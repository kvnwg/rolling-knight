/**
 * How a knight's attacks look at each rarity: the colors of its swings and shots, and what each tier
 * adds on top. Commons swing a clean white smear with pale steel edges and shoot plain shots; every
 * few tiers adds one visible thing, and once on it stays on:
 *
 *   uncommon   the knight's rarity color (a smear's edge, the fletching, trails and sparks)
 *   rare       a thicker colored edge on smears; an ink edge round shots, so they stand off any floor
 *   epic       a smear in the tier's color behind the white one; longer trails, after-images on shots
 *   legendary  shots shed sparkles
 *   mythic     a second return line and speed lines in an accent color; twin trails, a third spark
 *   ancient    rings on impact
 *   exalted    star bursts: a smear's tip glints, impacts burst
 *   celestial  bigger, a second color: a second smear layer, wider halos
 *   divine     light rays on impact
 *   eternal    a smear's rim lingers a frame after it's gone
 *   primordial a rainbow that turns
 *
 * Past primordial, absolute (Kevin's) drops all of that for the plainest and biggest: clean white and
 * black, and shockwaves. A mutation repaints the colors (Gilded gold, Shadow violet-black, Radiant
 * white-gold, Void purple with a cyan edge) and keeps the tier's extras. Pure data: no DOM, so the
 * preview sheet and the tests read it too. Every effect is drawn crisp and flat on the unlit top layer:
 * none of them glows, blooms or lights the scene (only the setting does).
 */
import type { ClassId } from '../../core/knights';
import { RARITIES, rarityIndex, type Rarity } from '../../core/rarity';
import type { SkillId } from '../../core/skillbook';
import type { MutationId } from '../../core/state';
import { oklchToHex } from '../pf/color';

/** Five shades, darkest to hottest: deep, dark, mid, light, hot (the near-white core). */
export type Ramp = readonly [string, string, string, string, string];

export interface VfxLook {
  rarity: Rarity;
  mutation: MutationId | null;
  /** 0 (common) .. 12 (primordial), 13 (absolute). */
  level: number;
  ramp: Ramp;
  /** The second color: the second smear layer, return lines, sparkles, stars. */
  accent: string;
  /** Rare and up: an ink edge (the deepest shade) round strokes and shots, so they stand off any floor. */
  edge: boolean;
  /** Smear layers behind the white one, and after-images behind shots (epic 1, celestial 2). */
  echoes: number;
  /** Shot streaks and trails are this many times the common length. */
  trail: number;
  /** How many sparkles a shot sheds (about this many per 0.1 s of flight). */
  sparkles: number;
  /** A second return line and speed lines; twin trails behind shots. */
  double: boolean;
  /** Rings on impact. */
  ring: boolean;
  /** Star bursts: a smear's tip glints, impacts burst. */
  star: boolean;
  /** Light rays. */
  rays: boolean;
  /** A smear's rim lingers a frame after it's gone. */
  linger: boolean;
  /** Primordial: the colors turn round the wheel along the stroke and over time. */
  rainbow: boolean;
  /** The rainbow's hue at its start (degrees; 0 for every other tier). */
  hue: number;
  /** Absolute (Kevin's): white and black only, clean shockwaves instead of sparkle. */
  mono: boolean;
  /** Size of smears and impacts (1 at common). */
  scale: number;
  /** Small number unique to this look (sprite cache keys). */
  id: number;
}

/** The first tier with each extra (exported for the tests and the preview sheet). */
export const TIER_FROM = {
  tint: 'uncommon',
  edge: 'rare',
  echo: 'epic',
  sparkles: 'legendary',
  double: 'mythic',
  ring: 'ancient',
  star: 'exalted',
  grand: 'celestial',
  rays: 'divine',
  linger: 'eternal',
  rainbow: 'primordial',
} as const satisfies Record<string, Rarity>;

/**
 * The tier past primordial (Kevin's). It may not be in RARITIES on every branch, so it's matched by
 * name, and placed one past primordial where RARITIES doesn't know it.
 */
export const ABSOLUTE = 'absolute';

export function isAbsolute(r: Rarity | undefined): boolean {
  return (r as string | undefined) === ABSOLUTE;
}

/** A tier's place on the ladder (0 = common). */
export function levelOf(r: Rarity): number {
  const i = rarityIndex(r);
  if (i >= 0) return i;
  return isAbsolute(r) ? rarityIndex('primordial') + 1 : 0;
}

const at = (r: Rarity, from: Rarity) => levelOf(r) >= levelOf(from);

/**
 * Hand-set ramps per tier, built round the rarity's UI color (RARITY_COLOR) with even steps, the
 * shadows a little cooler and the lights a little warmer, the hot shade almost white. Keyed by name
 * (not Record<Rarity>), so a tier added later falls back to common's instead of breaking the build.
 */
