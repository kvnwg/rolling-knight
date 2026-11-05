/**
 * Which PixelForge monster draws a mob, and its colors. The mapping keeps the sim's mob as it is
 * (name, size, stats, behavior); only the art changes:
 *
 *   slime            the supplied pack's slime with a face (the floor's colors), everywhere
 *   flyer            bat (the farm keeps its crows)
 *   beast            wolf; frost wolf in the tundra
 *   humanoid         goblin archer (ranged); in the dark biomes (the dungeon, the crypt, the
 *                    graveyard) the supplied pack's undead: a skeleton with a sword, one with a
 *                    scythe or a robed vampire, by design; skeleton in the desert ruins;
 *                    orc in the tundra and when the design has horns; goblin otherwise (the goblin
 *                    chief as an elite). From floor 36 on, a chaser's elite is the Ashen Duelist,
 *                    a tall, quick glaive fighter. The farm keeps its scarecrows, casters their robes
 *   golem            ogre, in the biome's stone
 *   bosses           the Ember Depths' is the Cinderwyrm, a big slow dragon in obsidian (its embers at half HP);
 *                    the rest the Stone Warden, a forest guardian of boulders, an antlered skull and
 *                    a leafy mane, in each place's stone and leaves (autumn red at half HP); the
 *                    farm's pig, the ram, ghosts, pumpkins and the unmasked demon keep their own art
 *
 * Everything else (bugs, plants, pumpkins, ghosts, the farm's animals) keeps the game's sprites.
 * Colors come from the mob's design (mobgen.ts gives each type a ramp from its biome, twisted): its
 * hue, at PixelForge's lightness steps and a muted chroma, paints the monster's main material, and
 * the biome's eye color lights its glow eyes. Elites wear a darker, richer version with red eyes.
 */
import type { MobType } from '../../world/mobgen';
import type { SheetName } from './assets';
import { hexToOklch, oklchToHex, ramp, rampLike, shiftL } from './color';
import type { Paint } from './frames';
import type { Recolor } from './sheet';

export type MonsterId =
  | 'slime' | 'bat' | 'wolf' | 'frost_wolf' | 'goblin' | 'goblin_archer' | 'goblin_chief' | 'orc' | 'skeleton' | 'ogre' | 'stone_warden'
  | 'cinderwyrm' | 'ashen_duelist'
  // The supplied packs' (tools/packs/enemies.py): side views, mirrored for the other facing.
  | 'pk_skeleton' | 'pk_reaper' | 'pk_vampire' | 'pk_slime';

export const MONSTER_SHEET: Record<MonsterId, SheetName> = {
  slime: 'slime',
  bat: 'bat',
  wolf: 'wolf',
  frost_wolf: 'wolf',
  goblin: 'goblin',
  goblin_archer: 'goblin_archer',
  goblin_chief: 'goblin_chief',
  orc: 'orc',
  skeleton: 'skeleton',
  ogre: 'ogre',
  stone_warden: 'stone_warden',
  cinderwyrm: 'cinderwyrm',
  ashen_duelist: 'ashen_duelist',
  pk_skeleton: 'pk_skeleton',
  pk_reaper: 'pk_reaper',
  pk_vampire: 'pk_vampire',
  pk_slime: 'pk_slime',
};

/** The first floor whose humanoid chasers' elites are the Ashen Duelist (the desert ruins on). */
export const DUELIST_FROM = 36;

/** Biomes whose humanoids are the pack's undead. */
const UNDEAD_BIOMES: ReadonlySet<string> = new Set(['dungeon', 'crypt', 'graveyard']);

/** Which of the pack's undead a design is: by its seed and its place on the floor, so a floor's two humanoid designs mostly differ. */
export function undeadFor(t: MobType): 'pk_skeleton' | 'pk_reaper' | 'pk_vampire' {
  const i = Number(t.id.split('-')[2]) || 0;
  return (['pk_skeleton', 'pk_reaper', 'pk_vampire'] as const)[(t.features.seed + i) % 3];
}

export function biomeOf(t: MobType): string {
  return t.id.split('-')[0];
}

/** The floor a mob design was made for (its id is biome-floor-index). */
export function floorOf(t: MobType): number {
  return Number(t.id.split('-')[1]) || 0;
}

