/**
 * Stealing from a merchant. Any ware on her stall can be taken without paying (Game.stealWare). The
 * moment one is, she turns on the squad: a beat of warning (she shouts, a "!" over her head, her
 * stall's light goes red), then she vaults her counter and comes for you, fought like a boss with her
 * own bar: BAL.shop.thief.might (3) times the HP and the hit of the boss this floor would have had
 * (the same generator, at this floor's difficulty, as if it were a boss floor).
 *
 * She fights like a merchant: fistfuls of coins (a fan), coins all round (a ring), her wares raining
 * down, and a shoulder-first barge; she summons no one. Once she's furious nobody is minding the
 * stall, so the rest of her wares are free for the grabbing, in the middle of the fight or after it.
 * The way down is as open as it was: you can run, and she follows across the floor. Beating her
 * pays a pile of gold (BAL.shop.thief.loot kills' worth); the squad going down to her is a wipe like
 * any other. A thief is remembered for the rest of the run (state.run.thief: shop.ts marks the next
 * merchants' prices up). She never fights unless she's stolen from, and nothing steals but the
 * player: the squad's AI and Auto only ever see her once she's a foe.
 */
import { BAL } from '../core/balance';
import { foeStats } from '../core/power';
import { clear, type Unit } from './entities';
import { floorBoss, type MobType } from './mobgen';
import { freeSpot } from './nav';
import type { Npc } from './npcs';
import type { World } from './world';

/** The merchant's fury, from the theft on (World.fury). */
export interface Fury {
  /** Who was robbed (taken off the floor's folk once she turns). */
  npc: Npc;
  /** Her stall, where she stood: its light goes red. */
  x: number;
  y: number;
  /** Seconds since the theft; she turns at BAL.shop.thief.turn. */
  t: number;
  /** Her, as a foe: null through the warning, and still her (dead) once she's beaten. */
  unit: Unit | null;
  /** Seconds until her next shout; whether she's passed half HP, and whether her line about it is still to come. */
  shoutT: number;
  seething: boolean;
  seethe?: boolean;
  /** When she was beaten (the world's clock), and where: she stays there, dazed. Null until then. */
  fell: { at: number; x: number; y: number } | null;
}

/** Seconds of her vault over the counter, and how high it goes (px). */
export const VAULT_TIME = 0.34;
const VAULT_HEIGHT = 14;

/** What she shouts as she turns, through the fight, at half HP and as she falls. */
export const THIEF_TURN: readonly string[] = ['THIEF!', 'Put. That. BACK!', 'You little thief!', 'That is NOT free!'];
export const THIEF_TAUNTS: readonly string[] = [
  'That comes out of your hide!',
  'No refunds! No mercy!',
  'I counted every coin!',
  'Pay up! With interest!',
  'Thirty years, not one theft!',
  'Keep the change!',
  'You break it, you bought it!',
  'This is why we can\'t have nice wares!',
];
export const THIEF_SEETHE: readonly string[] = ['Now I\'m REALLY cross!', 'That does it. Clearance sale: YOU!', 'Everything must go! Starting with you!'];
export const THIEF_FALL: readonly string[] = ['Fine. Take it. Take it all...', 'Worst. Customer. Ever.', 'I\'m... writing to the guild...', 'Shop\'s... closed...'];

/** Is this one of the floor's merchants (the only folk who can be robbed)? */
export function isMerchant(npc: Npc): boolean {
  return npc.def.id === 'shopkeeper';
}

/** The floor's merchant, still at her stall (null: none, or she's already after you). */
export function merchantOf(w: World): Npc | null {
  return w.npcs.find(isMerchant) ?? null;
}

/**
 * The boss this floor would have had if it were a boss floor: the floor's own generator and seed, and
 * the HP and hit a boss gets at this floor's difficulty (power.ts). Her might is measured against it.
 */
export function wouldBeBoss(w: World): { type: MobType; hp: number; atk: number } {
  const type = floorBoss(w.biome, w.floor, w.seed);
  return { type, ...foeStats(type, w.difficulty, 'boss', w.floor, w.size) };
}

/**
 * The furious merchant as a foe: herself (the art draws her own chibi, angry and twice the size: her
 * id carries '-merchant-'), with a boss's moves that suit her trade. Her shots are gold: coins.
 */
export function furiousMerchantType(biomeId: string, floor: number, npc: Npc): MobType {
  const cloth = npc.def.look.shirt;
  return {
    id: `${biomeId}-merchant-${floor}`,
    name: 'Furious Merchant',
    plan: 'humanoid',
    behavior: 'chaser',
    // Her dress, then gold (her coins, the rings her wares land in, her glow).
    ramp: [cloth[0], cloth[1], cloth[2], '#ffd24a'],
    eye: '#ff3a2a',
    size: 2,
    radius: 9,
    // (A boss's HP and hit come from the balance targets, not from these: power.ts.)
    hp: 30,
    atk: 6,
    // Quicker than a boss: she chases a thief across the floor (knights still outrun her).
    speed: 46,
    range: 110,
    atkCd: 2.2,
    flying: false,
    features: { horns: false, spikes: false, crest: false, eyes: 2, tail: false, seed: npc.seed },
    shot: { speed: 84, color: '#ffd24a', radius: 3 },
    boss: { title: `${npc.def.name}, robbed`, moves: ['fan', 'ring', 'rain', 'charge'] },
  };
}

/**
 * A ware was just taken without paying: the floor's merchant turns (true), unless there's none at her
 * stall (false: she's already furious, or beaten). She shouts, and the warning starts.
 */
