/**
 * Knight classes and the knights you can roll. Every knight of a class shares that class's kit:
 * the same auto attack (fires on its own when an enemy is in range), dodge roll and special.
 * Rarity sets the stats (RARITY_STAT), and each tier has one knight of every class.
 */
import { RARITIES, type Rarity } from './rarity';

export const CLASS_IDS = ['guardian', 'blade', 'ranger', 'cleric', 'arcanist', 'lancer'] as const;
export type ClassId = (typeof CLASS_IDS)[number];
export type Role = 'tank' | 'melee' | 'ranged' | 'healer' | 'caster';

export interface SkillDef {
  name: string;
  text: string;
}

export interface ClassDef {
  id: ClassId;
  name: string;
  role: Role;
  roleName: string;
  hp: number;
  atk: number;
  /** Share of damage taken that armor removes. */
  armor: number;
  /** Art pixels per second. */
  speed: number;
  /** Auto attack reach in art pixels (16 to a tile). */
  range: number;
  /** Seconds between auto attacks. */
  atkCd: number;
  dodgeCd: number;
  specialCd: number;
  auto: SkillDef;
  dodge: SkillDef;
  special: SkillDef;
  /** Rebirths needed before this class can be rolled. */
  unlockRebirths: number;
}

export const CLASSES: Record<ClassId, ClassDef> = {
  guardian: {
    id: 'guardian', name: 'Guardian', role: 'tank', roleName: 'Tank',
    hp: 340, atk: 7, armor: 0.3, speed: 50, range: 22, atkCd: 0.85, dodgeCd: 1.6, specialCd: 11,
    auto: { name: 'Shield Sweep', text: 'A short, heavy sweep of the shield where you aim: knocks foes well back and stops their shots.' },
    dodge: { name: 'Shield Bash', text: 'Charges shield first: every foe in the way takes a blow, is knocked aside and staggered (a boss only takes the blow), and foes\' shots are blocked. The shield stays up a moment after.' },
    special: { name: 'Rallying Taunt', text: 'Every foe nearby turns on the Guardian for 4 s; a shockwave knocks them back and the Guardian takes 60% less damage.' },
    unlockRebirths: 0,
  },
  blade: {
    id: 'blade', name: 'Blade', role: 'melee', roleName: 'Fighter',
    hp: 240, atk: 11.5, armor: 0.16, speed: 60, range: 24, atkCd: 0.55, dodgeCd: 0.5, specialCd: 9,
    auto: { name: 'Cleave', text: 'A wide sword slash where you aim; it sends foes\' shots back as your own.' },
    dodge: { name: 'Phantom Dash', text: 'A long, quick roll that leaves afterimages behind; ready again in half a second.' },
    special: { name: 'Whirlwind', text: 'Spins for 2 s, cutting everything around and moving freely.' },
    unlockRebirths: 0,
  },
  ranger: {
    id: 'ranger', name: 'Ranger', role: 'ranged', roleName: 'Archer',
    hp: 115, atk: 11, armor: 0.05, speed: 62, range: 112, atkCd: 0.65, dodgeCd: 1.1, specialCd: 10,
    auto: { name: 'Longshot', text: 'Looses a fast arrow where you aim.' },
    dodge: { name: 'Shot or Snare', text: 'Toward a foe: a roll, and a piercing Power Shot at it as it ends. Away: a backflip, leaving a snare that roots the first foe to step in.' },
    special: { name: 'Arrow Rain', text: 'A volley rains down on the biggest group of foes for 2 s.' },
    unlockRebirths: 0,
  },
  cleric: {
    id: 'cleric', name: 'Cleric', role: 'healer', roleName: 'Healer',
    hp: 135, atk: 7, armor: 0.07, speed: 56, range: 88, atkCd: 0.9, dodgeCd: 1.3, specialCd: 14,
    auto: { name: 'Holy Orb', text: 'A slow orb of light where you aim; each hit heals the most hurt ally a little.' },
    dodge: { name: 'Blessed Step', text: 'A roll that leaves a holy circle behind, healing allies inside.' },
    special: { name: 'Sanctuary', text: 'Heals the whole squad for 35% and keeps healing them on holy ground.' },
    unlockRebirths: 0,
  },
  arcanist: {
    id: 'arcanist', name: 'Arcanist', role: 'caster', roleName: 'Mage',
    hp: 105, atk: 17, armor: 0.04, speed: 56, range: 96, atkCd: 1.0, dodgeCd: 1.4, specialCd: 12,
    auto: { name: 'Arcane Bolt', text: 'A bolt where you aim that bends toward foes and bursts on impact, hitting foes around it.' },
    dodge: { name: 'Blink', text: 'Teleports a long way, never through walls; an arcane burst hits the foes it left behind.' },
    special: { name: 'Meteor', text: 'Calls a meteor onto the biggest group: a huge blast that leaves fire.' },
    unlockRebirths: 1,
  },
  lancer: {
    id: 'lancer', name: 'Lancer', role: 'melee', roleName: 'Lancer',
    hp: 230, atk: 12.5, armor: 0.15, speed: 64, range: 39, atkCd: 0.7, dodgeCd: 1.2, specialCd: 8,
    auto: { name: 'Pierce', text: 'A long spear thrust where you aim that runs through every foe in a line and pops shots along it.' },
    dodge: { name: 'Spear Lunge', text: 'A fast, long dash that runs through every foe in the way, hitting each and pushing it on ahead.' },
    special: { name: 'Dragon Lunge', text: 'Charges far ahead, smashing through everything in the way.' },
    unlockRebirths: 2,
  },
};