/** The monster for a mob design, or null to keep the game's own sprite. */
export function monsterFor(t: MobType, elite: boolean, boss: boolean): MonsterId | null {
  const biome = biomeOf(t);
  if (t.id.includes('-demon-')) return null;
  if (boss) {
    if (['pig', 'ram', 'chicken', 'ghost', 'pumpkin', 'bug', 'plant'].includes(t.plan)) return null;
    return biome === 'ember' ? 'cinderwyrm' : 'stone_warden';
  }
  switch (t.plan) {
    case 'slime':
      return 'pk_slime';
    case 'flyer':
      return biome === 'farmland' ? null : 'bat';
    case 'beast':
      return biome === 'tundra' ? 'frost_wolf' : 'wolf';
    case 'humanoid':
      if (biome === 'farmland' || t.behavior === 'caster') return null;
      if (t.behavior === 'ranged') return 'goblin_archer';
      if (elite && t.behavior === 'chaser' && floorOf(t) >= DUELIST_FROM) return 'ashen_duelist';
      if (UNDEAD_BIOMES.has(biome)) return undeadFor(t);
      if (biome === 'desert') return 'skeleton';
      if (biome === 'tundra' || t.features.horns) return 'orc';
      return elite ? 'goblin_chief' : 'goblin';
    case 'golem':
      return 'ogre';
    default:
      return null;
  }
}

// PixelForge presets the recolors start from (style/style.json).
const P = {
  slime: ['#3c6553', '#4f7c6d', '#659488', '#7bada5'],
  membrane: ['#4b344a', '#61455b'],
  furGray: ['#564a43', '#6c6158', '#83786e', '#9a9085'],
  furBrown: ['#5f3f31', '#755644', '#8c6d58', '#a3856e'],
  furFrost: ['#536674', '#718393', '#91a0b1', '#b0bbcc'],
  hide: ['#525b2b', '#637345', '#758c5f'],
  bog: ['#394523', '#4a5c3a', '#5c7453'],
  cloth: ['#4c445a', '#5a556b'],
  orcSkin: ['#526540', '#67805c', '#7b9977'],
  ogreSkin: ['#755e4d', '#8f7863', '#a8957e'],
  bone: ['#7b705e', '#958b78', '#aca490', '#c1baa5'],
  iron: ['#3e4349', '#565b62', '#70757c', '#8b8f97'],
  steel: ['#50555e', '#6d727b', '#8b8f99', '#a7aab5'],
  granite: ['#504d42', '#68675a', '#828175', '#9c9c90'],
  basalt: ['#363b45', '#4a505b', '#606771', '#777e87'],
  sandstone: ['#71543d', '#8a6e54', '#a38a6e', '#bca78b'],
  frostStone: ['#3f5a64', '#5a737f', '#768d9a', '#94a8b6'],
  leatherDark: ['#443333', '#554341', '#65534f'],
  gold: ['#bc8f5f', '#d2ab70'],
} as const;

/** The supplied packs' monsters as drawn: the slime's gel, the skeletons' bone and blades, the vampire's robe. */
const GEL = ['#374e4a', '#456657', '#547e64', '#92a984'];
const BONE = ['#676057', '#b3b2a1', '#e6e6e6'];
const PK_METAL = ['#6d758d', '#b3b9d1', '#dae0ea'];
const PK_ROBE = ['#5e4e3a', '#827860'];

/** A glow eye in the biome's color, kept inside PixelForge's glow limits (L 0.85, C 0.14). */
export function glowEye(hex: string): string {
  const [L, C, h] = hexToOklch(hex);
  return oklchToHex(Math.min(0.85, Math.max(0.6, L)), Math.min(0.14, C), h);
}

/** The mob design's signature hue and a muted chroma from it. */
function hueOf(t: MobType): { h: number; c: number } {
  const [, C, h] = hexToOklch(t.ramp[Math.min(2, t.ramp.length - 1)]);
  return { h, c: Math.max(0.02, Math.min(0.085, C * 0.7)) };
}

/**
 * Slimes are gel, whatever the biome's palette (a brown slime reads as a bun): a gel hue per biome,
 * turned a little per design so a floor's slimes differ, and C for how vivid.
 */
