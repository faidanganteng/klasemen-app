require("dotenv").config();
const express = require("express");
const cors = require("cors");
const pool = require("./db");
const { buildGroupKeys, assignGroups, buildSchedule } = require("./schedule");
const { isPowerOfTwo, roundLabel, buildSeedOrder } = require("./bracket");

const app = express();
app.use(cors());
app.use(express.json());

function computeStandings(teams, matches) {
  const table = {};
  teams.forEach((t) => {
    table[t.id] = { team: t, played: 0, win: 0, draw: 0, lose: 0, gf: 0, ga: 0, gd: 0, pts: 0 };
  });
  matches.forEach((m) => {
    if (m.home_score === null || m.away_score === null) return;
    const h = table[m.home_team_id];
    const a = table[m.away_team_id];
    if (!h || !a) return;
    h.played++; a.played++;
    h.gf += m.home_score; h.ga += m.away_score;
    a.gf += m.away_score; a.ga += m.home_score;
    if (m.home_score > m.away_score) { h.win++; h.pts += 3; a.lose++; }
    else if (m.home_score < m.away_score) { a.win++; a.pts += 3; h.lose++; }
    else { h.draw++; a.draw++; h.pts += 1; a.pts += 1; }
  });
  return Object.values(table)
    .map((r) => ({ ...r, gd: r.gf - r.ga }))
    .sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || x.team.name.localeCompare(y.team.name));
}

async function getFullTournament(tournamentId) {
  const [[tournament]] = await pool.query("SELECT * FROM tournaments WHERE id = ?", [tournamentId]);
  if (!tournament) return null;
  const [teams] = await pool.query("SELECT * FROM teams WHERE tournament_id = ? ORDER BY group_key, name", [tournamentId]);
  const [matches] = await pool.query("SELECT * FROM matches WHERE tournament_id = ? ORDER BY group_key, matchday, match_time", [tournamentId]);

  const groups = {};
  teams.forEach((t) => {
    if (!groups[t.group_key]) groups[t.group_key] = [];
    groups[t.group_key].push(t);
  });

  const standings = {};
  Object.keys(groups).forEach((g) => {
    standings[g] = computeStandings(groups[g], matches.filter((m) => m.group_key === g));
  });

  return { tournament, groups, matches, standings };
}

async function getBracket(tournamentId) {
  const [rows] = await pool.query(
    "SELECT * FROM knockout_matches WHERE tournament_id = ? ORDER BY round_size DESC, slot ASC",
    [tournamentId]
  );
  if (rows.length === 0) return { hasBracket: false, rounds: [] };

  const [teams] = await pool.query(
    `SELECT t.id, t.name FROM teams t
     INNER JOIN tournaments tour ON tour.id = t.tournament_id
     WHERE tour.id = ?`,
    [tournamentId]
  );
  const teamMap = {};
  teams.forEach((t) => { teamMap[t.id] = t; });

  const roundSizes = [...new Set(rows.map((r) => r.round_size))].sort((a, b) => b - a);
  const rounds = roundSizes.map((size) => ({
    roundSize: size,
    label: roundLabel(size),
    matches: rows
      .filter((r) => r.round_size === size)
      .map((r) => ({
        id: r.id,
        slot: r.slot,
        team1: r.team1_id ? teamMap[r.team1_id] : null,
        team2: r.team2_id ? teamMap[r.team2_id] : null,
        team1_score: r.team1_score,
        team2_score: r.team2_score,
        winner_id: r.winner_id,
      })),
  }));

  return { hasBracket: true, rounds };
}

app.get("/api/tournaments", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT t.*,
        (SELECT tm.name FROM knockout_matches km JOIN teams tm ON tm.id = km.winner_id
         WHERE km.tournament_id = t.id AND km.round_size = 1 AND km.winner_id IS NOT NULL LIMIT 1) AS champion_name
      FROM tournaments t
      ORDER BY t.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal mengambil daftar turnamen" });
  }
});

