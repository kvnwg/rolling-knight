/**
 * The game: the save, the always-on Summoning Altar, and the dungeon floor being played. The UI and
 * the renderer read from here; input and menu actions call in. Nothing here touches the DOM.
 */
import { BAL } from './core/balance';
import { drawDesign } from './core/deck';
import type { CoreEvent } from './core/events';
import { knightDef } from './core/knights';
import { currentLuck } from './core/luck';
import { campFloor, canRebirth, checkpointFor, newGame, rebirth as doRebirth } from './core/newGame';
import { runOffline, type OfflineReport } from './core/offline';
import { perksOpen } from './core/perks';
import { floorDifficulty, squadPower, type Difficulty } from './core/power';
import { Rng } from './core/rng';
import { rollTick } from './core/roller';
import { fillSquad, goldMult, killGold, knightStats, soloBonus, squadSize } from './core/roster';
import { RUN_ITEMS, canStack, runMults, type RunItemId } from './core/runItems';
import { CLASS_SKILLS, SKILLS, tierStep } from './core/skillbook';
import { placeShop, type Ware } from './world/shop';
import { merchantOf, provoke } from './world/thief';
import { rigSkill } from './world/skills';
import { clearSave, loadGame, saveGame } from './core/save';
import type { GameState } from './core/state';
import { CAMP_BIOME, biomeForFloor, isBossFloor, type Biome } from './world/biomes';
import { campMap, generateFloor, type FloorMap } from './world/mapgen';
import { floorBoss, floorMobs } from './world/mobgen';
import { World, type HeroSpec } from './world/world';
import { HUB_DESCEND_Y, HUB_STEPS_Y, hubLayout } from './world/hubWorld';
import { applyDialogAction, dialogFor, placeNpcs, type DialogChoice, type DialogNode, type Npc } from './world/npcs';
import { questEvent, type Quest, type QuestEvent, type QuestReward } from './core/quests';
import { onFloorStart } from './world/chance';
import { skillRollLuck } from './core/chance';
import type { ScreenView } from './render/view';

export type Listener = (e: CoreEvent) => void;

export interface Summoned {
  knightId: string;
  mutation: import('./core/state').MutationId | null;
  oneIn: number;
  isNew: boolean;
  mult: number;
  at: number;
}

let campMapCache: FloorMap | null = null;

/**
 * Through a portal: once the squad has swirled in (World.warp) the screen cuts to black in a blink
 * (this much a second; the hub's steps fade out at 2.2), and the next floor comes up fast while the
 * squad pops out (World.arrive). Every other fade in clears at FADE_IN.
 */
export const PORTAL_CUT = 12;
export const PORTAL_REVEAL = 5;
const FADE_IN = 1.6;

export class Game {
  state: GameState;
  rng: Rng;
  world: World | null = null;
  /** The current floor's balance: par, the squad's power when it started, and what its foes are built for. */
  difficulty: Difficulty | null = null;
  biome: Biome;
  offline: OfflineReport | null = null;
  /** Seconds of the floor's fade in or out (the renderer draws it). */
  fade = 1;
  fadeDir: -1 | 1 = -1;
  /** How fast the fade in under way clears (a second): quicker after a portal. */
  private fadeIn = FADE_IN;
  /**
   * The world as the canvas showed it last frame (the renderer sets it): where a world point is on the
   * page, for the HUD's overlays (render/view.ts toScreen). Null before the first frame.
   */
  view: ScreenView | null = null;
  /** What runs once a frame has been drawn (onFrame). */
  private framed = new Set<() => void>();
  private pendingFloor: number | null = null;
  /** Walking down the hub's steps: the fade out has begun, the dungeon comes when it's black. */
  private descending = false;
  private wipeT = 0;
  private saveT = 0;
  private listeners = new Set<Listener>();
  /** HP share per knight id, carried between floors. */
  private hpShare = new Map<string, number>();
  /** Bumped whenever something the menus show changes. */
  version = 0;
  paused = false;
  /** In the dungeon (true) or at camp, the home screen (false). The altar rolls either way. */
  inDungeon = false;
  /** The camp scene: the squad round the fire. */
  camp: World | null = null;
  private campKey = '';
  /** The hub between dives: your knight walking among the keepers. */
  hub: World | null = null;
  private hubKey = '';
  /** After a wipe with the dev bot playing, seconds until the squad heads back down on its own (cancelled by any input). */
  autoReturnT = 0;
  /**
   * Dev and tools only: the knight you control plays itself (World.bot: it moves, dodges and fights by
   * its class's AI). Set by the ?auto URL flag and the sim; never saved, never in the game's UI.
   */
  bot = false;
  /** The latest summons, newest first (the Summon tab's log). */
  recent: Summoned[] = [];
  /**
   * The ware (its uid) a steal has been asked of once (reachForWare): the HUD asks "Steal? She'll
   * fight you." and a second ask does it. Stepping away from the ware forgets it.
   */
  stealAsked: number | null = null;

