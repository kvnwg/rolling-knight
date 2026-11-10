/**
 * One dungeon floor in motion: the squad, the mobs, shots, ground effects and pickups. The game
 * controller (game.ts) builds a World per floor and feeds it input; the renderer draws it.
 */
import { BAL } from '../core/balance';
import { type ClassId } from '../core/knights';
import type { Rarity } from '../core/rarity';
import { Rng } from '../core/rng';
import type { KnightStats } from '../core/roster';
import type { MutationId } from '../core/state';
import { heroAi, heroAutoRoll, mobAi, quakeRing } from './ai';
import type { Biome } from './biomes';
import { dist, inRing, lineOfSight, moveUnit, norm, type Area, type FloatText, type Fx, type Pickup, type Shot, type Unit, type View } from './entities';
import { flowFrom, type Flow } from './flow';
import { FLOOR, TILE, tileAt, type FloorMap } from './mapgen';
import { type MobType } from './mobgen';
import { TALK_RANGE, type HubStation } from './hubWorld';
import { demonDeathLines, demonEnrageLines, demonMobType, demonTauntsFor, type Npc, type NpcDef } from './npcs';
import type { Ware } from './shop';
import { floorPar, foeStats } from '../core/power';
import { heroDodge, heroSpecial, heroTick } from './skills';
import { CLEAR, skyOf, type Sky } from './sky';
import { onHeroHit, onHeroHurt, onKill, onShotHit, onTick } from './chance';
import { makeTraps, updateTraps, type Trap } from './traps';
import { feelHit, tickFeel } from './feel';

export interface HeroSpec {
  knightId: string;
  cls: ClassId;
  rarity: Rarity;
  mutation: MutationId | null;
  stats: KnightStats;
  slot: number;
  /** Carried over from the last floor (share of max HP); 1 = full, 0 = downed. */
  hpShare: number;
}

export type WorldEvent =
  | { type: 'kill'; gold: number; elite: boolean; boss: boolean; x: number; y: number; name: string }
  | { type: 'pickup'; kind: Pickup['kind']; amount: number }
  | { type: 'cleared' }
  /** A boss floor's way down opened (its boss fell). */
  | { type: 'portal' }
  /** The leader touched the open portal: the squad swirls into it ('exit' follows once it's through). */
  | { type: 'warp' }
  | { type: 'exit' }
  | { type: 'wipe' }
  | { type: 'heroDown'; slot: number }
  /** A Phoenix Feather (a merchant's) caught a knight as it fell: it's back up, the feather spent. */
  | { type: 'phoenix'; slot: number }
  | { type: 'switch'; slot: number }
  | { type: 'bossPhase' }
  /** A knight's dodge roll made something miss that would have hit it (once per roll); `mine`: the knight you control. */
  | { type: 'perfect'; slot: number; mine: boolean }
  /** A swing cut a foe's shot out of the air (melee.ts); `reflect`: sent back; `mine`: the knight you steer's. */
  | { type: 'clink'; x: number; y: number; reflect: boolean; mine: boolean };

interface Snapshot {
  heroes: Map<number, { x: number; y: number; hp: number; downed: boolean; view: Unit['view']; dir: 1 | -1 }>;
  mobs: Map<number, { x: number; y: number }>;
}

export interface Input {
  mx: number;
  my: number;
  dodge: boolean;
  special: boolean;
  /** Your knight attacks only while this is held (not on Auto, where it fights by itself). */
  attack?: boolean;
  /** Where to aim (world px), from the mouse (aim.ts); with neither this nor aimDx/aimDy: the auto-aim. */
  aimX?: number | null;
  aimY?: number | null;
  /** Which way to aim (a direction), from a drag off the touch Attack button; it wins over aimX/aimY. */
  aimDx?: number | null;
  aimDy?: number | null;
}

export interface WorldOptions {
  map: FloorMap;
  biome: Biome;
  floor: number;
  boss: boolean;
  mobTypes: MobType[];
  bossType: MobType | null;
  squad: HeroSpec[];
  perks: string[];
  controlled: number;
  seed: number;
  goldPerKill: number;
  /** What the foes are built for, in Squad Power (power.ts); par for the floor when not given. */
  difficulty?: number;
  /**
   * Knights the floor is built for (1 to 3; the squad's when not given): foes hit as hard as that
   * many knights' HP says, and a smaller squad meets thinner packs (half of them for one knight).
   */
  size?: number;
  /** The camp (home screen): no mobs, the squad stands round the fire. */
  camp?: boolean;
  /** The hub: no mobs; you walk your knight among the keepers' stations. */
  hub?: boolean;
  stations?: HubStation[];
  /** Folk on this floor (npcs.ts): talk to them for jobs; one may be a demon in disguise. */
  npcs?: Npc[];
}

let nextUid = 1;
export function uid(): number {
  return nextUid++;
}

/** Seconds a foe takes to rise into a fight once it wakes (or is summoned), before it may attack. */
export const SPAWN_IN = 0.6;

/**
 * Seconds the squad takes to swirl into the open portal, from the moment the leader touches it to
 * the next floor (World.warp); with reduce motion (a flash where it stands, no swirl), WARP_CALM.
 */
export const WARP_TIME = 0.6;
export const WARP_CALM = 0.25;

/** Seconds the squad takes to pop back out of the warp at the next floor's start (World.arrive). */
export const ARRIVE_TIME = 0.5;

export class World {
  map: FloorMap;
  biome: Biome;
  floor: number;
  /** The weather over this floor (clear under ground and at the hub). */
  sky: Sky;
  boss: boolean;
  mobTypes: MobType[];
  heroes: Unit[] = [];
  mobs: Unit[] = [];
  shots: Shot[] = [];
  areas: Area[] = [];
  texts: FloatText[] = [];
  pickups: Pickup[] = [];
  /** The floor's traps (traps.ts): spikes, fire vents, saws, pressure plates. */
  traps: Trap[] = [];
  fx: Fx[] = [];
  events: WorldEvent[] = [];
  time = 0;
  controlled: number;
  input: Input = { mx: 0, my: 0, dodge: false, special: false };
  /** Auto attack: the knight you steer aims and attacks by itself (you still move it and dodge). */
  auto = false;
  /**
   * Dev and tools only (the ?auto URL flag, npm run sim): the knight you control plays itself,
   * moving, dodging and fighting by its class's AI like the rest of the squad. Not in the game's UI.
   */
  bot = false;
  portalOpen = false;
  /**
   * The squad going down through the open portal: seconds in, of its whole swirl. It starts the
   * moment the leader touches the portal; once it's through comes 'exit' (Game cuts to the next floor).
   */
  warp: { t: number; dur: number } | null = null;
  /** The squad popping out of the warp at this floor's start (arriveFromPortal): seconds in, of its length. */
  arrive: { t: number; dur: number } | null = null;
  /** Reduce motion (Game sets it): a portal's warp is a quick flash where the squad stands, no swirl. */
  calm = false;
  cleared = false;
  exited = false;
  wiped = false;
  perks: Set<string>;
  /** Lone Wolf, and the knight went down alone: it fights with the perk's might. */
  lone = false;
  rng: Rng;
  goldPerKill: number;
  /** Seconds the camera should shake, and how hard. */
  shake = 0;
  shakePower = 0;
  /** A short freeze on big hits (hit-stop). */
  hitStop = 0;
  heroFlow: Flow | null = null;
  heroFlowFly: Flow | null = null;
  goalFlow: Flow | null = null;
  private flowT = 0;
  bossUnit: Unit | null = null;
  /** A boss floor's boss (not a demon that drops its disguise): the way down opens when it falls. */
  floorBoss: Unit | null = null;
  /** War Banner stacks (attack speed). */
  banner = 0;
  bannerT = 0;
  tagTeamT = 0;
  /** The player's luck right now (Loaded Dice included); Game sets it every tick, and skill rolls lean rarer with it. */
  luck = 1;
  /** What this floor's foes are built for, in Squad Power (see power.ts). */
  difficulty: number;
  /** Knights the floor is built for (1 to 3): see WorldOptions.size. */
  size = 3;
  /** The last 5 seconds, a snapshot every 0.1 s (for Rewind). */
  private history: Snapshot[] = [];
  private historyT = 0;
  /** A rewind playing: the snapshots from now back to the target, and how far through it is. */
  rewind: { frames: Snapshot[]; t: number; dur: number } | null = null;

