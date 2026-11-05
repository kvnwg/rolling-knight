/**
 * How a knight looks in PixelForge's style: which sheet its class uses, and the material ramps its
 * rarity and mutation paint over the sheet's own (metal, cloth, accent, leather; skin and hair per
 * knight). Commons wear iron and undyed cloth; each tier up wears a better metal and cloth dyed in
 * its rarity's color, all at PixelForge's lightness steps and muted chroma so the shading and the
 * style hold. Epic and up add a cape, Celestial and up a halo, Primordial cycles its colors; the
 * mutations repaint on top (Gilded gold, Shadow dark, Radiant light, Void purple-black with cyan).
 */
import { knightDef, type ClassId } from '../../core/knights';
import { RARITY_COLOR, rarityIndex, type Rarity } from '../../core/rarity';
import type { MutationId } from '../../core/state';
import type { SheetName } from './assets';
import { hexToOklch, mixHexes, oklchToHex, ramp, rampLike } from './color';
import type { Recolor } from './sheet';

export const KNIGHT_SHEET: Record<ClassId, SheetName> = {
  guardian: 'rk_guardian',
  blade: 'rk_blade',
  ranger: 'rk_ranger',
  cleric: 'rk_cleric',
  arcanist: 'rk_arcanist',
  lancer: 'rk_lancer',
};

// PixelForge's presets (style/style.json), dark to light.
export const PF = {
  iron: ['#3e4349', '#565b62', '#70757c', '#8b8f97'],
  steel: ['#50555e', '#6d727b', '#8b8f99', '#a7aab5'],
  bronze: ['#775230', '#8f6d46', '#a88a5e', '#c0a778'],
  gold: ['#926837', '#ac8450', '#c29e66', '#d5b67b'],
  accentGold: ['#bc8f5f', '#d2ab70'],
  accentSilver: ['#81868f', '#a0a5ae'],
  leatherBrown: ['#5e494c', '#735b51', '#826b5e'],
  leatherDark: ['#443333', '#554341', '#65534f'],
  leatherTan: ['#795d46', '#8c7258', '#9f886b'],
  skins: [
    ['#9f6f65', '#c08d80', '#dba292'],
    ['#aa8173', '#c69d8c', '#ddb3a0'],
    ['#865f4a', '#a3785f', '#bb9174'],
    ['#5f3e33', '#785444', '#8f6b57'],
  ],
  hairs: [
    ['#735b51', '#826b5e', '#957e6d'],
    ['#3f3a49', '#504a58', '#625a68'],
    ['#a08461', '#b7996c', '#cbb17d'],
    ['#7b4d42', '#8f5e4c', '#a3735c'],
    ['#797983', '#92919a', '#aeacb6'],
  ],
} as const;

const clothL = (l: number) => [l, l + 0.07];

interface Tier {
  metal: readonly string[];
  cloth: readonly string[];
  accent: readonly string[];
  leather: readonly string[];
}