const SLIME_HUE: Record<string, [h: number, c: number]> = {
  hamlet: [150, 0.07], farmland: [150, 0.07], forest: [172, 0.07], tundra: [232, 0.07], dungeon: [146, 0.07], crypt: [158, 0.065], swamp: [136, 0.075],
  desert: [72, 0.08], graveyard: [300, 0.07], ember: [36, 0.11], crystal: [292, 0.09], shrine: [350, 0.07],
};

/** PixelForge's forest guardian as drawn: charcoal boulders, spring leaves, berries; at half HP the leaves go autumn, the berries blood. */
const LEAF = ['#1b5524', '#397028', '#5c8a30', '#83a342'];
const AUTUMN = ['#822d22', '#a24628', '#be6436', '#d98346'];
const BERRY = ['#bf623d', '#d77e49'];
const BLOOD = ['#933235', '#ad4c42'];
const CHARCOAL = ['#2a3139', '#3a4049', '#4b5059', '#5d606a'];

/**
 * The Stone Warden in each place: its boulders in the stone there, its mane in the leaves there (a
 * spring forest's green, frosted pine in the tundra, dead leaves in the dungeon and the crypt, dry
 * fronds in the desert, crystal in the grottoes, cherry blossom at the shrine), its berries, and its
 * eyes in the place's glow.
 */
const WARDEN: Record<string, { stone: readonly string[]; leaf: readonly string[]; fruit?: readonly string[]; eye: string }> = {
  hamlet: { stone: P.granite, leaf: rampLike(LEAF, 0.1, 132, 5, 0.03), eye: '#ffe066' },
  forest: { stone: CHARCOAL, leaf: LEAF, eye: '#a2d060' },
  tundra: { stone: P.frostStone, leaf: rampLike(LEAF, 0.035, 205, 3, 0.16), eye: '#7ae0ff' },
  dungeon: { stone: rampLike(P.granite, 0.035, 330, 4, -0.06), leaf: rampLike(LEAF, 0.045, 62, 5, -0.02), fruit: BLOOD, eye: '#ff6a3a' },
  crypt: { stone: P.basalt, leaf: rampLike(LEAF, 0.04, 150, 4, 0.02), fruit: rampLike(BERRY, 0.04, 120, 4, 0.02), eye: '#ff3a2a' },
  swamp: { stone: rampLike(P.granite, 0.025, 115, 4, -0.06), leaf: rampLike(LEAF, 0.075, 118, 4, -0.02), fruit: rampLike(BERRY, 0.11, 95, 4, 0.04), eye: '#e8ff4a' },
  desert: { stone: P.sandstone, leaf: rampLike(LEAF, 0.07, 88, 5, 0.1), fruit: rampLike(BERRY, 0.09, 40, 4, -0.08), eye: '#ffb03a' },
  graveyard: { stone: rampLike(P.basalt, 0.025, 300, 3, 0.02), leaf: rampLike(LEAF, 0.045, 300, 3, 0.06), fruit: BLOOD, eye: '#b8ff5a' },
  // (The Ember Depths have the Cinderwyrm; a warden there would be basalt with leaves of fire.)
  ember: { stone: P.basalt, leaf: ramp([0.45, 0.56, 0.66, 0.76], 0.14, 34, 14), eye: '#ffb04a' },
  crystal: { stone: rampLike(P.granite, 0.06, 292, 4, 0.02), leaf: rampLike(LEAF, 0.08, 200, 4, 0.12), fruit: rampLike(BERRY, 0.1, 330, 4, 0.06), eye: '#e8f8ff' },
  shrine: { stone: rampLike(P.granite, 0.04, 170, 4, -0.03), leaf: rampLike(LEAF, 0.08, 352, 3, 0.2), fruit: rampLike(BERRY, 0.12, 85, 4, 0.06), eye: '#ffd84a' },
};

/**
 * The Cinderwyrm: on the lava-lit floors of the Ember Depths it comes in its obsidian scales, ash
 * wings and gilded horns (PixelForge's cinderwyrm_obsidian), dark against the glow; at half HP it
 * cracks open into its embers (the Cinderwyrm as drawn: ember scales and wings, pale horns).
 */
const WYRM_OBSIDIAN = { scales: ['#2e2e3f', '#3f3d4f', '#514d5f', '#635d6f'], membrane: ['#4c4b5d', '#625d70'], horn: ['#9c703a', '#b58947', '#caa55e'] };
const WYRM_EMBER = { scales: ['#6f181e', '#8c2e26', '#a64832', '#c06240'], membrane: ['#9f4325', '#b75e30'], horn: ['#7d6f5f', '#9a8d7b', '#b5a996'] };

