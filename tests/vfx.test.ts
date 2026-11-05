import { describe, expect, it } from 'vitest';
import { CLASS_IDS, type ClassId } from '../src/core/knights';
import { RARITIES, RARITY_COLOR, rarityIndex, type Rarity } from '../src/core/rarity';
import { CLASS_SKILLS } from '../src/core/skillbook';
import type { PixelBuf } from '../src/render/pixel/buf';
import {
  IMPACT_FRAMES, IMPACT_KINDS, SHOT_ART, SHOT_DIRS, STEEL, SWING_DIRS, SWING_FRAMES, SWING_TIMING, arrowSprite, dangerRamp, dirIndex, impactSprite,
  lungeSprite, swingFrameAt, swingSprite, whirlSprite, type VfxSprite,
} from '../src/render/vfx/art';
import {
  ABSOLUTE, MELEE_SWING, SWING_STYLES, TIER_FROM, everyTier, isAbsolute, isMelee, levelOf, rainbowStep, swingStyleFor, vfxLook, type VfxLook,
} from '../src/render/vfx/look';
import { Vfx } from '../src/render/vfx/vfx';
import type { Fx, Shot, Unit } from '../src/world/entities';
import type { World } from '../src/world/world';

const HEX = /^#[0-9a-f]{6}$/;
const KEVIN = ABSOLUTE as Rarity;
const upToPrimordial = RARITIES.filter((r) => !isAbsolute(r));

/** Opaque pixels in a buffer, and whether every alpha is all or nothing (no half-transparent mush). */
function pixels(b: PixelBuf | null): { n: number; crisp: boolean } {
  if (!b) return { n: 0, crisp: true };
  let n = 0;
  let crisp = true;
  for (let i = 3; i < b.px.length; i += 4) {
    if (b.px[i] === 255) n++;
    else if (b.px[i] !== 0) crisp = false;
  }
  return { n, crisp };
}

function size(s: VfxSprite): number {
  return pixels(s.buf).n;
}

function crisp(s: VfxSprite): boolean {
  return pixels(s.buf).crisp;
}

