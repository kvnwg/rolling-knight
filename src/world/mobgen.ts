/**
 * Procedural mobs. Each floor designs three or four mob types from its biome: a body plan (slime,
 * beast, humanoid, flyer, plant, golem, bug, pumpkin, ghost, or the farm's pig and ram), a behavior
 * (chaser, archer, charger, bomber, caster, tank, swarm), colors from the biome with a twist, a size,
 * features (horns, spikes, eyes, crests) and a name. Every fifth floor adds a boss built the same way,
 * bigger, with attack patterns of its own.
 */
import { BAL } from '../core/balance';
import { Rng } from '../core/rng';
import type { Biome, BodyPlan, Ramp } from './biomes';

export type Behavior = 'chaser' | 'ranged' | 'charger' | 'bomber' | 'caster' | 'tank' | 'swarm';
export type BossMove = 'ring' | 'fan' | 'charge' | 'slam' | 'summon' | 'rain';

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
};

const BOSS_NAMES = ['Grumblor', 'Vexmaw', 'Old Gnarl', 'Skarr', 'Mother Brood', 'Kragg', 'Morrow', 'Ysgarth', 'Thul', 'Belloc', 'Nyssa', 'Ozrak'];
const BOSS_TITLES = ['Tyrant', 'Devourer', 'Warden', 'Undying', 'Matriarch', 'Hollow King', 'Gatekeeper', 'Ravager'];

const BASE: Record<Behavior, { hp: number; atk: number; speed: number; range: number; atkCd: number }> = {
  chaser: { hp: 30, atk: 6, speed: 34, range: 12, atkCd: 1.1 },
  ranged: { hp: 22, atk: 5, speed: 28, range: 92, atkCd: 1.9 },
  charger: { hp: 38, atk: 9, speed: 30, range: 90, atkCd: 3.2 },
  bomber: { hp: 16, atk: 14, speed: 46, range: 14, atkCd: 1 },
  caster: { hp: 24, atk: 8, speed: 26, range: 100, atkCd: 3.4 },
  tank: { hp: 90, atk: 10, speed: 19, range: 22, atkCd: 2.6 },
  swarm: { hp: 12, atk: 4, speed: 54, range: 8, atkCd: 0.8 },
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
  const flying = plan === 'flyer' || plan === 'ghost';
  const size = plan === 'golem' ? 1.25 : behavior === 'swarm' ? 0.8 : plan === 'beast' ? 1.1 : 1;
  const ramp = twist(rng.pick(biome.mobs.palettes), rng);
  const shotColor = ramp[ramp.length - 1];
  return {
    id,
    name: `${adj} ${noun}`,
    plan,
    behavior,
    ramp,
    eye: biome.mobs.eye,
    size,
    radius: Math.round(5 * size),
    hp: base.hp * rng.float(0.9, 1.15),
    atk: base.atk * rng.float(0.9, 1.15),
    speed: base.speed * rng.float(0.9, 1.15),
    range: base.range,
    atkCd: base.atkCd * rng.float(0.9, 1.1),
    flying,
    features: {
      horns: rng.chance(0.4),
      spikes: rng.chance(0.3),
      crest: rng.chance(0.3),
      eyes: rng.weighted<1 | 2 | 3>([[1, 2], [2, 6], [3, 1]]),
      tail: rng.chance(0.5),
      seed: rng.int(0, 1 << 30),
    },
    ...(behavior === 'ranged' || behavior === 'caster' ? { shot: { speed: rng.float(65, 85), color: shotColor, radius: 3 } } : {}),
  };
}

/** The mob types living on a floor (deterministic for the floor and seed). */
export function floorMobs(biome: Biome, floor: number, seed: number): MobType[] {
  const rng = new Rng(Rng.hashSeed(seed ^ (floor * 7919) ^ 0x51ed));
  const n = floor >= 12 ? 4 : 3;
  const plans = rng.shuffle([...biome.mobs.plans]);
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
  const candidates = biome.mobs.plans.filter((p) => ['golem', 'beast', 'humanoid', 'slime', 'ghost', 'pumpkin', 'pig', 'ram'].includes(p));
  const plan = rng.pick(candidates.length ? candidates : biome.mobs.plans);
  const behavior = plan === 'golem' ? 'tank' : plan === 'ghost' ? 'caster' : BEHAVIORS[plan][0];
  const t = design(biome, plan, behavior, rng, `${biome.id}-${floor}-boss`);
  const moves: BossMove[] = rng.shuffle(['ring', 'fan', 'charge', 'slam', 'summon', 'rain'] as BossMove[]).slice(0, 3);
  if (!moves.includes('ring')) moves[0] = 'ring';
  const name = rng.pick(BOSS_NAMES);
  const title = `${rng.pick(biome.mobs.adjectives)} ${rng.pick(BOSS_TITLES)}`;
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

/** Enemy stat scaling with depth. */
export function floorScale(floor: number): { hp: number; atk: number } {
  return { hp: BAL.dungeon.hpBase * Math.pow(BAL.dungeon.hpGrowth, floor - 1), atk: BAL.dungeon.atkBase * Math.pow(BAL.dungeon.dmgGrowth, floor - 1) };
}
