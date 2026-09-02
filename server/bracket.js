function isPowerOfTwo(n) {
  return n > 0 && (n & (n - 1)) === 0;
}

function roundLabel(roundSize) {
  if (roundSize === 1) return "Final";
  if (roundSize === 2) return "Semifinal";
  if (roundSize === 4) return "Perempat Final";
  if (roundSize === 8) return "16 Besar";
  if (roundSize === 16) return "32 Besar";
  return `Babak ${roundSize * 2} Besar`;
}

// standingsByGroup: { A: [row,...], B: [...] } (row.team = {id,name})
// Mengambil peringkat 1 & 2 tiap grup, lalu menyusun urutan bibit
// supaya peringkat 1 grup A ketemu peringkat 2 grup berikutnya (bukan grupnya sendiri).
function buildSeedOrder(standingsByGroup, groupKeys) {
  const rank1 = groupKeys.map((g) => standingsByGroup[g][0].team);
  const rank2 = groupKeys.map((g) => standingsByGroup[g][1].team);
  const n = groupKeys.length;
  const seedOrder = [];
  for (let i = 0; i < n; i++) {
    seedOrder.push(rank1[i]);
    seedOrder.push(rank2[(i + 1) % n]);
  }
  return seedOrder;
}

module.exports = { isPowerOfTwo, roundLabel, buildSeedOrder };