describe('tier looks', () => {
  it('every tier has a look, Kevin\'s absolute included (whether or not RARITIES lists it yet)', () => {
    const tiers = everyTier();
    expect(tiers.at(-1)).toBe(KEVIN);
    expect(new Set(tiers).size).toBe(tiers.length);
    for (const r of tiers) {
      const L = vfxLook(r, null, 2);
      expect(L.ramp).toHaveLength(5);
      for (const c of [...L.ramp, L.accent]) expect(c, r).toMatch(HEX);
      expect(L.level).toBe(levelOf(r));
    }
    expect(levelOf(KEVIN)).toBe(rarityIndex('primordial') + 1);
  });

  it('keeps commons clean: white and pale steel, no extras', () => {
    const L = vfxLook('common');
    expect(L).toMatchObject({ edge: false, echoes: 0, sparkles: 0, double: false, ring: false, star: false, rays: false, linger: false, rainbow: false, mono: false, scale: 1, trail: 1 });
  });

  it('adds one visible thing every few tiers, and once on it stays on up to primordial', () => {
    const on: Record<keyof typeof TIER_FROM, (L: VfxLook) => boolean> = {
      tint: (L) => L.ramp[2] !== vfxLook('common').ramp[2],
      edge: (L) => L.edge,
      echo: (L) => L.echoes > 0 && L.trail > 1.25,
      sparkles: (L) => L.sparkles > 0,
      double: (L) => L.double,
      ring: (L) => L.ring,
      star: (L) => L.star,
      grand: (L) => L.echoes >= 2,
      rays: (L) => L.rays,
      linger: (L) => L.linger,
      rainbow: (L) => L.rainbow,
    };
    for (const [feature, from] of Object.entries(TIER_FROM) as Array<[keyof typeof TIER_FROM, Rarity]>) {
      for (const r of upToPrimordial) expect(on[feature](vfxLook(r, null, 1)), `${feature} at ${r}`).toBe(rarityIndex(r) >= rarityIndex(from));
    }
    // Bigger at every tier, and never fewer sparkles or a shorter trail.
    for (let i = 1; i < upToPrimordial.length; i++) {
      const a = vfxLook(upToPrimordial[i - 1], null, 1);
      const b = vfxLook(upToPrimordial[i], null, 1);
      expect(b.scale).toBeGreaterThan(a.scale);
      expect(b.sparkles).toBeGreaterThanOrEqual(a.sparkles);
      expect(b.trail).toBeGreaterThanOrEqual(a.trail);
    }
  });

  it('paints each tier in its rarity color', () => {
    for (const r of upToPrimordial) {
      if (r === 'common' || r === 'primordial') continue;
      expect(vfxLook(r).ramp, r).toContain(RARITY_COLOR[r]);
    }
  });

  it('turns the primordial rainbow with time; only the primordial', () => {
    const steps = new Set<number>();
    for (let t = 0; t < 3; t += 0.05) steps.add(rainbowStep('primordial', t));
    expect(steps.size).toBeGreaterThan(6);
    expect(rainbowStep('legendary', 1.234)).toBe(0);
    const a = vfxLook('primordial', null, 0);
    const b = vfxLook('primordial', null, 6);
    expect(a.rainbow && b.rainbow).toBe(true);
    expect(a.ramp[2]).not.toBe(b.ramp[2]);
    expect(a.id).not.toBe(b.id);
  });

  it('gives Kevin the biggest, plainest look of all: white and black, shockwaves, no sparkle', () => {
    const K = vfxLook(KEVIN);
    const P = vfxLook('primordial', null, 3);
    expect(K.mono).toBe(true);
    expect(K.rainbow).toBe(false);
    expect(K.sparkles).toBe(0);
    expect(K.ring).toBe(true);
    expect(K.scale).toBeGreaterThan(P.scale);
    expect(K.ramp[0]).toBe('#000000');
    expect(K.ramp[4]).toBe('#ffffff');
    // And a mutation can't color him in.
    expect(vfxLook(KEVIN, 'gilded').ramp).toEqual(K.ramp);
  });

  it('lets a mutation repaint the colors and keep the tier\'s extras', () => {
    const base = vfxLook('celestial');
    const gilded = vfxLook('celestial', 'gilded');
    expect(gilded.ramp).not.toEqual(base.ramp);
    expect(gilded).toMatchObject({ edge: base.edge, echoes: base.echoes, sparkles: base.sparkles, double: base.double, ring: base.ring, star: base.star, scale: base.scale });
  });
});