app.post("/api/tournaments", async (req, res) => {
  const { name, numGroups, teamsPerGroup, teamNames } = req.body;
  const totalTeams = numGroups * teamsPerGroup;
  if (!Array.isArray(teamNames) || teamNames.length !== totalTeams) {
    return res.status(400).json({ error: `Jumlah nama tim harus ${totalTeams}` });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [tRes] = await conn.query(
      "INSERT INTO tournaments (name, num_groups, teams_per_group) VALUES (?, ?, ?)",
      [name || "Piala Nusantara", numGroups, teamsPerGroup]
    );
    const tournamentId = tRes.insertId;

    const groupKeys = buildGroupKeys(numGroups);
    const teamObjs = teamNames.map((n, i) => ({ name: (n || "").trim() || `Tim ${i + 1}` }));
    const drawnGroups = assignGroups(teamObjs, teamsPerGroup, groupKeys);

    const groupsWithDbIds = {};
    for (const g of groupKeys) {
      groupsWithDbIds[g] = [];
      for (const team of drawnGroups[g]) {
        const [r] = await conn.query(
          "INSERT INTO teams (tournament_id, name, group_key) VALUES (?, ?, ?)",
          [tournamentId, team.name, g]
        );
        groupsWithDbIds[g].push({ id: r.insertId, name: team.name });
      }
    }

    const scheduleRows = buildSchedule(groupsWithDbIds, groupKeys);
    for (const m of scheduleRows) {
      await conn.query(
        `INSERT INTO matches (tournament_id, group_key, matchday, match_date, match_time, home_team_id, away_team_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [tournamentId, m.group_key, m.matchday, m.match_date, m.match_time, m.home_team_id, m.away_team_id]
      );
    }

    await conn.commit();
    res.status(201).json(await getFullTournament(tournamentId));
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: "Gagal membuat turnamen" });
  } finally {
    conn.release();
  }
});

app.get("/api/tournaments/:id", async (req, res) => {
  const full = await getFullTournament(req.params.id);
  if (!full) return res.status(404).json({ error: "Turnamen tidak ditemukan" });
  res.json(full);
});

app.delete("/api/tournaments/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM tournaments WHERE id = ?", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal menghapus turnamen" });
  }
});

app.post("/api/tournaments/:id/redraw", async (req, res) => {
  const tournamentId = req.params.id;
  const conn = await pool.getConnection();
  try {
    const [[tournament]] = await conn.query("SELECT * FROM tournaments WHERE id = ?", [tournamentId]);
    if (!tournament) return res.status(404).json({ error: "Turnamen tidak ditemukan" });

    const [teams] = await conn.query("SELECT * FROM teams WHERE tournament_id = ?", [tournamentId]);
    const groupKeys = buildGroupKeys(tournament.num_groups);
    const drawnGroups = assignGroups(teams, tournament.teams_per_group, groupKeys);

    await conn.beginTransaction();
    for (const g of groupKeys) {
      for (const team of drawnGroups[g]) {
        await conn.query("UPDATE teams SET group_key = ? WHERE id = ?", [g, team.id]);
      }
    }
    await conn.query("DELETE FROM matches WHERE tournament_id = ?", [tournamentId]);
    await conn.query("DELETE FROM knockout_matches WHERE tournament_id = ?", [tournamentId]);
    const scheduleRows = buildSchedule(drawnGroups, groupKeys);
    for (const m of scheduleRows) {
      await conn.query(
        `INSERT INTO matches (tournament_id, group_key, matchday, match_date, match_time, home_team_id, away_team_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [tournamentId, m.group_key, m.matchday, m.match_date, m.match_time, m.home_team_id, m.away_team_id]
      );
    }
    await conn.commit();
    res.json(await getFullTournament(tournamentId));
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: "Gagal mengundi ulang" });
  } finally {
    conn.release();
  }
});

app.patch("/api/teams/:id", async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "Nama tim tidak boleh kosong" });
  try {
    await pool.query("UPDATE teams SET name = ? WHERE id = ?", [name.trim(), req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal menyimpan nama tim" });
  }
});

app.patch("/api/matches/:id", async (req, res) => {
  const { homeScore, awayScore, matchTime, matchDate } = req.body;
  const fields = [];
  const values = [];
  if (homeScore !== undefined) { fields.push("home_score = ?"); values.push(homeScore === "" ? null : homeScore); }
  if (awayScore !== undefined) { fields.push("away_score = ?"); values.push(awayScore === "" ? null : awayScore); }
  if (matchTime !== undefined && matchTime !== "") { fields.push("match_time = ?"); values.push(matchTime); }
  if (matchDate !== undefined && matchDate !== "") { fields.push("match_date = ?"); values.push(matchDate); }
  if (fields.length === 0) return res.json({ ok: true });
  values.push(req.params.id);
  await pool.query(`UPDATE matches SET ${fields.join(", ")} WHERE id = ?`, values);
  res.json({ ok: true });
});

app.post("/api/tournaments/:id/reset-scores", async (req, res) => {
  await pool.query("UPDATE matches SET home_score = NULL, away_score = NULL WHERE tournament_id = ?", [req.params.id]);
  res.json(await getFullTournament(req.params.id));
});

