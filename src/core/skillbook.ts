/**
 * The skill book. Instead of one special, every class has a list of six skills, and the skill button
 * rolls for one: a quick spin that lands on a random skill from the knight's list and fires it on
 * the spot (src/world/skills.ts plays them). Each list spans the tiers, from two commons to one
 * legendary; the class's old special is its rare. A knight with a signature (SIGNATURES) adds it to
 * its list as the jackpot, the rarest entry of all.
 *
 * Odds: each skill has a weight (a class's six add up to 100, so at luck 1 a weight is its chance
 * in percent). Luck tilts them gently toward the rarer tiers: a skill's weight is multiplied by
 * luck ^ (0.1 x its tier's step above common), so at luck 10 a legendary weighs 2.5x as much (its
 * chance goes from 3% to about 5.7%) and at luck 100 6.3x, while the commons keep their weight (luck
 * past 1,000 counts as 1,000).
 *
 * Numbers (`n`): damage in multiples of the knight's attack, heals and shields as shares of max HP
 * (a damage-taken multiplier for `dr`), distances in art pixels (16 to a tile), times in seconds.
 *
 * Pure data and math: no world, no DOM.
 */
import { CLASSES, CLASS_IDS, SIGNATURES, knightDef, type ClassId, type Signature } from './knights';
import type { Rarity } from './rarity';
import type { Rng } from './rng';

export const SKILL_TIERS = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'jackpot'] as const;
export type SkillTier = (typeof SKILL_TIERS)[number];

export const TIER_NAME: Record<SkillTier, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
  jackpot: 'Jackpot',
};

/** The altar tier whose colors a skill tier wears (the jackpot is Mythic pink). */
export const TIER_RARITY: Record<SkillTier, Rarity> = {
  common: 'common',
  uncommon: 'uncommon',
  rare: 'rare',
  epic: 'epic',
  legendary: 'legendary',
  jackpot: 'mythic',
};

/** How far above common a tier sits (0 to 5): the power luck is raised to, times LUCK_TILT. */
export function tierStep(t: SkillTier): number {
  return SKILL_TIERS.indexOf(t);
}

/** Luck's pull per tier step: a skill's weight × luck ^ (LUCK_TILT × its tier step). */
export const LUCK_TILT = 0.1;
/** Luck past this counts as this much for skill rolls. */
export const LUCK_CAP = 1000;

/** The picture a skill shows (the HUD's reel and the hero sheet draw it: src/ui/skillIcons.ts). */
export type SkillIcon =
  | 'shield' | 'helm' | 'quake' | 'taunt' | 'dome' | 'titan'
  | 'sword' | 'swords' | 'shadow' | 'whirl' | 'slashes' | 'holySword'
  | 'arrow' | 'fan' | 'net' | 'rain' | 'nova' | 'bow'
  | 'heart' | 'pillar' | 'clover' | 'cross' | 'wings' | 'sun'
  | 'missiles' | 'frost' | 'bolt' | 'meteor' | 'vortex' | 'comet'
  | 'spear' | 'sweep' | 'target' | 'dash' | 'chevrons' | 'skyfall'
  | 'clock';

