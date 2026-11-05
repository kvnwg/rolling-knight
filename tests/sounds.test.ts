import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isFightCue, type FightCue } from '../src/audio/catalog';
import { engine, type Graph } from '../src/audio/engine';
import { FightObserver, brakeFor, cellAt, materialOf } from '../src/audio/fight';
import { mixer } from '../src/audio/mixer';
import { RECIPES } from '../src/audio/recipes';
import { SOUND_FILES } from '../src/audio/soundFiles';
import { SOUNDS, SOUND_NAMES, landCue, sfx, skillCue } from '../src/audio/sfx';
import { voiceAt } from '../src/audio/synth';
import { newGame } from '../src/core/newGame';
import { addKnight, knightStats } from '../src/core/roster';
import { SKILLS, SKILL_IDS, SKILL_TIERS, tierStep } from '../src/core/skillbook';
import { BIOMES } from '../src/world/biomes';
import { generateFloor } from '../src/world/mapgen';
import { floorMobs, type MobType } from '../src/world/mobgen';
import { CAST_TIME, onSkillRoll, SLAM_TIME, startSkillRoll } from '../src/world/skills';
import { World, type HeroSpec } from '../src/world/world';
import { soundsDoc } from '../tools/soundsDoc';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// ------------------------------------------------------------------ a stand-in for Web Audio
class Param {
  constructor(public value = 0) {}
  setValueAtTime(v: number) {
    this.value = v;
    return this;
  }
  linearRampToValueAtTime(v: number) {
    this.value = v;
    return this;
  }
  exponentialRampToValueAtTime(v: number) {
    if (!(v > 0)) throw new RangeError('an exponential ramp needs a positive target');
    this.value = v;
    return this;
  }
  setTargetAtTime(v: number) {
    this.value = v;
    return this;
  }
  cancelScheduledValues() {
    return this;
  }
}

class FakeNode {
  out = new Set<FakeNode | Param>();
  constructor(readonly ctx: FakeCtx) {}
  connect(n: FakeNode | Param) {
    this.out.add(n);
    return n;
  }
  disconnect() {
    this.out.clear();
  }
}

class FakeSource extends FakeNode {
  at = -1;
  until = Infinity;
  onended: (() => void) | null = null;
  start(t = 0) {
    this.at = t;
    this.ctx.started.push(this);
  }
  stop(t = 0) {
    this.until = t;
  }
}

class FakeCtx {
  currentTime = 0;
  state = 'running';
  sampleRate = 48000;
  destination = new FakeNode(this);
  started: FakeSource[] = [];
  createOscillator() {
    return Object.assign(new FakeSource(this), { type: 'sine', frequency: new Param(440), detune: new Param(0) });
  }
  createBufferSource() {
    return Object.assign(new FakeSource(this), { buffer: null, loop: false, playbackRate: new Param(1) });
  }
  createGain() {
    return Object.assign(new FakeNode(this), { gain: new Param(1) });
  }
  createBiquadFilter() {
    return Object.assign(new FakeNode(this), { type: 'lowpass', frequency: new Param(350), Q: new Param(1) });
  }
  createStereoPanner() {
    return Object.assign(new FakeNode(this), { pan: new Param(0) });
  }
  createWaveShaper() {
    return Object.assign(new FakeNode(this), { curve: null });
  }
  createBuffer(channels: number, length: number, rate: number) {
    return { duration: length / rate, length, numberOfChannels: channels, sampleRate: rate, getChannelData: () => new Float32Array(length) };
  }
  /** Time passes: sources that have stopped end. */
  advance(dt: number) {
    this.currentTime += dt;
    for (const s of this.started) {
      if (s.until <= this.currentTime && s.onended) {
        const f = s.onended;
        s.onended = null;
        f();
      }
    }
  }
}

const contexts: FakeCtx[] = [];