app.get("/api/tournaments/:id/bracket", async (req, res) => {
  try {
    res.json(await getBracket(req.params.id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal mengambil bagan" });
  }
});

app.post("/api/tournaments/:id/bracket", async (req, res) => {
  const tournamentId = req.params.id;
  const conn = await pool.getConnection();
  try {
    const full = await getFullTournament(tournamentId);
    if (!full) return res.status(404).json({ error: "Turnamen tidak ditemukan" });

    const groupKeys = Object.keys(full.groups).sort();
    for (const g of groupKeys) {
      if (full.groups[g].length < 2) {
        return res.status(400).json({ error: `Grup ${g} kurang dari 2 tim, tidak bisa membuat bagan` });
      }
    }

    const qualifiers = groupKeys.length * 2;
    if (!isPowerOfTwo(qualifiers)) {
      return res.status(400).json({
        error: `Jumlah tim lolos (${qualifiers}) harus pangkat dua (4, 8, 16, 32). Gunakan 2, 4, 8, atau 16 grup.`,
      });
    }

    const seedOrder = buildSeedOrder(full.standings, groupKeys);

    await conn.beginTransaction();
    await conn.query("DELETE FROM knockout_matches WHERE tournament_id = ?", [tournamentId]);

    const roundSizes = [];
    let s = qualifiers / 2;
    while (s >= 1) { roundSizes.push(s); s = s / 2; }

    let prevRoundIds = null;
    for (let ri = roundSizes.length - 1; ri >= 0; ri--) {
      const size = roundSizes[ri];
      const thisRoundIds = [];
      for (let slot = 0; slot < size; slot++) {
        let nextMatchId = null;
        let nextSlot = null;
        if (prevRoundIds) {
          nextMatchId = prevRoundIds[Math.floor(slot / 2)];
          nextSlot = slot % 2 === 0 ? 1 : 2;
        }
        let team1Id = null, team2Id = null;
        if (size === roundSizes[0]) {
          team1Id = seedOrder[slot * 2].id;
          team2Id = seedOrder[slot * 2 + 1].id;
        }
        const [r] = await conn.query(
          `INSERT INTO knockout_matches (tournament_id, round_size, slot, team1_id, team2_id, next_match_id, next_slot)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [tournamentId, size, slot, team1Id, team2Id, nextMatchId, nextSlot]
        );
        thisRoundIds.push(r.insertId);
      }
      prevRoundIds = thisRoundIds;
    }

    await conn.commit();
    res.status(201).json(await getBracket(tournamentId));
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: "Gagal membuat bagan" });
  } finally {
    conn.release();
  }
});

app.patch("/api/knockout-matches/:id", async (req, res) => {
  const { team1Score, team2Score } = req.body;
  const matchId = req.params.id;
  try {
    const [[match]] = await pool.query("SELECT * FROM knockout_matches WHERE id = ?", [matchId]);
    if (!match) return res.status(404).json({ error: "Laga tidak ditemukan" });

    if (team1Score === "" || team2Score === "" || team1Score === null || team2Score === null) {
      await pool.query(
        "UPDATE knockout_matches SET team1_score = NULL, team2_score = NULL, winner_id = NULL WHERE id = ?",
        [matchId]
      );
      return res.json({ ok: true });
    }

    if (Number(team1Score) === Number(team2Score)) {
      return res.status(400).json({ error: "Skor tidak boleh sama di babak gugur. Kalau berakhir adu penalti, tambahkan 1 gol untuk tim pemenang sebagai penanda." });
    }

    const winnerId = Number(team1Score) > Number(team2Score) ? match.team1_id : match.team2_id;
    await pool.query(
      "UPDATE knockout_matches SET team1_score = ?, team2_score = ?, winner_id = ? WHERE id = ?",
      [team1Score, team2Score, winnerId, matchId]
    );

    if (match.next_match_id) {
      const field = match.next_slot === 1 ? "team1_id" : "team2_id";
      await pool.query(`UPDATE knockout_matches SET ${field} = ? WHERE id = ?`, [winnerId, match.next_match_id]);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal menyimpan skor babak gugur" });
  }
});

app.patch("/api/tournaments/:id/matchday-schedule", async (req, res) => {
  const { matchday, matchDate, matchTime } = req.body;
  if (matchday === undefined) return res.status(400).json({ error: "matchday wajib diisi" });
  const fields = [];
  const values = [];
  if (matchDate) { fields.push("match_date = ?"); values.push(matchDate); }
  if (matchTime) { fields.push("match_time = ?"); values.push(matchTime); }
  if (fields.length === 0) return res.json({ ok: true });
  values.push(req.params.id, matchday);
  await pool.query(`UPDATE matches SET ${fields.join(", ")} WHERE tournament_id = ? AND matchday = ?`, values);
  res.json({ ok: true });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server jalan di http://localhost:${PORT}`));