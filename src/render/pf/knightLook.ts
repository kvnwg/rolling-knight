/**
 * How a knight looks in PixelForge's style: which sheet its class uses, and the material ramps its
 * rarity and mutation paint over the sheet's own (metal, cloth, accent, leather; skin and hair per
 * knight). Commons wear iron and undyed cloth; each tier up wears a better metal and cloth dyed in
 * its rarity's color, all at PixelForge's lightness steps and muted chroma so the shading and the
 * style hold. Epic and up add a cape (unless the class wears a cloak of its own), Celestial and up a
 * halo, Primordial cycles its colors; the mutations repaint on top (Gilded gold, Shadow dark, Radiant
 * light, Void purple-black with cyan).
 *
 * Each class is drawn with a silhouette and a two-tone outfit of its own (the Blade's dark tunic and
 * bright scarf, the Cleric's white robe under a gold cloak and mitre): the tier's dye goes on through
 * the class's own values (dressed), so a light robe stays light and a vivid scarf stays the vivid
 * part, and a part dyed apart (cloth2: a scarf, a cloak; metal2: the Lancer's helm and spearhead)
 * takes a second tone of the tier.
 */
import { KEVIN_ID, knightDef, type ClassId } from '../../core/knights';
import { RARITY_COLOR, rarityIndex, type Rarity } from '../../core/rarity';
import type { MutationId } from '../../core/state';
import { SHEETS, type SheetName } from './assets';
import { hexToOklch, mixHexes, oklchToHex, ramp, rampLike, warmer } from './color';
import type { Recolor } from './sheet';

/** The sheet each class is drawn from (recolored per rarity and mutation). */
export const KNIGHT_SHEET: Record<ClassId, SheetName> = {
  guardian: 'rk_guardian',
  blade: 'rk_blade',
  ranger: 'rk_ranger',
  cleric: 'rk_cleric',
  arcanist: 'rk_arcanist',
  lancer: 'rk_lancer',
};

/**
 * Knights drawn from a sheet of their own instead of their class's, in that sheet's own colors (no
 * rarity recolor): Kevin, the one Absolute knight, a plain guy in a tee. A sheet listed here plays
 * its class's animations (the same names), so it needs all of them.
 */
export const KNIGHT_SHEET_BY_ID: Readonly<Record<string, SheetName>> = {
  [KEVIN_ID]: 'rk_kevin',
};

/** The sheet a knight is drawn from: its own, or its class's. */
export function knightSheet(id: string): SheetName {
  return KNIGHT_SHEET_BY_ID[id] ?? KNIGHT_SHEET[knightDef(id).cls];
}

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
  /** A part dyed apart: a scarf, a cloak, a mitre (dressed: the class's own values in the tier's dye). */
  cloth2?: readonly string[];
  /** A part in another metal: the Lancer's helm and spearhead (the tier's trim metal). */
  metal2?: readonly string[];
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
  // Kevin: no shining armor, just plain dark clothes (he doesn't need it).
  absolute: { metal: ramp([0.3, 0.38, 0.47, 0.56], 0.01, 260, 4), cloth: ramp(clothL(0.3), 0.01, 260), accent: ramp([0.5, 0.58], 0.01, 260), leather: PF.leatherDark },
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

/** How a class's sheet paints a material: its lightness per shade, and its chroma and hue. */
interface Design {
  L: number[];
  C: number;
  h: number;
}

const designs = new Map<string, Design | null>();