/** A stand-in audio graph, live, as the engine's (its timers faked, so every layer can be run to its end after). */
function fakeGraph(): { ctx: FakeCtx; graph: Graph } {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const ctx = new FakeCtx();
  contexts.push(ctx);
  const graph = { ctx, master: ctx.createGain(), sfx: ctx.createGain(), music: ctx.createGain(), noise: ctx.createBuffer(1, 96000, 48000) };
  engine.graph = graph as unknown as Graph;
  return { ctx, graph: graph as unknown as Graph };
}

afterEach(() => {
  // Time passes until every layer still to come has been made and everything has rung out (so no voice
  // is left counted), then the audio goes.
  if (contexts.length) {
    for (let k = 0; k < 100; k++) {
      for (const c of contexts) c.advance(0.1);
      vi.advanceTimersByTime(100);
    }
    for (const c of contexts) c.advance(1e4);
    contexts.length = 0;
    vi.useRealTimers();
  }
  engine.graph = null;
});

// ------------------------------------------------------------------ a floor to fight on
function squad(ids: string[]): HeroSpec[] {
  const s = newGame(1);
  ids.forEach((id) => addKnight(s, id, null));
  return ids.map((id, slot) => {
    const [rarity, cls] = id.split('-') as [HeroSpec['rarity'], HeroSpec['cls']];
    return { knightId: id, cls, rarity, mutation: null, stats: knightStats(s, id), slot, hpShare: 1 };
  });
}

function world(ids: string[], seed = 99): World {
  const biome = BIOMES.hamlet;
  const map = generateFloor({ floor: 3, biome, seed, boss: false });
  return new World({ map, biome, floor: 3, boss: false, mobTypes: floorMobs(biome, 3, seed), bossType: null, squad: squad(ids), perks: [], controlled: 0, seed, goldPerKill: 3 });
}

function mobType(o: Partial<MobType> & Pick<MobType, 'id' | 'plan' | 'behavior'>): MobType {
  return { name: 'Test', ramp: ['#000000', '#111111', '#222222', '#333333'], eye: '#ff0000', size: 1, radius: 5, hp: 10, atk: 1, speed: 30, range: 12, atkCd: 1, flying: false, features: { horns: false, spikes: false, crest: false, eyes: 2, tail: false, seed: 1 }, ...o };
}

// ------------------------------------------------------------------ the tests
describe('the sound list', () => {
  it('gives every skill in the skill book a cast sound, and every skill tier a landing sound', () => {
    for (const id of SKILL_IDS) {
      const cue = skillCue(id);
      expect(SOUND_NAMES, id).toContain(cue);
      expect(SOUNDS[cue].group).toBe('Skills');
      expect(SOUNDS[cue].when).toContain(SKILLS[id].name);
      expect(typeof RECIPES[cue as FightCue], cue).toBe('function');
    }
    expect(new Set(SKILL_IDS.map(skillCue)).size).toBe(SKILL_IDS.length);
    for (const t of SKILL_TIERS) expect(SOUND_NAMES).toContain(landCue(t));
    expect(skillCue('titansWrath')).toBe('skill_titans_wrath');
    expect(skillCue('whirlwind')).toBe('skill_whirlwind');
  });

  it('names every sound in docs/SOUNDS.md, and every name there is a sound in sfx.ts', () => {
    const doc = readFileSync(join(root, 'docs/SOUNDS.md'), 'utf8');
    const named = [...doc.matchAll(/^\| `([a-z0-9_]+)` \|/gm)].map((m) => m[1]);
    expect(named.length).toBeGreaterThan(100);
    for (const n of named) expect(SOUND_NAMES, `${n} (in the docs)`).toContain(n);
    for (const n of SOUND_NAMES) expect(named, `${n} (in sfx.ts)`).toContain(n);
    expect(new Set(named).size).toBe(named.length);
    // And it says what the catalog says (after a change: npx tsx tools/soundsDoc.ts).
    expect(doc).toBe(soundsDoc());
  });

  it('names every sound in snake case, as its file is named', () => {
    for (const n of SOUND_NAMES) expect(n).toMatch(/^[a-z][a-z0-9_]*$/);
  });

  it('plays a recording in place of any sound: soundFiles picks up every mp3 by its name', () => {
    const files = readdirSync(join(root, 'src/assets/sounds')).filter((f) => f.endsWith('.mp3')).map((f) => f.slice(0, -4));
    expect(files.length).toBeGreaterThan(0);
    expect(Object.keys(SOUND_FILES).sort()).toEqual(files.sort());
    // The altar's recordings are sounds of the list under their own names.
    for (const f of files.filter((x) => x !== 'hit')) expect(SOUND_NAMES).toContain(f);
  });
});