describe('every attack has an effect', () => {
  it('gives every melee class a stroke and every ranged class none (they shoot)', () => {
    for (const cls of CLASS_IDS) {
      const style = swingStyleFor(cls, null);
      if (isMelee(cls)) expect(style, cls).toBe(MELEE_SWING[cls]);
      else expect(style, cls).toBeNull();
    }
    expect(Object.keys(MELEE_SWING).sort()).toEqual(CLASS_IDS.filter(isMelee).sort());
    // Every melee skill either swings in one of the strokes or is drawn another way (null).
    for (const cls of CLASS_IDS.filter(isMelee)) for (const id of CLASS_SKILLS[cls]) {
      const s = swingStyleFor(cls, id);
      if (s) expect(SWING_STYLES).toContain(s);
    }
    expect(swingStyleFor('blade', 'twinSlash')).toBe('slash');
    expect(swingStyleFor('lancer', 'impale')).toBe('impale');
    expect(swingStyleFor('blade', 'battleCry')).toBeNull();
  });

  it('draws every stroke in every direction, on the pixel grid, the leading frames never empty', () => {
    for (const style of SWING_STYLES) {
      for (const r of ['common', 'rare', 'celestial', 'primordial', KEVIN] as Rarity[]) {
        const L = vfxLook(r, null, 4);
        for (let dir = 0; dir < SWING_DIRS; dir += 3) {
          for (let f = 0; f < SWING_FRAMES; f++) {
            const s = swingSprite(style, L, dir, dir % 2 ? 1 : -1, f, f === 1);
            expect(crisp(s), `${style} ${r} ${dir} ${f}`).toBe(true);
            // The smear and the streak show; after them only Kevin's shockwave.
            if (f <= 1) expect(size(s), `${style} ${r} ${dir} ${f}`).toBeGreaterThan(f === 0 ? 20 : 6);
            else if (!isAbsolute(r) && !(f === 2 && L.linger)) expect(size(s), `${style} ${r} ${dir} ${f}`).toBe(0);
          }
        }
      }
    }
  });

  it('draws the smear flat white; the tiers tint its edge and lay smears of their color behind it', () => {
    const colors = (s: VfxSprite) => {
      const out = new Map<string, number>();
      const b = s.buf!;
      for (let i = 0; i < b.px.length; i += 4) {
        if (!b.px[i + 3]) continue;
        const c = `#${[b.px[i], b.px[i + 1], b.px[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
        out.set(c, (out.get(c) ?? 0) + 1);
      }
      return out;
    };
    const most = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const common = colors(swingSprite('slash', vfxLook('common'), 0, 1, 0, false));
    expect(most(common)).toBe('#ffffff');
    expect([...common.keys()].sort()).toEqual(['#92a1b9', '#c7cfdd', '#ffffff'].filter((c) => common.has(c)).sort());
    const rare = vfxLook('rare');
    expect(colors(swingSprite('slash', rare, 0, 1, 0, false)).has(rare.ramp[3])).toBe(true);
    const leg = vfxLook('legendary');
    const legC = colors(swingSprite('slash', leg, 0, 1, 0, false));
    expect(most(legC)).toBe('#ffffff');
    expect(legC.get(leg.ramp[2]) ?? 0).toBeGreaterThan(20);
    const kevin = colors(swingSprite('slash', vfxLook(KEVIN), 0, 1, 0, false));
    expect([...kevin.keys()].every((c) => c === '#ffffff' || c === '#000000' || c === '#d8d8e0')).toBe(true);
  });

  it('makes the rarer tiers and crits bigger', () => {
    const at = (r: Rarity, crit = false) => size(swingSprite('slash', vfxLook(r, null, 2), 4, 1, 0, crit));
    expect(at('legendary')).toBeGreaterThan(at('common'));
    expect(at('celestial')).toBeGreaterThan(at('legendary'));
    // Kevin's is the biggest of all: it reaches furthest (the rarer tiers' extras add pixels, not reach).
    const reach = (r: Rarity) => swingSprite('slash', vfxLook(r, null, 2), 0, 1, 0, false).buf!.w;
    expect(reach(KEVIN)).toBeGreaterThan(reach('primordial'));
    expect(at('common', true)).toBeGreaterThan(at('common'));
  });

  it('draws the channels: whirlwind round the knight, the lunge along its way', () => {
    for (const r of ['common', 'epic', 'primordial', KEVIN] as Rarity[]) {
      for (let dir = 0; dir < SWING_DIRS; dir += 4) {
        expect(size(whirlSprite(vfxLook(r), dir, dir % 3))).toBeGreaterThan(30);
        expect(size(lungeSprite(vfxLook(r), dir, dir % 3))).toBeGreaterThan(30);
      }
    }
  });

  it('draws every kind of shot in every direction and frame, on the pixel grid', () => {
    for (const [kind, art] of Object.entries(SHOT_ART) as Array<[Shot['kind'], (typeof SHOT_ART)[Shot['kind']]]>) {
      for (const r of ['common', 'epic', 'celestial', 'primordial'] as Rarity[]) {
        for (let dir = 0; dir < SHOT_DIRS; dir++) {
          for (let f = 0; f < art.frames; f++) {
            const s = art.draw(vfxLook(r, null, 1), dir, f);
            expect(size(s), `${kind} ${r} ${dir} ${f}`).toBeGreaterThan(4);
            expect(crisp(s)).toBe(true);
          }
        }
      }
    }
  });

  it('turns the arrow by whole-pixel mirrors: opposite directions are exact mirror images', () => {
    const L = vfxLook('common');
    const flat = (s: VfxSprite) => {
      const b = s.buf!;
      const rows: string[] = [];
      for (let y = 0; y < b.h; y++) {
        let row = '';
        for (let x = 0; x < b.w; x++) row += b.px[(y * b.w + x) * 4 + 3] ? 'x' : '.';
        rows.push(row);
      }
      return rows;
    };
    const right = flat(arrowSprite(L, 0, false, 0));
    const left = flat(arrowSprite(L, 8, false, 0));
    expect(left).toEqual(right.map((r) => [...r].reverse().join('')));
    const seen = new Set<string>();
    for (let d = 0; d < 16; d++) seen.add(flat(arrowSprite(L, d, false, 0)).join('/'));
    expect(seen.size).toBe(16);
    expect(dirIndex(1, 0, 16)).toBe(0);
    expect(dirIndex(0, 1, 16)).toBe(4);
    expect(dirIndex(-1, 0, 16)).toBe(8);
    expect(dirIndex(0, -1, 16)).toBe(12);
  });

  it('gives foes\' shots a saturated danger ring, even when their color is pale', () => {
    for (const c of ['#fff4f0', '#e8e8e8', '#ff6a6a', '#9adf5a']) {
      const r = dangerRamp(c);
      expect(r[0]).toMatch(HEX);
      expect(r[4]).toBe('#ffffff');
      const [R, G, B] = [1, 3, 5].map((i) => parseInt(r[2].slice(i, i + 2), 16));
      expect(Math.max(R, G, B) - Math.min(R, G, B), c).toBeGreaterThan(60);
    }
  });

  it('bursts every kind of impact, sized to the hit', () => {
    for (const kind of IMPACT_KINDS) {
      const s = impactSprite(kind, vfxLook('legendary'), STEEL, 1, 0, 3);
      expect(size(s), kind).toBeGreaterThan(2);
      for (let f = 0; f < IMPACT_FRAMES; f++) expect(crisp(impactSprite(kind, vfxLook('celestial'), STEEL, 1.4, f, 5))).toBe(true);
    }
    expect(size(impactSprite('burst', vfxLook('common'), STEEL, 1.6, 1))).toBeGreaterThan(size(impactSprite('burst', vfxLook('common'), STEEL, 1, 1)));
  });

  it('plays a swing\'s frames in order over the swing', () => {
    expect(SWING_TIMING.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    let last = 0;
    for (let u = 0; u < 1; u += 0.01) {
      const f = swingFrameAt(u);
      expect(f).toBeGreaterThanOrEqual(last);
      last = f;
    }
    expect(last).toBe(SWING_FRAMES - 1);
  });
});

// ------------------------------------------------------------------ the runtime, on a stand-in world

function unit(cls: ClassId, extra: Partial<Unit> = {}): Unit {
  return {
    uid: 1, team: 'hero', x: 100, y: 100, vx: 0, vy: 0, r: 4, hp: 10, maxHp: 10, atk: 1, armor: 0, speed: 56, dir: 1, view: 'side', moving: false,
    animT: 0, swingT: 0, swingDur: 0.26, aimX: 1, aimY: 0, hurtT: 0, invuln: 0, dr: 1, drT: 0, stunT: 0, slowT: 0, burnT: 0, burnDps: 0, dead: false,
    flying: false, cls, knightId: `rare-${cls}`, rarity: 'rare', slot: 0, ...extra,
  } as Unit;
}

/** Just what the effects read; its rng throws if anything touches it (the sim's dice are not ours). */
function world(heroes: Unit[]): World {
  const rng = new Proxy({}, { get: () => { throw new Error('the effects touched the sim\'s rng'); } });
  return { heroes, mobs: [], shots: [] as Shot[], fx: [] as Fx[], time: 1, rewind: null, bossUnit: null, rng } as unknown as World;
}

function shot(kind: Shot['kind'], extra: Partial<Shot> = {}): Shot {
  return { uid: 50, team: 'hero', x: 150, y: 90, vx: 200, vy: 0, r: 2, dmg: 1, life: 1, kind, color: '#f0e0b0', from: 1, ...extra };
}

describe('the effects at play', () => {
  it('starts a stroke on the tick a melee blow lands, and marks each foe it hit in its own way', () => {
    for (const [cls, style, mark] of [['blade', 'slash', 'cut'], ['guardian', 'chop', 'thud'], ['lancer', 'thrust', 'pierce']] as const) {
      const h = unit(cls);
      const w = world([h]);
      const v = new Vfx();
      v.update(w);
      // The blow lands: the sim marks the foe it hit, and someone else's hit far off.
      h.swingT = h.swingDur = 0.26;
      w.fx.push({ kind: 'hit', x: 116, y: 94, color: '#9a6d3e' }, { kind: 'hit', x: 400, y: 380, color: '#9a6d3e' });
      w.time += 0.016;
      v.update(w);
      expect(v.playing().map((s) => s.style), cls).toEqual([style]);
      expect(v.playing()[0].dir).toBe(0);
      expect(v.bursts().map((b) => b.kind), cls).toEqual([mark]);
      // Our mark replaces the generic spark on our foe; the far one is left to the renderer.
      expect(w.fx).toHaveLength(1);
      expect(w.fx[0].x).toBe(400);
    }
  });

  it('swings nothing for the ranged classes, and nothing for a skill that doesn\'t swing', () => {
    for (const cls of ['ranger', 'cleric', 'arcanist'] as const) {
      const h = unit(cls);
      const w = world([h]);
      const v = new Vfx();
      v.update(w);
      h.swingT = h.swingDur = 0.22;
      w.time += 0.016;
      v.update(w);
      expect(v.playing()).toHaveLength(0);
    }
    const h = unit('blade');
    const w = world([h]);
    const v = new Vfx();
    v.update(w);
    h.swingT = h.swingDur = 0.35;
    h.lastSkill = { skill: 'battleCry', at: w.time, n: 1, free: false };
    w.time += 0.016;
    v.update(w);
    expect(v.playing()).toHaveLength(0);
  });

  it('bursts a shot where it ended: what it hit, a wall, or nothing; a bolt\'s own splash replaces the blast', () => {
    const cases: Array<[Shot['kind'], Partial<Shot>, Fx | null, string]> = [
      ['arrow', {}, { kind: 'hit', x: 152, y: 92, color: '#9a6d3e' }, 'spark'],
      ['orb', { color: '#fff0a0' }, { kind: 'hit', x: 150, y: 91 }, 'holy'],
      ['bullet', { team: 'mob', color: '#ff6a6a' }, { kind: 'hit', x: 151, y: 90, color: '#ff5a5a' }, 'pop'],
      ['spear', {}, { kind: 'crit', x: 150, y: 90 }, 'pierce'],
      ['arrow', {}, { kind: 'dust', x: 150, y: 90, color: '#f0e0b0' }, 'wall'],
      ['arrow', {}, null, 'fizzle'],
      ['bolt', { color: '#b08aff', splash: 16 }, { kind: 'blast', x: 150, y: 90, color: '#b08aff', size: 1 }, 'burst'],
    ];
    for (const [kind, extra, fx, want] of cases) {
      const h = unit('ranger');
      const w = world([h]);
      const v = new Vfx();
      w.shots.push(shot(kind, extra));
      v.update(w);
      expect(v.stats().shots).toBe(1);
      w.shots.length = 0;
      if (fx) w.fx.push(fx);
      w.time += 0.016;
      v.update(w);
      expect(v.stats().shots).toBe(0);
      expect(v.bursts().map((b) => b.kind), `${kind} ${want}`).toEqual([want]);
      // The hit and the bolt's blast are ours to draw now; a wall's grit stays the renderer's too.
      if (fx && fx.kind !== 'dust') expect(w.fx, `${kind} ${want}`).toHaveLength(0);
    }
  });

  it('sparks where a piercing shot goes through a foe, and keeps flying', () => {
    const h = unit('lancer');
    const w = world([h]);
    const v = new Vfx();
    const s = shot('spear', { pierce: 3, hit: new Set() });
    w.shots.push(s);
    v.update(w);
    s.hit!.add(9);
    s.x += 4;
    w.fx.push({ kind: 'hit', x: s.x, y: s.y });
    w.time += 0.016;
    v.update(w);
    expect(v.stats().shots).toBe(1);
    expect(v.bursts().map((b) => b.kind)).toEqual(['pierce']);
  });
});