/** One look per rarity (the order is RARITIES'). */
const TIERS: Record<Rarity, Tier> = {
  // Iron and undyed wool, a tarnished brass buckle.
  common: { metal: PF.iron, cloth: ramp(clothL(0.43), 0.022, 65), accent: ramp([0.56, 0.64], 0.04, 75), leather: PF.leatherBrown },
  // Bronze and forest green.
  uncommon: { metal: PF.bronze, cloth: ramp(clothL(0.42), 0.065, 148), accent: ramp([0.62, 0.7], 0.06, 80), leather: PF.leatherBrown },
  // Bright steel and royal blue.
  rare: { metal: PF.steel, cloth: ramp(clothL(0.42), 0.08, 258), accent: PF.accentSilver, leather: PF.leatherDark },
  // Silver with a violet sheen, purple cloth, gold trim.
  epic: { metal: rampLike(PF.steel, 0.032, 300, 4, 0.03), cloth: ramp(clothL(0.41), 0.09, 312), accent: PF.accentGold, leather: PF.leatherDark },
  // Gold, and cloth of gold.
  legendary: { metal: PF.gold, cloth: ramp(clothL(0.56), 0.095, 80), accent: ramp([0.72, 0.8], 0.09, 84), leather: PF.leatherDark },
  // Rose steel and magenta.
  mythic: { metal: rampLike(PF.steel, 0.048, 345, 3), cloth: ramp(clothL(0.41), 0.11, 352), accent: PF.accentGold, leather: PF.leatherDark },
  // Bronze gone green in its shadows (verdigris), and rust.
  ancient: { metal: [oklchToHex(0.39, 0.04, 178), oklchToHex(0.48, 0.045, 150), oklchToHex(0.58, 0.065, 92), oklchToHex(0.67, 0.07, 82)], cloth: ramp(clothL(0.42), 0.1, 42), accent: ramp([0.6, 0.68], 0.07, 70), leather: PF.leatherDark },
  // Blackened crimson steel, blood-red cloth, gold.
  exalted: { metal: ramp([0.36, 0.44, 0.53, 0.62], 0.05, 18, 4), cloth: ramp(clothL(0.38), 0.11, 24), accent: PF.accentGold, leather: PF.leatherDark },
  // Star-silver and azure.
  celestial: { metal: rampLike(PF.steel, 0.032, 235, 3, 0.06), cloth: ramp(clothL(0.46), 0.09, 228), accent: ramp([0.74, 0.81], 0.06, 88), leather: PF.leatherDark },
  // Aurora steel and mint.
  astral: { metal: rampLike(PF.steel, 0.045, 182, 3, 0.04), cloth: ramp(clothL(0.5), 0.09, 172), accent: ramp([0.7, 0.79], 0.03, 180), leather: PF.leatherDark },
  // White gold and ivory.
  divine: { metal: rampLike(PF.gold, 0.05, 86, 3, 0.05), cloth: ramp(clothL(0.7), 0.03, 88), accent: ramp([0.74, 0.81], 0.09, 82), leather: PF.leatherTan },
  // Obsidian with lavender cloth.
  eternal: { metal: ramp([0.32, 0.4, 0.49, 0.6], 0.035, 296, 3), cloth: ramp(clothL(0.5), 0.08, 296), accent: ramp([0.66, 0.75], 0.05, 300), leather: ramp([0.31, 0.35, 0.4], 0.02, 300) },
  // Cycling (see primordialTier); this is its look at step 0.
  primordial: { metal: PF.gold, cloth: PF.accentGold, accent: PF.accentGold, leather: PF.leatherDark },
};

/** Hue steps a Primordial knight's colors cycle through (palettes are cached per step). */
export const PRIMORDIAL_STEPS = 24;

/**
 * Primordial armor is opal: every shade a different hue (violet in the shadows to gold in the
 * light), the whole ramp turning round the wheel over time; the cloth is a deep, rich dye a little
 * bluer than the armor's shadows.
 */
function primordialTier(step: number): Tier {
  const h = (step / PRIMORDIAL_STEPS) * 360;
  return {
    metal: [oklchToHex(0.5, 0.075, h), oklchToHex(0.6, 0.08, h + 55), oklchToHex(0.7, 0.075, h + 110), oklchToHex(0.8, 0.065, h + 165)],
    cloth: ramp(clothL(0.42), 0.11, (h + 340) % 360),
    accent: ramp([0.74, 0.81], 0.09, 82),
    leather: PF.leatherDark,
  };
}

/** The step a still Primordial (menus, portraits) shows: violet to gold armor over royal blue. */
export const PRIMORDIAL_STILL = 18;

/** The mutations' paint over a tier: Gilded gold, Shadow dark, Radiant light, Void purple-black with a cyan glint. */
function mutate(t: Tier, m: MutationId | null, cls: ClassId): Tier {
  switch (m) {
    case 'gilded': {
      const gold = ramp([0.58, 0.67, 0.75, 0.81], 0.095, 70, 4);
      // Classes without armor gild their wood: the Ranger's bow, the casters' staves.
      const unarmored = cls === 'ranger' || cls === 'cleric' || cls === 'arcanist';
      return { ...t, metal: gold, accent: ramp([0.76, 0.82], 0.1, 85), leather: unarmored ? ramp([0.5, 0.58, 0.66], 0.085, 72, 4) : t.leather };
    }
    case 'shadow':
      return {
        metal: ramp([0.31, 0.36, 0.43, 0.51], 0.035, 300, 3),
        cloth: ramp([0.31, 0.37], 0.05, 305),
        accent: ramp([0.5, 0.6], 0.09, 305),
        leather: ramp([0.3, 0.33, 0.37], 0.02, 300),
      };
    case 'radiant':
      return {
        metal: ramp([0.66, 0.72, 0.78, 0.82], 0.035, 90, 2),
        // Halfway to white in lightness, softer in color (the order of the shades holds).
        cloth: t.cloth.map((c) => {
          const [L, C, h] = hexToOklch(c);
          return oklchToHex(L + (0.84 - L) * 0.5, C * 0.75, h);
        }),
        accent: ramp([0.76, 0.82], 0.09, 85),
        leather: PF.leatherTan,
      };
    case 'void':
      return {
        metal: [oklchToHex(0.3, 0.02, 290), oklchToHex(0.33, 0.035, 288), oklchToHex(0.38, 0.05, 284), oklchToHex(0.72, 0.11, 205)],
        cloth: ramp([0.3, 0.34], 0.04, 290),
        accent: ramp([0.64, 0.78], 0.11, 205, 0),
        leather: ramp([0.3, 0.32, 0.35], 0.02, 290),
      };
    default:
      return t;
  }
}