  camp: boolean;
  /** The hub (between dives): only your knight, walking; the keepers at their stations. */
  hub: boolean;
  stations: HubStation[] = [];
  /** Folk standing about on this floor. */
  npcs: Npc[] = [];
  /** A merchant's wares set out on the floor (world/shop.ts); Game.buyWare sells them. */
  wares: Ware[] = [];
  /** The run's merchant items (Game sets them, core/runItems.ts): damage the squad takes (the Iron Helm), lifesteal and thorns shares, revives left. */
  guard = 1;
  lifesteal = 0;
  thorns = 0;
  phoenix = 0;
  /** An unmasked demon (fought like a boss, but it doesn't take the floor with it), and its banter clock. */
  demon: { unit: Unit; def: NpcDef; tauntT: number; enraged: boolean } | null = null;

  constructor(o: WorldOptions) {
    this.camp = !!o.camp;
    this.hub = !!o.hub;
    this.stations = o.stations ?? [];
    this.npcs = o.npcs ?? [];
    this.map = o.map;
    this.biome = o.biome;
    this.floor = o.floor;
    this.sky = o.hub || o.camp ? CLEAR : skyOf(o.biome, o.seed, o.floor);
    this.boss = o.boss;
    this.mobTypes = o.mobTypes;
    this.perks = new Set(o.perks);
    this.controlled = o.controlled;
    this.rng = new Rng(o.seed);
    this.goldPerKill = o.goldPerKill;
    // Lone Wolf: a knight that goes down alone fights like three (the squad, if you take one, all goes).
    this.lone = this.perks.has('loneWolf') && o.squad.length === 1;
    o.squad.forEach((h, i) => {
      const ox = (i - 1) * 12;
      this.heroes.push(this.makeHero(h, o.map.start.x + ox, o.map.start.y + (i === 1 ? 0 : 6)));
    });
    if (!this.heroes.some((h) => h.slot === this.controlled && !h.downed)) {
      const alive = this.heroes.find((h) => !h.downed);
      if (alive) this.controlled = alive.slot!;
    }
    if (this.hub) {
      // Just your knight, at the hub's spawn.
      this.heroes = this.heroes.filter((h) => h.slot === this.controlled).slice(0, 1);
      for (const h of this.heroes) {
        h.x = o.map.start.x;
        h.y = o.map.start.y;
        h.view = 'up';
      }
      this.cleared = true;
      this.difficulty = 0;
    } else if (this.camp) {
      // Round the fire, facing it.
      const fire = o.map.props.find((p) => p.kind === 'campfire') ?? { x: o.map.start.x, y: o.map.start.y - 20 };
      const spots: Array<[number, number, View, 1 | -1]> = [[-22, 4, 'side', 1], [22, 4, 'side', -1], [0, 20, 'up', 1]];
      this.heroes.forEach((h, i) => {
        const [dx, dy, view, dir] = spots[i % 3];
        h.x = fire.x + dx;
        h.y = fire.y + dy;
        h.view = view;
        h.dir = dir;
      });
      this.portalOpen = true;
      this.cleared = true;
      this.difficulty = 0;
      return;
    }
    this.difficulty = o.difficulty ?? floorPar(o.floor);
    this.size = Math.max(1, Math.min(3, Math.round(o.size ?? 3)));
    // A smaller squad meets thinner packs: (1 + size) / 4 of the floor's foes (bosses always come).
    // (Their own random stream: the floor's stays as it was.)
    const thin = new Rng(Rng.hashSeed((o.seed ^ 0x7417) >>> 0));
    const keepShare = (1 + this.size) / 4;
    this.traps = makeTraps(o.map);
    // Coins lying on the floor are real gold: they sit where they lie until the squad picks them up.
    for (const p of o.map.props) {
      if (p.kind !== 'coins') continue;
      this.pickups.push({ uid: uid(), x: p.x, y: p.y, vx: 0, vy: 0, z: 0, vz: 0, kind: 'gold', amount: Math.max(1, Math.round(this.goldPerKill * 3)), t: 0, taken: false });
    }
    o.map.props = o.map.props.filter((p) => p.kind !== 'coins');
    for (const s of o.map.spawns) {
      if (!s.boss && keepShare < 1 && thin.next() >= keepShare) continue;
      const t = s.boss ? o.bossType! : this.rng.pick(o.mobTypes);
      const m = this.makeMob(t, s.x, s.y, s.elite, s.boss);
      m.room = s.room;
      this.mobs.push(m);
      if (s.boss) {
        this.bossUnit = m;
        this.floorBoss = m;
        // The boss arrives with a few of the floor's mobs.
        for (let k = 0; k < 3; k++) {
          const a = this.makeMob(this.rng.pick(o.mobTypes), s.x + (k - 1) * 30, s.y + 30, false, false);
          a.room = s.room;
          this.mobs.push(a);
        }
      }
    }
    // The way down is open from the start: fight what you like and leave when you like. Only a
    // boss floor's waits for its boss to fall.
    this.portalOpen = !o.boss;
    this.refreshFlows();
  }