/** One knight per class per tier, in CLASS_IDS order. */
const NAMES: Record<Exclude<Rarity, 'absolute'>, readonly string[]> = {
  common: ['Bucket Bob', 'Tam', 'Pip', 'Mott', 'Wick', 'Pete'],
  uncommon: ['Brannoc', 'Edric', 'Wren', 'Maude', 'Corvin', 'Harlan'],
  rare: ['Ironhold', 'Kestrel', 'Lyra', 'Aldous', 'Morwen', 'Valen'],
  epic: ['Grimwald', 'Seraphine', 'Thorne', 'Ylva', 'Zephyra', 'Draven'],
  legendary: ['Aurelion', 'Lancelyn', 'Sylvaris', 'Benedra', 'Orlanth', 'Gideon'],
  mythic: ['Brakkus', 'Kaida', 'Ysolde', 'Celestine', 'Aeon', 'Valkyr'],
  ancient: ['Stonewall', 'Rhovan', 'Fennwick', 'Anwe', 'Thalgrim', 'Tarsus'],
  exalted: ['Corin', 'Aethel', 'Vael', 'Lumen', 'Ozymand', 'Halvard'],
  celestial: ['Atlas', 'Orion', 'Vega', 'Lumina', 'Nebulon', 'Polaris'],
  astral: ['Bastion', 'Riven', 'Quasar', 'Aurora', 'Cosmara', 'Zenith'],
  divine: ['Theron', 'Caliburn', 'Artemis', 'Solenne', 'Merlin', 'Michael'],
  eternal: ['Unbroken', 'Kairo', 'Nyx', 'Mercy', 'Malakar', 'Kael'],
  primordial: ['Titan', 'Origin', 'Genesis', 'Dawn', 'Arcanum', 'Ymir'],
};

/** The Absolute tier's one knight: a black-haired normal guy, the strongest in the game by far. */
export const KEVIN_ID = 'absolute-blade';

export interface KnightDef {
  id: string;
  name: string;
  cls: ClassId;
  rarity: Rarity;
  /** 0..1, picks this knight's own accent colors so knights of a tier look different. */
  hue: number;
}

export const KNIGHTS: KnightDef[] = RARITIES.flatMap((rarity, ri) =>
  rarity === 'absolute'
    ? [{ id: KEVIN_ID, name: 'Kevin', cls: 'blade' as ClassId, rarity: rarity as Rarity, hue: 0 }]
    : CLASS_IDS.map((cls, ci): KnightDef => ({
        id: `${rarity}-${cls}`,
        name: NAMES[rarity][ci],
        cls,
        rarity,
        hue: ((ri * 7 + ci * 3) % 13) / 13,
      })),
);

export const KNIGHTS_BY_ID = new Map(KNIGHTS.map((k) => [k.id, k]));

/**
 * Signature specials: a few rare knights replace their class's special with one of their own.
 * Aeon (the Mythic Arcanist) rewinds time.
 */
export interface Signature extends SkillDef {
  id: 'rewind';
  cd: number;
}

export const SIGNATURES: Readonly<Record<string, Signature>> = {
  'mythic-arcanist': {
    id: 'rewind',
    name: 'Rewind',
    cd: 20,
    text: 'Turns time back 4 seconds for the squad: everyone returns to where they stood, with the HP they had, fallen knights included. Enemy shots and spells in the air vanish; every bit of damage the squad dealt stays.',
  },
};

/** The special a knight actually has: its signature, or its class's. */
export function specialOf(id: string): SkillDef & { cd: number; signature?: Signature['id'] } {
  const sig = SIGNATURES[id];
  if (sig) return { name: sig.name, text: sig.text, cd: sig.cd, signature: sig.id };
  const cls = CLASSES[knightDef(id).cls];
  return { ...cls.special, cd: cls.specialCd };
}

export function knightId(rarity: Rarity, cls: ClassId): string {
  return `${rarity}-${cls}`;
}

export function knightDef(id: string): KnightDef {
  const k = KNIGHTS_BY_ID.get(id);
  if (!k) throw new Error(`Unknown knight ${id}`);
  return k;
}

/** Classes the roller can pick from after `rebirths` rebirths. */
export function unlockedClasses(rebirths: number): ClassId[] {
  return CLASS_IDS.filter((c) => CLASSES[c].unlockRebirths <= rebirths);
}
