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

// PixelForge's presets (style/style.json, its vivid second design pass), dark to light.
export const PF = {
  iron: ['#3f4348', '#63686f', '#8b8f97', '#b6b9bf'],
  steel: ['#4c535e', '#737b88', '#9ea5b3', '#cdd1db'],
  bronze: ['#864e1b', '#b17434', '#d69e5b', '#f5cd94'],
  gold: ['#996000', '#c38600', '#e4b243', '#fee18c'],
  obsidian: ['#2f2f3e', '#4d4a5c', '#6e687b', '#908998'],
  roseGold: ['#99523f', '#c67656', '#ed9f77', '#ffd2b5'],
  blued: ['#1a4f80', '#4275b2', '#719dde', '#a7c6fe'],
  accentGold: ['#df9c21', '#ffcc59'],
  accentSilver: ['#9a9fa8', '#ccd1db'],
  accentPearl: ['#c8c4b7', '#ebe8da'],
  leatherBrown: ['#5e494c', '#735b51', '#826b5e'],
  leatherDark: ['#482d28', '#64463c', '#7d6255'],
  leatherBlack: ['#302e3b', '#494554', '#635e6b'],
  leatherTan: ['#8c5c3b', '#ae7d52', '#cba276'],
  // light, fair, tan, deep, ebony, porcelain
  skins: [
    ['#9f6f65', '#c08d80', '#dba292'],
    ['#c4917d', '#e7b094', '#ffd4b9'],
    ['#a0684d', '#c58864', '#e3ae87'],
    ['#724130', '#945e45', '#b08063'],
    ['#60352a', '#7f503e', '#9a6f5a'],
    ['#c3ac9f', '#dfc7b7', '#f8e4d3'],
  ],
  // brown, black, blonde, auburn, silver, fire, platinum, raven, chestnut, golden, copper, snow, and
  // the bright ones (HAIR_NATURAL on): bubblegum, lavender, sky, mint.
  hairs: [
    ['#735b51', '#826b5e', '#957e6d'],
    ['#2c2e45', '#484762', '#66627c'],
    ['#c7943d', '#e7b852', '#ffde84'],
    ['#8b3724', '#b25634', '#d07d55'],
    ['#848591', '#acadbb', '#d6d6e3'],
    ['#b83022', '#e4531f', '#ff8342'],
    ['#b0ab98', '#cdcab4', '#eae9d5'],
    ['#22304a', '#3c4867', '#596280'],
    ['#6c3623', '#905538', '#ad7858'],
    ['#c98000', '#eca407', '#ffd06f'],
    ['#b54e18', '#dc7020', '#f89b4d'],
    ['#b0b9bf', '#c9d2da', '#e5ecf4'],
    ['#c45f8c', '#f27ca2', '#ffb2bf'],
    ['#816ab9', '#aa87de', '#d3a9f8'],
    ['#2a8ab8', '#50abe4', '#8ccbff'],
    ['#46987b', '#5cbca2', '#86deca'],
  ],
} as const;

/** How many of PF.hairs are natural colors (the rest are bright: no wizard's beard is bubblegum pink). */
const HAIR_NATURAL = 12;

/** A two-shade cloth at lightness `l`, a full PixelForge step apart. */
const clothL = (l: number) => [l, l + 0.12];

interface Tier {
  metal: readonly string[];
  cloth: readonly string[];
  accent: readonly string[];
  leather: readonly string[];
  /** A part dyed apart: a scarf, a cloak, a plume (dressed: the class's own values in the tier's dye). */
  cloth2?: readonly string[];
  /** A third cloth (the Ranger's tunic under its hood and mantle): the tier's trim, dressed. */
  cloth3?: readonly string[];
  /** A part in another metal: the Lancer's winged cap (the tier's trim metal). */
  metal2?: readonly string[];
  /** A gem (the Arcanist's orb): the rarity's own color. */
  accent2?: readonly string[];
}