  /** No save behind this game: a brand-new player (or ?fresh). */
  readonly isNew: boolean;

  constructor(fresh = false) {
    const loaded = fresh ? null : loadGame();
    this.isNew = !loaded;
    this.state = loaded ?? newGame();
    this.rng = new Rng(this.state.rngState);
    this.biome = biomeForFloor(this.state.run.floor, this.state.run.biomeSeed);
    if (loaded) {
      const away = (Date.now() - loaded.savedAt) / 1000;
      this.offline = runOffline(this.state, this.rng, away, Date.now());
    }
  }

  on(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /**
   * Runs `fn` each time a frame has been drawn (the world moved, the canvas shows it and `view` says
   * where): for what's drawn over the canvas in the page and must keep in step with it, frame for
   * frame (the spell slam's icon going into a knight's weapon). Returns the way to stop.
   */
  onFrame(fn: () => void): () => void {
    this.framed.add(fn);
    return () => this.framed.delete(fn);
  }

  /** A frame has been drawn (App's loop, right after the renderer). */
  frameDrawn(): void {
    for (const fn of this.framed) fn();
  }

  emit = (e: CoreEvent): void => {
    if (e.type === 'land') {
      this.version++;
      this.recent.unshift({ knightId: e.knightId, mutation: e.mutation, oneIn: e.oneIn, isNew: e.result.kind === 'new', mult: e.mult, at: Date.now() });
      if (this.recent.length > 30) this.recent.length = 30;
    }
    for (const fn of this.listeners) fn(e);
  };

  get luck(): number {
    return currentLuck(this.state, Date.now()) * runMults(this.state.run.items).luck;
  }

  /** A knight's stats with the run's merchant items on top (Whetstone Oil, Iron Tonic, Swift Tonic, Traveler's Boots). */
  private runStats<T extends { atk: number; hp: number; atkCd: number; speed: number }>(st: T): T {
    const m = runMults(this.state.run.items);
    return { ...st, atk: st.atk * m.dmg, hp: st.hp * m.hp, atkCd: st.atkCd / m.atkSpd, speed: st.speed * m.speed };
  }

  squadSpecs(): HeroSpec[] {
    const s = this.state;
    const out: HeroSpec[] = [];
    s.squad.forEach((id, slot) => {
      if (!id || !s.roster[id]) return;
      const def = knightDef(id);
      out.push({
        knightId: id,
        cls: def.cls,
        rarity: def.rarity,
        mutation: s.roster[id].mutation,
        stats: this.runStats(knightStats(s, id)),
        slot,
        hpShare: this.hpShare.get(id) ?? 1,
      });
    });
    return out;
  }

  /** Starts `floor` as a fresh map. `portal`: the squad came down through the way down (it pops out of the warp, and the floor comes up quickly). */
  startFloor(floor: number, portal = false): void {
    const s = this.state;
    s.run.floor = floor;
    s.run.bestFloor = Math.max(s.run.bestFloor, floor);
    // Every 10th floor saves the run's progress: a wipe from here on comes back to it.
    if (checkpointFor(floor) === floor && floor > s.run.checkpoint) {
      s.run.checkpoint = floor;
      this.emit({ type: 'checkpoint', floor });
    }
    s.records.bestFloorEver = Math.max(s.records.bestFloorEver, floor);
    // The run just made it to the floor a rebirth needs: tell the player, once, right away.
    if (canRebirth(s) && !s.run.rebirthTold) {
      s.run.rebirthTold = true;
      this.emit({ type: 'rebirthReady', next: s.rebirths + 1 });
    }
    const biome = biomeForFloor(floor, s.run.biomeSeed);
    this.biome = biome;
    const boss = isBossFloor(floor);
    // Every time a floor is entered (a return to one too) it's a new map, built to the next design in
    // the deck: none comes round again until all have been played.
    s.run.visits = (s.run.visits ?? 0) + 1;
    const design = drawDesign(s.run, Rng.hashSeed(s.run.biomeSeed ^ Math.imul(s.run.visits, 0x9e3779b1)));
    const seed = (s.run.biomeSeed ^ Math.imul(floor, 2654435761) ^ Math.imul(s.run.deaths + 1, 40503) ^ Math.imul(s.run.visits, 0x2c1b3c6d)) >>> 0;
    const map = generateFloor({ floor, biome, seed, boss, design });
    const mobTypes = floorMobs(biome, floor, seed);
    // Built for the knights you bring (par is for three); going short-handed pays more gold.
    this.difficulty = floorDifficulty(floor, squadPower(s), squadSize(s));
    s.quests ??= [];
    const npcs = placeNpcs(map, floor, biome.id, seed, s.quests);
    // Now and then a room is a merchant's (world/shop.ts): her wares priced by this floor's gold (a
    // thief's price if you stole from one earlier this run).
    const shop = placeShop(map, floor, biome.id, seed, killGold(floor) * goldMult(s), npcs.flatMap((n) => (n.camp ? [n.camp] : [])), !!s.run.thief);
    if (shop) npcs.push(shop.merchant);
    this.world = new World({
      map,
      biome,
      floor,
      boss,
      mobTypes,
      bossType: boss ? floorBoss(biome, floor, seed) : null,
      squad: this.squadSpecs(),
      perks: s.perks,
      controlled: s.controlled,
      seed,
      goldPerKill: killGold(floor) * goldMult(s) * soloBonus(s) * runMults(s.run.items).gold,
      difficulty: this.difficulty.value,
      size: squadSize(s),
      npcs,
    });
    this.world.wares = shop?.wares ?? [];
    this.stealAsked = null;
    this.applyRunItems();
    this.questEvent({ type: 'floor', floor });
    this.world.auto = s.settings.autoPlay;
    this.world.bot = this.bot || s.settings.autoPlay;
    if (portal) this.world.arriveFromPortal(s.settings.reduceMotion);
    // The upgrade map's chance lines play on this floor.
    onFloorStart(this.world, s);
    s.controlled = this.world.controlled;
    this.fade = 1;
    this.fadeDir = -1;
    this.fadeIn = portal ? PORTAL_REVEAL : FADE_IN;
    // Saved now, so the card just dealt stays dealt even if the game closes straight away.
    saveGame(s);
    this.emit({ type: 'floorStart', floor, biome: biome.name, boss });
    this.version++;
  }

  /** The squad changed in the menus: swap knights in place on the floor. */
  syncSquad(): void {
    const w = this.world;
    if (!w) return;
    const specs = this.squadSpecs();
    const lead = w.leader();
    const keep = w.heroes.filter((h) => specs.some((sp) => sp.knightId === h.knightId && sp.slot === h.slot));
    const next = [...keep];
    for (const sp of specs) {
      if (keep.some((h) => h.knightId === sp.knightId && h.slot === sp.slot)) continue;
      const x = lead?.x ?? w.map.start.x;
      const y = lead?.y ?? w.map.start.y;
      const h = w.makeHero(sp, x, y);
      w.fx.push({ kind: 'levelup', x, y, color: '#ffe27a' });
      next.push(h);
    }
    w.heroes = next.sort((a, b) => a.slot! - b.slot!);
    // Stats may have changed (level ups, upgrades): refresh them, keeping HP shares.
    for (const h of w.heroes) {
      const sp = specs.find((x) => x.knightId === h.knightId)!;
      const share = h.maxHp > 0 ? h.hp / h.maxHp : 1;
      const fresh = w.makeHero(sp, h.x, h.y);
      h.maxHp = fresh.maxHp;
      h.hp = h.downed ? 0 : Math.max(1, share * h.maxHp);
      h.atk = fresh.atk;
      h.speed = fresh.speed;
      h.atkCd = fresh.atkCd;
      h.dodgeCd = fresh.dodgeCd;
      h.specialCd = fresh.specialCd;
      h.rollTimeMult = fresh.rollTimeMult;
      h.mutation = sp.mutation;
    }
    if (!w.heroes.some((h) => h.slot === w.controlled && !h.downed)) {
      const alive = w.heroes.find((h) => !h.downed);
      if (alive) w.controlled = alive.slot!;
    }
    this.state.controlled = w.controlled;
    w.refreshFlows();
    this.version++;
  }

  /** Rebuilds the camp scene when the squad changes. */
  syncCamp(): void {
    const key = this.state.squad.join('|') + Object.values(this.state.roster).map((r) => r.mutation ?? '').join('');
    if (this.camp && key === this.campKey) return;
    this.campKey = key;
    campMapCache ??= campMap();
    this.camp = new World({
      map: campMapCache,
      biome: CAMP_BIOME,
      floor: 0,
      boss: false,
      mobTypes: [],
      bossType: null,
      squad: this.squadSpecs(),
      perks: [],
      controlled: this.state.controlled,
      seed: 1,
      goldPerKill: 0,
      camp: true,
    });
  }

  /** Rebuilds the hub when your knight changes: just them, at the hub's spawn, among the keepers. */
  syncHub(force = false): void {
    const s = this.state;
    const id = s.squad[s.controlled] ?? s.squad.find(Boolean) ?? null;
    const key = `${id}|${id ? s.roster[id]?.mutation ?? '' : ''}`;
    if (!force && this.hub && key === this.hubKey) return;
    this.hubKey = key;
    const layout = hubLayout();
    const specs = this.squadSpecs();
    const controlled = specs.find((sp) => sp.knightId === id)?.slot ?? 0;
    const was = this.hub?.leader();
    this.hub = new World({
      map: layout.map,
      biome: CAMP_BIOME,
      floor: 0,
      boss: false,
      mobTypes: [],
      bossType: null,
      squad: specs,
      perks: [],
      controlled,
      seed: 7,
      goldPerKill: 0,
      hub: true,
      stations: layout.stations,
    });
    // A new knight takes over where the old one stood (only the start of a visit begins at the spawn).
    const now = this.hub.leader();
    if (was && now && !force) {
      now.x = was.x;
      now.y = was.y;
      now.view = was.view;
      now.dir = was.dir;
    }
  }

  /** Back to the hub after a wipe: the squad patched up, the run back at its checkpoint. */
  private returnToHub(): void {
    const s = this.state;
    s.run.floor = s.run.checkpoint;
    s.run.items = {};
    s.run.thief = false;
    this.hpShare.clear();
    this.world = null;
    this.inDungeon = false;
    this.fade = 1;
    this.fadeDir = -1;
    this.fadeIn = FADE_IN;
    this.syncHub(true);
    if (this.bot || s.settings.autoPlay) this.autoReturnT = 5;
    this.save();
    this.version++;
  }

  /** Into the dungeon: the floor you left off on, as a fresh map (every trip down is a new one, built to the next design in the deck). */
  enterDungeon(): void {
    if (!this.state.squad.some(Boolean)) return;
    this.inDungeon = true;
    this.autoReturnT = 0;
    // The hub waits with your knight back at the head of the steps (not halfway down them).
    this.syncHub(true);
    this.startFloor(this.state.run.floor);
    this.fade = 1;
    this.fadeDir = -1;
    this.version++;
  }

  /**
   * The hub's steps: the court darkens as your knight goes down them, and at the bottom the screen
   * fades out and the dungeon begins (the same as telling the warden you're ready).
   */
  private walkDown(): void {
    const l = this.hub?.leader();
    if (!l || this.descending || this.fadeDir > 0 || !this.state.squad.some(Boolean)) return;
    if (l.y >= HUB_DESCEND_Y) {
      this.descending = true;
      this.fadeDir = 1;
      this.emit({ type: 'descend' });
      return;
    }
    const depth = (l.y - HUB_STEPS_Y) / (HUB_DESCEND_Y - HUB_STEPS_Y);
    if (depth > 0) this.fade = Math.max(this.fade, Math.min(0.7, depth * 0.7));
  }

  /**
   * Back to camp. The run steps back to the floor after the last boss you beat (campFloor), and the
   * squad rests: the fallen are up again and everyone is whole for the next trip down.
   */
  leaveDungeon(): void {
    if (!this.inDungeon) return;
    const from = this.state.run.floor;
    const back = campFloor(from, this.state.run.checkpoint);
    const revived = this.world ? this.world.heroes.filter((h) => h.downed).length : 0;
    // Everything about being at the hub first, all of it together: nothing after this can leave the
    // game half way (in the dungeon with no floor draws nothing at all).
    this.inDungeon = false;
    this.world = null;
    this.state.run.floor = back;
    this.hpShare.clear();
    // A merchant's goods are for one run: heading back to camp ends it (and what the merchants say of you).
    this.state.run.items = {};
    this.state.run.thief = false;
    // (So is a portal's cut to the next floor, a wipe's walk home or a step down the stairs, if one was under way.)
    this.pendingFloor = null;
    this.descending = false;
    this.wipeT = 0;
    this.fade = 1;
    this.fadeDir = -1;
    this.fadeIn = FADE_IN;
    this.syncHub(true);
    this.emit({ type: 'camp', from, back, revived });
    this.save();
    this.version++;
  }

  /** The run's merchant items that the world plays out (lifesteal, thorns, damage taken, revives left). */
  private applyRunItems(): void {
    const w = this.world;
    if (!w) return;
    const m = runMults(this.state.run.items);
    w.guard = m.guard;
    w.lifesteal = m.lifesteal;
    w.thorns = m.thorns;
    w.phoenix = m.phoenix;
  }

  /**
   * Buys a ware off a merchant's display: 'ok' (paid; heals and scrolls work at once, the rest stay
   * with the squad for the run), 'short' (not enough gold), 'max' (that one stacks no higher),
   * 'gone' (sold, or not on this floor), or 'closed' (you stole from her: there's no one to pay, and
   * what's left is for the taking: stealWare).
   */
  buyWare(ware: Ware): 'ok' | 'short' | 'max' | 'gone' | 'closed' {
    const w = this.world;
    const s = this.state;
    if (!w || ware.sold || !w.wares.includes(ware)) return 'gone';
    if (w.fury) return 'closed';
    if (!canStack(s.run.items, ware.item)) return 'max';
    if (s.gold < ware.price) return 'short';
    s.gold -= ware.price;
    ware.sold = true;
    this.stealAsked = null;
    this.useRunItem(ware.item);
    this.emit({ type: 'bought', item: ware.item, price: ware.price });
    this.version++;
    return 'ok';
  }

  /**
   * Takes a ware off a merchant's display without paying (world/thief.ts): 'ok' (it's yours, working
   * like a bought one), 'max' (that one stacks no higher) or 'gone'. The first one taken turns the
   * merchant on the squad and marks you a thief for the rest of the run; after that the rest of her
   * stall is free for the grabbing, while she's after you and once she's beaten. Only the player
   * ever calls this: nothing the squad's AI, Auto or the dev bot does steals.
   */
  stealWare(ware: Ware): 'ok' | 'max' | 'gone' {
    const w = this.world;
    const s = this.state;
    if (!w || ware.sold || !w.wares.includes(ware)) return 'gone';
    if (!canStack(s.run.items, ware.item)) return 'max';
    ware.sold = true;
    this.stealAsked = null;
    this.useRunItem(ware.item);
    const first = provoke(w);
    if (first) s.run.thief = true;
    this.emit({ type: 'stolen', item: ware.item, first });
    this.version++;
    return 'ok';
  }

  /**
   * The player reaches for a ware without paying (the HUD's STEAL button, its key). With the merchant
   * still at her stall the first reach only asks ('ask': the HUD says what will happen) and a second,
   * still standing at the same ware, steals it; once she's been robbed there's nothing left to ask.
   */
  reachForWare(ware: Ware): 'ask' | 'ok' | 'max' | 'gone' {
    const w = this.world;
    if (!w || ware.sold || !w.wares.includes(ware)) return 'gone';
    if (!canStack(this.state.run.items, ware.item)) return 'max';
    if (!w.fury && merchantOf(w) && this.stealAsked !== ware.uid) {
      this.stealAsked = ware.uid;
      this.version++;
      return 'ask';
    }
    return this.stealWare(ware);
  }

  private useRunItem(id: RunItemId): void {
    const w = this.world!;
    const s = this.state;
    const before = runMults(s.run.items);
    if (id === 'draught') {
      for (const h of w.livingHeroes()) {
        w.heal(h, h.maxHp * 0.6);
        w.fx.push({ kind: 'heal', x: h.x, y: h.y });
      }
      return;
    }
    if (id === 'scroll') {
      // The next roll of the knight you play lands on one of its Epic or Legendary skills.
      const h = w.heroes.find((x) => x.slot === w.controlled);
      const pool = h?.cls ? CLASS_SKILLS[h.cls].filter((k) => tierStep(SKILLS[k].tier) >= 3) : [];
      if (h && pool.length) {
        rigSkill(h, pool[w.rng.int(0, pool.length - 1)]);
        w.text(h.x, h.y - 30, 'NEXT ROLL: EPIC+', '#c88aff', true);
      }
      return;
    }
    const items = (s.run.items ??= {});
    items[id] = Math.min(RUN_ITEMS[id].max, (items[id] ?? 0) + 1);
    const after = runMults(items);
    // The squad on this floor gets it now (new floors build it in: runStats).
    for (const h of w.heroes) {
      h.atk *= after.dmg / before.dmg;
      const hp = after.hp / before.hp;
      h.maxHp *= hp;
      if (!h.downed) h.hp *= hp;
      if (h.atkCd !== undefined) h.atkCd /= after.atkSpd / before.atkSpd;
      h.speed *= after.speed / before.speed;
    }
    w.goldPerKill *= after.gold / before.gold;
    this.applyRunItems();
  }

  switchTo(slot: number): void {
    if (this.world?.switchControl(slot)) {
      this.state.controlled = slot;
      this.version++;
    }
  }

  /**
   * Auto battle (the setting autoPlay): your knight plays itself in a fight, moving, dodging and
   * fighting by its class's AI, and goes down once the floor is done (App hands it back to you
   * while you steer or attack); after a wipe the squad heads back down on its own.
   */
  setAuto(on: boolean): void {
    this.state.settings.autoPlay = on;
    if (this.world) {
      this.world.auto = on;
      this.world.bot = this.bot || on;
    }
    this.version++;
  }

  /** The altar's seal is broken: it starts to spin (the first spin on the next tick). */
  breakSeal(): void {
    if (!this.state.roll.sealed) return;
    this.state.roll.sealed = false;
    this.version++;
    this.save();
  }

  tick(dt: number): void {
    const s = this.state;
    if (this.paused) return;
    dt = Math.min(dt, 0.1);
    s.playTimeMs += dt * 1000;
    // (A sealed altar waits for its seal to be broken.)
    if (!s.roll.sealed) rollTick(s, this.rng, Date.now(), dt, this.emit);
    s.rngState = this.rng.state;
    if (!this.inDungeon) {
      // At the hub: your knight walks among the keepers; the dungeon waits. Empty squad slots fill
      // themselves here (and only here).
      fillSquad(s);
      this.syncHub();
      this.hub?.update(dt);
      this.walkDown();
      if (this.autoReturnT > 0) {
        this.autoReturnT -= dt;
        if (this.autoReturnT <= 0) this.enterDungeon();
      }
    } else if (!this.world) {
      // No floor until the squad has someone in it.
      fillSquad(s);
      if (s.squad.some(Boolean)) this.startFloor(s.run.floor);
      // (Nobody to send down: back at the hub, not in a dungeon with no floor, which draws nothing.)
      else this.inDungeon = false;
    } else {
      // The squad is locked in the dungeon: new knights wait at the hub.
      this.world.luck = this.luck * skillRollLuck(s);
      this.world.calm = s.settings.reduceMotion;
      // (A steal asked of a ware is forgotten once you step away from it.)
      if (this.stealAsked !== null && this.world.nearWare()?.uid !== this.stealAsked) this.stealAsked = null;
      this.world.update(dt);
      this.handleWorldEvents();
    }
    if (this.fade > 0 && this.fadeDir < 0) this.fade = Math.max(0, this.fade - dt * this.fadeIn);
    // A fade to black is always on its way somewhere (down the steps, through a portal): one with
    // nowhere to go would leave the screen black for good, so it turns back.
    if (this.fadeDir > 0 && !this.descending && this.pendingFloor === null) this.fadeDir = -1;
    if (this.fadeDir > 0) {
      // (Through a portal it's a cut, black in a blink; down the hub's steps, a fade.)
      this.fade = Math.min(1, this.fade + dt * (this.pendingFloor !== null ? PORTAL_CUT : 2.2));
      if (this.fade >= 1 && this.descending) {
        this.descending = false;
        this.enterDungeon();
      }
      if (this.fade >= 1 && this.pendingFloor !== null) {
        const f = this.pendingFloor;
        this.pendingFloor = null;
        this.startFloor(f, true);
      }
    }
    if (this.wipeT > 0) {
      this.wipeT -= dt;
      if (this.wipeT <= 0) this.returnToHub();
    }
    // Gold per minute over the last few minutes (offline income uses it).
    this.saveT += dt;
    if (this.saveT > 10) {
      this.saveT = 0;
      this.trackIncome();
      saveGame(s);
    }
  }

  private trackIncome(): void {
    const s = this.state;
    const now = s.playTimeMs;
    s.stats.goldWindow.push([now, s.gold]);
    s.stats.goldWindow = s.stats.goldWindow.filter(([t]) => t >= now - 10 * 60_000);
    const first = s.stats.goldWindow[0];
    const mins = (now - first[0]) / 60_000;
    if (mins > 1) s.stats.goldPerMinute = Math.max(0, (s.gold - first[1]) / mins);
    // The fights' own rate (what keeps coming while you're away): picked-up gold only, spending aside.
    const win = (s.stats.combatWindow ??= []);
    win.push([now, s.stats.combatGold ?? 0]);
    s.stats.combatWindow = win.filter(([t]) => t >= now - 10 * 60_000);
    const c0 = s.stats.combatWindow[0];
    const cm = (now - c0[0]) / 60_000;
    if (cm > 1) s.stats.combatPerMinute = Math.max(0, ((s.stats.combatGold ?? 0) - c0[1]) / cm);
  }

  private goToFloor(floor: number, healAll: boolean): void {
    const w = this.world;
    if (w) {
      for (const h of w.heroes) {
        // A fallen knight stays down into the next floor: only a support knight's Epic or Legendary
        // skill raises one (or the hub, where everyone recovers).
        const share = h.hp / h.maxHp;
        this.hpShare.set(h.knightId!, healAll ? 1 : h.downed ? 0 : Math.min(1, share + (1 - share) * BAL.dungeon.healBetweenFloors));
      }
      // Coins still in the air are banked.
      for (const p of w.pickups) this.collect(p.kind, p.amount);
    }
    this.pendingFloor = floor;
    this.fadeDir = 1;
  }

  private collect(kind: 'gold' | 'potion' | 'hourglass', amount: number): void {
    const s = this.state;
    if (kind === 'gold') {
      s.gold += amount;
      s.stats.combatGold = (s.stats.combatGold ?? 0) + amount;
    }
    else if (kind === 'hourglass') s.hourglasses += amount;
    else {
      const now = Date.now();
      const secs = BAL.luck.potionSeconds + (s.upgrades.potionTime ?? 0) * 20;
      s.potionEndsAt = Math.max(now, s.potionEndsAt ?? 0) + secs * 1000;
      this.emit({ type: 'potion', seconds: secs });
    }
  }

  private handleWorldEvents(): void {
    const w = this.world!;
    const s = this.state;
    for (const e of w.events) {
      switch (e.type) {
        case 'kill':
          s.stats.killsThisRun += 1;
          s.records.kills += 1;
          this.questEvent({ type: 'kill', elite: e.elite, boss: e.boss && !e.robbed, mobName: e.name });
          if (e.robbed) {
            // The merchant you robbed: no floor's boss (no sigil, no boss count), but a win all the same.
            this.emit({ type: 'merchantDown', name: e.name });
          } else if (e.boss) {
            const first = w.floor / 5 > s.run.bosses;
            if (first) {
              s.run.bosses = w.floor / 5;
              if (perksOpen(s)) s.sigils += BAL.perks.sigilsPerBoss;
            }
            this.emit({ type: 'bossDown', floor: w.floor, first });
          }
          break;
        case 'pickup':
          this.collect(e.kind, e.amount);
          this.questEvent({ type: 'pickup', kind: e.kind });
          if (e.kind === 'gold') this.emit({ type: 'gold', amount: e.amount });
          break;
        case 'fury':
          this.emit({ type: 'merchantFury', name: e.name });
          break;
        case 'cleared':
          this.emit({ type: 'floorClear', floor: w.floor });
          break;
        case 'portal':
          this.emit({ type: 'portalOpen', floor: w.floor });
          break;
        case 'warp':
          this.emit({ type: 'warp', floor: w.floor });
          break;
        case 'exit':
          this.goToFloor(w.floor + 1, false);
          break;
        case 'wipe':
          s.run.deaths += 1;
          s.run.checkpoint = checkpointFor(w.floor);
          this.emit({ type: 'wipe', floor: w.floor, back: s.run.checkpoint });
          this.wipeT = 2.5;
          break;
        case 'switch':
          s.controlled = e.slot;
          break;
        case 'phoenix': {
          const items = (s.run.items ??= {});
          items.phoenix = Math.max(0, (items.phoenix ?? 0) - 1);
          this.emit({ type: 'toast', text: 'A Phoenix Feather caught your knight!', tone: 'gold' });
          break;
        }
        case 'perfect':
          this.emit({ type: 'perfectRoll', mine: e.mine });
          break;
        case 'clink':
          // (Only a sound: nothing for the screen to redraw.)
          this.emit({ type: 'clink', x: e.x, y: e.y, reflect: e.reflect, mine: e.mine });
          continue;
        default:
          break;
      }
      this.version++;
    }
    w.events.length = 0;
  }

  // ---------------------------------------------------------------- folk and their jobs

  /** Progress on the jobs you've taken; a toast for each one that's just done. */
  private questEvent(e: QuestEvent): void {
    const done = questEvent((this.state.quests ??= []), e);
    for (const q of done) this.emit({ type: 'toast', text: `Job done: ${q.title}! Back to ${q.giverName ?? 'the giver'}.`, tone: 'gold' });
  }

  /** What someone on this floor says to you now. */
  dialogFor(npc: Npc): Record<string, DialogNode> {
    const w = this.world!;
    const s = this.state;
    return dialogFor(npc, {
      floor: w.floor,
      biomeName: w.biome.name,
      activeQuests: s.quests ?? [],
      goldPerKill: w.goldPerKill,
      mobNames: w.mobTypes.map((t) => t.name),
      cleared: w.cleared,
      heroName: w.leader()?.knightId ? knightDef(w.leader()!.knightId!).name : undefined,
      thief: !!s.run.thief,
    });
  }

  /** You picked a line: take or hand back a job, collect a gift, or find out who you're really talking to. */
  choose(npc: Npc, choice: DialogChoice): { close: boolean; fight: boolean; accepted: Quest | null } {
    const s = this.state;
    const r = applyDialogAction(npc, choice, (s.quests ??= []));
    if (r.reward) this.grant(r.reward);
    if (r.accepted) this.emit({ type: 'toast', text: `Job taken: ${r.accepted.title}`, tone: 'gold' });
    if (r.turnedIn) this.emit({ type: 'toast', text: `Job handed in: ${r.turnedIn.title}`, tone: 'good' });
    if (r.fight && this.world) {
      this.world.unmaskDemon(npc);
      this.emit({ type: 'toast', text: `${npc.def.demon?.name ?? 'The demon'} drops the act!`, tone: 'bad' });
    }
    this.version++;
    return { close: r.close || r.fight, fight: r.fight, accepted: r.accepted };
  }

  /** A job's reward or a gift: gold, Hourglasses, a luck potion, Lucky Spins. */
  grant(r: QuestReward): void {
    const s = this.state;
    if (r.gold) {
      s.gold += r.gold;
      this.emit({ type: 'gold', amount: r.gold });
    }
    if (r.hourglasses) s.hourglasses += r.hourglasses;
    if (r.potion) this.collect('potion', 1);
    if (r.luckSpins) s.roll.bankedLucky = (s.roll.bankedLucky ?? 0) + r.luckSpins;
  }

  rebirth(): boolean {
    if (!doRebirth(this.state)) return false;
    this.hpShare.clear();
    this.world = null;
    this.inDungeon = false;
    this.emit({ type: 'rebirth', count: this.state.rebirths });
    saveGame(this.state);
    this.version++;
    return true;
  }

  save(): void {
    saveGame(this.state);
  }

  /** A new game from nothing (Settings): its altar sealed, like a new player's. */
  reset(): void {
    clearSave();
    this.state = newGame();
    this.state.roll.sealed = true;
    this.rng = new Rng(this.state.rngState);
    this.world = null;
    this.inDungeon = false;
    this.recent = [];
    this.hpShare.clear();
    this.version++;
  }

  touch(): void {
    this.version++;
  }
}