const RAMPS: Readonly<Record<string, { ramp: Ramp; accent: string }>> = {
  common: { ramp: ['#3c4458', '#6c7890', '#a8b4c8', '#dde5f0', '#ffffff'], accent: '#ffffff' },
  uncommon: { ramp: ['#1e4a30', '#2f8a44', '#5cc65a', '#b4f0a4', '#f4fff0'], accent: '#e8ffd8' },
  rare: { ramp: ['#1a2e6a', '#2a5cc0', '#3d9cf0', '#a8dcff', '#f4fbff'], accent: '#d8f0ff' },
  epic: { ramp: ['#3a1a5e', '#6e2fb0', '#b05ae8', '#e2b4ff', '#fff4ff'], accent: '#f4dcff' },
  legendary: { ramp: ['#6a3010', '#c06a10', '#ffb81f', '#ffe48a', '#fffbe8'], accent: '#fff4c0' },
  mythic: { ramp: ['#5a1038', '#b02a6e', '#ff4fa3', '#ffb4d8', '#fff4fa'], accent: '#ffe0f0' },
  ancient: { ramp: ['#4a2a18', '#8a5428', '#d2884a', '#f4cc94', '#fff6e8'], accent: '#6ae0c0' },
  exalted: { ramp: ['#4a0a18', '#a81830', '#ff3b4e', '#ffa4a4', '#fff2ee'], accent: '#ffd88a' },
  celestial: { ramp: ['#123a6a', '#1e7ab8', '#38e8ff', '#b4f8ff', '#ffffff'], accent: '#ffe8a0' },
  astral: { ramp: ['#0e3e4a', '#1a9a7a', '#4dffb4', '#c4ffe6', '#ffffff'], accent: '#c8a4ff' },
  divine: { ramp: ['#6a4a1e', '#c0903c', '#f6d47a', '#fff4d6', '#ffffff'], accent: '#ffffff' },
  eternal: { ramp: ['#2a1a5a', '#6a4ab8', '#c9b3ff', '#ece4ff', '#ffffff'], accent: '#8af4ff' },
  // Kevin's: no color at all. Clean white with black ink.
  [ABSOLUTE]: { ramp: ['#000000', '#141418', '#b8b8c2', '#eeeef4', '#ffffff'], accent: '#000000' },
};

const MUTATION_RAMPS: Record<MutationId, { ramp: Ramp; accent: string }> = {
  gilded: { ramp: ['#5a3a10', '#a87420', '#e8b440', '#ffe89a', '#fffbe8'], accent: '#fff4c0' },
  shadow: { ramp: ['#0e0816', '#2a1440', '#5a2a8a', '#a070e0', '#e4d0ff'], accent: '#c890ff' },
  radiant: { ramp: ['#8a6a3a', '#e0c080', '#fff0c0', '#fffbea', '#ffffff'], accent: '#ffffff' },
  void: { ramp: ['#0a0614', '#26143e', '#4a2a7a', '#6ae8ff', '#e8ffff'], accent: '#6ae8ff' },
};

/** Hue steps the primordial rainbow turns through, and how many it turns per second. */
export const RAINBOW_STEPS = 12;
const RAINBOW_RATE = 6;

/** A rainbow shade: one of the five ramp lightnesses at a hue (degrees). */
export function rainbowShade(shade: number, hue: number): string {
  const L = [0.36, 0.5, 0.68, 0.85, 0.97][shade];
  const C = [0.1, 0.15, 0.17, 0.11, 0.04][shade];
  return oklchToHex(L, C, ((hue % 360) + 360) % 360);
}

/** The primordial ramp at a hue step. */
function rainbowRamp(step: number): Ramp {
  const h = (step / RAINBOW_STEPS) * 360;
  return [rainbowShade(0, h - 20), rainbowShade(1, h - 10), rainbowShade(2, h), rainbowShade(3, h + 12), rainbowShade(4, h + 20)];
}

/** The primordial hue step at a time (seconds); 0 for every other tier. */
export function rainbowStep(rarity: Rarity, timeSec: number): number {
  return rarity === 'primordial' ? ((Math.floor(timeSec * RAINBOW_RATE) % RAINBOW_STEPS) + RAINBOW_STEPS) % RAINBOW_STEPS : 0;
}

const looks = new Map<string, VfxLook>();
let nextId = 1;