/** One look per rarity (the order is RARITIES'), in PixelForge's vivid presets. */
const TIERS: Record<Rarity, Tier> = {
  // Iron and undyed wool, a tarnished brass buckle.
  common: { metal: PF.iron, cloth: ramp(clothL(0.5), 0.026, 72), accent: ramp([0.6, 0.72], 0.05, 78), leather: PF.leatherBrown },
  // Bronze and emerald.
  uncommon: { metal: PF.bronze, cloth: ramp(clothL(0.48), 0.14, 150), accent: ramp([0.66, 0.78], 0.09, 80), leather: PF.leatherBrown },
  // Bright steel and royal blue.
  rare: { metal: PF.steel, cloth: ramp(clothL(0.45), 0.17, 262), accent: PF.accentSilver, leather: PF.leatherBlack },
  // Silver with a violet sheen, violet cloth, gold trim.
  epic: { metal: rampLike(PF.steel, 0.045, 300, 4, 0.02), cloth: ramp(clothL(0.45), 0.16, 305), accent: PF.accentGold, leather: PF.leatherBlack },
  // Gold, and cloth of gold.
  legendary: { metal: PF.gold, cloth: ramp(clothL(0.66), 0.15, 82), accent: ramp([0.78, 0.9], 0.13, 88), leather: PF.leatherDark },
  // Rose gold and magenta.
  mythic: { metal: PF.roseGold, cloth: ramp(clothL(0.5), 0.18, 345), accent: PF.accentGold, leather: PF.leatherBlack },
  // Bronze gone green in its shadows (verdigris), and rust.
  ancient: { metal: [oklchToHex(0.42, 0.065, 178), oklchToHex(0.54, 0.08, 150), oklchToHex(0.67, 0.1, 88), oklchToHex(0.8, 0.1, 80)], cloth: ramp(clothL(0.5), 0.15, 42), accent: ramp([0.66, 0.78], 0.1, 70), leather: PF.leatherDark },
  // Blackened crimson steel, blood-red cloth, gold.
  exalted: { metal: ramp([0.34, 0.45, 0.57, 0.7], 0.07, 20, 4), cloth: ramp(clothL(0.42), 0.17, 22), accent: PF.accentGold, leather: PF.leatherBlack },
  // Star-silver and sky.
  celestial: { metal: rampLike(PF.steel, 0.045, 235, 3, 0.04), cloth: ramp(clothL(0.6), 0.13, 228), accent: ramp([0.8, 0.9], 0.07, 90), leather: PF.leatherBlack },
  // Aurora steel and mint.
  astral: { metal: rampLike(PF.steel, 0.06, 182, 3, 0.04), cloth: ramp(clothL(0.6), 0.13, 168), accent: ramp([0.76, 0.88], 0.06, 180), leather: PF.leatherBlack },
  // White gold and ivory.
  divine: { metal: rampLike(PF.gold, 0.06, 86, 3, 0.06), cloth: ramp(clothL(0.78), 0.035, 88), accent: PF.accentGold, leather: PF.leatherTan },
  // Obsidian with lavender cloth.
  eternal: { metal: PF.obsidian, cloth: ramp(clothL(0.6), 0.11, 296), accent: ramp([0.72, 0.84], 0.08, 300), leather: ramp([0.31, 0.37, 0.44], 0.025, 300) },
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
    metal: [oklchToHex(0.5, 0.1, h), oklchToHex(0.62, 0.11, h + 55), oklchToHex(0.74, 0.1, h + 110), oklchToHex(0.86, 0.08, h + 165)],
    cloth: ramp(clothL(0.45), 0.16, (h + 340) % 360),
    accent: ramp([0.78, 0.9], 0.13, 88),
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
  const dL = Math.max(0.31 - lo, Math.min(0.93 - hi, (Lt - refL) * 0.5));
  const C = Ct * Math.max(0.3, Math.min(1.2, d.C / refC));
  return d.L.map((L, i) => oklchToHex(L + dL, C, warmer((h0 + dh + 360) % 360, 5 * i)));
}

/**
 * A tier dressed for a class's sheet: its cloth, its second cloth and its leather through the class's
 * values, a third cloth in its trim, its trim metal from its accent, a gem in the rarity's color.
 */
function dressFor(t: Tier, sheet: SheetName, gem: string): Tier {
  const cloth = designOf(sheet, 'cloth', 2);
  const cloth2 = designOf(sheet, 'cloth2', 2);
  const cloth3 = designOf(sheet, 'cloth3', 2);
  // A second dye a little round the wheel from the first, as the class's own two are (both vivid).
  const dh = cloth && cloth2 && cloth.C > 0.06 && cloth2.C > 0.06 ? Math.max(-25, Math.min(25, ((cloth2.h - cloth.h + 540) % 360) - 180)) : 0;
  const [, aC, aH] = hexToOklch(t.accent[t.accent.length - 1]);
  return {
    ...t,
    cloth: dress(t.cloth, cloth, 0.56, 0.15),
    cloth2: dress(t.cloth, cloth2, 0.56, 0.15, dh),
    ...(cloth3 ? { cloth3: dress(t.accent, cloth3, 0.7, 0.1) } : {}),
    leather: dress(t.leather, designOf(sheet, 'leather', 3), 0.45, 0.04),
    metal2: t.metal.map((x, i) => oklchToHex(Math.min(0.93, hexToOklch(x)[0] + 0.03), Math.max(0.02, Math.min(0.16, aC)), warmer(aH, 4 * i))),
    accent2: ramp([0.5, 0.68], Math.min(0.17, hexToOklch(gem)[1]), hexToOklch(gem)[2], 6),
  };
}

