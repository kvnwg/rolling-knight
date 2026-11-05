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
import { Rng } from './core/rng';
import { rollTick } from './core/roller';
import { fillSquad, goldMult, killGold, knightStats } from './core/roster';
import { clearSave, loadGame, saveGame } from './core/save';
import type { GameState } from './core/state';
import { biomeForFloor, isBossFloor, type Biome } from './world/biomes';
import { generateFloor } from './world/mapgen';
import { floorBoss, floorMobs } from './world/mobgen';
import { World, type HeroSpec } from './world/world';

export type Listener = (e: CoreEvent) => void;

export class Game {
  state: GameState;
  rng: Rng;
  world: World | null = null;
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
    if (e.type === 'land') this.version++;
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
    });
    this.world.auto = s.settings.autoPlay;
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
    // No floor until the squad has someone in it.
    if (!this.world) {
      fillSquad(s);
      if (s.squad.some(Boolean)) this.startFloor(s.run.floor);
    } else {
      // New knights fill empty slots on their own; bring them onto the floor.
      const before = s.squad.join();
      fillSquad(s);
      if (s.squad.join() !== before || this.world.heroes.length === 0) this.syncSquad();
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
      if (this.wipeT <= 0) this.goToFloor(s.run.checkpoint, true);
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

  rebirth(): boolean {
    if (!doRebirth(this.state)) return false;
    this.hpShare.clear();
    this.world = null;
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
    this.hpShare.clear();
    this.version++;
  }

  touch(): void {
    this.version++;
  }
}