/** A stable small hash of a string. */
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export interface KnightPaint {
  cls: ClassId;
  rarity: Rarity;
  mutation: MutationId | null;
  sheet: SheetName;
  recolor: Recolor;
  /** Cache key for this paint (rarity, mutation, the Primordial step). */
  key: string;
  cape: readonly string[] | null;
  /** The halo's light and dark color (Celestial and up). */
  halo: [string, string] | null;
  /** The light a knight gives off (Legendary and up, and the mutations). */
  glow: string | null;
}

/** The Primordial color step at `timeSec` (0 for every other tier). */
export function paintStep(rarity: Rarity, timeSec: number): number {
  return rarity === 'primordial' ? Math.floor(timeSec * 0.15 * PRIMORDIAL_STEPS) % PRIMORDIAL_STEPS : 0;
}

const paintCache = new Map<string, KnightPaint>();

/** The paint for a knight (by id), with its mutation, at a Primordial color step. */
export function knightPaint(id: string, mutation: MutationId | null, step = 0): KnightPaint {
  const def = knightDef(id);
  const key = `${id}|${mutation ?? ''}|${def.rarity === 'primordial' ? step : 0}`;
  let p = paintCache.get(key);
  if (p) return p;
  const r = def.rarity;
  const tier = mutate(r === 'primordial' ? primordialTier(step) : TIERS[r], mutation, def.cls);
  const h = hashStr(def.name);
  const recolor: Recolor = {
    metal: tier.metal,
    cloth: tier.cloth,
    accent: tier.accent,
    leather: tier.leather,
    skin: PF.skins[h % PF.skins.length],
    hair: PF.hairs[(h >>> 8) % PF.hairs.length],
  };
  if (mutation === 'void') recolor.eyes = ['#6ae8ff'];
  if (mutation === 'shadow') recolor.skin = rampLike(PF.skins[h % PF.skins.length], 0.035, 30, 2, -0.1);
  const ri = rarityIndex(r);
  const tierColor = RARITY_COLOR[r];
  const halo: [string, string] | null = ri >= rarityIndex('celestial')
    ? [mixHexes(r === 'primordial' ? oklchToHex(0.85, 0.12, (step / PRIMORDIAL_STEPS) * 360) : tierColor, '#ffffff', 0.45), mixHexes(tierColor, '#3a263a', 0.35)]
    : null;
  let glow: string | null = ri >= rarityIndex('legendary') ? (r === 'primordial' ? tier.metal[3] : mixHexes(tierColor, tier.metal[3], 0.4)) : null;
  if (mutation === 'radiant') glow = '#fff2c0';
  else if (mutation === 'void') glow = '#6ae8ff';
  else if (mutation === 'shadow') glow = '#a060ff';
  p = {
    cls: def.cls,
    rarity: r,
    mutation,
    sheet: KNIGHT_SHEET[def.cls],
    recolor,
    key,
    cape: ri >= rarityIndex('epic') ? tier.cloth.map((c) => mixHexes(c, '#20101e', 0.12)) : null,
    halo,
    glow,
  };
  paintCache.set(key, p);
  if (paintCache.size > 400) paintCache.delete(paintCache.keys().next().value!);
  return p;
}

/** Every rarity's ramps (for tests and previews). */
export function tierRamps(r: Rarity): Tier {
  return r === 'primordial' ? primordialTier(PRIMORDIAL_STILL) : TIERS[r];
}