export interface MobPaint extends Paint {
  monster: MonsterId;
  sheet: SheetName;
}

const cache = new Map<string, MobPaint>();

/** The paint for a mob (null: the game's own sprite). `enraged` is a boss past half HP. */
export function mobPaint(t: MobType, elite: boolean, boss: boolean, enraged = false): MobPaint | null {
  const monster = monsterFor(t, elite, boss);
  if (!monster) return null;
  const key = `${t.id}|${elite ? 1 : 0}|${boss ? 1 : 0}|${enraged ? 1 : 0}`;
  let p = cache.get(key);
  if (p) return p;
  const biome = biomeOf(t);
  const { h, c } = hueOf(t);
  const eye = glowEye(elite ? '#ff5a4a' : t.eye);
  const r: Recolor = { eyes: [eye] };
  // Elites: the same monster, a step darker and richer.
  const dL = elite ? -0.06 : 0;
  const ce = elite ? 1.25 : 1;
  switch (monster) {
    case 'slime': {
      const [sh, sc] = SLIME_HUE[biome] ?? [h, c];
      const hue = sh + ((t.features.seed % 25) - 12);
      r.slime = rampLike(P.slime, sc * (elite ? 1.15 : 1), hue, 6, dL + 0.02);
      r.slime_highlight = [oklchToHex(0.85, 0.035, hue)];
      // Slimes keep their cute dark eyes; elites glare.
      r.eyes = elite ? [eye] : ['#3f3a49'];
      break;
    }
    case 'bat':
      r.membrane = rampLike(P.membrane, Math.min(0.07, c * ce), h, 5, dL);
      r.fur = rampLike(P.furBrown, Math.min(0.045, c * 0.6), h, 5, dL - 0.02);
      break;
    case 'wolf':
    case 'frost_wolf': {
      if (monster === 'frost_wolf') r.fur = rampLike(P.furFrost, 0.03, 245, 5, dL);
      else if (biome === 'ember') r.fur = rampLike(P.furGray, 0.03, 30, 4, dL - 0.08);
      else if (biome === 'desert') r.fur = rampLike(P.furGray, 0.05, 72, 4, dL + 0.05);
      else {
        // Fur stays fur: browns and tans keep a little of the design's hue, anything else goes grey.
        const natural = h >= 20 && h <= 85;
        r.fur = rampLike(P.furGray, natural ? Math.max(0.015, Math.min(0.04, c * 0.45)) : 0.012, natural ? h : 60, 4, dL - (biome === 'forest' ? 0.05 : 0));
      }
      break;
    }
    case 'goblin':
    case 'goblin_archer':
    case 'goblin_chief': {
      const chief = monster === 'goblin_chief';
      const base = chief ? P.bog : P.hide;
      const hide: Record<string, readonly string[]> = {
        ember: rampLike(base, 0.09, 28, 5, 0.02), // imps
        crypt: rampLike(base, 0.03, 160, 4, 0.08), // ghouls
        graveyard: rampLike(base, 0.03, 200, 4, 0.06),
        desert: rampLike(base, 0.06, 88, 5, 0.04),
        tundra: rampLike(base, 0.045, 222, 4, 0.06),
        shrine: rampLike(base, 0.07, 168, 5, 0.02),
        swamp: P.bog,
        crystal: rampLike(base, 0.06, 290, 4, 0.04),
      };
      r.hide = shiftL(hide[biome] ?? (elite && !chief ? rampLike(base, 0.075, 124, 5) : base), dL);
      r.cloth = rampLike(P.cloth, Math.min(0.08, c * ce), h, 5, chief ? -0.03 : 0.03);
      break;
    }
    case 'orc':
      r.skin = biome === 'tundra' ? rampLike(P.orcSkin, 0.03, 235, 4, 0.03) : biome === 'ember' ? rampLike(P.orcSkin, 0.07, 32, 5, -0.02) : rampLike(P.orcSkin, 0.061, 136, 5, dL);
      r.metal = elite ? P.steel : biome === 'tundra' ? rampLike(P.iron, 0.02, 240, 3, 0.04) : P.iron;
      if (elite) r.accent = P.gold;
      break;
    case 'skeleton':
      r.bone = biome === 'crypt' ? rampLike(P.bone, 0.03, 140, 4) : biome === 'graveyard' ? rampLike(P.bone, 0.025, 255, 3) : biome === 'desert' ? rampLike(P.bone, 0.045, 78, 4, 0.02) : P.bone;
      if (elite) r.metal = P.steel;
      break;
    case 'ogre': {
      // Golems: an ogre of the biome's stone.
      const stone: Record<string, readonly string[]> = {
        tundra: rampLike(P.ogreSkin, 0.032, 232, 3, -0.02),
        ember: rampLike(P.ogreSkin, 0.02, 262, 3, -0.12),
        crystal: rampLike(P.ogreSkin, 0.07, 296, 4, -0.04),
        desert: rampLike(P.ogreSkin, 0.05, 64, 4),
        crypt: rampLike(P.ogreSkin, 0.02, 200, 3, -0.08),
      };
      r.skin = shiftL(stone[biome] ?? rampLike(P.ogreSkin, 0.018, 100, 3, -0.04), dL);
      r.cloth = rampLike(P.cloth, Math.min(0.08, c * ce), h, 5, -0.02);
      r.hair = rampLike(P.leatherDark, 0.02, h, 3);
      break;
    }
    case 'pk_slime': {
      // Its own lightness steps, in the floor's gel hue (green as drawn in most places).
      const [sh, sc] = SLIME_HUE[biome] ?? [h, c];
      const hue = sh + ((t.features.seed % 25) - 12);
      r.slime = rampLike(GEL, sc * (elite ? 1.2 : 1), hue, 6, dL);
      r.slime_highlight = [oklchToHex(0.8, 0.04, hue), oklchToHex(0.87, 0.03, hue)];
      delete r.eyes;
      break;
    }
    case 'pk_skeleton':
    case 'pk_reaper': {
      // Bone as drawn in the dungeon, tinted by the crypt's damp and the graveyard's moonlight; an
      // elite's blade (and its slash) runs red.
      const tint: Record<string, readonly string[]> = { crypt: rampLike(BONE, 0.03, 140, 4), graveyard: rampLike(BONE, 0.025, 255, 3) };
      r.bone = shiftL(tint[biome] ?? BONE, dL);
      if (elite) r.metal = rampLike(PK_METAL, 0.1, 22, 6, -0.04);
      delete r.eyes;
      break;
    }
    case 'pk_vampire': {
      r.robe = rampLike(PK_ROBE, Math.max(0.02, Math.min(0.06, c * ce)), h, 5, dL);
      r.eyes = elite ? ['#a01a1a', '#ff4a3a'] : ['#79191d', '#be2b25'];
      break;
    }
    case 'stone_warden': {
      // Enraged, the mane turns autumn and the berries blood, the glow red.
      const look = WARDEN[biome] ?? WARDEN.hamlet;
      r.stone = look.stone;
      r.leaf = enraged ? AUTUMN : look.leaf;
      r.fruit = enraged ? BLOOD : (look.fruit ?? BERRY);
      r.eyes = [enraged ? glowEye(biome === 'ember' ? '#ffd24a' : '#ff5040') : glowEye(look.eye)];
      break;
    }
    case 'cinderwyrm': {
      // Obsidian with red eyes; at half HP, its embers with white-hot eyes.
      const look = enraged ? WYRM_EMBER : WYRM_OBSIDIAN;
      r.scales = look.scales;
      r.membrane = look.membrane;
      r.horn = look.horn;
      r.eyes = [glowEye(enraged ? '#fff0a0' : '#cd605a')];
      break;
    }
    case 'ashen_duelist':
      // Its own dark plate and crimson cape; the elites' red glare.
      r.eyes = [eye];
      break;
  }
  p = { monster, sheet: MONSTER_SHEET[monster], recolor: r, key };
  cache.set(key, p);
  if (cache.size > 300) cache.delete(cache.keys().next().value!);
  return p;
}

/** The light a PixelForge mob's eyes give (elites, bosses and golems glow). */
export function mobEyeLight(t: MobType, elite: boolean): string {
  return glowEye(elite ? '#ff5a4a' : t.eye);
}
