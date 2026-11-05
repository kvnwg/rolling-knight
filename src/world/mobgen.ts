/**
 * Procedural mobs. Each floor designs three or four mob types from its biome: a body plan (slime,
 * beast, humanoid, flyer, plant, golem, bug, pumpkin, ghost, or the farm's pig, ram and chicken), a
 * behavior (chaser, archer, charger, bomber, caster, tank, swarm), colors from the biome with a twist,
 * a size, features (horns, spikes, eyes, crests) and a name ("Adjective Noun", or one from the biome's
 * own name tables: the farm's are jokes). Every fifth floor adds a boss built the same way, bigger,
 * with attack patterns of its own (a biome can name its own boss plan, names and titles).
 */
import { Rng } from '../core/rng';
import type { Biome, BodyPlan, Ramp } from './biomes';

export type Behavior = 'chaser' | 'ranged' | 'charger' | 'bomber' | 'caster' | 'tank' | 'swarm';
export type BossMove = 'ring' | 'fan' | 'charge' | 'slam' | 'summon' | 'rain' | 'leap';

/**
 * A mob's gap-closer: a dash (a straight rush along a line) or a leap (an arc onto a spot). Each is
 * telegraphed (a crouch, a lane or a landing ring on the ground), hits once, and leaves the mob spent
 * for a moment; a dodge roll goes straight through it. The name says what it looks like (the art
 * picks its frames by it): wolves pounce, slimes hop, goblins stab, orcs shoulder-charge, skeletons
 * thrust, bats swoop, beetles skitter, boars and rams charge, ogres leap and slam.
 */
export type LungeName = 'pounce' | 'hop' | 'stab' | 'shoulder' | 'thrust' | 'swoop' | 'skitter' | 'charge' | 'slam';

export interface Lunge {
  name: LungeName;
  kind: 'dash' | 'leap';
  /** Seconds of the tell (the crouch, the rear-back) before it goes. */
  wind: number;
  /** How far it goes (px) and how long that takes (s). */
  reach: number;
  dur: number;
  /** A leap's height at the top of its arc (px). */
  height: number;
  /** Its hit (x attack), its knockback (px), and how far past the body it hits (a dash) or the landing ring's radius (a leap). */
  dmg: number;
  knock: number;
  r: number;
  /** A dash that runs on through whoever it hits (a charge) instead of stopping at the first. */
  through: boolean;
  /** Seconds it stands spent after (the window to punish it). */
  recover: number;
  /** Seconds between lunges; the distances it starts one from. */
  cd: number;
  min: number;
  max: number;
}

export const LUNGES: Record<LungeName, Lunge> = {
  pounce: { name: 'pounce', kind: 'leap', wind: 0.45, reach: 76, dur: 0.4, height: 14, dmg: 1.25, knock: 9, r: 12, through: false, recover: 0.42, cd: 3, min: 30, max: 80 },
  hop: { name: 'hop', kind: 'leap', wind: 0.5, reach: 62, dur: 0.46, height: 18, dmg: 1.2, knock: 8, r: 13, through: false, recover: 0.45, cd: 3.2, min: 24, max: 66 },
  stab: { name: 'stab', kind: 'dash', wind: 0.42, reach: 52, dur: 0.17, height: 0, dmg: 1.2, knock: 7, r: 3, through: false, recover: 0.36, cd: 2.8, min: 26, max: 58 },
  shoulder: { name: 'shoulder', kind: 'dash', wind: 0.55, reach: 72, dur: 0.3, height: 0, dmg: 1.35, knock: 16, r: 4, through: true, recover: 0.5, cd: 3.6, min: 30, max: 76 },
  thrust: { name: 'thrust', kind: 'dash', wind: 0.36, reach: 42, dur: 0.14, height: 0, dmg: 1.15, knock: 6, r: 3, through: false, recover: 0.3, cd: 2.6, min: 22, max: 48 },
  swoop: { name: 'swoop', kind: 'dash', wind: 0.38, reach: 68, dur: 0.26, height: 0, dmg: 1.1, knock: 5, r: 3, through: true, recover: 0.32, cd: 3, min: 28, max: 72 },
  skitter: { name: 'skitter', kind: 'dash', wind: 0.36, reach: 44, dur: 0.15, height: 0, dmg: 1.1, knock: 4, r: 3, through: false, recover: 0.3, cd: 2.8, min: 20, max: 48 },
  charge: { name: 'charge', kind: 'dash', wind: 0.6, reach: 98, dur: 0.42, height: 0, dmg: 1.3, knock: 14, r: 4, through: true, recover: 0.55, cd: 3.4, min: 26, max: 102 },
  slam: { name: 'slam', kind: 'leap', wind: 0.62, reach: 86, dur: 0.56, height: 26, dmg: 1.2, knock: 14, r: 22, through: false, recover: 0.62, cd: 5, min: 44, max: 92 },
};

