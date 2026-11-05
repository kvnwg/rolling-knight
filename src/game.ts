/**
 * The game: the save, the always-on Summoning Altar, and the dungeon floor being played. The UI and
 * the renderer read from here; input and menu actions call in. Nothing here touches the DOM.
 */
import { BAL } from './core/balance';
import type { CoreEvent } from './core/events';
import { knightDef } from './core/knights';
import { currentLuck } from './core/luck';
import { newGame, rebirth as doRebirth } from './core/newGame';
import { runOffline, type OfflineReport } from './core/offline';
import { perksOpen } from './core/perks';
import { floorDifficulty, squadPower, type Difficulty } from './core/power';
import { Rng } from './core/rng';
import { rollTick } from './core/roller';
import { bestSquad, fillSquad, goldMult, killGold, knightStats } from './core/roster';
import { clearSave, loadGame, saveGame } from './core/save';
import type { GameState } from './core/state';
import { CAMP_BIOME, biomeForFloor, isBossFloor, type Biome } from './world/biomes';
import { campMap, generateFloor, type FloorMap } from './world/mapgen';
import { floorBoss, floorMobs } from './world/mobgen';
import { World, type HeroSpec } from './world/world';
import { hubLayout } from './world/hubWorld';
import { applyDialogAction, dialogFor, placeNpcs, type DialogChoice, type DialogNode, type Npc } from './world/npcs';
import { questEvent, type Quest, type QuestEvent, type QuestReward } from './core/quests';
import { onFloorStart } from './world/chance';

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
  private pendingFloor: number | null = null;
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
  /** After a wipe on Auto, seconds until the squad heads back down on its own (cancelled by any input). */
  autoReturnT = 0;
  /** The latest summons, newest first (the Summon tab's log). */
  recent: Summoned[] = [];

  constructor(fresh = false) {
    const loaded = fresh ? null : loadGame();
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

  emit = (e: CoreEvent): void => {
    if (e.type === 'land') {
      this.version++;
      this.recent.unshift({ knightId: e.knightId, mutation: e.mutation, oneIn: e.oneIn, isNew: e.result.kind === 'new', mult: e.mult, at: Date.now() });
      if (this.recent.length > 30) this.recent.length = 30;
      // The tutorial's two big finds go straight into the squad, unless you're mid-fight: the squad
      // only changes at the hub (leave the dungeon, or fall, to bring new knights along).
      if ((e.scripted === 'first' || e.scripted === 'beginner') && !this.inDungeon) {
        bestSquad(this.state);
        this.hubKey = '';
      } else if (e.scripted === 'beginner' && this.inDungeon) {
        this.emit({ type: 'toast', text: 'A new knight waits at the hub. Head back to bring them along!', tone: 'gold' });
      }
    }
    for (const fn of this.listeners) fn(e);
  };

  get luck(): number {
    return currentLuck(this.state, Date.now());
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
        stats: knightStats(s, id),
        slot,
        hpShare: this.hpShare.get(id) ?? 1,
      });
    });
    return out;
  }

  startFloor(floor: number): void {
    const s = this.state;
    s.run.floor = floor;
    s.run.bestFloor = Math.max(s.run.bestFloor, floor);
    s.records.bestFloorEver = Math.max(s.records.bestFloorEver, floor);
    const biome = biomeForFloor(floor, s.run.biomeSeed);
    this.biome = biome;
    const boss = isBossFloor(floor);
    const seed = (s.run.biomeSeed ^ Math.imul(floor, 2654435761) ^ Math.imul(s.run.deaths + 1, 40503)) >>> 0;
    const map = generateFloor({ floor, biome, seed, boss });
    const mobTypes = floorMobs(biome, floor, seed);
    this.difficulty = floorDifficulty(floor, squadPower(s));
    s.quests ??= [];
    const npcs = placeNpcs(map, floor, biome.id, seed, s.quests);
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
      goldPerKill: killGold(floor) * goldMult(s),
      difficulty: this.difficulty.value,
      npcs,
    });
    this.questEvent({ type: 'floor', floor });
    this.world.auto = s.settings.autoPlay;
    // The upgrade map's chance lines play on this floor.
    onFloorStart(this.world, s);
    s.controlled = this.world.controlled;
    this.fade = 1;
    this.fadeDir = -1;
    // The tutorial's beginner's luck comes about 45 s after the first floor opens.
    if (s.roll.tutorial === 'beginner' && s.roll.beginnerAt === null) s.roll.beginnerAt = s.playTimeMs + BAL.tutorial.beginnerAfterSeconds * 1000;
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
      if (w.perks.has('loneWolf') && sp.slot !== this.state.controlled) continue;
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
    this.hpShare.clear();
    this.world = null;
    this.inDungeon = false;
    this.fade = 1;
    this.fadeDir = -1;
    this.syncHub(true);
    if (s.settings.autoPlay) this.autoReturnT = 5;
    this.save();
    this.version++;
  }

  /** Into the dungeon: the floor you left off on (a new one if there's none). */
  enterDungeon(): void {
    if (!this.state.squad.some(Boolean)) return;
    this.inDungeon = true;
    this.autoReturnT = 0;
    if (!this.world) this.startFloor(this.state.run.floor);
    else {
      this.syncSquad();
      this.emit({ type: 'floorStart', floor: this.world.floor, biome: this.world.biome.name, boss: this.world.boss });
    }
    this.fade = 1;
    this.fadeDir = -1;
    this.version++;
  }

  /** Back to camp: the floor waits as it is. */
  leaveDungeon(): void {
    this.inDungeon = false;
    this.fade = 1;
    this.fadeDir = -1;
    this.save();
    this.version++;
  }

  switchTo(slot: number): void {
    if (this.world?.switchControl(slot)) {
      this.state.controlled = slot;
      this.version++;
    }
  }

  setAuto(on: boolean): void {
    this.state.settings.autoPlay = on;
    if (this.world) this.world.auto = on;
    this.version++;
  }

  tick(dt: number): void {
    const s = this.state;
    if (this.paused) return;
    dt = Math.min(dt, 0.1);
    s.playTimeMs += dt * 1000;
    rollTick(s, this.rng, Date.now(), dt, this.emit);
    s.rngState = this.rng.state;
    if (!this.inDungeon) {
      // At the hub: your knight walks among the keepers; the dungeon waits. Empty squad slots fill
      // themselves here (and only here).
      fillSquad(s);
      this.syncHub();
      this.hub?.update(dt);
      if (this.autoReturnT > 0) {
        this.autoReturnT -= dt;
        if (this.autoReturnT <= 0) this.enterDungeon();
      }
    } else if (!this.world) {
      // No floor until the squad has someone in it.
      fillSquad(s);
      if (s.squad.some(Boolean)) this.startFloor(s.run.floor);
    } else {
      // The squad is locked in the dungeon: new knights wait at the hub.
      this.world.update(dt);
      this.handleWorldEvents();
    }
    if (this.fade > 0 && this.fadeDir < 0) this.fade = Math.max(0, this.fade - dt * 1.6);
    if (this.fadeDir > 0) {
      this.fade = Math.min(1, this.fade + dt * 2.2);
      if (this.fade >= 1 && this.pendingFloor !== null) {
        const f = this.pendingFloor;
        this.pendingFloor = null;
        this.startFloor(f);
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
  }

  private goToFloor(floor: number, healAll: boolean): void {
    const w = this.world;
    if (w) {
      for (const h of w.heroes) {
        const share = h.downed ? BAL.dungeon.reviveHpPct : h.hp / h.maxHp;
        this.hpShare.set(h.knightId!, healAll ? 1 : Math.min(1, share + (1 - share) * BAL.dungeon.healBetweenFloors));
      }
      // Coins still in the air are banked.
      for (const p of w.pickups) this.collect(p.kind, p.amount);
    }
    this.pendingFloor = floor;
    this.fadeDir = 1;
  }

  private collect(kind: 'gold' | 'potion' | 'hourglass', amount: number): void {
    const s = this.state;
    if (kind === 'gold') s.gold += amount;
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
          this.questEvent({ type: 'kill', elite: e.elite, boss: e.boss, mobName: e.name });
          if (e.boss) {
            const first = w.floor / 5 > s.run.bosses;
            if (first) {
              s.run.bosses = w.floor / 5;
              if (perksOpen(s)) s.sigils += BAL.perks.sigilsPerBoss;
            }
            s.run.checkpoint = w.floor + 1;
            this.emit({ type: 'bossDown', floor: w.floor, first });
          }
          break;
        case 'pickup':
          this.collect(e.kind, e.amount);
          this.questEvent({ type: 'pickup', kind: e.kind });
          if (e.kind === 'gold') this.emit({ type: 'gold', amount: e.amount });
          break;
        case 'cleared':
          this.emit({ type: 'floorClear', floor: w.floor });
          break;
        case 'exit':
          this.goToFloor(w.floor + 1, false);
          break;
        case 'wipe':
          s.run.deaths += 1;
          s.run.checkpoint = Math.max(1, w.floor - ((w.floor - 1) % 5));
          this.emit({ type: 'wipe', floor: w.floor, back: s.run.checkpoint });
          this.wipeT = 2.5;
          break;
        case 'switch':
          s.controlled = e.slot;
          break;
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

  reset(): void {
    clearSave();
    this.state = newGame();
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