  makeHero(h: HeroSpec, x: number, y: number): Unit {
    const lone = this.lone ? 3 : 1;
    const wall = this.perks.has('shieldWall') ? 1.35 : 1;
    const maxHp = h.stats.hp * lone * wall;
    return {
      uid: uid(),
      team: 'hero',
      x,
      y,
      vx: 0,
      vy: 0,
      r: 4,
      hp: Math.max(0, maxHp * h.hpShare),
      maxHp,
      atk: h.stats.atk * (this.lone ? 2.5 : 1),
      armor: h.stats.armor,
      speed: h.stats.speed,
      dir: 1,
      view: 'up',
      moving: false,
      animT: Math.random(),
      swingT: 0,
      swingDur: 0.3,
      aimX: 0,
      aimY: -1,
      hurtT: 0,
      invuln: 0,
      dr: 1,
      drT: 0,
      stunT: 0,
      slowT: 0,
      burnT: 0,
      burnDps: 0,
      dead: false,
      flying: false,
      knightId: h.knightId,
      cls: h.cls,
      rarity: h.rarity,
      mutation: h.mutation,
      slot: h.slot,
      atkCd: h.stats.atkCd,
      atkT: 0.3,
      range: h.stats.range,
      dodgeCd: h.stats.dodgeCd * (this.perks.has('peasantRevolt') && this.underdogSquad() ? 0.5 : 1),
      dodgeT: 0,
      specialCd: h.stats.specialCd * (this.lone ? 0.7 : 1),
      // (Skill rolls have no cooldown now: in a fight the next starts as soon as the last skill is done.)
      specialT: 0,
      rollTimeMult: h.stats.rollTimeMult,
      downed: h.hpShare <= 0,
      ai: { target: null, think: 0, dodgeThink: 0, wanderX: 0, wanderY: 0, stuck: 0 },
    };
  }

  underdogSquad(): boolean {
    return this.heroes.length > 0 && this.heroes.every((h) => h.rarity === 'common' || h.rarity === 'uncommon' || h.rarity === 'rare');
  }

  /** A foe of type `t`, built for this floor's difficulty (its HP and hit come from power.ts's targets). */
  makeMob(t: MobType, x: number, y: number, elite: boolean, boss: boolean): Unit {
    const st = foeStats(t, this.difficulty, boss ? 'boss' : elite ? 'elite' : 'mob', this.floor, this.size);
    const maxHp = st.hp;
    return {
      uid: uid(),
      team: 'mob',
      x,
      y,
      vx: 0,
      vy: 0,
      r: Math.round(t.radius * (elite ? 1.3 : 1)),
      hp: maxHp,
      maxHp,
      atk: st.atk,
      armor: 0,
      speed: t.speed,
      dir: this.rng.chance(0.5) ? 1 : -1,
      view: 'side',
      moving: false,
      animT: this.rng.next() * 4,
      swingT: 0,
      swingDur: 0.3,
      aimX: 0,
      aimY: 1,
      hurtT: 0,
      invuln: 0,
      dr: 1,
      drT: 0,
      stunT: 0,
      slowT: 0,
      burnT: 0,
      burnDps: 0,
      dead: false,
      flying: t.flying,
      type: t,
      elite,
      boss,
      awake: boss,
      atkT: this.rng.float(0.5, t.atkCd),
      windT: 0,
      windDur: 0,
      // (A room's pack doesn't all lunge on the same beat.)
      lungeT: this.rng.float(0.4, 1.6),
      throwT: this.rng.float(0.5, 1.5),
      gunT: this.rng.float(0.6, 2.2),
      chaseT: 0,
      tauntBy: null,
      tauntT: 0,
      bossT: 2,
      bossPhase: 0,
      ai: { target: null, think: this.rng.next() * 0.3, dodgeThink: 0, wanderX: x, wanderY: y, stuck: 0 },
    };
  }

  leader(): Unit | undefined {
    return this.heroes.find((h) => h.slot === this.controlled && !h.downed) ?? this.heroes.find((h) => !h.downed);
  }

  livingHeroes(): Unit[] {
    return this.heroes.filter((h) => !h.downed);
  }

  livingMobs(): Unit[] {
    return this.mobs.filter((m) => !m.dead);
  }

  enemiesOf(u: Unit): Unit[] {
    return u.team === 'hero' ? this.mobs.filter((m) => !m.dead) : this.heroes.filter((h) => !h.downed);
  }

  /** Nearest foe within `range` (in sight, if asked). */
  nearestEnemy(u: Unit, range: number, sight = true): Unit | null {
    let best: Unit | null = null;
    let bd = range;
    for (const e of this.enemiesOf(u)) {
      if (e.team === 'mob' && !e.awake && u.team === 'hero' && dist(u.x, u.y, e.x, e.y) > range) continue;
      const d = dist(u.x, u.y, e.x, e.y) - e.r;
      if (d > bd) continue;
      // The line a shot's foot travels (it leaves from beside the shooter): both sides must be clear.
      if (sight && !(lineOfSight(this.map, u.x - 4, u.y - 4, e.x, e.y) && lineOfSight(this.map, u.x + 4, u.y - 4, e.x, e.y))) continue;
      bd = d;
      best = e;
    }
    return best;
  }

  enemiesIn(team: Unit['team'], x: number, y: number, r: number): Unit[] {
    const out: Unit[] = [];
    const list = team === 'hero' ? this.mobs : this.heroes;
    for (const e of list) {
      if (e.dead || e.downed) continue;
      if (dist(x, y, e.x, e.y) <= r + e.r) out.push(e);
    }
    return out;
  }

  /** Foes of `team` standing inside a ring of radius `r` on the ground round (x, y), as rings are drawn. */
  enemiesInRing(team: Unit['team'], x: number, y: number, r: number): Unit[] {
    const list = team === 'hero' ? this.mobs : this.heroes;
    return list.filter((e) => !e.dead && !e.downed && inRing(e.x, e.y, e.r, x, y, r));
  }

  /** Can't `u` be touched right now (untouchable, mid-roll, or a knight in a portal's warp)? Asks only: marks nothing. */
  untouchable(u: Unit): boolean {
    return u.invuln > 0 || !!u.rolling || (u.team === 'hero' && this.warping());
  }

  /** The squad is in a portal's warp (swirling in, or popping out at the next floor's start): the portal has it. */
  warping(): boolean {
    return this.warp !== null || this.arrive !== null;
  }

  /**
   * The leader touched the open portal: the whole squad (the fallen too) swirls into it over
   * WARP_TIME (WARP_CALM with reduce motion), out of reach and deaf to input meanwhile; then 'exit'.
   */
  private startWarp(): void {
    this.warp = { t: 0, dur: this.calm ? WARP_CALM : WARP_TIME };
    // A knockback still sliding a knight stops: each stays where the portal caught it.
    for (const h of this.heroes) h.shove = undefined;
    this.events.push({ type: 'warp' });
  }

  /**
   * The squad came down through a portal (Game.startFloor): it pops out where it starts over
   * ARRIVE_TIME, out of reach and deaf to input meanwhile. With reduce motion it's simply there.
   */
  arriveFromPortal(calm: boolean): void {
    this.calm = calm;
    if (!calm) this.arrive = { t: 0, dur: ARRIVE_TIME };
  }