/** The sheet's own colors of `mat` (null when it has none): lightness by shade, a missing shade a step from its neighbour. */
function designOf(sheet: SheetName, mat: string, shades: number): Design | null {
  const key = `${sheet}|${mat}`;
  if (designs.has(key)) return designs.get(key)!;
  const L: Array<number | undefined> = Array.from({ length: shades });
  let C = 0;
  let h = 0;
  let n = 0;
  for (const [hex, a, m, shade] of SHEETS[sheet].meta.colors) {
    if (m !== mat || a !== 255 || shade >= shades) continue;
    const o = hexToOklch(hex);
    L[shade] = o[0];
    C += o[1];
    h = o[2];
    n++;
  }
  let d: Design | null = null;
  if (n) {
    const step = 0.065;
    for (let i = 0; i < shades; i++) if (L[i] === undefined) for (let j = 1; j < shades; j++) {
      if (L[i - j] !== undefined) { L[i] = L[i - j]! + step * j; break; }
      if (L[i + j] !== undefined) { L[i] = L[i + j]! - step * j; break; }
    }
    d = { L: L as number[], C: C / n, h };
  }
  designs.set(key, d);
  return d;
}

/**
 * The tier's dye (`tier`, a ramp) put on through a class's own values (`d`): the class's lightness
 * steps, a little lighter or darker as the dye is, at the dye's hue (turned by `dh`), and the dye's
 * chroma scaled by how vivid the class's own color is against `refC` (a near-white robe stays
 * nearly white, a vivid scarf takes the dye at full strength). Without a design, the tier's ramp.
 */
function dress(tier: readonly string[], d: Design | null, refL: number, refC: number, dh = 0): string[] {
  if (!d) return [...tier];
  const [Lt, Ct] = hexToOklch(tier[Math.min(1, tier.length - 1)]);
  const h0 = hexToOklch(tier[0])[2];
  const lo = Math.min(...d.L);
  const hi = Math.max(...d.L);
  const dL = Math.max(0.31 - lo, Math.min(0.83 - hi, (Lt - refL) * 0.5));
  const C = Ct * Math.max(0.3, Math.min(1.2, d.C / refC));
  return d.L.map((L, i) => oklchToHex(L + dL, C, warmer((h0 + dh + 360) % 360, 5 * i)));
}

/** A tier dressed for a class's sheet: its cloth, its second cloth and its leather through the class's values, its trim metal from its accent. */
function dressFor(t: Tier, sheet: SheetName): Tier {
  const cloth = designOf(sheet, 'cloth', 2);
  const cloth2 = designOf(sheet, 'cloth2', 2);
  // A second dye a little round the wheel from the first, as the class's own two are (both vivid).
  const dh = cloth && cloth2 && cloth.C > 0.06 && cloth2.C > 0.06 ? Math.max(-25, Math.min(25, ((cloth2.h - cloth.h + 540) % 360) - 180)) : 0;
  const [, aC, aH] = hexToOklch(t.accent[t.accent.length - 1]);
  return {
    ...t,
    cloth: dress(t.cloth, cloth, 0.49, 0.09),
    cloth2: dress(t.cloth, cloth2, 0.49, 0.09, dh),
    leather: dress(t.leather, designOf(sheet, 'leather', 3), 0.45, 0.03),
    metal2: t.metal.map((x, i) => oklchToHex(Math.min(0.83, hexToOklch(x)[0] + 0.03), Math.max(0.02, Math.min(0.1, aC)), warmer(aH, 4 * i))),
  };
}