/** The mutations' paint over a tier: Gilded gold, Shadow dark, Radiant light, Void purple-black with a cyan glint. */
function mutate(t: Tier, m: MutationId | null, cls: ClassId): Tier {
  // Halfway to white in lightness, softer in color (the order of the shades holds).
  const whiten = (r: readonly string[]) =>
    r.map((c) => {
      const [L, C, h] = hexToOklch(c);
      return oklchToHex(L + (0.9 - L) * 0.5, C * 0.75, h);
    });
  switch (m) {
    case 'gilded': {
      const gold = [...PF.gold];
      // Classes without armor gild their wood: the Ranger's bow, the casters' staves.
      const unarmored = cls === 'ranger' || cls === 'cleric' || cls === 'arcanist';
      return { ...t, metal: gold, metal2: gold, accent: PF.accentGold, leather: unarmored ? ramp([0.52, 0.64, 0.76], 0.12, 72, 4) : t.leather };
    }
    case 'shadow': {
      const metal = ramp([0.31, 0.36, 0.43, 0.51], 0.035, 300, 3);
      return {
        metal,
        metal2: metal,
        cloth: ramp([0.31, 0.37], 0.05, 305),
        cloth2: ramp([0.36, 0.45], 0.1, 300),
        cloth3: ramp([0.33, 0.4], 0.06, 300),
        accent: ramp([0.5, 0.62], 0.11, 305),
        accent2: ramp([0.45, 0.62], 0.15, 300),
        leather: ramp([0.3, 0.33, 0.37], 0.02, 300),
      };
    }
    case 'radiant': {
      const metal = ramp([0.7, 0.78, 0.86, 0.93], 0.04, 90, 2);
      return {
        metal,
        metal2: metal,
        cloth: whiten(t.cloth),
        ...(t.cloth2 ? { cloth2: whiten(t.cloth2) } : {}),
        ...(t.cloth3 ? { cloth3: whiten(t.cloth3) } : {}),
        accent: ramp([0.8, 0.9], 0.1, 88),
        ...(t.accent2 ? { accent2: t.accent2 } : {}),
        leather: PF.leatherTan,
      };
    }
    case 'void': {
      const metal = [oklchToHex(0.3, 0.02, 290), oklchToHex(0.33, 0.035, 288), oklchToHex(0.38, 0.05, 284), oklchToHex(0.72, 0.11, 205)];
      return {
        metal,
        metal2: metal,
        cloth: ramp([0.3, 0.34], 0.04, 290),
        cloth2: ramp([0.33, 0.4], 0.07, 212),
        cloth3: ramp([0.3, 0.35], 0.04, 290),
        accent: ramp([0.64, 0.78], 0.12, 205, 0),
        accent2: ramp([0.6, 0.78], 0.13, 205, 0),
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
  const gem = r === 'primordial' ? oklchToHex(0.75, 0.15, (step / PRIMORDIAL_STEPS) * 360) : RARITY_COLOR[r];
  const tier = mutate(dressFor(base, sheet, gem), mutation, def.cls);
  const h = hashStr(def.name);
  const recolor: Recolor = {
    metal: tier.metal,
    cloth: tier.cloth,
    accent: tier.accent,
    leather: tier.leather,
    skin: PF.skins[h % PF.skins.length],
  };
  // One knight in three keeps its class's own hair (the Cleric's fire, the Arcanist's snow white); an
  // Arcanist's (and his beard's) stays a natural color.
  const hairs = def.cls === 'arcanist' ? HAIR_NATURAL : PF.hairs.length;
  if ((h >>> 8) % 3) recolor.hair = PF.hairs[(h >>> 12) % hairs];
  if (tier.cloth2) recolor.cloth2 = tier.cloth2;
  if (tier.cloth3) recolor.cloth3 = tier.cloth3;
  if (tier.metal2) recolor.metal2 = tier.metal2;
  if (tier.accent2) recolor.accent2 = tier.accent2;
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