  /**
   * A hit that would land on knight `h` now: does it miss? (It's untouchable, or rolling.) When it's
   * the knight's dodge roll that makes it miss, that's a perfect roll, marked once per roll (never in
   * a portal's warp: the portal saved it, not the roll). Call it only for a hit that really would have
   * landed (a shot touching, a bite in reach, a knight inside a ring as it goes off).
   */
  evades(h: Unit): boolean {
    if (!this.untouchable(h)) return false;
    const d = h.dodge;
    if (h.team === 'hero' && d && !d.perfect && this.time <= d.until && !this.warping()) {
      d.perfect = true;
      this.perfectRoll(h);
    }
    return true;
  }

  /**
   * A perfect roll: PERFECT! pops over the knight, it flashes and leaves an afterimage, a bright sound
   * plays (the event), and for the knight you're steering yourself the fight holds its breath for a beat.
   * Squadmates' are smaller and quieter.
   */
  private perfectRoll(h: Unit): void {
    const mine = h.slot === this.controlled;
    this.texts.push({ x: h.x, y: h.y - 30, text: mine ? 'PERFECT!' : 'PERFECT', color: '#ffe27a', t: 0, big: mine, style: 'perfect' });
    this.fx.push({ kind: 'perfect', x: h.x, y: h.y - 8, size: mine ? 1 : 0.5, uid: h.uid });
    this.events.push({ type: 'perfect', slot: h.slot!, mine });
    if (mine && !this.bot) this.hitStop = Math.max(this.hitStop, 0.07);
  }

  /** The spot within `range` of u that would catch the most foes in a circle of radius `r`. */
  densest(u: Unit, range: number, r: number): { x: number; y: number; n: number } | null {
    let best: { x: number; y: number; n: number } | null = null;
    for (const e of this.enemiesOf(u)) {
      if (dist(u.x, u.y, e.x, e.y) > range) continue;
      const n = this.enemiesIn(u.team, e.x, e.y, r).length + (e.boss ? 3 : 0);
      if (!best || n > best.n) best = { x: e.x, y: e.y, n };
    }
    return best;
  }

  text(x: number, y: number, text: string, color: string, big = false): void {
    this.texts.push({ x: x + this.rng.float(-3, 3), y, text, color, t: 0, big });
  }

  shakeIt(power: number, t = 0.2): void {
    this.shakePower = Math.max(this.shakePower, power);
    this.shake = Math.max(this.shake, t);
  }

  heal(target: Unit, amount: number): void {
    // (Not a knight in a portal's warp: it isn't where its number would float.)
    if (target.downed || target.dead || amount <= 0 || (target.team === 'hero' && this.warping())) return;
    const before = target.hp;
    target.hp = Math.min(target.maxHp, target.hp + amount);
    const got = target.hp - before;
    if (got >= 1) {
      this.text(target.x, target.y - 22, `+${Math.round(got)}`, '#7dff8a');
      this.fx.push({ kind: 'heal', x: target.x, y: target.y - 8 });
    }
  }

  /** Clerics' healing (Blood Pact turns it off). */
  clericHeal(target: Unit, amount: number): void {
    if (this.perks.has('bloodPact')) return;
    this.heal(target, amount);
  }

  revive(h: Unit, share: number): void {
    if (!h.downed) return;
    h.downed = false;
    h.hp = h.maxHp * share;
    h.invuln = 1.2;
    this.fx.push({ kind: 'revive', x: h.x, y: h.y });
    this.text(h.x, h.y - 26, 'REVIVED', '#ffe27a', true);
  }

  /** Deals damage. Returns the amount dealt. */
  damage(target: Unit, raw: number, from: Unit | null, opts: { crit?: boolean; knock?: number; kx?: number; ky?: number; color?: string; silent?: boolean } = {}): number {
    if (target.dead || target.downed || target.invuln > 0 || raw <= 0) return 0;
    // (A knight in a portal's warp is out of reach: whatever comes at it misses.)
    if (target.team === 'hero' && this.warping()) return 0;
    let amount = raw;
    if (from && from.team === 'hero') {
      // Berserker: up to +150% damage the lower the knight's HP.
      if (this.perks.has('berserker')) amount *= 1 + 1.5 * (1 - from.hp / from.maxHp);
      if (this.perks.has('peasantRevolt') && this.underdogSquad()) amount *= 2;
      // Tag Team: the knight just switched to hits harder for a few seconds.
      if ((from.tagBoostT ?? 0) > 0) amount *= 1.3;
    }
    amount *= 1 - target.armor;
    if (target.team === 'hero') amount *= this.guard;
    if (target.drT > 0) amount *= target.dr;
    amount = Math.max(1, amount);
    // The upgrade map's chance lines (chance.ts): lucky and doubled hits, fumbles, Second Wind...
    if (target.team === 'hero') {
      amount = onHeroHurt(this, target, amount, from);
      if (amount <= 0) return 0;
    } else if (from && from.team === 'hero') {
      amount = onHeroHit(this, from, target, amount, opts);
      if (amount <= 0) return 0;
    }
    target.hp -= amount;
    target.hurtT = 0.18;
    feelHit(this, target, from, opts);
    if (opts.knock && !target.boss) {
      const [nx, ny] = opts.kx !== undefined ? norm(opts.kx, opts.ky ?? 0) : from ? norm(target.x - from.x, target.y - from.y) : [0, 0];
      moveUnit(this.map, target, nx * opts.knock * (target.elite ? 0.5 : 1), ny * opts.knock * (target.elite ? 0.5 : 1));
    }
    if (!opts.silent) {
      const col = opts.color ?? (target.team === 'hero' ? '#ff5a5a' : opts.crit ? '#ffd84a' : '#ffffff');
      this.text(target.x, target.y - (target.boss ? 40 : 20), String(Math.round(amount)), col, !!opts.crit);
      this.fx.push({ kind: opts.crit ? 'crit' : 'hit', x: target.x, y: target.y - 6, color: target.team === 'mob' ? target.type!.ramp[2] : '#ff5a5a' });
    }
    if (from && from.team === 'hero' && this.perks.has('bloodPact')) this.heal(from, amount * 0.05);
    // A merchant's Vampire Fang: the hitter drinks a little of it (quietly: it's every hit).
    if (from && from.team === 'hero' && target.team === 'mob' && this.lifesteal > 0 && !from.downed) from.hp = Math.min(from.maxHp, from.hp + amount * this.lifesteal);
    // Thorn Mail: a foe that hits a knight up close takes some of it back.
    if (target.team === 'hero' && from && from.team === 'mob' && !from.dead && this.thorns > 0 && dist(from.x, from.y, target.x, target.y) < 40) {
      this.damage(from, amount * this.thorns, target, { color: '#b8e07a' });
    }
    if (target.team === 'mob') {
      if (!target.awake) this.wake(target);
      if (from && from.team === 'hero' && from.slot === this.controlled && this.perks.has('warBanner')) {
        this.banner = Math.min(10, this.banner + 1);
        this.bannerT = 3;
      }
      if (target.hp <= 0) this.killMob(target);
    } else {
      this.shakeIt(target.slot === this.controlled ? 2 : 1, 0.12);
      if (target.hp <= 0) this.downHero(target);
    }
    return amount;
  }