/** The look of a knight's attacks: its rarity, its mutation, the primordial hue step. */
export function vfxLook(rarity: Rarity, mutation: MutationId | null = null, step = 0): VfxLook {
  const s = rarity === 'primordial' ? ((step % RAINBOW_STEPS) + RAINBOW_STEPS) % RAINBOW_STEPS : 0;
  const key = `${rarity}|${mutation ?? ''}|${s}`;
  let L = looks.get(key);
  if (L) return L;
  const level = levelOf(rarity);
  const absolute = isAbsolute(rarity);
  const base = mutation && !absolute
    ? MUTATION_RAMPS[mutation]
    : rarity === 'primordial'
      ? { ramp: rainbowRamp(s), accent: rainbowShade(3, ((s + RAINBOW_STEPS / 2) / RAINBOW_STEPS) * 360) }
      : (RAMPS[rarity] ?? RAMPS.common);
  L = absolute
    ? {
        // Understated and devastating: no sparkle, no color, no stars. The biggest, cleanest cut of
        // all, in white with black ink, and shockwaves.
        rarity, mutation, level, ramp: base.ramp, accent: base.accent, edge: true, echoes: 0, trail: 2.4, sparkles: 0, double: false,
        ring: true, star: false, rays: false, linger: true, rainbow: false, hue: 0, mono: true, scale: 1.5, id: nextId++,
      }
    : {
        rarity,
        mutation,
        level,
        ramp: base.ramp,
        accent: base.accent,
        edge: at(rarity, TIER_FROM.edge),
        echoes: at(rarity, TIER_FROM.grand) ? 2 : at(rarity, TIER_FROM.echo) ? 1 : 0,
        trail: at(rarity, TIER_FROM.grand) ? 2 : at(rarity, TIER_FROM.echo) ? 1.6 : at(rarity, TIER_FROM.tint) ? 1.25 : 1,
        sparkles: at(rarity, TIER_FROM.rainbow) ? 12 : at(rarity, TIER_FROM.rays) ? 10 : at(rarity, TIER_FROM.grand) ? 8 : at(rarity, TIER_FROM.ring) ? 5 : at(rarity, TIER_FROM.sparkles) ? 3 : 0,
        double: at(rarity, TIER_FROM.double),
        ring: at(rarity, TIER_FROM.ring),
        star: at(rarity, TIER_FROM.star),
        rays: at(rarity, TIER_FROM.rays),
        linger: at(rarity, TIER_FROM.linger),
        rainbow: rarity === 'primordial' && !mutation,
        hue: rarity === 'primordial' ? (s / RAINBOW_STEPS) * 360 : 0,
        mono: false,
        scale: 1 + level * 0.025,
        id: nextId++,
      };
  looks.set(key, L);
  return L;
}

/** Every tier, commonest first, absolute last (whether or not RARITIES has it on this branch). */
export function everyTier(): Rarity[] {
  const all: Rarity[] = [...RARITIES];
  if (!all.some(isAbsolute)) all.push(ABSOLUTE as Rarity);
  return all;
}

// ------------------------------------------------------------------ what a swing looks like

/**
 * Melee strokes. slash: the Blade's crescent; chop: the Guardian's short heavy arc onto its foe;
 * thrust: the Lancer's streak to its reach; and the skills' bigger cuts in the same language.
 */
export type SwingStyle = 'slash' | 'chop' | 'thrust' | 'cleave' | 'bash' | 'slam' | 'stab' | 'impale' | 'spin';

export const SWING_STYLES: readonly SwingStyle[] = ['slash', 'chop', 'thrust', 'cleave', 'bash', 'slam', 'stab', 'impale', 'spin'];

export type MeleeClass = Extract<ClassId, 'guardian' | 'blade' | 'lancer'>;

/** Each melee class's auto attack. */
export const MELEE_SWING: Readonly<Record<MeleeClass, SwingStyle>> = { guardian: 'chop', blade: 'slash', lancer: 'thrust' };

export function isMelee(cls: ClassId | undefined): cls is MeleeClass {
  return cls === 'guardian' || cls === 'blade' || cls === 'lancer';
}

/**
 * The stroke a skill's cast plays (null: the skill doesn't swing: a war cry, a guard, a throw, a
 * leap; whirlwind and the lunges are channels, drawn while they run).
 */
const SKILL_SWING: Partial<Record<SkillId, SwingStyle | null>> = {
  shieldSlam: 'bash',
  groundPound: 'slam',
  titansWrath: 'slam',
  twinSlash: 'slash',
  thousandCuts: 'slash',
  shadowstep: 'stab',
  excalibur: 'cleave',
  sweep: 'spin',
  impale: 'impale',
};

/** The stroke a melee knight's swing plays: its class's auto attack, or the skill it just cast. */
export function swingStyleFor(cls: ClassId | undefined, skill: SkillId | null): SwingStyle | null {
  if (!isMelee(cls)) return null;
  if (skill) return SKILL_SWING[skill] ?? null;
  return MELEE_SWING[cls];
}