export interface SkillDef {
  id: SkillId;
  /** The class whose list it's on (null for a signature: it belongs to one knight). */
  cls: ClassId | null;
  name: string;
  /** One line for the hero sheet and the HUD. */
  text: string;
  tier: SkillTier;
  /** Its share of the roll at luck 1 (a class's six add up to 100). */
  weight: number;
  icon: SkillIcon;
  /** The color its name and its effects are drawn in. */
  color: string;
  /** The class's special from before the skill rolls (each class's rare). */
  classic?: boolean;
  /** Its numbers (see the top of this file for the units). */
  n: Readonly<Record<string, number>>;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const less = (dr: number) => pct(1 - dr);

// The numbers first, so each skill's line is written from the same numbers its effect uses.
const N = {
  // --- Guardian
  shieldSlam: { dmg: 2.5, knock: 26, stun: 1.2, r: 30 },
  ironSkin: { dr: 0.5, dur: 5, heal: 0.12, taunt: 3, r: 64 },
  groundPound: { dmg: 2, r: 46, stun: 1.5, knock: 10 },
  rallyingTaunt: { r: 96, taunt: 4, dr: 0.4, dmg: 1.5, knock: 18 },
  aegis: { dr: 0.3, dur: 6, heal: 0.2, r: 48, dmg: 0.5, knock: 22 },
  titansWrath: { dmg: 5, r: 72, stun: 2.5, knock: 30, taunt: 6, tauntR: 150, dr: 0.2, dur: 6, after: 3, afterDmg: 1.5, afterR: 56, every: 0.45 },
  // --- Blade
  twinSlash: { dmg: 2.4, r: 28, knock: 8, gap: 0.16 },
  battleCry: { atkSpd: 1.7, moveSpd: 1.25, dur: 6 },
  shadowstep: { dmg: 4.5, reach: 110, stun: 1 },
  whirlwind: { dur: 2, every: 0.22, dmg: 0.8, r: 28, knock: 5 },
  thousandCuts: { strikes: 10, every: 0.15, dmg: 1.5, reach: 90 },
  excalibur: { dmg: 4, blasts: 7, step: 24, r: 16, every: 0.06, endDmg: 5, endR: 30 },
  // --- Ranger
  powerShot: { dmg: 4, pierce: 6, speed: 300 },
  fanShot: { arrows: 7, spread: 0.16, dmg: 1.4, speed: 220 },
  snare: { dmg: 2, r: 32, stun: 2.5, speed: 220, reach: 200 },
  arrowRain: { r: 34, dur: 2, every: 0.18, dmg: 0.5, reach: 150 },
  arrowNova: { arrows: 16, rings: 2, gap: 0.22, dmg: 1.5, speed: 220, leap: 44 },
  thousandArrows: { spots: 8, r: 28, dur: 3, every: 0.15, dmg: 0.6, reach: 190 },
  // --- Cleric
  mend: { heal: 0.35, rest: 0.1 },
  smite: { dmg: 3.5, r: 20, delay: 0.35, heal: 0.12, reach: 140 },
  blessing: { heal: 0.2, atkSpd: 1.4, dur: 6 },
  sanctuary: { heal: 0.35, r: 42, dur: 3, every: 0.5, regen: 0.03 },
  guardianAngel: { revive: 0.5, heal: 0.25, invuln: 3 },
  miracle: { dmg: 3, r: 130, stun: 1.5, invuln: 2, every: 0.05 },
  // --- Arcanist
  magicMissiles: { missiles: 6, dmg: 1.5, speed: 140, homing: 8, spread: 0.3, splash: 14 },
  frostNova: { dmg: 2, r: 48, slow: 3, knock: 10 },
  chainLightning: { jumps: 7, dmg: 2.2, range: 70, stun: 0.4, every: 0.07, reach: 150 },
  meteor: { r: 36, delay: 0.9, dmg: 4, reach: 160 },
  singularity: { r: 76, pull: 48, dur: 2.5, every: 0.25, dmg: 0.5, burst: 4, burstR: 44, reach: 160 },
  meteorStorm: { meteors: 7, every: 0.25, r: 30, dmg: 3.5, reach: 180 },
  // --- Lancer
  javelin: { dmg: 3, speed: 260, pierce: 20 },
  sweep: { dmg: 2.2, r: 36, knock: 18 },
  impale: { dmg: 4.5, pierceDmg: 2, reach: 60, stun: 1.5 },
  dragonLunge: { dur: 0.34, speed: 300, dmg: 3, knock: 14, reach: 160 },
  wyrmRush: { lunges: 3, dur: 0.26, speed: 320, dmg: 3, gap: 0.32, reach: 150 },
  skyfall: { leap: 0.55, dmg: 6, r: 50, knock: 30, stun: 1.5, shards: 8, shardDmg: 1.5, fire: 3, reach: 130 },
  // --- signatures
  rewind: { back: 4, stopR: 140, stop: 2 },
} as const;

type Entry = Omit<SkillDef, 'id' | 'n'>;

const ENTRIES = {
  // ------------------------------------------------------------------ Guardian (tank)
  shieldSlam: {
    cls: 'guardian', tier: 'common', weight: 30, icon: 'shield', color: '#d8e0f0', name: 'Shield Slam',
    text: `Slams the shield into every foe in front: ${pct(N.shieldSlam.dmg)} attack, knocked flying and stunned ${N.shieldSlam.stun} s.`,
  },
  ironSkin: {
    cls: 'guardian', tier: 'common', weight: 26, icon: 'helm', color: '#c8d4ec', name: 'Iron Skin',
    text: `Braces and bellows: foes close by turn on the Guardian for ${N.ironSkin.taunt} s; ${less(N.ironSkin.dr)} less damage taken for ${N.ironSkin.dur} s and ${pct(N.ironSkin.heal)} HP back.`,
  },
  groundPound: {
    cls: 'guardian', tier: 'uncommon', weight: 20, icon: 'quake', color: '#e0b878', name: 'Ground Pound',
    text: `Pounds the ground: ${pct(N.groundPound.dmg)} attack to every foe close by, stunning them ${N.groundPound.stun} s.`,
  },
  rallyingTaunt: {
    cls: 'guardian', tier: 'rare', weight: 13, icon: 'taunt', color: '#ffd84a', name: CLASSES.guardian.special.name, classic: true,
    text: CLASSES.guardian.special.text,
  },
  aegis: {
    cls: 'guardian', tier: 'epic', weight: 8, icon: 'dome', color: '#ffe27a', name: 'Aegis',
    text: `A golden dome: the whole squad takes ${less(N.aegis.dr)} less damage for ${N.aegis.dur} s and heals ${pct(N.aegis.heal)}; foes close by are thrown back.`,
  },
  titansWrath: {
    cls: 'guardian', tier: 'legendary', weight: 3, icon: 'titan', color: '#ffb04a', name: "Titan's Wrath",
    text: `Brings the earth down: ${pct(N.titansWrath.dmg)} attack and a ${N.titansWrath.stun} s stun all around, ${N.titansWrath.after} aftershocks, every foe taunted and ${less(N.titansWrath.dr)} less damage for ${N.titansWrath.dur} s.`,
  },
  // ------------------------------------------------------------------ Blade (fighter)
  twinSlash: {
    cls: 'blade', tier: 'common', weight: 30, icon: 'sword', color: '#e8f0ff', name: 'Twin Slash',
    text: `Two wide slashes at the foes in front, ${pct(N.twinSlash.dmg)} attack each.`,
  },
  battleCry: {
    cls: 'blade', tier: 'common', weight: 26, icon: 'swords', color: '#ff8a6b', name: 'Battle Cry',
    text: `A war cry: attacks ${pct(N.battleCry.atkSpd - 1)} faster and moves ${pct(N.battleCry.moveSpd - 1)} faster for ${N.battleCry.dur} s.`,
  },
  shadowstep: {
    cls: 'blade', tier: 'uncommon', weight: 20, icon: 'shadow', color: '#b48cff', name: 'Shadowstep',
    text: `Steps through the shadows behind a foe and stabs it for ${pct(N.shadowstep.dmg)} attack, stunning it.`,
  },
  whirlwind: {
    cls: 'blade', tier: 'rare', weight: 13, icon: 'whirl', color: '#e8f0ff', name: CLASSES.blade.special.name, classic: true,
    text: CLASSES.blade.special.text,
  },
  thousandCuts: {
    cls: 'blade', tier: 'epic', weight: 8, icon: 'slashes', color: '#c8b8ff', name: 'Thousand Cuts',
    text: `Untouchable, the Blade flashes from foe to foe: ${N.thousandCuts.strikes} strikes of ${pct(N.thousandCuts.dmg)} attack.`,
  },
  excalibur: {
    cls: 'blade', tier: 'legendary', weight: 3, icon: 'holySword', color: '#fff2a0', name: 'Excalibur',
    text: `A blade of light splits the floor: a line of ${N.excalibur.blasts} blasts of ${pct(N.excalibur.dmg)} attack, ending in a ${pct(N.excalibur.endDmg)} explosion.`,
  },
  // ------------------------------------------------------------------ Ranger (archer)
  powerShot: {
    cls: 'ranger', tier: 'common', weight: 30, icon: 'arrow', color: '#f0e0b0', name: 'Power Shot',
    text: `A heavy arrow for ${pct(N.powerShot.dmg)} attack that runs through up to ${N.powerShot.pierce + 1} foes.`,
  },
  fanShot: {
    cls: 'ranger', tier: 'common', weight: 26, icon: 'fan', color: '#f0e0b0', name: 'Fan of Arrows',
    text: `${N.fanShot.arrows} arrows in a fan, ${pct(N.fanShot.dmg)} attack each.`,
  },
  snare: {
    cls: 'ranger', tier: 'uncommon', weight: 20, icon: 'net', color: '#d8c080', name: 'Snare Shot',
    text: `An arrow that bursts into a net: every foe caught is tangled for ${N.snare.stun} s and takes ${pct(N.snare.dmg)} attack.`,
  },
  arrowRain: {
    cls: 'ranger', tier: 'rare', weight: 13, icon: 'rain', color: '#e8e0c8', name: CLASSES.ranger.special.name, classic: true,
    text: CLASSES.ranger.special.text,
  },
  arrowNova: {
    cls: 'ranger', tier: 'epic', weight: 8, icon: 'nova', color: '#ffe8a0', name: 'Arrow Nova',
    text: `Leaps back and looses ${N.arrowNova.rings} rings of ${N.arrowNova.arrows} arrows all around, ${pct(N.arrowNova.dmg)} attack each.`,
  },
  thousandArrows: {
    cls: 'ranger', tier: 'legendary', weight: 3, icon: 'bow', color: '#fff2a0', name: 'Thousand Arrows',
    text: `The sky fills with arrows: rain falls on every group of foes in sight for ${N.thousandArrows.dur} s.`,
  },
  // ------------------------------------------------------------------ Cleric (healer)
  mend: {
    cls: 'cleric', tier: 'common', weight: 30, icon: 'heart', color: '#7dff8a', name: 'Mend',
    text: `Mends the most hurt knight for ${pct(N.mend.heal)} HP, and the rest of the squad for ${pct(N.mend.rest)}.`,
  },
  smite: {
    cls: 'cleric', tier: 'common', weight: 26, icon: 'pillar', color: '#fff0a0', name: 'Smite',
    text: `A pillar of light falls on a foe for ${pct(N.smite.dmg)} attack; the squad heals ${pct(N.smite.heal)}.`,
  },
  blessing: {
    cls: 'cleric', tier: 'uncommon', weight: 20, icon: 'clover', color: '#b0ec6c', name: 'Blessing',
    text: `Blesses the squad: ${pct(N.blessing.heal)} HP back and ${pct(N.blessing.atkSpd - 1)} faster attacks for ${N.blessing.dur} s.`,
  },
  sanctuary: {
    cls: 'cleric', tier: 'rare', weight: 13, icon: 'cross', color: '#fff0a0', name: CLASSES.cleric.special.name, classic: true,
    text: CLASSES.cleric.special.text,
  },
  guardianAngel: {
    cls: 'cleric', tier: 'epic', weight: 8, icon: 'wings', color: '#ffffff', name: 'Guardian Angel',
    text: `Wings of light: every fallen knight rises with ${pct(N.guardianAngel.revive)} HP; the squad heals ${pct(N.guardianAngel.heal)} and is untouchable for ${N.guardianAngel.invuln} s.`,
  },
  miracle: {
    cls: 'cleric', tier: 'legendary', weight: 3, icon: 'sun', color: '#fff7b0', name: 'Miracle',
    text: `Every knight rises and heals to full, and holy light smites every foe around for ${pct(N.miracle.dmg)} attack, stunning them.`,
  },
  // ------------------------------------------------------------------ Arcanist (mage)
  magicMissiles: {
    cls: 'arcanist', tier: 'common', weight: 30, icon: 'missiles', color: '#b08aff', name: 'Magic Missiles',
    text: `${N.magicMissiles.missiles} seeking missiles that burst on impact, ${pct(N.magicMissiles.dmg)} attack each.`,
  },
  frostNova: {
    cls: 'arcanist', tier: 'common', weight: 26, icon: 'frost', color: '#9edcf7', name: 'Frost Nova',
    text: `A ring of frost: ${pct(N.frostNova.dmg)} attack to every foe around, slowing them for ${N.frostNova.slow} s.`,
  },
  chainLightning: {
    cls: 'arcanist', tier: 'uncommon', weight: 20, icon: 'bolt', color: '#9ad8ff', name: 'Chain Lightning',
    text: `Lightning leaps between up to ${N.chainLightning.jumps} foes, ${pct(N.chainLightning.dmg)} attack each.`,
  },
  meteor: {
    cls: 'arcanist', tier: 'rare', weight: 13, icon: 'meteor', color: '#ff9a4a', name: CLASSES.arcanist.special.name, classic: true,
    text: CLASSES.arcanist.special.text,
  },
  singularity: {
    cls: 'arcanist', tier: 'epic', weight: 8, icon: 'vortex', color: '#b08aff', name: 'Singularity',
    text: `A singularity drags foes in for ${N.singularity.dur} s, grinding them, then bursts for ${pct(N.singularity.burst)} attack.`,
  },
  meteorStorm: {
    cls: 'arcanist', tier: 'legendary', weight: 3, icon: 'comet', color: '#ff7a2a', name: 'Meteor Storm',
    text: `Meteors rain down: ${N.meteorStorm.meteors} strikes of ${pct(N.meteorStorm.dmg)} attack, each leaving fire.`,
  },
  // ------------------------------------------------------------------ Lancer
  javelin: {
    cls: 'lancer', tier: 'common', weight: 30, icon: 'spear', color: '#e8d8b0', name: 'Javelin',
    text: `Hurls a spear that runs through every foe in its path for ${pct(N.javelin.dmg)} attack.`,
  },
  sweep: {
    cls: 'lancer', tier: 'common', weight: 26, icon: 'sweep', color: '#e8f0ff', name: 'Sweep',
    text: `Sweeps the spear all around: ${pct(N.sweep.dmg)} attack and a big knockback.`,
  },
  impale: {
    cls: 'lancer', tier: 'uncommon', weight: 20, icon: 'target', color: '#ff8a6a', name: 'Impale',
    text: `A brutal thrust: the first foe takes ${pct(N.impale.dmg)} attack and is pinned ${N.impale.stun} s; those behind take ${pct(N.impale.pierceDmg)}.`,
  },
  dragonLunge: {
    cls: 'lancer', tier: 'rare', weight: 13, icon: 'dash', color: '#ff7a5a', name: CLASSES.lancer.special.name, classic: true,
    text: CLASSES.lancer.special.text,
  },
  wyrmRush: {
    cls: 'lancer', tier: 'epic', weight: 8, icon: 'chevrons', color: '#ff9a5a', name: 'Wyrm Rush',
    text: `${N.wyrmRush.lunges} lunges in a row, each at the nearest foe: ${pct(N.wyrmRush.dmg)} attack every pass, untouchable.`,
  },
  skyfall: {
    cls: 'lancer', tier: 'legendary', weight: 3, icon: 'skyfall', color: '#ffd86a', name: 'Skyfall',
    text: `Leaps into the sky and crashes down on the biggest group: ${pct(N.skyfall.dmg)} attack, spear shards flying and fire left burning.`,
  },
  // ------------------------------------------------------------------ signatures (one knight's jackpot)
  rewind: {
    cls: null, tier: 'jackpot', weight: 2, icon: 'clock', color: '#9ad8ff', name: Object.values(SIGNATURES).find((x) => x.id === 'rewind')?.name ?? 'Rewind',
    text: `Time turns back ${N.rewind.back} s for the squad: where everyone stood, their HP, fallen knights too. Damage dealt stays.`,
  },
} as const satisfies Record<keyof typeof N, Entry>;

export type SkillId = keyof typeof N;

/** Every skill, by id. `SKILLS[id].n` is typed to that skill's own numbers. */
export const SKILLS: { readonly [K in SkillId]: SkillDef & { id: K; n: (typeof N)[K] } } = Object.fromEntries(
  (Object.keys(N) as SkillId[]).map((id) => [id, { ...ENTRIES[id], id, n: N[id] }]),
) as never;

export const SKILL_IDS = Object.keys(N) as SkillId[];

/** Each class's list, commonest first. */
export const CLASS_SKILLS: Record<ClassId, readonly SkillId[]> = Object.fromEntries(
  CLASS_IDS.map((c) => [c, SKILL_IDS.filter((id) => SKILLS[id].cls === c).sort((a, b) => tierStep(SKILLS[a].tier) - tierStep(SKILLS[b].tier))]),
) as Record<ClassId, SkillId[]>;

/** The skill a signature is (each signature in SIGNATURES must have its skill here). */
export const SIGNATURE_SKILL: Record<Signature['id'], SkillId> = { rewind: 'rewind' };

/** A knight's signature skill (its jackpot), or null. */
export function signatureSkill(knightId: string): SkillDef | null {
  const sig = SIGNATURES[knightId];
  return sig ? SKILLS[SIGNATURE_SKILL[sig.id]] : null;
}

/** The list a knight rolls from: its class's six, then its signature if it has one. */
export function skillsFor(knightId: string): SkillDef[] {
  const list: SkillDef[] = CLASS_SKILLS[knightDef(knightId).cls].map((id) => SKILLS[id]);
  const sig = signatureSkill(knightId);
  if (sig) list.push(sig);
  return list;
}

/** Seconds a knight waits between skill rolls: its class's (a signature no longer brings its own). */
export function skillRollCd(knightId: string): number {
  return CLASSES[knightDef(knightId).cls].specialCd;
}

function luckFor(luck: number): number {
  return Number.isFinite(luck) ? Math.min(LUCK_CAP, Math.max(1, luck)) : 1;
}

/** A skill's weight at this luck: its weight × luck ^ (LUCK_TILT × its tier step). */
export function tiltedWeight(skill: Pick<SkillDef, 'weight' | 'tier'>, luck = 1): number {
  return skill.weight * Math.pow(luckFor(luck), LUCK_TILT * tierStep(skill.tier));
}

export interface SkillOdds {
  skill: SkillDef;
  /** 0 to 1; a list's chances add up to 1. */
  chance: number;
  /** "1 in X". */
  oneIn: number;
}

/** The odds of every skill a knight can roll, at this luck, in list order (the hero sheet's table). */
export function skillOdds(knightId: string, luck = 1): SkillOdds[] {
  return oddsOf(skillsFor(knightId), luck);
}

export function oddsOf(list: readonly SkillDef[], luck = 1): SkillOdds[] {
  const w = list.map((s) => tiltedWeight(s, luck));
  const total = w.reduce((a, b) => a + b, 0);
  return list.map((skill, i) => ({ skill, chance: w[i] / total, oneIn: total / w[i] }));
}

/** Rolls a skill from a knight's list: weighted, leaning rarer with luck. */
export function rollSkill(knightId: string, luck: number, rng: Rng): SkillDef {
  const list = skillsFor(knightId);
  return rng.weighted(list.map((s) => [s, tiltedWeight(s, luck)] as const));
}

/** "30%", "2.9%", "0.4%" for the odds tables. */
export function fmtChance(p: number): string {
  const v = p * 100;
  if (v >= 10) return `${Math.round(v)}%`;
  if (v >= 0.1) return `${(Math.round(v * 10) / 10).toFixed(1)}%`;
  return `${(Math.round(v * 100) / 100).toFixed(2)}%`;
}