  wake(m: Unit): void {
    // (Nothing new joins a fight the squad is leaving through a portal, or arriving from one.)
    if (this.warping()) return;
    // Its roommates hear it. Each one that wakes rises into the fight (a puff, a moment before it attacks).
    const rouse = (o: Unit) => {
      if (o.awake || o.dead) return;
      o.awake = true;
      this.spawnIn(o);
    };
    rouse(m);
    for (const o of this.mobs) if (!o.awake && !o.dead && (o.room === m.room || dist(o.x, o.y, m.x, m.y) < 90)) rouse(o);
  }

  /** A foe rising into a fight: a puff of dust, and `SPAWN_IN` seconds before it may attack (mobMotion draws it rising). */
  spawnIn(o: Unit): void {
    o.spawnT = SPAWN_IN;
    this.fx.push({ kind: 'land', x: o.x, y: o.y, size: 0.7 });
  }

  killMob(m: Unit): void {
    m.dead = true;
    m.hp = 0;
    const t = m.type!;
    this.fx.push({ kind: 'death', x: m.x, y: m.y - 4, color: t.ramp[2], size: m.boss ? 3 : m.elite ? 2 : 1, src: m.boss ? 'boss' : t.plan === 'slime' ? 'slime' : undefined });
    const gold = Math.max(1, Math.round(this.goldPerKill * (m.boss ? 25 : m.elite ? 4 : 1)));
    this.events.push({ type: 'kill', gold, elite: !!m.elite, boss: !!m.boss, x: m.x, y: m.y, name: t.name });
    onKill(this, m);
    if (this.demon && this.demon.unit === m) {
      this.text(m.x, m.y - 34, this.rng.pick(demonDeathLines), '#ff9a6a', true);
      this.demon = null;
      if (this.bossUnit === m) this.bossUnit = null;
    }
    // Coins burst out and fly to the squad.
    const coins = m.boss ? 18 : m.elite ? 6 : 2 + this.rng.int(0, 1);
    for (let i = 0; i < coins; i++) this.spawnPickup(m.x, m.y, 'gold', Math.max(1, Math.round(gold / coins)));
    const d = BAL.dungeon.drops;
    if (this.rng.chance(m.boss ? d.potionBoss : m.elite ? d.potionElite : d.potionMob)) this.spawnPickup(m.x, m.y, 'potion', 1);
    if (m.boss) this.spawnPickup(m.x, m.y, 'hourglass', d.hourglassBoss);
    else if (m.elite && this.rng.chance(d.hourglassElite)) this.spawnPickup(m.x, m.y, 'hourglass', 1);
    if (m.boss && m.type?.id.startsWith('ember-')) {
      // An unmasked demon: a big moment, but the floor's other foes don't fall with it.
      this.shakeIt(5, 0.6);
      this.hitStop = 0.2;
    } else if (m.boss) {
      this.shakeIt(6, 0.8);
      this.hitStop = 0.25;
      // The boss's minions fall with it.
      for (const o of this.mobs) if (!o.dead) this.killMob(o);
    } else if (m.elite) {
      this.shakeIt(3, 0.25);
    }
  }

  spawnPickup(x: number, y: number, kind: Pickup['kind'], amount: number): void {
    const a = this.rng.float(0, Math.PI * 2);
    const s = this.rng.float(20, 60);
    this.pickups.push({ uid: uid(), x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6, z: 0, vz: this.rng.float(50, 90), kind, amount, t: 0, taken: false });
  }

  downHero(h: Unit): void {
    h.hp = 0;
    h.downed = true;
    // A Phoenix Feather catches it as it falls.
    if (this.phoenix > 0) {
      this.phoenix--;
      this.revive(h, 0.5);
      this.fx.push({ kind: 'levelup', x: h.x, y: h.y, color: '#ff9a3a' });
      this.text(h.x, h.y - 36, 'PHOENIX!', '#ffb050', true);
      this.events.push({ type: 'phoenix', slot: h.slot! });
      return;
    }
    h.rolling = undefined;
    h.channel = undefined;
    this.fx.push({ kind: 'death', x: h.x, y: h.y - 6, color: '#c8c8d8', size: 1, src: 'hero' });
    this.events.push({ type: 'heroDown', slot: h.slot! });
    if (h.slot === this.controlled) {
      const next = this.heroes.find((x) => !x.downed);
      if (next) this.switchControl(next.slot!, true);
    }
    if (this.heroes.every((x) => x.downed) && !this.wiped) {
      this.wiped = true;
      this.events.push({ type: 'wipe' });
    }
  }

  switchControl(slot: number, forced = false): boolean {
    const h = this.heroes.find((x) => x.slot === slot);
    // (Not in a portal's warp: the leader the view follows stays the one that stepped in.)
    if (!h || h.downed || slot === this.controlled || this.warping()) return false;
    this.controlled = slot;
    this.events.push({ type: 'switch', slot });
    this.fx.push({ kind: 'spark', x: h.x, y: h.y - 10, color: '#ffe27a' });
    // Tag Team: the incoming knight hits harder for a few seconds (at most once every 10 s).
    if (!forced && this.perks.has('tagTeam') && this.tagTeamT <= 0) {
      this.tagTeamT = 10;
      h.tagBoostT = 4;
    }
    return true;
  }

  refreshFlows(): void {
    const alive = this.livingHeroes();
    this.heroFlow = flowFrom(this.map, alive);
    this.heroFlowFly = flowFrom(this.map, alive, true);
    // Squad AI (and the bot) hunts foes until the floor is clear, or its boss is down; then the way out.
    const goals = this.cleared || (this.boss && this.portalOpen) ? [this.map.exit] : this.livingMobs();
    this.goalFlow = goals.length ? flowFrom(this.map, goals) : null;
  }

  private snapshot(): Snapshot {
    return {
      heroes: new Map(this.heroes.map((h) => [h.uid, { x: h.x, y: h.y, hp: h.hp, downed: !!h.downed, view: h.view, dir: h.dir }])),
      mobs: new Map(this.mobs.filter((m) => !m.dead).map((m) => [m.uid, { x: m.x, y: m.y }])),
    };
  }

  /**
   * Rewind (Aeon, the Mythic Arcanist): time runs backwards to 4 seconds ago, for the squad. `say`:
   * REWIND! over the leader (not when the HUD has stamped it on the screen; its jitter is still drawn,
   * so the world's random stream stays as it was).
   */
  startRewind(say = true): boolean {
    if (this.rewind || this.history.length < 5) return false;
    const back = Math.min(this.history.length, 40);
    this.rewind = { frames: [this.snapshot(), ...this.history.slice(-back).reverse()], t: 0, dur: 0.8 };
    if (say) this.text(this.leader()?.x ?? 0, (this.leader()?.y ?? 0) - 30, 'REWIND!', '#9ad8ff', true);
    else this.rng.float(-3, 3);
    return true;
  }

