/** Small shared helpers for the good-roll effects: the UI pixel unit, numbers, colors, a hash. */
import { RARITIES, RARITY_COLOR, type Rarity } from '../../core/rarity';

/** CSS px per art pixel (the UI's --u, 2 to 4), read off the page. */
export function readU(el?: Element | null): number {
  const v = parseFloat(getComputedStyle(el ?? document.documentElement).getPropertyValue('--u'));
  return Number.isFinite(v) && v > 0 ? v : 3;
}

const SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No'];

/** 999, 1K, 2.1K, 19.6K, 892M (Dumpster Legend's formatNumber). */
export function fmtNum(value: number): string {
  if (!Number.isFinite(value)) return value > 0 ? '∞' : '-∞';
  const sign = value < 0 ? '-' : '';
  const v = Math.abs(value);
  if (v < 1000) return sign + Math.floor(v).toString();
  let tier = Math.floor(Math.log10(v) / 3);
  let scaled = v / Math.pow(1000, tier);
  if (scaled >= 1000) {
    tier += 1;
    scaled /= 1000;
  }
  let body: string;
  if (scaled < 100) {
    const floored = Math.floor(scaled * 10) / 10;
    body = floored % 1 === 0 ? floored.toFixed(0) : floored.toFixed(1);
  } else body = Math.floor(scaled).toString();
  return sign + body + (SUFFIX[tier] ?? `e${tier * 3}`);
}

/** A "1 in X" number: 1,234 up to 99,999, then 250K, 4.5M. */
export function fmtOdds(x: number): string {
  return x < 100000 ? Math.round(x).toLocaleString('en-US') : fmtNum(x);
}

/** A stable 0..1 from an integer (Dumpster Legend's reelStrip hash). */
export function hash(n: number): number {
  let h = Math.imul(n + 0x9e37, 0x9e3779b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return ((h >>> 0) % 100000) / 100000;
}

/** A tier's light (rarity index). */
export function tierColor(tier: number): string {
  return RARITY_COLOR[RARITIES[Math.max(0, Math.min(RARITIES.length - 1, tier))]];
}

/** `a` mixed toward `b` by `t` (hex in, hex out). */
export function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) + (((pb >> s) & 255) - ((pa >> s) & 255)) * t);
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
}

/** The rainbow tiers: their stamps, titles and odds plates run through every color. */
export const RAINBOW_TIERS: ReadonlySet<Rarity> = new Set<Rarity>(['mythic', 'primordial']);

/** Three hard color bands for a tier's lettering (light, its color, dark), or 'rainbow'. */
export function rarityBands(r: Rarity): readonly string[] | 'rainbow' {
  if (RAINBOW_TIERS.has(r)) return 'rainbow';
  const c = RARITY_COLOR[r];
  return [mixHex(c, '#ffffff', 0.62), c, mixHex(c, '#1a1326', 0.3)];
}

export const CONFETTI_COLORS = ['#ff5252', '#ffc233', '#5bc236', '#42a5f5', '#c48bff', '#ffffff'] as const;
