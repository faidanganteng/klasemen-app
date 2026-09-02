const TIME_SLOTS = ["15:30", "18:00"];

function buildGroupKeys(numGroups) {
  return Array.from({ length: numGroups }, (_, i) => String.fromCharCode(65 + i));
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function assignGroups(teams, teamsPerGroup, groupKeys) {
  const shuffled = shuffleArray(teams);
  const groups = {};
  groupKeys.forEach((k, gi) => {
    groups[k] = shuffled.slice(gi * teamsPerGroup, gi * teamsPerGroup + teamsPerGroup);
  });
  return groups;
}

// Metode lingkaran (circle method) untuk leg pertama: n tim -> n-1 ronde,
// n/2 laga per ronde. Jika jumlah tim ganjil, ditambah "bye" (null) yang dilewati.
// Leg kedua = leg pertama diulang dengan tuan rumah & tamu dibalik,
// sehingga setiap tim bertemu tim lain dua kali (kandang-tandang).
function roundRobinRounds(teams) {
  let arr = [...teams];
  if (arr.length % 2 !== 0) arr = [...arr, null];
  const n = arr.length;
  const firstLeg = [];
  for (let r = 0; r < n - 1; r++) {
    const roundMatches = [];
    for (let i = 0; i < n / 2; i++) {
      const home = arr[i];
      const away = arr[n - 1 - i];
      if (home && away) roundMatches.push(r % 2 === 0 ? [home, away] : [away, home]);
    }
    firstLeg.push(roundMatches);
    arr.splice(1, 0, arr.pop());
  }
  const secondLeg = firstLeg.map((round) => round.map(([home, away]) => [away, home]));
  return [...firstLeg, ...secondLeg];
}

function nextSaturday(from) {
  const d = new Date(from);
  const day = d.getDay();
  const add = (6 - day + 7) % 7 || 7;
  d.setDate(d.getDate() + add);
  return d;
}

// groups: { A: [{id,name}, ...], B: [...] }
// return: daftar laga siap disimpan ke tabel matches
function buildSchedule(groups, groupKeys) {
  const start = nextSaturday(new Date());
  const matches = [];
  groupKeys.forEach((g) => {
    const rounds = roundRobinRounds(groups[g]);
    rounds.forEach((round, rIdx) => {
      const date = new Date(start);
      date.setDate(date.getDate() + rIdx * 7);
      round.forEach((pair, mIdx) => {
        matches.push({
          group_key: g,
          matchday: rIdx + 1,
          match_date: date.toISOString().slice(0, 10),
          match_time: TIME_SLOTS[mIdx % TIME_SLOTS.length],
          home_team_id: pair[0].id,
          away_team_id: pair[1].id,
        });
      });
    });
  });
  return matches;
}

module.exports = { buildGroupKeys, assignGroups, buildSchedule };