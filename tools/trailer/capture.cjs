/**
 * Films one shot of the game, frame by frame (see clock.js for why), into a folder of PNGs.
 *
 *   node tools/trailer/capture.cjs <shot> [--portrait] [--from S] [--to S] [--out shots/trailer] [--name dir]
 *                                         [--base http://localhost:5173/] [--fps 60] [--scout] [--every N]
 *
 * <shot> names an entry of shots.cjs: the game's own dev URL flags (a floor, a squad, the bot at the
 * controls), how long it plays, and cues (at a second of the take: land this knight's next skill roll
 * on a legendary, show a find at the altar, ...). A take plays the same every time (the page's clock
 * and its Math.random are the capture's), so --from and --to film just the seconds worth keeping:
 * the rest is played unseen, at the same sixtieth of a second a step.
 *
 * --scout looks a take over cheaply before filming it: a small screen, one picture every --every
 * frames (default 30: two a second), and a contact sheet of them (<out>/<shot>-scout.jpg) with the
 * second each was taken at.
 *
 * Needs the game's dev server running (`npm run dev`), or a frozen copy of it on another port.
 * Landscape is 1920x1080; --portrait is a 540x810 phone screen at 2x (1080x1620), with touch controls.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const SHOTS = require('./shots.cjs');

function args() {
  const a = process.argv.slice(2);
  const o = { shot: a[0], base: 'http://localhost:5173/', out: 'shots/trailer', fps: 60, portrait: false, scout: false, every: 30 };
  for (let i = 1; i < a.length; i++) {
    const k = a[i];
    if (k === '--portrait') o.portrait = true;
    else if (k === '--scout') o.scout = true;
    else if (k.startsWith('--')) o[k.slice(2)] = a[++i];
  }
  return o;
}

/** What the page offers the cues (the game is on window.__game in dev). */
const DIRECTOR = () => {
  const game = () => window.__game;
  const world = () => game().world;
  window.__dir = {
    hero: (slot) => world()?.heroes.find((h) => h.slot === slot),
    /** This knight's next skill roll lands on `skill` (the game's own rig: world/skills.ts rigSkill). */
    rig(slot, skill) {
      const h = this.hero(slot);
      if (h) h.skillRig = skill;
    },
    /** As rig, and the roll under way (if any) is dropped so the rigged one starts now, spinning for `spin` s. */
    cast(slot, skill, spin = 0.5) {
      const h = this.hero(slot);
      if (!h || h.downed) return;
      h.skillRig = skill;
      h.skillRoll = undefined;
      h.specialT = 0;
      h.rollTimeMult = spin / 1.8;
    },
    /** A find at the altar, as the roll that lands it tells the screen (the full-screen reveal). */
    reveal(knightId, oneIn, drama = 'insane', mutation = null) {
      const rarity = knightId.split('-')[0];
      game().emit({ type: 'land', spinId: 0, reel: 0, knightId, rarity, mutation, oneIn, mult: 1, drama, result: { kind: 'new' }, newRecord: true });
    },
    /** Everyone whole again (a long take shouldn't end on a wipe). */
    heal() {
      for (const h of world()?.heroes ?? []) {
        if (h.downed) continue;
        h.hp = h.maxHp;
      }
    },
    /** Foes still standing, and how far the nearest is from the knight you play. */
    stats() {
      const w = world();
      if (!w) return null;
      const l = w.leader();
      const alive = w.mobs.filter((m) => !m.dead && m.hp > 0);
      const near = l ? Math.min(...alive.map((m) => Math.hypot(m.x - l.x, m.y - l.y)), 9999) : 9999;
      return { t: Math.round(window.__clock.now), mobs: alive.length, near: Math.round(near), hp: w.heroes.map((h) => Math.round((100 * h.hp) / h.maxHp)) };
    },
  };
};

