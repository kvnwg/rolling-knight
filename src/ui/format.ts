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

export function secs(s: number): string {
  if (s < 60) return `${Math.ceil(s)}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${Math.floor(s % 60)}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