  private updateRewind(dt: number): void {
    const r = this.rewind!;
    r.t += dt;
    const k = Math.min(r.frames.length - 1, Math.floor((r.t / r.dur) * r.frames.length));
    const f = r.frames[k];
    // Play the recording backwards: everyone slides back along the way they came.
    for (const h of this.heroes) {
      const p = f.heroes.get(h.uid);
      if (!p) continue;
      h.x = p.x;
      h.y = p.y;
      h.view = p.view;
      h.dir = p.dir;
      h.moving = true;
      h.animT -= dt * 2;
    }
    for (const m of this.mobs) {
      const p = f.mobs.get(m.uid);
      if (!p || m.dead) continue;
      m.x = p.x;
      m.y = p.y;
    }
    if (r.t < r.dur) return;
    // Landed in the past: the squad's HP and fallen knights come back; damage dealt stays dealt.
    const past = r.frames[r.frames.length - 1];
    for (const h of this.heroes) {
      const p = past.heroes.get(h.uid);
      if (!p) continue;
      if (!p.downed && p.hp > 0) {
        h.downed = false;
        h.hp = Math.max(h.downed ? 0 : h.hp, Math.min(h.maxHp, p.hp));
      }
      h.rolling = undefined;
      h.channel = undefined;
      h.invuln = Math.max(h.invuln, 0.6);
      this.fx.push({ kind: 'revive', x: h.x, y: h.y });
    }
    this.shots = this.shots.filter((s) => s.team === 'hero');
    this.areas = this.areas.filter((a) => a.team === 'hero');
    for (const m of this.mobs) {
      m.windT = 0;
      m.rush = undefined;
      m.recoverT = 0;
      m.move = undefined;
    }
    this.history = [];
    this.rewind = null;
    this.wiped = false;
    this.refreshFlows();
  }

  /** The ware on display the knight you play stands at (not yet sold), or null (always, in a portal's warp). */
  nearWare(): Ware | null {
    const h = this.leader();
    if (!h || this.hub || this.warping()) return null;
    let best: Ware | null = null;
    let bd = 15;
    for (const w of this.wares) {
      if (w.sold) continue;
      const d = dist(h.x, h.y, w.x, w.y);
      if (d < bd) {
        bd = d;
        best = w;
      }
    }
    return best;
  }