(async () => {
  const o = args();
  const shot = SHOTS[o.shot];
  if (!shot) {
    console.error(`No shot "${o.shot}". Shots: ${Object.keys(SHOTS).join(', ')}`);
    process.exit(1);
  }
  const fps = Number(o.fps);
  const from = Number(o.from ?? 0);
  const to = Number(o.to ?? shot.seconds ?? 8);
  const every = o.scout ? Number(o.every) : 1;
  const tag = `${o.shot}${o.portrait ? '-portrait' : ''}`;
  const dir = path.join(o.out, o.name ?? (o.scout ? `${tag}-scout` : tag));
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--force-color-profile=srgb'] });
  // (A scout's screen is the film's at half the size: the same layout, a quarter of the pixels.)
  const context = await browser.newContext(
    o.portrait
      ? { viewport: { width: 540, height: 810 }, deviceScaleFactor: o.scout ? 1 : 2, hasTouch: true, isMobile: true }
      : { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: o.scout ? 0.5 : 1 },
  );
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error('PAGE ERROR', e.message));
  page.on('console', (m) => m.type() === 'error' && console.error('console:', m.text().slice(0, 300)));
  // No sound in a silent film (and nothing for the audio's own clock to fall out with).
  await page.addInitScript(() => {
    window.AudioContext = undefined;
    window.webkitAudioContext = undefined;
  });
  await page.addInitScript({ path: path.join(__dirname, 'clock.js') });
  const query = (o.portrait && shot.portraitQuery) || shot.query;
  await page.goto(o.base + query, { waitUntil: 'load' });

  // The game boots on real time (its sheets decode); from here on the capture's clock runs it.
  await page.waitForSelector('canvas.game', { timeout: 60000 });
  await page.waitForFunction(() => !!window.__game && !!window.__renderer, null, { timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(DIRECTOR);
  if (shot.setup) await page.evaluate(shot.setup);
  await page.evaluate(() => {
    const r = window.__renderer;
    window.__draw = r.render.bind(r);
    window.__seen = (on) => (r.render = on ? window.__draw : () => {});
  });

  const frame = 1000 / fps;
  const cues = [...(shot.cues ?? [])].sort((a, b) => a.at - b.at);
  const first = Math.round(from * fps);
  const last = Math.round(to * fps);
  const t0 = Date.now();
  let shown = true;
  let n = 0;
  const stamps = [];
  for (let i = 0; i < last; i++) {
    const t = i / fps;
    for (const c of cues) if (c.at >= t && c.at < t + 1 / fps) await page.evaluate(c.run);
    // Unseen frames aren't drawn (drawing is nearly all of a frame's cost); the one before a seen frame is, so its effects are in place.
    const film = i >= first && (i - first) % every === 0;
    const next = i + 1 >= first && (i + 1 - first) % every === 0;
    if ((film || next) !== shown) await page.evaluate((on) => window.__seen(on), (shown = film || next));
    await page.evaluate((d) => window.__clock.step(d), frame);
    if (!film) continue;
    await page.evaluate(() => window.__clock.settle());
    const file = path.join(dir, `${String(n++).padStart(5, '0')}.${o.scout ? 'jpg' : 'png'}`);
    await page.screenshot(o.scout ? { path: file, type: 'jpeg', quality: 85 } : { path: file, type: 'png' });
    stamps.push(t);
    if (!o.scout && n % fps === 1) console.log(`[${tag}] ${t.toFixed(1)}s  ${((Date.now() - t0) / 1000).toFixed(0)}s gone`, JSON.stringify(await page.evaluate(() => window.__dir.stats())));
  }
  console.log(`[${tag}] ${n} frames of ${from}s..${to}s in ${((Date.now() - t0) / 1000).toFixed(0)}s -> ${dir}`, JSON.stringify(await page.evaluate(() => window.__dir.stats())));
  await browser.close();
  // What these frames are, for whoever cuts them (cut.cjs).
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ shot: o.shot, portrait: o.portrait, scout: o.scout, from, to, fps, every, frames: n }));

  if (o.scout && n > 0) {
    // The contact sheet: every picture with its second, six across.
    const cols = o.portrait ? 8 : 6;
    const w = o.portrait ? 270 : 480;
    const label = stamps.map((t, k) => `drawtext=text='${t.toFixed(1)}s':x=6:y=6:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.7:enable='eq(n\,${k})'`).join(',');
    const sheet = path.join(o.out, `${tag}-scout.jpg`);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', '1', '-i', path.join(dir, '%05d.jpg'), '-vf', `scale=${w}:-1,${label},tile=${cols}x${Math.ceil(n / cols)}`, '-frames:v', '1', '-q:v', '4', sheet]);
    console.log(`[${tag}] contact sheet -> ${sheet}`);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