/** The mutations' paint over a tier: Gilded gold, Shadow dark, Radiant light, Void purple-black with a cyan glint. */
function mutate(t: Tier, m: MutationId | null, cls: ClassId): Tier {
  // Halfway to white in lightness, softer in color (the order of the shades holds).
  const whiten = (r: readonly string[]) =>
    r.map((c) => {
      const [L, C, h] = hexToOklch(c);
      return oklchToHex(L + (0.84 - L) * 0.5, C * 0.75, h);
    });
  switch (m) {
    case 'gilded': {
      const gold = ramp([0.58, 0.67, 0.75, 0.81], 0.095, 70, 4);
      // Classes without armor gild their wood: the Ranger's bow, the casters' staves.
      const unarmored = cls === 'ranger' || cls === 'cleric' || cls === 'arcanist';
      return { ...t, metal: gold, metal2: gold, accent: ramp([0.76, 0.82], 0.1, 85), leather: unarmored ? ramp([0.5, 0.58, 0.66], 0.085, 72, 4) : t.leather };
    }
    case 'shadow': {
      const metal = ramp([0.31, 0.36, 0.43, 0.51], 0.035, 300, 3);
      return {
        metal,
        metal2: metal,
        cloth: ramp([0.31, 0.37], 0.05, 305),
        cloth2: ramp([0.36, 0.43], 0.085, 300),
        accent: ramp([0.5, 0.6], 0.09, 305),
        leather: ramp([0.3, 0.33, 0.37], 0.02, 300),
      };
    }
    case 'radiant': {
      const metal = ramp([0.66, 0.72, 0.78, 0.82], 0.035, 90, 2);
      return {
        metal,
        metal2: metal,
        cloth: whiten(t.cloth),
        ...(t.cloth2 ? { cloth2: whiten(t.cloth2) } : {}),
        accent: ramp([0.76, 0.82], 0.09, 85),
        leather: PF.leatherTan,
      };
    }
    case 'void': {
      const metal = [oklchToHex(0.3, 0.02, 290), oklchToHex(0.33, 0.035, 288), oklchToHex(0.38, 0.05, 284), oklchToHex(0.72, 0.11, 205)];
      return {
        metal,
        metal2: metal,
        cloth: ramp([0.3, 0.34], 0.04, 290),
        cloth2: ramp([0.33, 0.39], 0.06, 212),
        accent: ramp([0.64, 0.78], 0.11, 205, 0),
        leather: ramp([0.3, 0.32, 0.35], 0.02, 290),
      };
    }
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
  const sheet = knightSheet(id);
  const base = r === 'primordial' ? primordialTier(step) : TIERS[r];
  // The tier as it is (the cape), and dressed for the class's outfit (the knight).
  const plain = mutate(base, mutation, def.cls);
  const tier = mutate(dressFor(base, sheet), mutation, def.cls);
  const h = hashStr(def.name);
  const recolor: Recolor = {
    metal: tier.metal,
    cloth: tier.cloth,
    accent: tier.accent,
    leather: tier.leather,
    skin: PF.skins[h % PF.skins.length],
    hair: PF.hairs[(h >>> 8) % PF.hairs.length],
  };
  if (tier.cloth2) recolor.cloth2 = tier.cloth2;
  if (tier.metal2) recolor.metal2 = tier.metal2;
  if (mutation === 'void') recolor.eyes = ['#6ae8ff'];
  if (mutation === 'shadow') recolor.skin = rampLike(PF.skins[h % PF.skins.length], 0.035, 30, 2, -0.1);
  const ri = rarityIndex(r);
  const tierColor = RARITY_COLOR[r];
  // A knight with a sheet of its own wears that sheet's colors and none of the tier's trappings
  // (Kevin doesn't need a cape or a halo); a mutation still gives off its light.
  const own = id in KNIGHT_SHEET_BY_ID;
  const halo: [string, string] | null = !own && ri >= rarityIndex('celestial')
    ? [mixHexes(r === 'primordial' ? oklchToHex(0.85, 0.12, (step / PRIMORDIAL_STEPS) * 360) : tierColor, '#ffffff', 0.45), mixHexes(tierColor, '#3a263a', 0.35)]
    : null;
  let glow: string | null = !own && ri >= rarityIndex('legendary') ? (r === 'primordial' ? tier.metal[3] : mixHexes(tierColor, tier.metal[3], 0.4)) : null;
  if (mutation === 'radiant') glow = '#fff2c0';
  else if (mutation === 'void') glow = '#6ae8ff';
  else if (mutation === 'shadow') glow = '#a060ff';
  p = {
    cls: def.cls,
    rarity: r,
    mutation,
    sheet,
    recolor: own ? {} : recolor,
    key,
    // (A class that wears a cloak of its own has it dyed in the tier's color instead.)
    cape: !own && !SHEETS[sheet].meta.cloak && ri >= rarityIndex('epic') ? plain.cloth.map((c) => mixHexes(c, '#20101e', 0.12)) : null,
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