  /** The person on this floor you're close enough to talk to (or to the spot before their set-up), or null (always, in a portal's warp). */
  nearNpc(): Npc | null {
    const h = this.leader();
    if (!h || this.hub || this.warping()) return null;
    let best: Npc | null = null;
    let bd = TALK_RANGE;
    for (const n of this.npcs) {
      const t = n.camp?.talk;
      const d = Math.min(dist(h.x, h.y, n.x, n.y), t ? dist(h.x, h.y, t.x, t.y) + 4 : Infinity);
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    return best;
  }

  /**
   * The demon drops the act: the NPC goes, and where it stood the demon stands, fought like a boss
   * (its bar at the top), joking all the way down.
   */
  unmaskDemon(npc: Npc): void {
    this.npcs = this.npcs.filter((n) => n !== npc);
    const t = demonMobType(this.floor, this.biome.id, npc.seed);
    // Behind a counter it vaults over it, onto the open floor in front.
    const at = npc.camp && tileAt(this.map, Math.floor(npc.x / TILE), Math.floor(npc.y / TILE)) !== FLOOR ? npc.camp.talk : npc;
    const m = this.makeMob(t, at.x, at.y, false, true);
    m.awake = true;
    // Built like a boss of this floor, but a little gentler (it's a side show).
    m.maxHp *= 0.6;
    m.hp = m.maxHp;
    this.mobs.push(m);
    this.bossUnit = m;
    this.demon = { unit: m, def: npc.def, tauntT: 1.5, enraged: false };
    this.cleared = false;
    this.fx.push({ kind: 'blast', x: npc.x, y: npc.y - 6, color: '#ff6a3a', size: 2 });
    this.shakeIt(4, 0.4);
    this.text(npc.x, npc.y - 34, this.rng.pick(demonTauntsFor(npc.def)), '#ff9a6a', true);
  }

  /** The keeper you're close enough to talk to (the hub), or null. */
  nearStation(): HubStation | null {
    const h = this.leader();
    if (!h || !this.hub) return null;
    let best: HubStation | null = null;
    let bd = TALK_RANGE;
    for (const s of this.stations) {
      // From the keeper, or from the spot in front of their counter.
      const d = Math.min(dist(h.x, h.y, s.x, s.y), s.talk ? dist(h.x, h.y, s.talk.x, s.talk.y) + 6 : Infinity);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  update(dt: number): void {
    if (this.hub) {
      // Walking round the hub: your knight moves; the keepers idle.
      this.time += dt;
      const h = this.leader();
      if (h) heroTick(this, h, dt, this.input.mx, this.input.my);
      this.input.dodge = false;
      this.input.special = false;
      for (const t of this.texts) t.t += dt;
      this.texts = this.texts.filter((t) => t.t < 1.1);
      return;
    }
    if (this.camp) {
      this.time += dt;
      for (const h of this.heroes) {
        h.animT += dt;
        h.moving = false;
      }
      for (const t of this.texts) t.t += dt;
      return;
    }
    if (this.rewind) {
      this.time += dt;
      this.updateRewind(dt);
      return;
    }
    this.historyT += dt;
    if (this.historyT >= 0.1) {
      this.historyT = 0;
      this.history.push(this.snapshot());
      if (this.history.length > 50) this.history.shift();
    }
    // (A portal's warp keeps to the clock: a hit-stop doesn't stretch it.)
    const clock = dt;
    if (this.hitStop > 0) {
      // Only the part of the frame inside the freeze is slowed, so a freeze is as long at any frame rate.
      const stop = Math.min(this.hitStop, dt);
      this.hitStop -= stop;
      dt -= stop * 0.85;
    }
    this.time += dt;
    this.flowT -= dt;
    if (this.flowT <= 0) {
      this.flowT = 0.3;
      this.refreshFlows();
    }
    if (this.tagTeamT > 0) this.tagTeamT -= dt;
    for (const h of this.heroes) if ((h.tagBoostT ?? 0) > 0) h.tagBoostT! -= dt;
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.banner = 0;
    }
    const lead = this.leader();
    // --- folk: they idle, and turn to face your knight when it comes close
    for (const n of this.npcs) {
      n.animT += dt;
      if (lead && dist(lead.x, lead.y, n.x, n.y) < 60) {
        n.view = 'side';
        n.dir = lead.x < n.x ? -1 : 1;
      }
    }
    // --- an unmasked demon keeps up the banter
    if (this.demon) {
      const d = this.demon;
      d.tauntT -= dt;
      if (d.tauntT <= 0) {
        d.tauntT = this.rng.float(4, 7);
        this.text(d.unit.x, d.unit.y - 34, this.rng.pick(demonTauntsFor(d.def)), '#ff9a6a', false);
      }
      if (!d.enraged && d.unit.hp < d.unit.maxHp * 0.5) {
        d.enraged = true;
        d.unit.bossPhase = 1;
        this.text(d.unit.x, d.unit.y - 34, this.rng.pick(demonEnrageLines), '#ff5a3a', true);
        this.shakeIt(3, 0.3);
      }
    }
    // --- heroes (none of it in a portal's warp: the squad holds still where the portal caught it,
    // its input and its AI waiting until it's out, its burns and timers too)
    for (const h of this.warping() ? [] : this.heroes) {
      tickStatus(this, h, dt);
      if (h.downed) continue;
      const mine = h.slot === this.controlled && !this.bot;
      let mx = 0;
      let my = 0;
      if (mine) {
        mx = this.input.mx;
        my = this.input.my;
        if (this.input.dodge) heroDodge(this, h, mx, my);
        if (this.input.special) heroSpecial(this, h, false);
        else heroAutoRoll(this, h, dt);
      } else {
        [mx, my] = heroAi(this, h, lead, dt);
      }
      heroTick(this, h, dt, mx, my);
    }
    this.input.dodge = false;
    this.input.special = false;
    // --- mobs
    for (const m of this.mobs) {
      if (m.dead) continue;
      tickStatus(this, m, dt);
      if (m.dead) continue;
      mobAi(this, m, dt);
    }
    onTick(this, dt);
    updateTraps(this, this.traps);
    tickFeel(this, dt);
    separate(this);
    updateShots(this, dt);
    updateAreas(this, dt);
    updatePickups(this, dt);
    for (const t of this.texts) {
      t.t += dt;
      t.y -= dt * (t.big ? 14 : 18);
    }
    this.texts = this.texts.filter((t) => t.t < (t.big ? 1.1 : 0.8));
    if (this.shake > 0) this.shake -= dt;
    else this.shakePower = 0;
    this.mobs = this.mobs.filter((m) => !m.dead || m.hurtT > -0.5);
    for (const m of this.mobs) if (m.dead) m.hurtT -= dt;
    // --- a boss floor's way down opens when its boss falls (whatever else is still about)
    if (!this.portalOpen && this.floorBoss && this.floorBoss.dead) {
      this.portalOpen = true;
      this.events.push({ type: 'portal' });
      this.fx.push({ kind: 'portal', x: this.map.exit.x, y: this.map.exit.y });
      this.refreshFlows();
    }
    // --- every foe down: the floor is cleared
    if (!this.cleared && this.mobs.every((m) => m.dead)) {
      this.cleared = true;
      if (!this.portalOpen) {
        this.portalOpen = true;
        this.fx.push({ kind: 'portal', x: this.map.exit.x, y: this.map.exit.y });
      }
      this.events.push({ type: 'cleared' });
      this.refreshFlows();
    }
    // --- the way down: the leader touching the open portal swirls the whole squad into it at once,
    // and once it's through, down it goes. A squad playing itself (the dev bot) clears the floor (or
    // its boss) first.
    if (this.warp) {
      this.warp.t += clock;
      if (this.warp.t >= this.warp.dur && !this.exited) {
        this.exited = true;
        this.events.push({ type: 'exit' });
      }
    } else {
      const mayLeave = !this.bot || this.cleared || (this.boss && this.portalOpen);
      if (this.portalOpen && mayLeave && !this.exited && lead && dist(lead.x, lead.y, this.map.exit.x, this.map.exit.y) < 14) this.startWarp();
    }
    if (this.arrive) {
      this.arrive.t += clock;
      if (this.arrive.t >= this.arrive.dur) this.arrive = null;
    }
  }
}

function tickStatus(w: World, u: Unit, dt: number): void {
  u.animT += dt;
  if (u.hurtT > 0) u.hurtT -= dt;
  if (u.invuln > 0) u.invuln -= dt;
  if (u.drT > 0) u.drT -= dt;
  if (u.stunT > 0) u.stunT -= dt;
  if (u.slowT > 0) u.slowT -= dt;
  if (u.swingT > 0) u.swingT -= dt;
  if (u.burnT > 0) {
    u.burnT -= dt;
    const before = u.hp;
    u.hp -= u.burnDps * dt;
    if (Math.floor(before / Math.max(1, u.burnDps)) !== Math.floor(u.hp / Math.max(1, u.burnDps)) && w.rng.chance(0.5)) {
      w.fx.push({ kind: 'spark', x: u.x, y: u.y - 8, color: '#ff8a3a' });
    }
    if (u.hp <= 0) {
      if (u.team === 'mob') w.killMob(u);
      else w.downHero(u);
    }
  }
}

/**
 * Units push each other apart a little (heroes and mobs alike; not a knight mid-roll or a mob mid-dash
 * or mid-leap). The knight in the lead shoulders its squadmates aside and they barely push it back:
 * turning back through a corridor, it's never pinned by the squad trailing it. A knight powering up
 * for its Legendary (its slam) stands its ground: whatever crowds it is pushed off instead.
 */
function separate(w: World): void {
  // (A squad in a portal's warp is the portal's: nothing shoulders it about meanwhile.)
  const all = [...(w.warping() ? [] : w.heroes.filter((h) => !h.downed && !h.rolling)), ...w.mobs.filter((m) => !m.dead && !m.rush)];
  const lead = w.leader();
  const give = (u: Unit, other: Unit) => (u.skillSlam ? 0 : u.boss ? 0.1 : u === lead && other.team === 'hero' ? 0.15 : 1);
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i];
      const b = all[j];
      const min = a.r + b.r;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      const push = (min - d) * 0.5;
      const nx = dx / d;
      const ny = dy / d;
      const wa = give(a, b);
      const wb = give(b, a);
      moveUnit(w.map, a, -nx * push * wa, -ny * push * wa);
      moveUnit(w.map, b, nx * push * wb, ny * push * wb);
    }
  }
}

function updateShots(w: World, dt: number): void {
  for (const s of w.shots) {
    s.life -= dt;
    if (s.homing) {
      const foes = s.team === 'hero' ? w.mobs.filter((m) => !m.dead) : w.heroes.filter((h) => !h.downed);
      let best: Unit | null = null;
      let bd = 70;
      for (const f of foes) {
        const d = dist(s.x, s.y, f.x, f.y);
        if (d < bd) {
          bd = d;
          best = f;
        }
      }
      if (best) {
        const sp = Math.hypot(s.vx, s.vy);
        const [nx, ny] = norm(best.x - s.x, best.y - 6 - s.y);
        s.vx += (nx * sp - s.vx) * Math.min(1, s.homing * dt);
        s.vy += (ny * sp - s.vy) * Math.min(1, s.homing * dt);
      }
    }
    if (s.curve) {
      // A curving bullet: its heading turns as it flies.
      const c = Math.cos(s.curve * dt);
      const n = Math.sin(s.curve * dt);
      const vx = s.vx * c - s.vy * n;
      s.vy = s.vx * n + s.vy * c;
      s.vx = vx;
    }
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    if (tileAt(w.map, Math.floor(s.x / TILE), Math.floor((s.y + 6) / TILE)) === 0) {
      s.life = 0;
      w.fx.push({ kind: 'dust', x: s.x, y: s.y, color: s.color });
      if (s.splash) splash(w, s);
      continue;
    }
    const targets = s.team === 'hero' ? w.mobs : w.heroes;
    for (const t of targets) {
      if (t.dead || t.downed || s.life <= 0) continue;
      if (s.hit?.has(t.uid)) continue;
      if (dist(s.x, s.y, t.x, t.y - 6) > s.r + t.r + 2) continue;
      const from = [...w.heroes, ...w.mobs].find((u) => u.uid === s.from) ?? null;
      if (t.team === 'hero' && w.evades(t)) continue;
      const crit = s.team === 'hero' && w.rng.chance(0.1);
      w.damage(t, s.dmg * (crit ? 1.6 : 1), from, { crit, knock: s.kind === 'arrow' ? 3 : 2, kx: s.vx, ky: s.vy });
      onShotHit(w, s, t);
      if (s.heal && from) {
        // Holy Orb: heals the most hurt ally.
        const hurt = w.heroes.filter((h) => !h.downed).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
        if (hurt) w.clericHeal(hurt, s.heal);
      }
      if (s.splash) splash(w, s, t.uid);
      if (s.pierce && s.pierce > 0) {
        s.pierce -= 1;
        (s.hit ??= new Set()).add(t.uid);
      } else {
        s.life = 0;
      }
    }
  }
  w.shots = w.shots.filter((s) => s.life > 0);
}