describe('the placeholders', () => {
  it('give every fight sound a synthesized sound: each starts its layers and rings for a moment', () => {
    const fightCues = SOUND_NAMES.filter(isFightCue);
    expect(Object.keys(RECIPES).sort()).toEqual([...fightCues].sort());
    for (const cue of fightCues) {
      for (const level of [0, 0.5, 1]) {
        const ctx = new FakeCtx();
        const v = voiceAt(ctx as unknown as BaseAudioContext, ctx.destination as unknown as AudioNode, 1, ctx.createBuffer(1, 96000, 48000) as unknown as AudioBuffer, Math.random, { level, counted: false });
        RECIPES[cue](v);
        expect(ctx.started.length, cue).toBeGreaterThan(0);
        expect(v.end, cue).toBeGreaterThan(1.01);
        expect(v.end, cue).toBeLessThan(5);
        for (const s of ctx.started) expect(s.at, cue).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('play every sound by name through sfx.play, the altar’s and the menus’ too: each starts its layers', () => {
    const { ctx, graph } = fakeGraph();
    engine.graph = graph;
    // (The altar's and the menus' sounds keep their own gaps in real time: a second apart each.)
    let now = 1e6;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
    try {
      for (const name of SOUND_NAMES) {
        now += 2000;
        const before = ctx.started.length;
        sfx.play(name, 3);
        expect(ctx.started.length, name).toBeGreaterThan(before);
        ctx.advance(3);
      }
    } finally {
      clock.mockRestore();
    }
  });
});

describe('the mix', () => {
  it('holds a crowd back: twenty foes falling at once are a few deaths, and only so many hits ring together', () => {
    const { ctx, graph } = fakeGraph();
    engine.graph = graph;
    const played = (k: string) => mixer.stats().played[k] ?? 0;
    const deaths = played('death_bone');
    for (let i = 0; i < 20; i++) sfx.fire('death_bone', { x: i, y: 0 });
    expect(played('death_bone') - deaths).toBe(1);
    // Spread over a moment: no more than its limit at once.
    const before = played('hit_stone');
    for (let i = 0; i < 20; i++) {
      sfx.fire('hit_stone', {});
      ctx.advance(0.03);
    }
    const n = played('hit_stone') - before;
    expect(n).toBeGreaterThan(SOUNDS.hit_stone.max);
    expect(n).toBeLessThan(20);
  });

  it('lets the key moments through a crowd of background sounds, and drops background sounds first', () => {
    const { ctx, graph } = fakeGraph();
    engine.graph = graph;
    const played = (k: string) => mixer.stats().played[k] ?? 0;
    // A wall of background and fight sounds, all at once.
    const cues: FightCue[] = ['mob_bite', 'mob_swipe', 'mob_shot', 'arrow_thunk', 'knight_dodge', 'heal', 'kill_chime', 'hit_flesh', 'hit_slime', 'hit_bone', 'hit_wood', 'death_flesh', 'death_slime', 'boom_small', 'zap', 'atk_sword', 'atk_bow', 'atk_spear'];
    for (let round = 0; round < 3; round++) {
      for (const c of cues) sfx.fire(c, { x: 0, y: 0 });
      ctx.advance(0.07);
    }
    const busy = mixer.stats().dropped;
    expect(Object.keys(busy).some((k) => k.endsWith(':busy') && SOUNDS[k.split(':')[0] as FightCue].prio === 0), 'background sounds dropped first').toBe(true);
    const crit = played('crit');
    const land = played('skill_roll_land_legendary');
    sfx.fire('crit', {});
    sfx.fire('skill_roll_land_legendary', {});
    expect(played('crit')).toBe(crit + 1);
    expect(played('skill_roll_land_legendary')).toBe(land + 1);
  });

  it('is quieter far from your knight, and silent at volume 0', () => {
    const { graph } = fakeGraph();
    engine.graph = graph;
    const played = (k: string) => mixer.stats().played[k] ?? 0;
    mixer.listen({ x: 0, y: 0 });
    const far = mixer.stats().dropped['boom_big:far'] ?? 0;
    sfx.fire('boom_big', { x: 5000, y: 0 });
    expect(mixer.stats().dropped['boom_big:far']).toBe(far + 1);
    const v = engine.sfxVolume;
    engine.setSfxVolume(0);
    const before = played('boom_small');
    sfx.fire('boom_small', { x: 0, y: 0 });
    sfx.play('boom_small');
    expect(played('boom_small')).toBe(before);
    engine.setSfxVolume(v);
    mixer.listen(null);
  });
});

describe('foes sound like what they are made of', () => {
  it('follows the art: slimes, skeletons, golems and the Stone Warden, bugs, plants, ghosts, flesh', () => {
    expect(materialOf(mobType({ id: 'hamlet-3-0', plan: 'slime', behavior: 'chaser' }))).toBe('slime');
    expect(materialOf(mobType({ id: 'crypt-8-0', plan: 'humanoid', behavior: 'chaser' }))).toBe('bone');
    expect(materialOf(mobType({ id: 'graveyard-8-1', plan: 'humanoid', behavior: 'chaser' }))).toBe('bone');
    // A goblin archer, even in the crypt; a goblin elsewhere.
    expect(materialOf(mobType({ id: 'crypt-8-1', plan: 'humanoid', behavior: 'ranged' }))).toBe('flesh');
    expect(materialOf(mobType({ id: 'hamlet-3-1', plan: 'humanoid', behavior: 'chaser' }))).toBe('flesh');
    expect(materialOf(mobType({ id: 'farmland-3-1', plan: 'humanoid', behavior: 'chaser' }))).toBe('wood');
    expect(materialOf(mobType({ id: 'tundra-6-2', plan: 'golem', behavior: 'tank' }))).toBe('stone');
    expect(materialOf(mobType({ id: 'hamlet-5-boss', plan: 'beast', behavior: 'chaser' }), true)).toBe('stone');
    expect(materialOf(mobType({ id: 'farmland-5-boss', plan: 'pig', behavior: 'charger' }), true)).toBe('flesh');
    expect(materialOf(mobType({ id: 'ember-demon-imp-ember-7', plan: 'humanoid', behavior: 'caster' }), true)).toBe('flesh');
    expect(materialOf(mobType({ id: 'swamp-4-2', plan: 'bug', behavior: 'swarm' }))).toBe('shell');
    expect(materialOf(mobType({ id: 'forest-4-2', plan: 'plant', behavior: 'ranged' }))).toBe('wood');
    expect(materialOf(mobType({ id: 'graveyard-9-2', plan: 'ghost', behavior: 'caster' }))).toBe('ghost');
    expect(materialOf(mobType({ id: 'forest-4-0', plan: 'beast', behavior: 'chaser' }))).toBe('flesh');
  });
});

describe('the skill reel', () => {
  it('ticks for each skill passing the line, slower and slower as it brakes, all before it lands', () => {
    for (const step of [0, 2, 3]) {
      const at = Array.from({ length: 8 }, (_, i) => cellAt(i + 1, brakeFor(step)));
      for (let i = 0; i < at.length; i++) {
        expect(at[i]).toBeGreaterThan(0.08);
        expect(at[i]).toBeLessThan(1);
        if (i > 1) expect(at[i] - at[i - 1]).toBeGreaterThan(at[i - 1] - at[i - 2]);
      }
    }
  });
});

describe('the fight, heard', () => {
  const stops: Array<() => void> = [];
  afterEach(() => {
    while (stops.length) stops.pop()!();
  });

  it('plays each class’s attacks, hits by foe, deaths, foes’ attacks and every part of a skill roll', () => {
    const w = world(['rare-blade', 'rare-ranger', 'rare-arcanist']);
    w.bot = true;
    const heard: Array<{ cue: FightCue; x?: number; y?: number }> = [];
    const obs = new FightObserver((cue, o) => heard.push({ cue, x: o.x, y: o.y }));
    stops.push(onSkillRoll((e) => obs.skill(e)));
    obs.frame(w);
    const h = w.heroes[0];
    // Bring the floor's foes to the squad, awake, a few at a time.
    const DT = 1 / 30;
    for (let t = 0; t < 40 && w.mobs.some((m) => !m.dead); t += DT) {
      if (Math.round(t / DT) % 60 === 0) {
        const near = w.mobs.filter((m) => !m.dead).slice(0, 5);
        near.forEach((m, i) => {
          if (Math.hypot(m.x - h.x, m.y - h.y) < 60) return;
          const a = (i / 5) * Math.PI * 2;
          m.x = h.x + Math.cos(a) * 40;
          m.y = h.y + Math.sin(a) * 26;
          w.wake(m);
        });
      }
      w.update(DT);
      obs.frame(w);
      w.fx.length = 0;
    }
    const got = new Set(heard.map((e) => e.cue));
    for (const cue of ['atk_sword', 'atk_bow', 'atk_arcane', 'arrow_thunk', 'skill_roll_start', 'skill_roll_spin'] as const) expect(got, cue).toContain(cue);
    expect([...got].some((c) => c.startsWith('hit_')), 'a foe hit').toBe(true);
    expect([...got].some((c) => c.startsWith('death_')), 'a foe falling').toBe(true);
    expect([...got].some((c) => c.startsWith('skill_roll_land_')), 'a reel landing').toBe(true);
    expect([...got].some((c) => c.startsWith('skill_') && !c.startsWith('skill_roll_')), 'a skill’s own sound').toBe(true);
    expect([...got].some((c) => c.startsWith('mob_') || c === 'knight_hurt' || c === 'knight_block'), 'a foe attacking').toBe(true);
    // Each sound is placed where it happened.
    for (const e of heard) {
      expect(Number.isFinite(e.x), e.cue).toBe(true);
      expect(Number.isFinite(e.y), e.cue).toBe(true);
    }
  });

  it('plays the reel’s landing by its tier as it stops, then the skill’s own sound as it slams down and fires', () => {
    const w = world(['rare-guardian', 'rare-cleric', 'rare-lancer']);
    const heard: FightCue[] = [];
    const obs = new FightObserver((cue) => heard.push(cue));
    stops.push(onSkillRoll((e) => obs.skill(e)));
    obs.frame(w);
    for (const id of ['titansWrath', 'mend', 'skyfall'] as const) {
      const k = w.heroes.find((x) => x.cls === SKILLS[id].cls)!;
      heard.length = 0;
      const at = new Map<string, number>();
      k.skillRig = id;
      k.specialT = 0;
      expect(startSkillRoll(w, k)).toBe(true);
      for (let i = 0; i < Math.ceil((CAST_TIME + 0.6) * 30) && heard.indexOf(skillCue(id) as FightCue) < 0; i++) {
        w.update(1 / 30);
        obs.frame(w);
        for (const c of heard) if (!at.has(c)) at.set(c, i);
        w.fx.length = 0;
      }
      const land = heard.indexOf(landCue(SKILLS[id].tier));
      const cast = heard.indexOf(skillCue(id) as FightCue);
      expect(heard[0]).toBe('skill_roll_start');
      expect(heard).toContain('skill_roll_spin');
      expect(land, id).toBeGreaterThan(0);
      expect(cast, id).toBeGreaterThan(land);
      // The slam between them: as long as the skill's tier takes.
      const gap = (at.get(skillCue(id))! - at.get(landCue(SKILLS[id].tier))!) / 30;
      expect(Math.abs(gap - SLAM_TIME[tierStep(SKILLS[id].tier)]), id).toBeLessThan(0.07);
    }
  });
});
