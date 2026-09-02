import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";

const API = "http://10.70.234.190:4000/api";
const STORAGE_KEY = "pn_tournament_id";

const SAMPLE_NAMES = [
  "Garuda Muda FC", "Elang Khatulistiwa", "Banteng Selatan", "Rimba Borneo",
  "Ombak Samudra", "Naga Merah", "Singa Perbukitan", "Cendrawasih United",
  "Badai Pesisir", "Gunung Api FC", "Kilat Timur", "Merpati Putih",
  "Harimau Sumatra", "Camar Laut", "Perkasa Jaya", "Bintang Nusantara",
];

const GROUP_OPTIONS = [2, 4, 6, 8];
const TEAMS_PER_GROUP_OPTIONS = [3, 4, 5, 6];
const MENU_ITEMS = [
  { key: "dashboard", label: "Dashboard", icon: "🏟️" },
  { key: "pengaturan", label: "Pengaturan", icon: "⚙️" },
  { key: "klasemen", label: "Klasemen", icon: "📊" },
  { key: "jadwal", label: "Jadwal", icon: "📅" },
  { key: "bagan", label: "Babak Gugur", icon: "🏆" },
  { key: "riwayat", label: "Riwayat", icon: "📜" },
];

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short" });
}

function formatDateTime(iso) {
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const ADMIN_PASSWORD = "wm2026admin";

export default function App() {
  const [showWelcome, setShowWelcome] = useState(true);
  const [userRole, setUserRole] = useState(null); // "admin" | "penonton"
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState("");
  const [adminLoginError, setAdminLoginError] = useState("");
  const [activeMenu, setActiveMenu] = useState("pengaturan");
  const [setupStep, setSetupStep] = useState("turnamen");
  const [tournamentName, setTournamentName] = useState("Piala Nusantara");
  const [numGroups, setNumGroups] = useState(4);
  const [teamsPerGroup, setTeamsPerGroup] = useState(4);
  const totalTeamsSetup = numGroups * teamsPerGroup;
  const [teamNames, setTeamNames] = useState(() => Array(16).fill(""));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [restoring, setRestoring] = useState(true);

  const [tournamentId, setTournamentId] = useState(null);
  const [groups, setGroups] = useState({});
  const [matches, setMatches] = useState([]);
  const [standings, setStandings] = useState({});
  const [activeGroup, setActiveGroup] = useState("A");
  const [bracket, setBracket] = useState({ hasBracket: false, rounds: [] });
  const [expandedMatchdays, setExpandedMatchdays] = useState({});
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const matchesRef = useRef(matches);
  useEffect(() => { matchesRef.current = matches; }, [matches]);
  const groupsRef = useRef(groups);
  useEffect(() => { groupsRef.current = groups; }, [groups]);
  const bracketRef = useRef(bracket);
  useEffect(() => { bracketRef.current = bracket; }, [bracket]);
  const debounceTimers = useRef({});
  const teamDebounce = useRef({});
  const knockoutDebounce = useRef({});
  const timeDebounce = useRef({});
  const dateDebounce = useRef({});
  const matchdayDebounce = useRef({});

  const applyData = useCallback((data) => {
    setTournamentId(data.tournament.id);
    setGroups(data.groups);
    setMatches(data.matches);
    setStandings(data.standings);
    setActiveGroup(Object.keys(data.groups)[0] || "A");
    setNumGroups(data.tournament.num_groups);
    setTeamsPerGroup(data.tournament.teams_per_group);
    setTournamentName(data.tournament.name);
    localStorage.setItem(STORAGE_KEY, data.tournament.id);
  }, []);

  const fetchBracket = useCallback(async (id) => {
    if (!id) return;
    try {
      const res = await fetch(`${API}/tournaments/${id}/bracket`);
      if (!res.ok) return;
      setBracket(await res.json());
    } catch (err) {}
  }, []);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch(`${API}/tournaments`);
      if (res.ok) setHistory(await res.json());
    } catch (err) {} finally {
      setHistoryLoading(false);
    }
  }, []);

  const openTournament = useCallback(async (id) => {
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API}/tournaments/${id}`);
      if (!res.ok) throw new Error("Gagal membuka turnamen");
      const data = await res.json();
      applyData(data);
      await fetchBracket(id);
      setActiveMenu("dashboard");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [applyData, fetchBracket]);

  const deleteTournament = useCallback(async (id) => {
    try {
      await fetch(`${API}/tournaments/${id}`, { method: "DELETE" });
      fetchHistory();
    } catch (err) {
      setError("Gagal menghapus turnamen");
    }
  }, [fetchHistory]);

  const deleteAllExceptActive = useCallback(async () => {
    if (!window.confirm("Hapus semua riwayat turnamen lain (selain yang sedang aktif)? Tindakan ini tidak bisa dibatalkan.")) return;
    setLoading(true);
    try {
      const toDelete = history.filter((t) => t.id !== tournamentId);
      for (const t of toDelete) {
        await fetch(`${API}/tournaments/${t.id}`, { method: "DELETE" });
      }
      fetchHistory();
    } catch (err) {
      setError("Gagal menghapus riwayat");
    } finally {
      setLoading(false);
    }
  }, [history, tournamentId, fetchHistory]);

  useEffect(() => {
    const savedId = localStorage.getItem(STORAGE_KEY);
    if (!savedId) { setRestoring(false); return; }
    (async () => {
      try {
        const res = await fetch(`${API}/tournaments/${savedId}`);
        if (!res.ok) { localStorage.removeItem(STORAGE_KEY); return; }
        const data = await res.json();
        applyData(data);
        fetchBracket(data.tournament.id);
        setActiveMenu("dashboard");
      } catch (err) {} finally {
        setRestoring(false);
      }
    })();
  }, [applyData, fetchBracket]);

  useEffect(() => {
    if (activeMenu === "riwayat") fetchHistory();
  }, [activeMenu, fetchHistory]);

  useEffect(() => {
    setTeamNames((prev) => {
      if (prev.length === totalTeamsSetup) return prev;
      const next = prev.slice(0, totalTeamsSetup);
      while (next.length < totalTeamsSetup) next.push("");
      return next;
    });
  }, [totalTeamsSetup]);

  const handleAdminLogin = useCallback(() => {
    if (adminPasswordInput === ADMIN_PASSWORD) {
      setUserRole("admin");
      setShowWelcome(false);
      setShowAdminLogin(false);
      setAdminPasswordInput("");
      setAdminLoginError("");
    } else {
      setAdminLoginError("Password salah, coba lagi.");
    }
  }, [adminPasswordInput]);

  const updateTeamName = useCallback((idx, value) => {
    setTeamNames((prev) => {
      const next = [...prev];
      next[idx] = value;
      return next;
    });
  }, []);

  const fillSample = useCallback(() => {
    setTeamNames((prev) => prev.map((v, i) => (v.trim() ? v : SAMPLE_NAMES[i % SAMPLE_NAMES.length])));
  }, []);

  const startTournament = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API}/tournaments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: tournamentName, numGroups, teamsPerGroup, teamNames }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Gagal membuat turnamen");
      const data = await res.json();
      applyData(data);
      setBracket({ hasBracket: false, rounds: [] });
      setActiveMenu("dashboard");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tournamentName, numGroups, teamsPerGroup, teamNames, applyData]);

  const redraw = useCallback(async () => {
    if (!tournamentId) return;
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API}/tournaments/${tournamentId}/redraw`, { method: "POST" });
      if (!res.ok) throw new Error("Gagal mengundi ulang");
      applyData(await res.json());
      setBracket({ hasBracket: false, rounds: [] });
      setActiveMenu("dashboard");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tournamentId, applyData]);

  const resetScores = useCallback(async () => {
    if (!tournamentId) return;
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API}/tournaments/${tournamentId}/reset-scores`, { method: "POST" });
      if (!res.ok) throw new Error("Gagal reset skor");
      applyData(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tournamentId, applyData]);

  const startNewTournament = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setTournamentId(null);
    setGroups({});
    setMatches([]);
    setStandings({});
    setBracket({ hasBracket: false, rounds: [] });
    setTeamNames(Array(totalTeamsSetup).fill(""));
    setTournamentName("Piala Nusantara");
    setSetupStep("turnamen");
    setActiveMenu("pengaturan");
  }, [totalTeamsSetup]);

  const refreshTournament = useCallback(async () => {
    if (!tournamentId) return;
    try {
      const res = await fetch(`${API}/tournaments/${tournamentId}`);
      if (!res.ok) return;
      const data = await res.json();
      setGroups(data.groups);
      setMatches(data.matches);
      setStandings(data.standings);
    } catch (err) {}
  }, [tournamentId]);

  const saveScore = useCallback(async (matchId) => {
    const m = matchesRef.current.find((x) => x.id === matchId);
    if (!m) return;
    try {
      await fetch(`${API}/matches/${matchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ homeScore: m.home_score, awayScore: m.away_score }),
      });
      refreshTournament();
    } catch (err) {
      setError("Gagal menyimpan skor");
    }
  }, [refreshTournament]);

  const handleScoreChange = useCallback((matchId, side, value) => {
    const v = value === "" ? null : Math.max(0, Math.min(99, parseInt(value, 10) || 0));
    setMatches((prev) => prev.map((m) => (m.id === matchId ? { ...m, [side]: v } : m)));
    clearTimeout(debounceTimers.current[matchId + side]);
    debounceTimers.current[matchId + side] = setTimeout(() => saveScore(matchId), 600);
  }, [saveScore]);

  const saveMatchTime = useCallback(async (matchId) => {
    const m = matchesRef.current.find((x) => x.id === matchId);
    if (!m) return;
    try {
      await fetch(`${API}/matches/${matchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchTime: m.match_time }),
      });
    } catch (err) {
      setError("Gagal menyimpan jam laga");
    }
  }, []);

  const handleTimeChange = useCallback((matchId, value) => {
    setMatches((prev) => prev.map((m) => (m.id === matchId ? { ...m, match_time: value } : m)));
    clearTimeout(timeDebounce.current[matchId]);
    timeDebounce.current[matchId] = setTimeout(() => saveMatchTime(matchId), 600);
  }, [saveMatchTime]);

  const saveMatchDate = useCallback(async (matchId) => {
    const m = matchesRef.current.find((x) => x.id === matchId);
    if (!m) return;
    try {
      await fetch(`${API}/matches/${matchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchDate: m.match_date }),
      });
    } catch (err) {
      setError("Gagal menyimpan tanggal laga");
    }
  }, []);

  const handleDateChange = useCallback((matchId, value) => {
    setMatches((prev) => prev.map((m) => (m.id === matchId ? { ...m, match_date: value } : m)));
    clearTimeout(dateDebounce.current[matchId]);
    dateDebounce.current[matchId] = setTimeout(() => saveMatchDate(matchId), 600);
  }, [saveMatchDate]);

  const saveMatchdaySchedule = useCallback(async (md) => {
    const sample = matchesRef.current.find((m) => m.matchday === Number(md));
    if (!sample || !tournamentId) return;
    try {
      await fetch(`${API}/tournaments/${tournamentId}/matchday-schedule`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchday: Number(md), matchDate: sample.match_date, matchTime: sample.match_time }),
      });
    } catch (err) {
      setError("Gagal menyimpan jadwal matchday");
    }
  }, [tournamentId]);

  const handleMatchdayDateChange = useCallback((md, value) => {
    setMatches((prev) => prev.map((m) => (m.matchday === Number(md) ? { ...m, match_date: value } : m)));
    clearTimeout(matchdayDebounce.current[md + "-date"]);
    matchdayDebounce.current[md + "-date"] = setTimeout(() => saveMatchdaySchedule(md), 600);
  }, [saveMatchdaySchedule]);

  const handleMatchdayTimeChange = useCallback((md, value) => {
    setMatches((prev) => prev.map((m) => (m.matchday === Number(md) ? { ...m, match_time: value } : m)));
    clearTimeout(matchdayDebounce.current[md + "-time"]);
    matchdayDebounce.current[md + "-time"] = setTimeout(() => saveMatchdaySchedule(md), 600);
  }, [saveMatchdaySchedule]);

  const saveTeamName = useCallback(async (teamId) => {
    const team = Object.values(groupsRef.current).flat().find((t) => t.id === teamId);
    if (!team) return;
    try {
      await fetch(`${API}/teams/${teamId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: team.name }),
      });
    } catch (err) {
      setError("Gagal menyimpan nama tim");
    }
  }, []);

  const handleTeamNameChange = useCallback((teamId, groupKey, value) => {
    setGroups((prev) => {
      const next = { ...prev };
      next[groupKey] = next[groupKey].map((t) => (t.id === teamId ? { ...t, name: value } : t));
      return next;
    });
    setStandings((prev) => {
      const next = { ...prev };
      if (next[groupKey]) {
        next[groupKey] = next[groupKey].map((row) =>
          row.team.id === teamId ? { ...row, team: { ...row.team, name: value } } : row
        );
      }
      return next;
    });
    clearTimeout(teamDebounce.current[teamId]);
    teamDebounce.current[teamId] = setTimeout(() => saveTeamName(teamId), 600);
  }, [saveTeamName]);

  const generateBracket = useCallback(async () => {
    if (!tournamentId) return;
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API}/tournaments/${tournamentId}/bracket`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal membuat bagan");
      setBracket(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  const saveKnockoutScore = useCallback(async (matchId) => {
    let match = null;
    bracketRef.current.rounds.forEach((r) => r.matches.forEach((m) => { if (m.id === matchId) match = m; }));
    if (!match) return;
    if (match.team1_score === null || match.team2_score === null) return;
    try {
      const res = await fetch(`${API}/knockout-matches/${matchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team1Score: match.team1_score, team2Score: match.team2_score }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || "Gagal menyimpan skor babak gugur");
      fetchBracket(tournamentId);
    } catch (err) {
      setError("Gagal menyimpan skor babak gugur");
    }
  }, [fetchBracket, tournamentId]);

  const handleKnockoutScoreChange = useCallback((matchId, side, value) => {
    const v = value === "" ? null : Math.max(0, Math.min(99, parseInt(value, 10) || 0));
    setBracket((prev) => ({
      ...prev,
      rounds: prev.rounds.map((r) => ({
        ...r,
        matches: r.matches.map((m) => (m.id === matchId ? { ...m, [side]: v } : m)),
      })),
    }));
    clearTimeout(knockoutDebounce.current[matchId + side]);
    knockoutDebounce.current[matchId + side] = setTimeout(() => saveKnockoutScore(matchId), 600);
  }, [saveKnockoutScore]);

  const teamsById = useMemo(() => {
    const map = {};
    Object.values(groups).flat().forEach((t) => { map[t.id] = t; });
    return map;
  }, [groups]);

  const groupKeys = useMemo(() => Object.keys(groups), [groups]);
  const totalTeams = useMemo(() => Object.values(groups).flat().length, [groups]);

  const groupMatches = useMemo(
    () => matches.filter((m) => m.group_key === activeGroup).sort((a, b) => a.matchday - b.matchday || a.match_time.localeCompare(b.match_time)),
    [matches, activeGroup]
  );

  const matchdayPairs = useMemo(() => {
    const all = [...new Set(matches.map((m) => m.matchday))].sort((a, b) => a - b);
    const pairs = [];
    for (let i = 0; i < all.length; i += 2) pairs.push(all.slice(i, i + 2));
    return pairs;
  }, [matches]);

  const isPairComplete = useCallback((pair) => {
    const pairMatches = matches.filter((m) => pair.includes(m.matchday));
    return pairMatches.length > 0 && pairMatches.every((m) => m.home_score !== null && m.away_score !== null);
  }, [matches]);

  const unlockedMatchdays = useMemo(() => {
    let unlocked = [];
    for (const pair of matchdayPairs) {
      unlocked = unlocked.concat(pair);
      if (!isPairComplete(pair)) break;
    }
    return unlocked;
  }, [matchdayPairs, isPairComplete]);

  const lockedPair = useMemo(
    () => matchdayPairs.find((pair) => !pair.every((md) => unlockedMatchdays.includes(md))),
    [matchdayPairs, unlockedMatchdays]
  );

  const currentPair = useMemo(() => {
    if (unlockedMatchdays.length === 0) return null;
    return matchdayPairs.find((pair) => pair.includes(unlockedMatchdays[unlockedMatchdays.length - 1]));
  }, [matchdayPairs, unlockedMatchdays]);

  const currentPairProgress = useMemo(() => {
    if (!currentPair) return { done: 0, total: 0 };
    const pairMatches = matches.filter((m) => currentPair.includes(m.matchday));
    return {
      done: pairMatches.filter((m) => m.home_score !== null && m.away_score !== null).length,
      total: pairMatches.length,
    };
  }, [currentPair, matches]);

  const byMatchday = useMemo(() => {
    const map = {};
    groupMatches.forEach((m) => {
      if (!unlockedMatchdays.includes(m.matchday)) return;
      if (!map[m.matchday]) map[m.matchday] = [];
      map[m.matchday].push(m);
    });
    return map;
  }, [groupMatches, unlockedMatchdays]);

  const activeStandings = standings[activeGroup] || [];
  const finishedCount = groupMatches.filter((m) => m.home_score !== null && m.away_score !== null).length;
  const filledNames = teamNames.filter((n) => n.trim()).length;

  const teamTotalMatches = useMemo(() => {
    const map = {};
    activeStandings.forEach((row) => {
      map[row.team.id] = groupMatches.filter(
        (m) => m.home_team_id === row.team.id || m.away_team_id === row.team.id
      ).length;
    });
    return map;
  }, [activeStandings, groupMatches]);

  const finishedTotal = useMemo(() => matches.filter((m) => m.home_score !== null && m.away_score !== null).length, [matches]);
  const remainingTotal = matches.length - finishedTotal;
  const leaders = useMemo(
    () => groupKeys.map((g) => ({ group: g, row: (standings[g] || [])[0] || null })),
    [groupKeys, standings]
  );
  const upcomingMatches = useMemo(() => {
    return matches
      .filter((m) => m.home_score === null || m.away_score === null)
      .sort((a, b) => (a.match_date + a.match_time).localeCompare(b.match_date + b.match_time))
      .slice(0, 6);
  }, [matches]);

  const qualifiersCount = groupKeys.length * 2;

  const champion = useMemo(() => {
    const finalRound = bracket.rounds.find((r) => r.roundSize === 1);
    if (!finalRound || !finalRound.matches[0]) return null;
    const m = finalRound.matches[0];
    if (!m.winner_id) return null;
    return m.winner_id === m.team1?.id ? m.team1 : m.team2;
  }, [bracket]);

  const sharedStyle = `
    .pn-root { --pitch-bg:#120808; --pitch-bg-2:#1B0D0D; --panel:#1A0D0D; --panel-soft:#241212;
      --line:#3A1616; --chalk:#F5F0EC; --chalk-dim:#B9ACA6; --gold:#E8B84B; --gold-ink:#3A2A0A; --red:#D21F1F;
      --wm-black:#0A0A0A; --wm-red:#D21F1F; --wm-red-dim:#8C1414; --wm-white:#F5F5F5;
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:var(--chalk); min-height:100vh; }
    .pn-root * { box-sizing:border-box; }
    .pn-shell { display:flex; min-height:100vh; }

    .wm-welcome {
      min-height:100vh; display:flex; align-items:center; justify-content:center;
      background: radial-gradient(circle at 50% 20%, #201010 0%, var(--wm-black) 55%, #000 100%);
      padding:24px;
    }
    .wm-welcome-card { text-align:center; max-width:440px; }
    .wm-welcome-crest {
      width:96px; height:96px; margin:0 auto 22px; border-radius:20px;
      background: linear-gradient(150deg, var(--wm-red) 0%, var(--wm-red-dim) 100%);
      display:flex; align-items:center; justify-content:center;
      font-family:"Arial Black",Impact,sans-serif; font-size:30px; color:var(--wm-white);
      box-shadow: 0 0 0 3px rgba(255,255,255,0.12), 0 10px 30px rgba(210,31,31,0.35);
    }
    .wm-welcome-eyebrow { font-size:11px; letter-spacing:0.28em; text-transform:uppercase; color:var(--wm-red); font-weight:700; margin:0 0 10px; }
    .wm-welcome-title { font-family:"Arial Black",Impact,sans-serif; font-size:32px; line-height:1.15; color:var(--wm-white);
      text-transform:uppercase; letter-spacing:0.01em; margin:0 0 14px; }
    .wm-welcome-title span { color:var(--wm-red); }
    .wm-welcome-sub { font-size:14px; color:#B9B9B9; line-height:1.6; margin:0 0 32px; }
    .wm-welcome-btn {
      display:inline-flex; align-items:center; gap:8px; background:var(--wm-red); color:var(--wm-white);
      border:none; border-radius:10px; padding:14px 40px; font-size:15px; font-weight:700;
      letter-spacing:0.04em; text-transform:uppercase; cursor:pointer;
      box-shadow: 0 8px 22px rgba(210,31,31,0.4); transition: transform 0.12s, background 0.15s;
    }
    .wm-welcome-btn:hover { background:#e83636; transform: translateY(-1px); }
    .wm-welcome-role-row { display:flex; flex-direction:column; gap:12px; align-items:center; }
    .wm-welcome-btn-outline { background:transparent; border:1px solid rgba(245,245,245,0.3); color:var(--wm-white); box-shadow:none; }
    .wm-welcome-btn-outline:hover { background:rgba(245,245,245,0.08); }
    .wm-corner-lock {
      position:absolute; top:20px; left:20px; width:38px; height:38px; border-radius:50%;
      background:rgba(255,255,255,0.05); border:1px solid rgba(245,245,245,0.15);
      color:var(--wm-white); font-size:16px; cursor:pointer; display:flex; align-items:center; justify-content:center;
      transition: all 0.15s; z-index:5;
    }
    .wm-corner-lock:hover { background:rgba(210,31,31,0.2); border-color:var(--wm-red); transform:scale(1.08); }
    .wm-admin-login { display:flex; flex-direction:column; align-items:center; gap:12px; width:100%; }
    .wm-admin-login-label { font-size:12px; color:var(--wm-white); font-weight:700; letter-spacing:0.04em; margin:0; }
    .wm-admin-input {
      width:100%; max-width:280px; background:rgba(255,255,255,0.06); border:1px solid rgba(245,245,245,0.25);
      border-radius:10px; padding:12px 14px; font-size:14px; color:var(--wm-white); text-align:center;
      letter-spacing:0.1em;
    }
    .wm-admin-input:focus { outline:none; border-color:var(--wm-red); background:rgba(255,255,255,0.09); }
    .wm-admin-error { font-size:12px; color:#ff8080; margin:-6px 0 0; }
    .wm-welcome-foot { margin-top:26px; font-size:11px; color:#6b6b6b; letter-spacing:0.06em; }

    .pn-mobile-toggle { display:none; }
    .pn-mobile-backdrop { display:none; }
    .pn-sidebar { width:250px; flex-shrink:0; position:relative; overflow:hidden;
      background: linear-gradient(175deg, #0A0A0A 0%, #1A0A0A 55%, #0A0A0A 100%);
      border-right:1px solid rgba(210,31,31,0.3);
      box-shadow: inset -1px 0 0 rgba(255,255,255,0.04), 6px 0 30px rgba(0,0,0,0.5);
      padding:26px 16px; position:sticky; top:0; height:100vh; overflow-y:auto; }
    .pn-sidebar-glow { position:absolute; top:-60px; left:-40px; width:220px; height:220px; border-radius:50%;
      background: radial-gradient(circle, rgba(210,31,31,0.28) 0%, rgba(210,31,31,0) 70%); pointer-events:none; }

    .pn-brand { position:relative; display:flex; align-items:center; gap:12px; margin-bottom:22px;
      padding-bottom:20px; border-bottom:1px solid rgba(210,31,31,0.25); }
    .pn-crest-wrap { position:relative; flex-shrink:0; }
    .pn-crest { width:46px; height:50px; display:flex; align-items:center; justify-content:center;
      font-family:"Arial Black",Impact,sans-serif; font-weight:900; font-size:16px; color:#F5F5F5;
      background: linear-gradient(160deg, #E23434 0%, #8C1414 100%);
      clip-path: polygon(50% 0%, 100% 16%, 100% 62%, 50% 100%, 0% 62%, 0% 16%);
      box-shadow: 0 0 0 2px rgba(255,255,255,0.15), 0 6px 16px rgba(210,31,31,0.5); }
    .pn-brand-title { font-family:"Arial Black",Impact,sans-serif; font-size:13.5px; letter-spacing:0.03em;
      text-transform:uppercase; margin:0; line-height:1.25; color:#F5F5F5; }
    .pn-brand-title span { display:block; color:#E23434; font-size:15px; letter-spacing:0.08em; }
    .pn-brand-sub { font-size:10px; color:#9A9A9A; margin:5px 0 0; letter-spacing:0.02em; }

    .pn-menu-section { font-size:9.5px; text-transform:uppercase; letter-spacing:0.14em; color:#6E6E6E;
      font-weight:700; margin:0 0 10px 4px; }
    .pn-menu-item { position:relative; display:flex; align-items:center; gap:11px; width:100%; text-align:left;
      background:rgba(255,255,255,0.02); border:1px solid transparent; color:#B8B4B0; font-weight:700; font-size:13px;
      padding:11px 13px; border-radius:9px; cursor:pointer; margin-bottom:6px; transition: all 0.15s; }
    .pn-menu-item:hover { background:rgba(210,31,31,0.1); border-color:rgba(210,31,31,0.25); color:#F5F5F5; }
    .pn-menu-item.active { background: linear-gradient(120deg, #D21F1F 0%, #8C1414 100%); color:#F5F5F5;
      border-color:rgba(255,255,255,0.15); box-shadow: 0 4px 14px rgba(210,31,31,0.45); }
    .pn-menu-item:disabled { opacity:0.35; cursor:not-allowed; }
    .pn-menu-item:disabled:hover { background:rgba(255,255,255,0.02); border-color:transparent; color:#B8B4B0; }
    .pn-menu-icon { font-size:15px; flex-shrink:0; filter: grayscale(0.15); }
    .pn-menu-active-bar { position:absolute; right:10px; width:5px; height:5px; border-radius:50%; background:#F5F5F5; }

    .pn-sidebar-foot { position:relative; margin-top:22px; padding:14px; border-radius:10px;
      background:rgba(255,255,255,0.03); border:1px solid rgba(210,31,31,0.2);
      font-size:10.5px; color:#9A9A9A; line-height:1.6; }
    .pn-sidebar-foot-dot { display:inline-block; width:6px; height:6px; border-radius:50%; background:#3DDC5A;
      margin-right:6px; box-shadow: 0 0 6px #3DDC5A; }
    .pn-sidebar-foot-db { color:#6E6E6E; }

    .pn-main { flex:1; min-width:0; position:relative; overflow-x:hidden;
      background:
        radial-gradient(circle at 85% 0%, rgba(210,31,31,0.10) 0%, rgba(210,31,31,0) 45%),
        repeating-linear-gradient(180deg, var(--pitch-bg) 0px, var(--pitch-bg) 44px, var(--pitch-bg-2) 44px, var(--pitch-bg-2) 88px);
      padding:28px 24px 60px; }
    .pn-wrap { max-width:900px; margin:0 auto; }

    .pn-page-head { margin-bottom:22px; padding-bottom:16px; border-bottom:1px solid var(--line); position:relative; }
    .pn-page-head::before { content:""; position:absolute; left:0; bottom:-1px; width:56px; height:2px;
      background: linear-gradient(90deg, var(--red), transparent); }
    .pn-eyebrow { font-size:11px; letter-spacing:0.18em; text-transform:uppercase; color:var(--gold); font-weight:700; margin:0 0 4px; }
    .pn-page-title { font-family:"Arial Black",Impact,sans-serif; font-size:24px; letter-spacing:0.02em; margin:0; text-transform:uppercase;
      text-shadow: 0 2px 12px rgba(210,31,31,0.25); }
    .pn-sub { font-size:13px; color:var(--chalk-dim); margin:5px 0 0; }

    .pn-actions { display:flex; gap:10px; flex-wrap:wrap; margin-top:16px; }
    .pn-btn { display:inline-flex; align-items:center; gap:7px; background:var(--panel-soft); color:var(--chalk);
      border:1px solid var(--line); border-radius:9px; padding:10px 16px; font-size:13px; font-weight:700; cursor:pointer;
      transition: all 0.15s; }
    .pn-btn:hover { background:var(--line); border-color:rgba(210,31,31,0.4); transform:translateY(-1px); }
    .pn-btn.primary { background: linear-gradient(120deg, var(--gold) 0%, #f0cd7a 100%); color:var(--gold-ink); border-color:var(--gold);
      box-shadow: 0 4px 14px rgba(232,184,75,0.35); }
    .pn-btn.primary:hover { box-shadow: 0 6px 18px rgba(232,184,75,0.5); }
    .pn-btn:disabled { opacity:0.5; cursor:not-allowed; transform:none !important; }
    .pn-select-wrap { display:flex; flex-direction:column; gap:3px; font-size:10px; color:var(--chalk-dim); text-transform:uppercase; }
    .pn-select { background:var(--panel-soft); color:var(--chalk); border:1px solid var(--line); border-radius:8px; padding:7px 10px; font-size:13px; font-weight:600; }
    .pn-select-row { display:flex; gap:14px; margin-bottom:18px; align-items:flex-end; flex-wrap:wrap; }
    .pn-text-input {
      background:var(--panel-soft); border:1px solid var(--line); border-radius:8px; color:var(--chalk);
      padding:10px 12px; font-size:14px; font-weight:600; width:100%; max-width:360px;
    }

    .pn-panel { background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:18px 16px 20px; margin-bottom:18px;
      box-shadow: 0 4px 18px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.03); }
    .pn-panel-head { display:flex; align-items:center; gap:8px; margin-bottom:14px; flex-wrap:wrap; }
    .pn-panel-head h2 { font-size:13px; letter-spacing:0.12em; text-transform:uppercase; margin:0; color:var(--chalk); font-weight:700; }

    .pn-champion-banner {
      display:flex; align-items:center; gap:14px; background: linear-gradient(120deg, var(--gold) 0%, #f0cd7a 100%);
      color:var(--gold-ink); border-radius:14px; padding:18px 20px; margin-bottom:20px;
      box-shadow: 0 8px 24px rgba(217,174,78,0.3);
    }
    .pn-champion-icon { font-size:34px; line-height:1; flex-shrink:0; }
    .pn-champion-label { font-size:10.5px; text-transform:uppercase; letter-spacing:0.12em; font-weight:700; opacity:0.8; }
    .pn-champion-name { font-family:"Arial Black",Impact,sans-serif; font-size:22px; text-transform:uppercase; margin:2px 0 0; }

    .pn-stat-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:12px; margin-bottom:20px; }
    .pn-stat-card { position:relative; overflow:hidden; background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:16px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.3); transition: transform 0.15s, border-color 0.15s; }
    .pn-stat-card:hover { transform: translateY(-2px); border-color: rgba(210,31,31,0.4); }
    .pn-stat-icon { position:absolute; right:10px; top:10px; font-size:22px; opacity:0.35; }
    .pn-stat-value { font-family:ui-monospace,Menlo,Consolas,monospace; font-size:28px; font-weight:700; color:var(--gold); line-height:1;
      text-shadow: 0 0 18px rgba(232,184,75,0.25); }
    .pn-stat-label { font-size:10.5px; color:var(--chalk-dim); text-transform:uppercase; letter-spacing:0.05em; margin-top:6px; }

    .pn-leader-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:10px; }
    .pn-leader-card { background:var(--panel-soft); border:1px solid var(--line); border-radius:9px; padding:12px; }
    .pn-leader-group { font-size:10px; color:var(--gold); text-transform:uppercase; font-weight:700; letter-spacing:0.06em; }
    .pn-leader-name { font-size:13.5px; font-weight:700; margin:4px 0 2px; }
    .pn-leader-pts { font-size:11px; color:var(--chalk-dim); font-family:ui-monospace,monospace; }

    .pn-upcoming-row { display:flex; align-items:center; gap:12px; padding:9px 0; border-bottom:1px solid rgba(255,255,255,0.05); }
    .pn-upcoming-row:last-child { border-bottom:none; }
    .pn-upcoming-date { font-size:10.5px; color:var(--chalk-dim); min-width:70px; }
    .pn-upcoming-teams { flex:1; font-size:13px; font-weight:600; }
    .pn-upcoming-group { font-size:10px; background:rgba(255,255,255,0.08); color:var(--chalk-dim); padding:2px 8px; border-radius:5px; font-weight:700; }

    .pn-name-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(190px,1fr)); gap:10px; margin-bottom:20px; }
    .pn-name-field { display:flex; flex-direction:column; gap:4px; }
    .pn-name-field label { font-size:10px; color:var(--gold); text-transform:uppercase; font-weight:700; }
    .pn-name-field input { background:var(--panel-soft); border:1px solid var(--line); border-radius:8px; color:var(--chalk); padding:9px 10px; font-size:13.5px; }
    .pn-setup-foot { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
    .pn-progress-note { font-size:12.5px; color:var(--chalk-dim); }

    .pn-group-tabs { display:flex; gap:8px; margin-bottom:18px; flex-wrap:wrap; }
    .pn-group-tab { padding:9px 18px; background:var(--panel); border:1px solid var(--line); border-radius:9px;
      color:var(--chalk-dim); font-weight:700; font-size:13px; cursor:pointer; transition: all 0.15s; }
    .pn-group-tab:hover { border-color:rgba(210,31,31,0.4); color:var(--chalk); }
    .pn-group-tab.active { color:#F5F5F5; background: linear-gradient(120deg, var(--red) 0%, var(--wm-red-dim) 100%);
      border-color:var(--red); box-shadow: 0 4px 14px rgba(210,31,31,0.4); }

    .pn-table-wrap { overflow-x:auto; border-radius:10px; }
    table.pn-table { width:100%; border-collapse:collapse; font-family:ui-monospace,Menlo,Consolas,monospace; min-width:620px; }
    .pn-table th { text-align:center; font-size:10px; color:var(--gold); font-weight:700; padding:8px 6px; text-transform:uppercase;
      letter-spacing:0.05em; border-bottom:2px solid var(--red); white-space:nowrap; }
    .pn-table th.pn-th-team { text-align:left; padding-left:4px; }
    .pn-table td { text-align:center; font-size:13px; padding:7px 6px; color:var(--chalk); border-bottom:1px solid rgba(255,255,255,0.05); white-space:nowrap; }
    .pn-table td.pn-td-team { text-align:left; font-family:-apple-system,sans-serif; font-weight:600; padding-left:4px; min-width:160px; white-space:normal; }
    .pn-table td.pn-pts { font-weight:700; color:var(--gold); }
    .pn-table td.pn-pct { color:var(--gold); font-weight:600; }
    .pn-rank { display:flex; align-items:center; gap:6px; }
    .pn-rank-num { width:18px; height:18px; border-radius:4px; font-size:10px; display:inline-flex; align-items:center; justify-content:center; background:rgba(255,255,255,0.08); color:var(--chalk-dim); font-weight:700; flex-shrink:0; }
    .pn-qualify .pn-rank-num { background:var(--gold); color:var(--gold-ink); }
    .pn-team-edit { flex:1; min-width:0; background:transparent; border:1px solid transparent; color:var(--chalk);
      font-weight:600; font-size:13px; font-family:-apple-system,sans-serif; padding:4px 6px; border-radius:5px; }
    .pn-team-edit:hover { border-color:var(--line); background:rgba(255,255,255,0.03); }
    .pn-team-edit:focus { outline:none; border-color:var(--gold); background:var(--panel-soft); }
    .pn-legend { display:flex; align-items:center; gap:6px; margin-top:12px; font-size:11px; color:var(--chalk-dim); }
    .pn-legend-dot { width:9px; height:9px; border-radius:3px; background:var(--gold); display:inline-block; }
    .pn-progress { font-size:11px; color:var(--chalk-dim); margin-left:auto; }

    .pn-round-label { font-size:11px; text-transform:uppercase; letter-spacing:0.1em; color:var(--gold); font-weight:700; margin:0 0 8px; }
    .pn-round-label-clickable { cursor:pointer; display:flex; align-items:center; gap:10px; user-select:none; padding:6px 4px; border-radius:6px; }
    .pn-round-label-clickable:hover { background:rgba(255,255,255,0.04); }
    .pn-round-status { font-size:9.5px; text-transform:uppercase; padding:2px 7px; border-radius:4px; background:rgba(255,255,255,0.08); color:var(--chalk-dim); letter-spacing:0.04em; }
    .pn-round-status.done { background:var(--gold); color:var(--gold-ink); }
    .pn-round-toggle { margin-left:auto; color:var(--chalk-dim); font-size:10px; }
    .pn-match { display:flex; align-items:center; gap:10px; background:var(--panel-soft); border:1px solid var(--line);
      border-left:3px solid var(--red); border-radius:9px; padding:10px 12px; margin-bottom:8px; transition: border-color 0.15s; }
    .pn-match:hover { border-left-color: var(--gold); }
    .pn-match-date { display:flex; flex-direction:column; align-items:center; min-width:52px; font-size:10.5px; color:var(--chalk-dim); border-right:1px dashed var(--line); padding-right:10px; }
    .pn-match-date b { color:var(--chalk); font-size:11px; }
    .pn-match-teams { flex:1; min-width:0; }
    .pn-match-row { display:flex; align-items:center; justify-content:space-between; gap:8px; }
    .pn-team-name { font-size:13px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .pn-score-input { width:30px; height:28px; text-align:center; background:var(--pitch-bg); border:1px solid var(--line); border-radius:6px; color:var(--gold); font-weight:700; font-family:ui-monospace,monospace; font-size:14px; }
    .pn-score-input:disabled { opacity:0.3; }
    .pn-round-header { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:8px; }
    .pn-round-datetime { display:flex; gap:6px; }
    .pn-time-input { background:var(--pitch-bg); border:1px solid var(--line); border-radius:6px; color:var(--chalk-dim); font-size:11px; padding:5px 6px; font-family:ui-monospace,monospace; }
    .pn-time-input:focus { outline:none; border-color:var(--gold); color:var(--chalk); }
    .pn-date-input { background:var(--pitch-bg); border:1px solid var(--line); border-radius:6px; color:var(--chalk); font-size:11px; padding:5px 6px; font-family:ui-monospace,monospace; }
    .pn-date-input:focus { outline:none; border-color:var(--gold); }
    .pn-locked-note { text-align:center; color:var(--chalk-dim); font-size:12.5px; padding:18px; background:var(--panel-soft); border:1px dashed var(--line); border-radius:10px; margin-top:6px; }
    .pn-status { font-size:9.5px; text-transform:uppercase; padding:2px 6px; border-radius:4px; margin-left:8px; background:rgba(255,255,255,0.06); color:var(--chalk-dim); }
    .pn-status.done { background:var(--red); color:#fbe4de; }

    .pn-bracket-wrap { display:flex; gap:22px; overflow-x:auto; padding:8px 4px 20px; }
    .pn-bracket-col { display:flex; flex-direction:column; min-width:190px; flex-shrink:0; }
    .pn-bracket-col-title { text-align:center; font-size:11px; text-transform:uppercase; letter-spacing:0.1em; color:var(--gold); font-weight:700; margin:0 0 12px; }
    .pn-bracket-matches { flex:1; display:flex; flex-direction:column; justify-content:space-around; }
    .pn-bracket-match { background:var(--panel-soft); border:1px solid var(--line); border-radius:9px; padding:9px 10px; margin:10px 0; }
    .pn-bracket-team-row { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:4px 0; }
    .pn-bracket-team-name { font-size:12.5px; font-weight:600; color:var(--chalk-dim); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:110px; }
    .pn-bracket-team-name.winner { color:var(--gold); font-weight:700; }
    .pn-bracket-vs { font-size:9px; color:var(--chalk-dim); text-align:center; padding:2px 0; }

    .pn-history-card {
      display:flex; align-items:center; gap:14px; background:var(--panel-soft); border:1px solid var(--line);
      border-radius:10px; padding:14px 16px; margin-bottom:10px; flex-wrap:wrap;
    }
    .pn-history-card.active-tournament { border-color:var(--gold); }
    .pn-history-main { flex:1; min-width:180px; }
    .pn-history-name { font-size:14px; font-weight:700; color:var(--chalk); margin:0; }
    .pn-history-meta { font-size:11px; color:var(--chalk-dim); margin:3px 0 0; }
    .pn-history-champion {
      display:inline-flex; align-items:center; gap:5px; font-size:11.5px; font-weight:700; color:var(--gold);
      background:rgba(217,174,78,0.12); padding:4px 10px; border-radius:6px;
    }
    .pn-history-badge {
      font-size:10px; font-weight:700; color:var(--gold-ink); background:var(--gold);
      padding:3px 9px; border-radius:6px; text-transform:uppercase; letter-spacing:0.04em;
    }

    .pn-empty { text-align:center; color:var(--chalk-dim); font-size:13px; padding:40px 20px; }
    .pn-error { background:#4a1f1a; border:1px solid var(--red); color:#f6d2ca; padding:10px 14px; border-radius:8px; margin-bottom:16px; font-size:13px; }
    .pn-loading-screen { display:flex; align-items:center; justify-content:center; min-height:100vh; color:var(--chalk-dim); font-size:14px; }

    .pn-viewer { min-height:100vh;
      background:
        radial-gradient(circle at 85% 0%, rgba(210,31,31,0.10) 0%, rgba(210,31,31,0) 45%),
        repeating-linear-gradient(180deg, var(--pitch-bg) 0px, var(--pitch-bg) 44px, var(--pitch-bg-2) 44px, var(--pitch-bg-2) 88px);
    }
    .pn-viewer-header { display:flex; align-items:center; justify-content:space-between; gap:12px;
      padding:18px 24px; border-bottom:1px solid rgba(210,31,31,0.25);
      background: linear-gradient(175deg, #0A0A0A 0%, #1A0A0A 100%); }
    .pn-viewer-header .pn-brand { margin-bottom:0; padding-bottom:0; border-bottom:none; }
    .pn-viewer-body { max-width:900px; margin:0 auto; padding:28px 24px 60px; }
    .pn-score-view { min-width:30px; text-align:center; font-weight:700; color:var(--gold); font-family:ui-monospace,monospace; font-size:14px; }

    @media (max-width: 760px) {
      .pn-shell { flex-direction:column; }
      .pn-mobile-toggle {
        display:flex; align-items:center; justify-content:center;
        position:fixed; top:14px; left:14px; z-index:40;
        width:42px; height:42px; border-radius:10px;
        background:rgba(10,10,10,0.9); border:1px solid rgba(210,31,31,0.4);
        color:#F5F5F5; font-size:20px; cursor:pointer;
      }
      .pn-mobile-backdrop {
        display:block; position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index:30;
      }
      .pn-sidebar {
        position:fixed; top:0; left:0; height:100vh; width:260px; z-index:35;
        transform: translateX(-100%); transition: transform 0.25s ease;
        display:flex; flex-direction:column; overflow-x:hidden; overflow-y:auto;
      }
      .pn-sidebar.pn-sidebar-open { transform: translateX(0); }
      .pn-sidebar-glow { display:none; }
      .pn-brand { margin-bottom:22px; padding-bottom:20px; border-bottom:1px solid rgba(210,31,31,0.25); }
      .pn-menu-section { display:block; }
      .pn-menu-item { width:100%; margin-bottom:6px; }
      .pn-sidebar-foot { display:block; }
      .pn-main { padding-top:70px; }
      .wm-welcome-title { font-size:26px; }
    }
  `;

  if (showWelcome) {
    return (
      <div className="pn-root">
        <style>{sharedStyle}</style>
        <div className="wm-welcome">
          <button
            className="wm-corner-lock"
            title="Masuk sebagai Admin"
            onClick={() => setShowAdminLogin(true)}
          >
            🔒
          </button>
          <div className="wm-welcome-card">
            <div className="wm-welcome-crest">WM</div>
            <p className="wm-welcome-eyebrow">Liga eFootball 2⚽26</p>
            <h1 className="wm-welcome-title">Selamat datang di<br /><span>Warung Madura Cup</span></h1>
            <p className="wm-welcome-sub">
              Panatau Perjalanan Turnamen Kalian, Informasi Tentang Klasmen Dan Jadwal Pertandingan Kalin.
            </p>
            {!showAdminLogin ? (
              <div className="wm-welcome-role-row">
                <button className="wm-welcome-btn" onClick={() => { setUserRole("penonton"); setShowWelcome(false); }}>MASUK AJA BRE</button>
              </div>
            ) : (
              <div className="wm-admin-login">
                <p className="wm-admin-login-label">🔒 Password Admin</p>
                <input
                  type="password"
                  className="wm-admin-input"
                  value={adminPasswordInput}
                  onChange={(e) => { setAdminPasswordInput(e.target.value); setAdminLoginError(""); }}
                  onKeyDown={(e) => e.key === "Enter" && handleAdminLogin()}
                  placeholder="Masukkan password"
                  autoFocus
                />
                {adminLoginError && <p className="wm-admin-error">{adminLoginError}</p>}
                <div className="wm-welcome-role-row">
                  <button className="wm-welcome-btn" onClick={handleAdminLogin}>Masuk</button>
                  <button
                    className="wm-welcome-btn wm-welcome-btn-outline"
                    onClick={() => { setShowAdminLogin(false); setAdminPasswordInput(""); setAdminLoginError(""); }}
                  >
                    Batal
                  </button>
                </div>
              </div>
            )}
            <p className="wm-welcome-foot">Fase Grup &middot; Musim 2026</p>
          </div>
        </div>
      </div>
    );
  }

  if (restoring) {
    return (
      <div className="pn-root">
        <style>{sharedStyle}</style>
        <div className="pn-loading-screen">Memuat turnamen tersimpan...</div>
      </div>
    );
  }

  const GroupTabs = () => (
    <div className="pn-group-tabs">
      {groupKeys.map((g) => (
        <button key={g} className={`pn-group-tab ${g === activeGroup ? "active" : ""}`} onClick={() => setActiveGroup(g)}>
          Grup {g}
        </button>
      ))}
    </div>
  );

  if (userRole === "penonton") {
    return (
      <div className="pn-root">
        <style>{sharedStyle}</style>
        <div className="pn-viewer">
          <header className="pn-viewer-header">
            <div className="pn-brand">
              <div className="pn-crest-wrap"><div className="pn-crest">WM</div></div>
              <div>
                <p className="pn-brand-title">WARUNG MADURA<span>CUP</span></p>
                <p className="pn-brand-sub">⚽ OKE KETUA</p>
              </div>
            </div>
            <button className="pn-btn" onClick={() => { setUserRole(null); setShowWelcome(true); }}>Keluar</button>
          </header>

          <div className="pn-viewer-body">
            {tournamentId ? (
              <>
                <div className="pn-page-head">
                  <p className="pn-eyebrow">{tournamentName}</p>
                  <h1 className="pn-page-title">Klasemen &amp; Jadwal</h1>
                  <p className="pn-sub">{finishedCount}/{groupMatches.length} laga selesai di grup {activeGroup}</p>
                </div>
                <GroupTabs />

                <div className="pn-panel">
                  <div className="pn-panel-head"><h2>Klasemen grup {activeGroup}</h2></div>
                  <div className="pn-table-wrap">
                    <table className="pn-table">
                      <thead>
                        <tr>
                          <th className="pn-th-team">Tim</th>
                          <th>MP</th><th>W</th><th>D</th><th>L</th>
                          <th>F</th><th>A</th><th>GD</th><th>P</th><th>%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeStandings.map((row, idx) => {
                          const totalM = teamTotalMatches[row.team.id] || 0;
                          const pct = totalM > 0 ? ((row.win / totalM) * 100).toFixed(1) : "0.0";
                          return (
                            <tr key={row.team.id} className={idx < 2 ? "pn-qualify" : ""}>
                              <td className="pn-td-team">
                                <span className="pn-rank">
                                  <span className="pn-rank-num">{idx + 1}</span>
                                  {row.team.name}
                                </span>
                              </td>
                              <td>{row.played}</td><td>{row.win}</td><td>{row.draw}</td><td>{row.lose}</td>
                              <td>{row.gf}</td><td>{row.ga}</td>
                              <td>{row.gd > 0 ? `+${row.gd}` : row.gd}</td>
                              <td className="pn-pts">{row.pts}</td>
                              <td className="pn-pct">{pct}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="pn-legend"><span className="pn-legend-dot" /> Peringkat 1&ndash;2 lolos ke babak berikutnya</div>
                </div>

                <div className="pn-panel">
                  <div className="pn-panel-head"><h2>Jadwal Pertandingan</h2></div>
                  {Object.keys(byMatchday).sort((a, b) => a - b).map((md) => {
                    const mdFinished = byMatchday[md].every((m) => m.home_score !== null && m.away_score !== null);
                    const isExpanded = expandedMatchdays[md] === true;
                    return (
                      <div key={md}>
                        <p
                          className="pn-round-label pn-round-label-clickable"
                          onClick={() => setExpandedMatchdays((prev) => ({ ...prev, [md]: !isExpanded }))}
                        >
                          Matchday {md}
                          <span className={`pn-round-status ${mdFinished ? "done" : ""}`}>
                            {mdFinished ? "✓ Selesai" : "Berjalan"}
                          </span>
                          <span className="pn-round-toggle">{isExpanded ? "▲" : "▼"}</span>
                        </p>
                        {isExpanded && byMatchday[md].map((m) => {
                          const done = m.home_score !== null && m.away_score !== null;
                          const home = teamsById[m.home_team_id];
                          const away = teamsById[m.away_team_id];
                          return (
                            <div className="pn-match" key={m.id}>
                              <div className="pn-match-date">
                                <b>{formatDate(m.match_date)}</b>
                                <span>{m.match_time} WIB</span>
                              </div>
                              <div className="pn-match-teams">
                                <div className="pn-match-row">
                                  <span className="pn-team-name">{home?.name}</span>
                                  <span className="pn-score-view">{m.home_score === null ? "-" : m.home_score}</span>
                                </div>
                                <div className="pn-match-row" style={{ marginTop: 4 }}>
                                  <span className="pn-team-name">{away?.name}</span>
                                  <span className="pn-score-view">{m.away_score === null ? "-" : m.away_score}</span>
                                </div>
                              </div>
                              <span className={`pn-status ${done ? "done" : ""}`}>{done ? "Selesai" : "Terjadwal"}</span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                  {lockedPair && (
                    <p className="pn-locked-note">
                      Matchday {lockedPair.join("-")} akan terbuka setelah semua laga Matchday {currentPair ? currentPair.join("-") : ""} di
                      semua grup selesai ({currentPairProgress.done}/{currentPairProgress.total} laga).
                    </p>
                  )}
                </div>
              </>
            ) : (
              <p className="pn-empty">Belum ada turnamen yang berjalan saat ini.</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pn-root">
      <style>{sharedStyle}</style>
      <div className="pn-shell">
        <button className="pn-mobile-toggle" onClick={() => setMobileMenuOpen(true)}>☰</button>
        {mobileMenuOpen && <div className="pn-mobile-backdrop" onClick={() => setMobileMenuOpen(false)} />}
        <aside className={`pn-sidebar ${mobileMenuOpen ? "pn-sidebar-open" : ""}`}>
          <div className="pn-sidebar-glow" />
          <div className="pn-brand">
            <div className="pn-crest-wrap">
              <div className="pn-crest">WM</div>
            </div>
            <div>
              <p className="pn-brand-title">WARUNG MADURA<span>CUP</span></p>
              <p className="pn-brand-sub">⚽ Liga eFootball &middot; 2026</p>
            </div>
          </div>
          <p className="pn-menu-section">Menu Turnamen</p>
          {MENU_ITEMS.map((item) => (
            <button
              key={item.key}
              className={`pn-menu-item ${activeMenu === item.key ? "active" : ""}`}
              disabled={item.key !== "pengaturan" && item.key !== "dashboard" && item.key !== "riwayat" && !tournamentId}
              onClick={() => { setActiveMenu(item.key); setMobileMenuOpen(false); }}
            >
              <span className="pn-menu-icon">{item.icon}</span>
              {item.label}
              {activeMenu === item.key && <span className="pn-menu-active-bar" />}
            </button>
          ))}
          {tournamentId && (
            <div className="pn-sidebar-foot">
              <span className="pn-sidebar-foot-dot" />
              {numGroups} grup &middot; {totalTeams} tim<br />
              <span className="pn-sidebar-foot-db">tersambung ke MySQL</span>
            </div>
          )}
        </aside>

        <main className="pn-main">
          <div className="pn-wrap">
            {error && <div className="pn-error">{error}</div>}

            {activeMenu === "dashboard" && (
              tournamentId ? (
                <>
                  <div className="pn-page-head">
                    <p className="pn-eyebrow">Ringkasan</p>
                    <h1 className="pn-page-title">Dashboard</h1>
                    <p className="pn-sub">Gambaran umum turnamen dari seluruh grup</p>
                  </div>

                  {champion && (
                    <div className="pn-champion-banner">
                      <span className="pn-champion-icon">🏆</span>
                      <div>
                        <p className="pn-champion-label">Juara turnamen</p>
                        <p className="pn-champion-name">{champion.name}</p>
                      </div>
                    </div>
                  )}

                  <div className="pn-stat-grid">
                    <div className="pn-stat-card">
                      <span className="pn-stat-icon">👥</span>
                      <div className="pn-stat-value">{totalTeams}</div>
                      <div className="pn-stat-label">Total tim</div>
                    </div>
                    <div className="pn-stat-card">
                      <span className="pn-stat-icon">🗂️</span>
                      <div className="pn-stat-value">{groupKeys.length}</div>
                      <div className="pn-stat-label">Grup</div>
                    </div>
                    <div className="pn-stat-card">
                      <span className="pn-stat-icon">⚽</span>
                      <div className="pn-stat-value">{matches.length}</div>
                      <div className="pn-stat-label">Total laga</div>
                    </div>
                    <div className="pn-stat-card">
                      <span className="pn-stat-icon">✅</span>
                      <div className="pn-stat-value">{finishedTotal}</div>
                      <div className="pn-stat-label">Laga selesai</div>
                    </div>
                    <div className="pn-stat-card">
                      <span className="pn-stat-icon">⏳</span>
                      <div className="pn-stat-value">{remainingTotal}</div>
                      <div className="pn-stat-label">Laga tersisa</div>
                    </div>
                  </div>

                  <div className="pn-panel">
                    <div className="pn-panel-head"><h2>Pemuncak tiap grup</h2></div>
                    <div className="pn-leader-grid">
                      {leaders.map(({ group, row }) => (
                        <div className="pn-leader-card" key={group}>
                          <div className="pn-leader-group">Grup {group}</div>
                          <div className="pn-leader-name">{row ? row.team.name : "-"}</div>
                          <div className="pn-leader-pts">{row ? `${row.pts} poin, ${row.played} main` : "Belum ada laga"}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="pn-panel">
                    <div className="pn-panel-head"><h2>Laga terdekat</h2></div>
                    {upcomingMatches.length === 0 ? (
                      <p className="pn-empty">Semua laga sudah selesai dimainkan.</p>
                    ) : (
                      upcomingMatches.map((m) => {
                        const home = teamsById[m.home_team_id];
                        const away = teamsById[m.away_team_id];
                        return (
                          <div className="pn-upcoming-row" key={m.id}>
                            <span className="pn-upcoming-date">{formatDate(m.match_date)}, {m.match_time}</span>
                            <span className="pn-upcoming-teams">{home?.name} vs {away?.name}</span>
                            <span className="pn-upcoming-group">Grup {m.group_key}</span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </>
              ) : <p className="pn-empty">Belum ada turnamen. Buka menu Pengaturan dulu.</p>
            )}

            {activeMenu === "pengaturan" && (
              !tournamentId ? (
                setupStep === "turnamen" ? (
                  <>
                    <div className="pn-page-head">
                      <p className="pn-eyebrow">Langkah 1 dari 2</p>
                      <h1 className="pn-page-title">Buat Turnamen</h1>
                      <p className="pn-sub">Beri nama turnamennya, lalu tentukan format grup</p>
                    </div>

                    <div className="pn-panel">
                      <div className="pn-panel-head"><h2>Nama turnamen</h2></div>
                      <input
                        className="pn-text-input"
                        type="text"
                        value={tournamentName}
                        onChange={(e) => setTournamentName(e.target.value)}
                        placeholder="Contoh: Warung Madura Cup 2026"
                      />
                    </div>

                    <div className="pn-panel">
                      <div className="pn-panel-head"><h2>Format grup</h2></div>
                      <div className="pn-select-row" style={{ marginBottom: 0 }}>
                        <label className="pn-select-wrap">
                          <span>Jumlah grup</span>
                          <select className="pn-select" value={numGroups} onChange={(e) => setNumGroups(Number(e.target.value))}>
                            {GROUP_OPTIONS.map((n) => <option key={n} value={n}>{n} grup</option>)}
                          </select>
                        </label>
                        <label className="pn-select-wrap">
                          <span>Tim / grup</span>
                          <select className="pn-select" value={teamsPerGroup} onChange={(e) => setTeamsPerGroup(Number(e.target.value))}>
                            {TEAMS_PER_GROUP_OPTIONS.map((n) => <option key={n} value={n}>{n} tim</option>)}
                          </select>
                        </label>
                      </div>
                    </div>

                    <div className="pn-actions" style={{ marginTop: 0, justifyContent: "flex-end" }}>
                      <button
                        className="pn-btn primary"
                        disabled={!tournamentName.trim()}
                        onClick={() => setSetupStep("peserta")}
                      >
                        Lanjut isi nama tim
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="pn-page-head">
                      <p className="pn-eyebrow">Langkah 2 dari 2 &middot; {tournamentName}</p>
                      <h1 className="pn-page-title">Isi Nama Tim</h1>
                      <p className="pn-sub">Isi nama tim yang ikut, lalu undi grup &amp; jadwal otomatis</p>
                    </div>

                    <div className="pn-panel">
                      <div className="pn-panel-head">
                        <h2>Peserta &middot; {totalTeamsSetup} tim, {numGroups} grup</h2>
                        <button className="pn-btn" style={{ marginLeft: "auto" }} onClick={fillSample}>Isi nama contoh</button>
                      </div>
                      <div className="pn-name-grid">
                        {teamNames.map((name, idx) => (
                          <div className="pn-name-field" key={idx}>
                            <label>Tim {idx + 1}</label>
                            <input type="text" value={name} placeholder={`Nama tim ${idx + 1}`} onChange={(e) => updateTeamName(idx, e.target.value)} />
                          </div>
                        ))}
                      </div>
                      <div className="pn-setup-foot">
                        <span className="pn-progress-note">{filledNames}/{totalTeamsSetup} nama tim sudah diisi</span>
                        <div className="pn-actions" style={{ marginTop: 0 }}>
                          <button className="pn-btn" onClick={() => setSetupStep("turnamen")}>Kembali</button>
                          <button className="pn-btn primary" disabled={loading} onClick={startTournament}>
                            {loading ? "Membuat..." : "Undi grup & buat jadwal"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </>
                )
              ) : (
                <>
                  <div className="pn-page-head">
                    <p className="pn-eyebrow">Pengaturan turnamen</p>
                    <h1 className="pn-page-title">{tournamentName}</h1>
                    <p className="pn-sub">{numGroups} grup &middot; {teamsPerGroup} tim/grup &middot; {totalTeams} tim total</p>
                  </div>
                  <div className="pn-panel">
                    <div className="pn-panel-head"><h2>Kelola turnamen berjalan</h2></div>
                    <div className="pn-actions" style={{ marginTop: 0 }}>
                      <button className="pn-btn" disabled={loading} onClick={resetScores}>Reset skor</button>
                      <button className="pn-btn primary" disabled={loading} onClick={redraw}>Undi ulang grup & jadwal</button>
                      <button className="pn-btn" disabled={loading} onClick={startNewTournament}>Mulai turnamen baru</button>
                    </div>
                  </div>
                </>
              )
            )}

            {activeMenu === "klasemen" && (
              tournamentId ? (
                <>
                  <div className="pn-page-head">
                    <p className="pn-eyebrow">Fase grup</p>
                    <h1 className="pn-page-title">Klasemen</h1>
                    <p className="pn-sub">{finishedCount}/{groupMatches.length} laga selesai di grup {activeGroup} &middot; klik nama tim untuk mengubahnya</p>
                  </div>
                  <GroupTabs />
                  <div className="pn-panel">
                    <div className="pn-table-wrap">
                      <table className="pn-table">
                        <thead>
                          <tr>
                            <th className="pn-th-team">Tim</th>
                            <th>MP</th><th>W</th><th>D</th><th>L</th>
                            <th>F</th><th>A</th><th>GD</th><th>P</th><th>%</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeStandings.map((row, idx) => {
                            const totalM = teamTotalMatches[row.team.id] || 0;
                            const pct = totalM > 0 ? ((row.win / totalM) * 100).toFixed(1) : "0.0";
                            return (
                              <tr key={row.team.id} className={idx < 2 ? "pn-qualify" : ""}>
                                <td className="pn-td-team">
                                  <span className="pn-rank">
                                    <span className="pn-rank-num">{idx + 1}</span>
                                    <input
                                      className="pn-team-edit"
                                      value={row.team.name}
                                      onChange={(e) => handleTeamNameChange(row.team.id, activeGroup, e.target.value)}
                                    />
                                  </span>
                                </td>
                                <td>{row.played}</td>
                                <td>{row.win}</td>
                                <td>{row.draw}</td>
                                <td>{row.lose}</td>
                                <td>{row.gf}</td>
                                <td>{row.ga}</td>
                                <td>{row.gd > 0 ? `+${row.gd}` : row.gd}</td>
                                <td className="pn-pts">{row.pts}</td>
                                <td className="pn-pct">{pct}%</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="pn-legend"><span className="pn-legend-dot" /> Peringkat 1&ndash;2 lolos ke babak berikutnya</div>
                  </div>
                </>
              ) : <p className="pn-empty">Belum ada turnamen. Buka menu Pengaturan dulu.</p>
            )}

            {activeMenu === "jadwal" && (
              tournamentId ? (
                <>
                  <div className="pn-page-head">
                    <p className="pn-eyebrow">Fase grup</p>
                    <h1 className="pn-page-title">Jadwal Pertandingan</h1>
                    <p className="pn-sub">Isi skor, klasemen otomatis diperbarui</p>
                  </div>
                  <GroupTabs />
                  <div className="pn-panel">
                    {Object.keys(byMatchday).sort((a, b) => a - b).map((md) => {
                      const mdFinished = byMatchday[md].every((m) => m.home_score !== null && m.away_score !== null);
                      const isExpanded = expandedMatchdays[md] === true;
                      const sampleMatch = byMatchday[md][0];
                      return (
                        <div key={md}>
                          <div className="pn-round-header">
                            <p
                              className="pn-round-label pn-round-label-clickable"
                              onClick={() => setExpandedMatchdays((prev) => ({ ...prev, [md]: !isExpanded }))}
                            >
                              Matchday {md}
                              <span className={`pn-round-status ${mdFinished ? "done" : ""}`}>
                                {mdFinished ? "✓ Selesai" : "Berjalan"}
                              </span>
                              <span className="pn-round-toggle">{isExpanded ? "▲" : "▼"}</span>
                            </p>
                            <div className="pn-round-datetime">
                              <input
                                className="pn-date-input"
                                type="date"
                                value={sampleMatch?.match_date ? sampleMatch.match_date.slice(0, 10) : ""}
                                onChange={(e) => handleMatchdayDateChange(md, e.target.value)}
                              />
                              <input
                                className="pn-time-input"
                                type="time"
                                value={sampleMatch?.match_time || ""}
                                onChange={(e) => handleMatchdayTimeChange(md, e.target.value)}
                              />
                            </div>
                          </div>
                          {isExpanded && byMatchday[md].map((m) => {
                            const done = m.home_score !== null && m.away_score !== null;
                            const home = teamsById[m.home_team_id];
                            const away = teamsById[m.away_team_id];
                            return (
                              <div className="pn-match" key={m.id}>
                                <div className="pn-match-teams">
                                  <div className="pn-match-row">
                                    <span className="pn-team-name">{home?.name}</span>
                                    <input className="pn-score-input" type="number" min="0" max="99"
                                      value={m.home_score === null ? "" : m.home_score} placeholder="-"
                                      onChange={(e) => handleScoreChange(m.id, "home_score", e.target.value)} />
                                  </div>
                                  <div className="pn-match-row" style={{ marginTop: 4 }}>
                                    <span className="pn-team-name">{away?.name}</span>
                                    <input className="pn-score-input" type="number" min="0" max="99"
                                      value={m.away_score === null ? "" : m.away_score} placeholder="-"
                                      onChange={(e) => handleScoreChange(m.id, "away_score", e.target.value)} />
                                  </div>
                                </div>
                                <span className={`pn-status ${done ? "done" : ""}`}>{done ? "Selesai" : "Terjadwal"}</span>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                    {lockedPair && (
                      <p className="pn-locked-note">
                        Matchday {lockedPair.join("-")} akan terbuka setelah semua laga Matchday {currentPair ? currentPair.join("-") : ""} di
                        semua grup selesai ({currentPairProgress.done}/{currentPairProgress.total} laga).
                      </p>
                    )}
                  </div>
                </>
              ) : <p className="pn-empty">Belum ada turnamen. Buka menu Pengaturan dulu.</p>
            )}

            {activeMenu === "bagan" && (
              tournamentId ? (
                <>
                  <div className="pn-page-head">
                    <p className="pn-eyebrow">Babak gugur</p>
                    <h1 className="pn-page-title">Bagan Turnamen</h1>
                    <p className="pn-sub">2 tim teratas tiap grup otomatis lolos ke babak gugur</p>
                  </div>

                  {champion && (
                    <div className="pn-champion-banner">
                      <span className="pn-champion-icon">🏆</span>
                      <div>
                        <p className="pn-champion-label">Juara turnamen</p>
                        <p className="pn-champion-name">{champion.name}</p>
                      </div>
                    </div>
                  )}

                  {!bracket.hasBracket ? (
                    <div className="pn-panel">
                      <p style={{ fontSize: 13, color: "var(--chalk-dim)", marginBottom: 16 }}>
                        Total tim yang akan lolos: <b style={{ color: "var(--chalk)" }}>{qualifiersCount}</b> tim
                        (peringkat 1 &amp; 2 dari {groupKeys.length} grup). Bagan hanya bisa dibuat kalau jumlah ini
                        pangkat dua (4, 8, 16, atau 32) &mdash; gunakan 2, 4, 8, atau 16 grup.
                      </p>
                      <button className="pn-btn primary" disabled={loading} onClick={generateBracket}>
                        {loading ? "Membuat..." : "Buat bagan babak gugur"}
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="pn-actions" style={{ marginTop: 0, marginBottom: 16 }}>
                        <button className="pn-btn" disabled={loading} onClick={generateBracket}>Buat ulang bagan</button>
                      </div>
                      <div className="pn-panel">
                        <div className="pn-bracket-wrap">
                          {bracket.rounds.map((round) => (
                            <div className="pn-bracket-col" key={round.roundSize}>
                              <p className="pn-bracket-col-title">{round.label}</p>
                              <div className="pn-bracket-matches">
                                {round.matches.map((m) => {
                                  const canPlay = m.team1 && m.team2;
                                  return (
                                    <div className="pn-bracket-match" key={m.id}>
                                      <div className="pn-bracket-team-row">
                                        <span className={`pn-bracket-team-name ${m.winner_id && m.team1 && m.winner_id === m.team1.id ? "winner" : ""}`}>
                                          {m.team1?.name || "TBD"}
                                        </span>
                                        <input
                                          className="pn-score-input" type="number" min="0" max="99"
                                          disabled={!canPlay}
                                          value={m.team1_score === null ? "" : m.team1_score} placeholder="-"
                                          onChange={(e) => handleKnockoutScoreChange(m.id, "team1_score", e.target.value)}
                                        />
                                      </div>
                                      <div className="pn-bracket-vs">vs</div>
                                      <div className="pn-bracket-team-row">
                                        <span className={`pn-bracket-team-name ${m.winner_id && m.team2 && m.winner_id === m.team2.id ? "winner" : ""}`}>
                                          {m.team2?.name || "TBD"}
                                        </span>
                                        <input
                                          className="pn-score-input" type="number" min="0" max="99"
                                          disabled={!canPlay}
                                          value={m.team2_score === null ? "" : m.team2_score} placeholder="-"
                                          onChange={(e) => handleKnockoutScoreChange(m.id, "team2_score", e.target.value)}
                                        />
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <p className="pn-progress-note">
                        Kalau laga berakhir seri dan diputuskan lewat adu penalti, tambahkan selisih 1 gol pada skor tim pemenang sebagai penanda (misalnya 1-0), karena skor tidak boleh sama di babak gugur.
                      </p>
                    </>
                  )}
                </>
              ) : <p className="pn-empty">Belum ada turnamen. Buka menu Pengaturan dulu.</p>
            )}

            {activeMenu === "riwayat" && (
              <>
                <div className="pn-page-head">
                  <p className="pn-eyebrow">Semua turnamen</p>
                  <h1 className="pn-page-title">Riwayat Turnamen</h1>
                  <p className="pn-sub">Buka kembali turnamen sebelumnya kapan saja</p>
                </div>

                {history.length > 1 && (
                  <div className="pn-actions" style={{ marginTop: 0, marginBottom: 16 }}>
                    <button className="pn-btn" disabled={loading} onClick={deleteAllExceptActive}>
                      Hapus semua riwayat lain
                    </button>
                  </div>
                )}

                {historyLoading ? (
                  <p className="pn-empty">Memuat riwayat...</p>
                ) : history.length === 0 ? (
                  <p className="pn-empty">Belum ada turnamen yang pernah dibuat.</p>
                ) : (
                  <div>
                    {history.map((t) => (
                      <div className={`pn-history-card ${t.id === tournamentId ? "active-tournament" : ""}`} key={t.id}>
                        <div className="pn-history-main">
                          <p className="pn-history-name">
                            {t.name} {t.id === tournamentId && <span className="pn-history-badge" style={{ marginLeft: 8 }}>Aktif</span>}
                          </p>
                          <p className="pn-history-meta">
                            {t.num_groups} grup &middot; {t.num_groups * t.teams_per_group} tim &middot; dibuat {formatDateTime(t.created_at)}
                          </p>
                        </div>
                        {t.champion_name && (
                          <span className="pn-history-champion">🏆 {t.champion_name}</span>
                        )}
                        <button className="pn-btn" disabled={loading || t.id === tournamentId} onClick={() => openTournament(t.id)}>
                          {t.id === tournamentId ? "Sedang dibuka" : "Buka"}
                        </button>
                        {t.id !== tournamentId && (
                          <button className="pn-btn" disabled={loading} onClick={() => deleteTournament(t.id)}>
                            Hapus
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}