/** A throw for when it can't get to you (ogres): a boulder torn from the ground, lobbed onto a spot. */
export interface Lob {
  /** Seconds it takes to tear it up and raise it (the tell). */
  wind: number;
  /** The landing ring's radius (px), its hit (x attack), seconds between throws, and the distances it throws from. */
  r: number;
  dmg: number;
  cd: number;
  min: number;
  max: number;
}

export const OGRE_LOB: Lob = { wind: 0.8, r: 18, dmg: 1.2, cd: 4.2, min: 40, max: 180 };

/**
 * A bomber's lunge: the same hop or pounce, but only to get there (a bump, not a bite): the blast it
 * winds up once it's on you is what hurts.
 */
function bomberLunge(l: Lunge): Lunge {
  return { ...l, dmg: 0.35, knock: 4, cd: 3.4, min: 30, max: 70 };
}

/**
 * Which lunge a design gets, from its body and behavior: every kind that fights up close has one
 * (archers, spitters and casters fight from range instead). Humanoid chasers fight the way their art
 * looks (mobLook.ts draws them): skeletons in the crypt, the graveyard and the ruins thrust, orcs (the
 * tundra's, and horned ones) shoulder-charge, goblins (and the farm's scarecrows) dash in and stab.
 * Bombers hop or pounce in before they go off.
 */
export function lungeFor(biome: string, plan: BodyPlan, behavior: Behavior, horns: boolean): Lunge | undefined {
  const L = LUNGES;
  if (behavior === 'bomber') return bomberLunge(plan === 'bug' ? L.pounce : L.hop);
  switch (plan) {
    case 'slime':
      return behavior === 'chaser' ? L.hop : undefined;
    case 'beast':
      return behavior === 'charger' ? L.charge : L.pounce;
    case 'humanoid':
      if (behavior !== 'chaser') return undefined;
      if (biome === 'crypt' || biome === 'graveyard' || biome === 'desert') return L.thrust;
      if (biome === 'tundra' || horns) return L.shoulder;
      return L.stab;
    case 'flyer':
    case 'ghost':
      return behavior === 'swarm' ? L.swoop : undefined;
    case 'golem':
      return L.slam;
    case 'bug':
      return behavior === 'chaser' ? L.pounce : L.skitter;
    case 'pumpkin':
      return behavior === 'chaser' ? L.hop : undefined;
    case 'pig':
    case 'ram':
      return L.charge;
    case 'chicken':
      return { ...L.hop, reach: 40, height: 10, r: 9, dmg: 1.1, min: 18, max: 44 };
    default:
      return undefined;
  }
}

/**
 * Readable bullets, Enter the Gungeon style: slow (60 to 100 px/s, slower than any knight's shot), big
 * and high-contrast, in a pattern each kind of foe is known by. 'aimed' one at you; 'fan' 3 to 5 spread
 * out; 'burst' 2 to 4 aimed one after another; 'ring' all round; 'wave' a wide slow arc; 'curve' a few
 * that bend in toward you. Later floors and elites fire denser patterns (ai.ts volley).
 */
export type Volley = 'aimed' | 'fan' | 'burst' | 'ring' | 'wave' | 'curve';

export interface Gun {
  /** Its pattern; every `every`-th volley `alt` instead (an archer's fan). */
  kind: Volley;
  alt?: Volley;
  every?: number;
  /** Seconds between volleys, and the distances it fires from. */
  cd: number;
  min: number;
  max: number;
  /** Seconds of its tell before it fires (the red flash, its "about to fire" pose). */
  wind: number;
}

/**
 * Each kind's gun: archers aim and fan out every third volley, spitters burst, spore pods ring, thorns
 * and spiders fan, shamans and wraiths curve theirs in, goblins and ghouls fire single aimed shots (and
 * skeletons short bursts, orcs fans), swarms the odd slow shot. Beasts, slimes, chargers, bombers and
 * ogres have no gun: they come at you (slimes, pumpkins, bombers and ogres shake bullets loose as they land,
 * slam or go off: quakeFor).
 */