export function provoke(w: World): boolean {
  const npc = merchantOf(w);
  if (!npc || w.fury) return false;
  w.fury = { npc, x: npc.x, y: npc.y, t: 0, unit: null, shoutT: 3, seething: false, fell: null };
  npc.view = 'down';
  // (Over the "!" the renderer puts on her head.)
  w.text(npc.x, npc.y - 46, w.rng.pick(THIEF_TURN), '#ff5a3a', true);
  w.fx.push({ kind: 'spark', x: npc.x, y: npc.y - 14, color: '#ff5a3a' });
  w.shakeIt(2, 0.25);
  return true;
}

/**
 * Where a keeper who turns foe lands: where they stand if a body that wide can move there, else the
 * talking spot in front of their set-up, else the nearest open floor to it the squad can reach.
 */
export function roomToFight(w: World, npc: Npc, r: number): { x: number; y: number } {
  if (clear(w.map, npc.x, npc.y, r, false)) return npc;
  const talk = npc.camp?.talk ?? npc;
  if (clear(w.map, talk.x, talk.y, r, false)) return talk;
  const lead = w.leader();
  const spot = freeSpot(w, talk.x, talk.y, r, lead?.x ?? talk.x, lead?.y ?? talk.y, 80);
  return spot ? { x: spot[0], y: spot[1] } : talk;
}

/** The warning's over: she's off the list of folk and on the floor as a foe, vaulting her counter. */
function turn(w: World, f: Fury): void {
  const npc = f.npc;
  w.npcs = w.npcs.filter((n) => n !== npc);
  const m = w.makeMob(furiousMerchantType(w.biome.id, w.floor, npc), npc.x, npc.y, false, true);
  // From behind a counter, or from between her stall's posts (she's wider than the gap as a foe, and
  // would stand wedged there all fight), she lands on the open floor in front, where you'd stand to talk.
  const at = roomToFight(w, npc, m.r);
  m.x = at.x;
  m.y = at.y;
  const boss = wouldBeBoss(w);
  m.maxHp = boss.hp * BAL.shop.thief.might;
  m.hp = m.maxHp;
  m.atk = boss.atk * BAL.shop.thief.might;
  m.awake = true;
  m.room = npc.room;
  m.dir = npc.dir;
  // (Her first move comes a moment after she lands, not as she does.)
  m.bossT = 1.4;
  m.atkT = 1;
  if (at !== npc) {
    m.x = npc.x;
    m.y = npc.y;
    m.vault = { x0: npc.x, y0: npc.y, x1: at.x, y1: at.y, t: 0, dur: VAULT_TIME, height: VAULT_HEIGHT };
  }
  w.mobs.push(m);
  w.bossUnit = m;
  f.unit = m;
  w.cleared = false;
  w.fx.push({ kind: 'blast', x: npc.x, y: npc.y - 8, color: '#ff5a3a', size: 1.5 });
  w.shakeIt(4, 0.4);
  w.events.push({ type: 'fury', name: m.type!.name });
  w.refreshFlows();
}

/** Every frame while a theft is being answered (World.update): the warning, her vault, her shouting. */
export function tickFury(w: World, dt: number): void {
  const f = w.fury;
  if (!f) return;
  f.t += dt;
  if (!f.unit) {
    // (Like any foe, she joins no fight the squad is leaving through a portal.)
    if (f.t >= BAL.shop.thief.turn && !w.warping()) turn(w, f);
    return;
  }
  const m = f.unit;
  if (m.dead) return;
  const v = m.vault;
  if (v) {
    // Over the counter: she goes where the arc takes her (the counter's no wall to a vault), then lands.
    v.t += dt;
    const p = Math.min(1, v.t / v.dur);
    m.x = v.x0 + (v.x1 - v.x0) * p;
    m.y = v.y0 + (v.y1 - v.y0) * p;
    if (p >= 1) {
      m.vault = undefined;
      m.recoverT = m.recoverDur = 0.25;
      w.fx.push({ kind: 'land', x: m.x, y: m.y, size: 1.4 });
      w.shakeIt(3, 0.2);
    }
    return;
  }
  f.shoutT -= dt;
  if (!f.seething && m.hp < m.maxHp * 0.5) {
    // Half down: her next line is the angry one, once the boss's own ENRAGED! has had its moment.
    f.seething = true;
    f.seethe = true;
    f.shoutT = 1.2;
  } else if (f.shoutT <= 0) {
    f.shoutT = w.rng.float(4.5, 7.5);
    w.text(m.x, m.y - 44, w.rng.pick(f.seethe ? THIEF_SEETHE : THIEF_TAUNTS), f.seethe ? '#ff5a3a' : '#ffb07a', !!f.seethe);
    f.seethe = false;
  }
}

/** She's beaten (World.killMob): her last words. What's left on her stall stays there, free. */
export function furyFalls(w: World, m: Unit): void {
  w.text(m.x, m.y - 40, w.rng.pick(THIEF_FALL), '#ffb07a', true);
  if (w.fury) w.fury.fell = { at: w.time, x: m.x, y: m.y };
  // (The bar goes back to an unmasked demon, if one's still up.)
  if (w.bossUnit === m) w.bossUnit = w.demon && !w.demon.unit.dead ? w.demon.unit : null;
}

/** Is she on the floor as a foe right now (turned, and not yet beaten)? */
export function furious(w: World): boolean {
  return !!w.fury?.unit && !w.fury.unit.dead;
}
