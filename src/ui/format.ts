/** Number formatting for the menus: 1,234 then 12.3K, 4.5M, 7.8B... */
export function fmt(n: number): string {
  if (!Number.isFinite(n)) return '∞';
  const a = Math.abs(n);
  if (a < 10_000) return Math.round(n).toLocaleString('en-US');
  const units = ['K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp'];
  let v = n / 1000;
  let i = 0;
  while (Math.abs(v) >= 1000 && i < units.length - 1) {
    v /= 1000;
    i++;
  }
  return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)}${units[i]}`;
}

/** "1 in 1,234,567". */
export function oneIn(n: number): string {
  return `1 in ${n < 1e7 ? Math.round(n).toLocaleString('en-US') : fmt(n)}`;
}

/** A count, short: 80, 2.5K, 25K, 150K, 1M, 2.5B (three figures at most, no trailing ".0"). */
export function short(n: number): string {
  if (!Number.isFinite(n)) return '∞';
  const sign = n < 0 ? '-' : '';
  let v = Math.abs(n);
  if (v < 1000) return `${sign}${Math.round(v)}`;
  const units = ['K', 'M', 'B', 'T', 'Qa', 'Qi'];
  v /= 1000;
  for (let i = 0; ; i++) {
    const r = v >= 100 ? Math.round(v) : Math.round(v * 10) / 10;
    // Rounding can reach the next unit (999,960 is 1M, not 1000K).
    if (r >= 1000 && i < units.length - 1) {
      v /= 1000;
      continue;
    }
    return `${sign}${r}${units[i]}`;
  }
}

/** Odds, short: "1 in 80", "1 in 25K", "1 in 1M", "1 in 2.5B". */
export function oneInShort(n: number): string {
  return `1 in ${short(n)}`;
}

export function secs(s: number): string {
  if (s < 60) return `${Math.ceil(s)}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${Math.floor(s % 60)}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