export function gunFor(plan: BodyPlan, behavior: Behavior, lunge: Lunge | undefined, atkCd: number, range: number): Gun | undefined {
  switch (behavior) {
    case 'ranged':
      if (plan === 'plant') return { kind: 'ring', cd: atkCd * 1.5, min: 0, max: range, wind: 0.6 };
      if (plan === 'flyer') return { kind: 'burst', cd: atkCd * 1.3, min: 0, max: range, wind: 0.5 };
      return { kind: 'aimed', alt: 'fan', every: 3, cd: atkCd, min: 0, max: range, wind: 0.45 };
    case 'caster':
      return { kind: 'curve', cd: atkCd * 0.9, min: 0, max: range, wind: 0.55 };
    case 'chaser':
      if (plan === 'humanoid') return { kind: lunge?.name === 'thrust' ? 'burst' : lunge?.name === 'shoulder' ? 'fan' : 'aimed', cd: 2.4, min: 34, max: 110, wind: 0.45 };
      if (plan === 'bug') return { kind: 'fan', cd: 2.8, min: 30, max: 100, wind: 0.5 };
      return undefined;
    case 'swarm':
      return plan === 'ghost' ? { kind: 'curve', cd: 3.6, min: 30, max: 100, wind: 0.5 } : { kind: 'aimed', cd: 3.6, min: 30, max: 100, wind: 0.45 };
    default:
      return undefined;
  }
}

/** Bullets a heavy mover shakes loose in a ring when it lands a leap, slams or goes off (0: none; a charger's charge is its whole attack). */
export function quakeFor(plan: BodyPlan, behavior: Behavior): number {
  if (behavior === 'tank') return 8;
  if (behavior === 'bomber') return 8;
  if (plan === 'slime' || plan === 'pumpkin') return 6;
  return 0;
}

export interface MobType {
  id: string;
  name: string;
  plan: BodyPlan;
  behavior: Behavior;
  ramp: Ramp;
  eye: string;
  /** Body size multiplier for the art (1 = normal). */
  size: number;
  radius: number;
  hp: number;
  atk: number;
  speed: number;
  range: number;
  atkCd: number;
  flying: boolean;
  /** Art features, decided once per type. */
  features: { horns: boolean; spikes: boolean; crest: boolean; eyes: 1 | 2 | 3; tail: boolean; seed: number };
  shot?: { speed: number; color: string; radius: number };
  boss?: { title: string; moves: BossMove[] };
  /** Its dash or leap (lungeFor), if it has one. */
  lunge?: Lunge;
  /** Its throw when it can't reach you (ogres), if it has one. */
  lob?: Lob;
  /** Its signature volley of bullets (gunFor), if it shoots. */
  gun?: Gun;
  /** Bullets it shakes loose in a ring when it lands, slams, goes off or ends a charge (quakeFor). */
  quake?: number;
}

const BEHAVIORS: Record<BodyPlan, Behavior[]> = {
  slime: ['chaser', 'bomber', 'chaser'],
  beast: ['chaser', 'charger'],
  humanoid: ['chaser', 'ranged', 'caster'],
  flyer: ['swarm', 'ranged'],
  plant: ['ranged', 'caster'],
  golem: ['tank'],
  bug: ['swarm', 'bomber', 'chaser'],
  pumpkin: ['chaser', 'bomber'],
  ghost: ['caster', 'swarm'],
  pig: ['charger'],
  ram: ['charger'],
  chicken: ['swarm'],
};

const NOUNS: Record<BodyPlan, Partial<Record<Behavior, string[]>>> = {
  slime: { chaser: ['Slime', 'Ooze', 'Blob'], bomber: ['Popper', 'Bloater'] },
  beast: { chaser: ['Hound', 'Wolf', 'Lynx', 'Stalker'], charger: ['Boar', 'Rhino', 'Tusker'] },
  humanoid: { chaser: ['Goblin', 'Ghoul', 'Raider', 'Brute'], ranged: ['Archer', 'Slinger', 'Hunter'], caster: ['Shaman', 'Cultist', 'Hexer'] },
  flyer: { swarm: ['Bat', 'Moth', 'Crow', 'Wisp'], ranged: ['Spitter', 'Watcher', 'Eye'] },
  plant: { ranged: ['Spore Pod', 'Thornweed'], caster: ['Bloom', 'Mandrake'] },
  golem: { tank: ['Golem', 'Sentinel', 'Colossus'] },
  bug: { swarm: ['Mite', 'Beetle', 'Scarab'], bomber: ['Bombardier', 'Tick'], chaser: ['Spider', 'Crawler'] },
  pumpkin: { chaser: ['Jack', 'Gourdling'], bomber: ['Pumpkin Bomb'] },
  ghost: { caster: ['Wraith', 'Banshee'], swarm: ['Spirit', 'Wisp'] },
  pig: { charger: ['Hog'] },
  ram: { charger: ['Ram'] },
  chicken: { swarm: ['Hen', 'Chicken'] },
};

