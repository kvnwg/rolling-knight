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
    hp: 260, atk: 8, armor: 0.25, speed: 50, range: 18, atkCd: 0.85, dodgeCd: 1.6, specialCd: 11,
    auto: { name: 'Shield Bash', text: 'Bashes the nearest foe with the shield, knocking it back.' },
    dodge: { name: 'Bulwark Roll', text: 'A short roll; the shield stays up for a moment after, halving damage.' },
    special: { name: 'Rallying Taunt', text: 'Every foe nearby turns on the Guardian for 4 s; a shockwave knocks them back and the Guardian takes 60% less damage.' },
    unlockRebirths: 0,
  },
  blade: {
    id: 'blade', name: 'Blade', role: 'melee', roleName: 'Fighter',
    hp: 170, atk: 13, armor: 0.12, speed: 60, range: 20, atkCd: 0.55, dodgeCd: 1.2, specialCd: 9,
    auto: { name: 'Cleave', text: 'A wide sword slash that hits every foe in front.' },
    dodge: { name: 'Combat Roll', text: 'A quick roll through danger, untouchable while rolling.' },
    special: { name: 'Whirlwind', text: 'Spins for 2 s, cutting everything around and moving freely.' },
    unlockRebirths: 0,
  },
  ranger: {
    id: 'ranger', name: 'Ranger', role: 'ranged', roleName: 'Archer',
    hp: 120, atk: 11, armor: 0.05, speed: 62, range: 112, atkCd: 0.65, dodgeCd: 1.1, specialCd: 10,
    auto: { name: 'Longshot', text: 'Looses an arrow at the nearest foe in range.' },
    dodge: { name: 'Backflip', text: 'A long leaping roll, untouchable while in the air.' },
    special: { name: 'Arrow Rain', text: 'A volley rains down on the biggest group of foes for 2 s.' },
    unlockRebirths: 0,
  },
  cleric: {
    id: 'cleric', name: 'Cleric', role: 'healer', roleName: 'Healer',
    hp: 150, atk: 7, armor: 0.1, speed: 56, range: 88, atkCd: 0.9, dodgeCd: 1.3, specialCd: 14,
    auto: { name: 'Holy Orb', text: 'A slow orb of light; each hit heals the most hurt ally a little.' },
    dodge: { name: 'Blessed Step', text: 'A roll that leaves a small healing glow behind.' },
    special: { name: 'Sanctuary', text: 'Heals the whole squad for 35% and raises a fallen knight.' },
    unlockRebirths: 0,
  },
  arcanist: {
    id: 'arcanist', name: 'Arcanist', role: 'caster', roleName: 'Mage',
    hp: 110, atk: 17, armor: 0.04, speed: 56, range: 96, atkCd: 1.0, dodgeCd: 1.4, specialCd: 12,
    auto: { name: 'Arcane Bolt', text: 'A seeking bolt that bursts on impact, hitting foes around it.' },
    dodge: { name: 'Blink', text: 'Teleports a short way, untouchable for the jump.' },
    special: { name: 'Meteor', text: 'Calls a meteor onto the biggest group: a huge blast that leaves fire.' },
    unlockRebirths: 1,
  },
  lancer: {
    id: 'lancer', name: 'Lancer', role: 'melee', roleName: 'Lancer',
    hp: 160, atk: 14, armor: 0.12, speed: 64, range: 32, atkCd: 0.7, dodgeCd: 1.2, specialCd: 8,
    auto: { name: 'Pierce', text: 'A long spear thrust that runs through every foe in a line.' },
    dodge: { name: 'Vault', text: 'Vaults over danger on the spear, untouchable while airborne.' },
    special: { name: 'Dragon Lunge', text: 'Charges far ahead, smashing through everything in the way.' },
    unlockRebirths: 2,
  },
};

/** One knight per class per tier, in CLASS_IDS order. */
const NAMES: Record<Rarity, readonly string[]> = {
  common: ['Bucket Bob', 'Squire Tam', 'Pip Fletcher', 'Brother Mott', 'Wick the Apprentice', 'Pitchfork Pete'],
  uncommon: ['Sir Brannoc', 'Sir Edric', 'Wren Ashwood', 'Sister Maude', 'Corvin Inkfinger', 'Sir Harlan'],
  rare: ['Dame Ironhold', 'Sir Kestrel', 'Lyra Swiftwind', 'Father Aldous', 'Morwen Starling', 'Sir Valen'],
  epic: ['Grimwald the Bastion', 'Seraphine Duskblade', 'Thorne Nightquill', 'Abbess Ylva', 'Zephyrine Hexweaver', 'Draven Stormspear'],
  legendary: ['Aurelion Goldwall', 'Lancelyn the Radiant', 'Sylvaris Dawnbow', 'Saint Benedra', 'Archmage Orlanth', 'Sir Gideon Sunlance'],
  mythic: ['Brakkus Dragonhide', 'Kaida Bloodmoon', 'Ysolde Moonshadow', 'Oracle Celestine', 'Chronomancer Aeon', 'Valkyr Skyrender'],
  ancient: ['The Stone Warden', 'Rhovan the Undying', 'Elder Fennwick', 'High Priestess Anwe', 'Thalgrim Elder Rune', 'Tarsus Bronzehelm'],
  exalted: ['Exarch Corin', 'Sir Aethelstan', 'Vael Starfletch', 'Hierophant Lumen', 'Magister Ozymand', 'Halberdier Seraph'],
  celestial: ['Atlas Skyward', 'Orion Stellarblade', 'Vega Comet-Eye', 'Lumina of the Spheres', 'Nebulon Starwright', 'Polaris Spearstar'],
  astral: ['Bulwark of Aeons', 'Riven Astralis', 'Quasar Huntress', 'Aurora Mender', 'Cosmara Riftmind', 'Zenith Lancer'],
  divine: ['Godshield Theron', 'Excalibrant', 'Artemisia', 'Saint Solenne', 'Merlinus Prime', 'Michael of the Spear'],
  eternal: ['The Unbroken', 'Eternblade Kairo', 'Everbow Nyx', 'Mother of Mercy', 'Malakar Voidcaller', 'Infinity Pike'],
  primordial: ['Titan of First Dawn', 'The Origin Blade', 'Genesis Archer', 'The First Light', 'Primarch Arcanum', 'Worldspear Ymir'],
};

export interface KnightDef {
  id: string;
  name: string;
  cls: ClassId;
  rarity: Rarity;
  /** 0..1, picks this knight's own accent colors so knights of a tier look different. */
  hue: number;
}

export const KNIGHTS: KnightDef[] = RARITIES.flatMap((rarity, ri) =>
  CLASS_IDS.map((cls, ci) => ({
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
 * Chronomancer Aeon (Mythic Arcanist) rewinds time.
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