function splash(w: World, s: Shot, skip?: number): void {
  const from = [...w.heroes, ...w.mobs].find((u) => u.uid === s.from) ?? null;
  w.fx.push({ kind: 'blast', x: s.x, y: s.y, color: s.color, size: 1 });
  for (const e of w.enemiesIn(s.team, s.x, s.y, s.splash!)) if (e.uid !== skip) w.damage(e, s.dmg * 0.6, from, { knock: 4 });
}

function updateAreas(w: World, dt: number): void {
  for (const a of w.areas) {
    a.t += dt;
    if (a.delay > 0) {
      a.delay -= dt;
      if (a.delay <= 0 && a.kind === 'boulder') {
        // A thrown boulder comes down: everyone under its ring is hit and knocked off the spot, and
        // the rock breaks into rubble.
        const from = [...w.heroes, ...w.mobs].find((u) => u.uid === a.from) ?? null;
        for (const e of w.enemiesInRing(a.team, a.x, a.y, a.r)) {
          if (e.team === 'hero' && w.evades(e)) continue;
          w.damage(e, a.dmg, from, { knock: 12, kx: e.x - a.x, ky: e.y - a.y });
        }
        w.fx.push({ kind: 'blast', x: a.x, y: a.y, color: a.color, size: a.r / 12, src: 'boulder' });
        w.fx.push({ kind: 'land', x: a.x, y: a.y, size: a.r / 10 });
        w.shakeIt(3, 0.25);
        w.areas.push({ uid: uid(), team: a.team, x: a.x, y: a.y, r: a.r * 0.6, delay: 0, dur: 1.6, tick: 9, tickT: 9, dmg: 0, kind: 'rubble', from: a.from, color: a.color, t: 0 });
        // ...and shards of it fly off all round.
        if (from && from.team === 'mob') quakeRing(w, from, a.x, a.y, 6, a.r);
        a.done = true;
      } else if (a.delay <= 0 && (a.kind === 'meteor' || a.kind === 'slam' || a.kind === 'blast' || a.kind === 'bomb')) {
        // It goes off: one big hit.
        const from = [...w.heroes, ...w.mobs].find((u) => u.uid === a.from) ?? null;
        for (const e of w.enemiesIn(a.team, a.x, a.y, a.r)) {
          if (e.team === 'hero' && w.evades(e)) continue;
          w.damage(e, a.dmg, from, { knock: 10, crit: a.kind === 'meteor' });
        }
        w.fx.push({ kind: 'blast', x: a.x, y: a.y, color: a.color, size: a.r / 12, src: a.kind === 'slam' ? 'slam' : a.kind === 'bomb' ? 'bomb' : a.kind === 'meteor' ? 'meteor' : undefined });
        w.shakeIt(a.kind === 'meteor' ? 5 : 3, 0.3);
        if (a.kind === 'meteor') {
          // The meteor leaves fire behind.
          w.areas.push({ uid: uid(), team: a.team, x: a.x, y: a.y, r: a.r * 0.8, delay: 0, dur: 3, tick: 0.5, tickT: 0, dmg: a.dmg * 0.08, kind: 'fire', from: a.from, color: '#ff7a2a', t: 0 });
        }
        if (a.dur <= 0) a.done = true;
      }
      continue;
    }
    a.dur -= dt;
    a.tickT -= dt;
    if (a.tickT <= 0) {
      a.tickT = a.tick;
      const from = [...w.heroes, ...w.mobs].find((u) => u.uid === a.from) ?? null;
      if (a.heal) {
        for (const h of w.heroes) if (!h.downed && dist(h.x, h.y, a.x, a.y) <= a.r) w.clericHeal(h, h.maxHp * a.heal);
      }
      if (a.dmg > 0) {
        for (const e of w.enemiesIn(a.team, a.x, a.y, a.r)) {
          // (Lingering ground, fire and the like: a roll keeps a knight out of it, but that's no perfect roll.)
          if (e.team === 'hero' && w.untouchable(e)) continue;
          w.damage(e, a.dmg, from, { silent: a.kind === 'fire' && w.rng.chance(0.5) });
        }
        if (a.kind === 'rain') {
          for (let k = 0; k < 3; k++) w.fx.push({ kind: 'spark', x: a.x + w.rng.float(-a.r, a.r), y: a.y + w.rng.float(-a.r * 0.6, a.r * 0.6), color: '#e8e0c8' });
        }
      }
    }
    if (a.dur <= 0) a.done = true;
  }
  w.areas = w.areas.filter((a) => !a.done);
}

function updatePickups(w: World, dt: number): void {
  const lead = w.leader();
  for (const p of w.pickups) {
    p.t += dt;
    if (p.t < 0.6) {
      // A little hop where it dropped.
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vz -= 260 * dt;
      p.z = Math.max(0, p.z + p.vz * dt);
      p.vx *= 0.9;
      p.vy *= 0.9;
      continue;
    }
    if (!lead) continue;
    // Then it flies to the squad's leader.
    const [nx, ny] = norm(lead.x - p.x, lead.y - 8 - p.y);
    const sp = 60 + (p.t - 0.6) * 260;
    p.x += nx * sp * dt;
    p.y += ny * sp * dt;
    if (dist(p.x, p.y, lead.x, lead.y - 8) < 6) {
      p.taken = true;
      w.events.push({ type: 'pickup', kind: p.kind, amount: p.amount });
      if (p.kind !== 'gold') {
        w.text(lead.x, lead.y - 30, p.kind === 'potion' ? 'LUCK POTION!' : `+${p.amount} HOURGLASS`, p.kind === 'potion' ? '#7dff8a' : '#ffd84a', true);
      }
    }
  }
  w.pickups = w.pickups.filter((p) => !p.taken);
}
