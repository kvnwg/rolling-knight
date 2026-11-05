/**
 * Seeded PRNG (mulberry32), the same one Dumpster Legend uses. Game randomness that must be
 * reproducible (rolls, map generation, mob design) goes through this class.
 */
export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  /** Current internal state; persist it to resume the exact same sequence. */
  get state(): number {
    return this.s;
  }

  set state(v: number) {
    this.s = v >>> 0;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  float(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Uniform integer in [min, max] (inclusive). */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('Rng.pick on empty array');
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** Pick a key with probability proportional to its weight. Zero weights never win. */
  weighted<K>(entries: ReadonlyArray<readonly [K, number]>): K {
    let total = 0;
    for (const [, w] of entries) total += Math.max(0, w);
    if (total <= 0) throw new Error('Rng.weighted with no positive weights');
    let r = this.next() * total;
    let last: K | undefined;
    for (const [k, w] of entries) {
      if (w <= 0) continue;
      last = k;
      r -= w;
      if (r < 0) return k;
    }
    return last as K;
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /** A child generator with its own stream (for map or mob generation that shouldn't disturb this one). */
  fork(salt = 0): Rng {
    return new Rng(Rng.hashSeed((this.next() * 4294967296) ^ salt));
  }

  static hashSeed(n: number): number {
    let h = (n ^ 0x9e3779b9) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return (h ^ (h >>> 16)) >>> 0;
  }
}

/** Stable hash of a string to 32 bits (FNV-1a). */
export function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