/**
 * Plans drawn in their own colors (the farm's pack sprites and chickens): their ramp is only for their
 * glow, their shots and the splat they leave, so it matches the animal, not the biome's cloth.
 */
const OWN_RAMPS: Partial<Record<BodyPlan, Ramp>> = {
  pig: ['#5a2a24', '#a85d52', '#d18075', '#f4b8b0'],
  ram: ['#1e1e24', '#404046', '#8a8288', '#f6e7da'],
  chicken: ['#8a7e76', '#d0c8c0', '#f0ece6', '#ffffff'],
};

const BOSS_NAMES = ['Grumblor', 'Vexmaw', 'Old Gnarl', 'Skarr', 'Mother Brood', 'Kragg', 'Morrow', 'Ysgarth', 'Thul', 'Belloc', 'Nyssa', 'Ozrak'];
const BOSS_TITLES = ['Tyrant', 'Devourer', 'Warden', 'Undying', 'Matriarch', 'Hollow King', 'Gatekeeper', 'Ravager'];

/**
 * Each behavior's shape (power.ts measures HP and hit against the chaser's, so those two stay the
 * reference) and its pace in px/s. Knights walk 50 to 62: chasers come on at nearly that (and sprint
 * when they're far off: ai.ts), swarms outrun you, archers and casters keep up, and even an ogre jogs.
 */
export const BASE: Record<Behavior, { hp: number; atk: number; speed: number; range: number; atkCd: number }> = {
  chaser: { hp: 30, atk: 6, speed: 47, range: 12, atkCd: 0.95 },
  ranged: { hp: 22, atk: 5, speed: 38, range: 92, atkCd: 1.6 },
  charger: { hp: 38, atk: 9, speed: 42, range: 90, atkCd: 2.6 },
  bomber: { hp: 16, atk: 14, speed: 58, range: 14, atkCd: 1 },
  caster: { hp: 24, atk: 8, speed: 34, range: 100, atkCd: 3 },
  tank: { hp: 90, atk: 8, speed: 34, range: 22, atkCd: 2.5 },
  swarm: { hp: 12, atk: 4, speed: 64, range: 8, atkCd: 0.7 },
};

/** A small hue twist on a biome ramp so two mob types of a floor look different. */
function twist(ramp: Ramp, rng: Rng): Ramp {
  const shift = rng.float(-0.08, 0.08);
  const sat = rng.float(0.85, 1.2);
  return ramp.map((hex) => {
    const [h, s, l] = hsl(hex);
    return toHex(h + shift, Math.min(1, s * sat), l);
  });
}

export function hsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h /= 6;
  return [h, s, l];
}

export function toHex(h: number, s: number, l: number): string {
  h = ((h % 1) + 1) % 1;
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(Math.max(0, Math.min(1, c)) * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function design(biome: Biome, plan: BodyPlan, behavior: Behavior, rng: Rng, id: string): MobType {
  const base = BASE[behavior];
  const noun = rng.pick(NOUNS[plan][behavior] ?? NOUNS[plan][BEHAVIORS[plan][0]] ?? ['Creature']);
  const adj = rng.pick(biome.mobs.adjectives);
  // A biome's own name table replaces "Adjective Noun" (only biomes that have one draw from the rng here).
  const table = biome.mobs.names?.[plan];
  const name = table?.length ? rng.pick(table) : `${adj} ${noun}`;
  const flying = plan === 'flyer' || plan === 'ghost';
  const size = plan === 'golem' ? 1.25 : behavior === 'swarm' ? 0.8 : plan === 'beast' ? 1.1 : 1;
  const picked = twist(rng.pick(biome.mobs.palettes), rng);
  const ramp = OWN_RAMPS[plan] ?? picked;
  const shotColor = ramp[ramp.length - 1];
  // (The rolls in the order they always came, so a floor's mobs look as they did.)
  const hp = base.hp * rng.float(0.9, 1.15);
  const atk = base.atk * rng.float(0.9, 1.15);
  const speed = base.speed * rng.float(0.9, 1.15);
  const atkCd = base.atkCd * rng.float(0.9, 1.1);
  const features = {
    horns: rng.chance(0.4),
    spikes: rng.chance(0.3),
    crest: rng.chance(0.3),
    eyes: rng.weighted<1 | 2 | 3>([[1, 2], [2, 6], [3, 1]]),
    tail: rng.chance(0.5),
    seed: rng.int(0, 1 << 30),
  };
  const lunge = lungeFor(biome.id, plan, behavior, features.horns);
  const gun = gunFor(plan, behavior, lunge, atkCd, base.range);
  const quake = quakeFor(plan, behavior);
  return {
    id,
    name,
    plan,
    behavior,
    ramp,
    eye: biome.mobs.eye,
    size,
    radius: Math.round(5 * size),
    hp,
    atk,
    speed,
    range: base.range,
    atkCd,
    flying,
    features,
    ...(behavior === 'ranged' || behavior === 'caster' ? { shot: { speed: rng.float(65, 85), color: shotColor, radius: 3 } } : {}),
    ...(lunge ? { lunge } : {}),
    ...(plan === 'golem' ? { lob: OGRE_LOB } : {}),
    ...(gun ? { gun } : {}),
    ...(quake ? { quake } : {}),
    // (Every foe's bullets get a speed: slow, readable, slower than any knight's shot.)
    ...(behavior === 'ranged' || behavior === 'caster' || !gun ? {} : { shot: { speed: 70, color: shotColor, radius: 3 } }),
  };
}

/** The mob types living on a floor (deterministic for the floor and seed). */
export function floorMobs(biome: Biome, floor: number, seed: number): MobType[] {
  const rng = new Rng(Rng.hashSeed(seed ^ (floor * 7919) ^ 0x51ed));
  const n = floor >= 12 ? 4 : 3;
  let plans = rng.shuffle([...biome.mobs.plans]);
  // A biome's signature mobs come first, so every one of its floors has them.
  const core = biome.mobs.core;
  if (core?.length) plans = [...core, ...plans.filter((p) => !core.includes(p))];
  const out: MobType[] = [];
  for (let i = 0; i < n; i++) {
    const plan = plans[i % plans.length];
    // The first type is always a melee chaser-style mob so every floor has a frontline.
    const options = BEHAVIORS[plan];
    const behavior = i === 0 ? options[0] : rng.pick(options);
    out.push(design(biome, plan, behavior, rng, `${biome.id}-${floor}-${i}`));
  }
  return out;
}

export function floorBoss(biome: Biome, floor: number, seed: number): MobType {
  const rng = new Rng(Rng.hashSeed(seed ^ (floor * 104729) ^ 0xb055));
  const own = biome.mobs.boss;
  const candidates = biome.mobs.plans.filter((p) => ['golem', 'beast', 'humanoid', 'slime', 'ghost', 'pumpkin', 'pig', 'ram'].includes(p));
  const plan = own ? own.plan : rng.pick(candidates.length ? candidates : biome.mobs.plans);
  const behavior = plan === 'golem' ? 'tank' : plan === 'ghost' ? 'caster' : BEHAVIORS[plan][0];
  const t = design(biome, plan, behavior, rng, `${biome.id}-${floor}-boss`);
  const moves: BossMove[] = rng.shuffle(['ring', 'fan', 'charge', 'slam', 'summon', 'rain', 'leap'] as BossMove[]).slice(0, 3);
  if (!moves.includes('ring')) moves[0] = 'ring';
  // Big farm animals always charge; every other boss has a charge or a leap to come at you with
  // (heavy ones leap, the rest one or the other).
  const spare = moves[1] === 'ring' ? 2 : 1;
  if ((plan === 'pig' || plan === 'ram') && !moves.includes('charge')) moves[spare] = 'charge';
  else if (!moves.includes('charge') && !moves.includes('leap')) {
    moves[spare] = plan === 'golem' || plan === 'slime' || plan === 'pumpkin' || t.features.seed % 2 ? 'leap' : 'charge';
  }
  let name: string;
  let title: string;
  if (own) [name, title] = rng.pick(own.names);
  else {
    name = rng.pick(BOSS_NAMES);
    title = `${rng.pick(biome.mobs.adjectives)} ${rng.pick(BOSS_TITLES)}`;
  }
  return {
    ...t,
    name,
    size: 2.2,
    radius: 12,
    hp: t.hp * 42,
    atk: t.atk * 1.9,
    speed: Math.max(24, t.speed * 0.9),
    atkCd: 2.2,
    range: 110,
    shot: { speed: 75, color: t.ramp[3], radius: 3 },
    boss: { title, moves },
    features: { ...t.features, horns: true, crest: true },
  };
}

