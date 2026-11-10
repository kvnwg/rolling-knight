/**
 * The capture's clock, injected into the page before the game loads (tools/trailer/capture.cjs).
 *
 * A browser without a graphics card draws this game at a few frames a second, far too slow to film.
 * So the page's time is taken away from it: performance.now, Date, requestAnimationFrame, timers and
 * CSS animations all stand still until `__clock.step(ms)` moves them on by exactly one frame's worth.
 * The capture steps, lets the page settle, takes a picture, and steps again: every frame of the film
 * is a frame the game drew, 1/60 s after the last, however long it took to draw.
 */
(() => {
  const realRaf = window.requestAnimationFrame.bind(window);
  const realTimeout = window.setTimeout.bind(window);
  const RealDate = Date;
  // The same film every time: a fixed date, and Math.random from a seed (?seed=N in the page's URL).
  const epoch = 1767225600000;
  let now = 0;
  let seed = (Number(new URLSearchParams(location.search).get('seed')) || 1) >>> 0;
  Math.random = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  performance.now = () => now;
  class FilmDate extends RealDate {
    constructor(...a) {
      if (a.length === 0) super(epoch + now);
      else super(...a);
    }
    static now() {
      return epoch + now;
    }
  }
  window.Date = FilmDate;

  // requestAnimationFrame: queued, run by step().
  let rafId = 1;
  let rafs = new Map();
  window.requestAnimationFrame = (cb) => {
    const id = rafId++;
    rafs.set(id, cb);
    return id;
  };
  window.cancelAnimationFrame = (id) => void rafs.delete(id);

  // Timers: due by the film's clock.
  let timerId = 1;
  const timers = new Map();
  const add = (fn, ms, args, every) => {
    const id = timerId++;
    const wait = Math.max(0, Number(ms) || 0);
    timers.set(id, { at: now + wait, fn, args, every: every ? Math.max(1, wait) : 0, id });
    return id;
  };
  window.setTimeout = (fn, ms, ...args) => add(fn, ms, args, false);
  window.setInterval = (fn, ms, ...args) => add(fn, ms, args, true);
  window.clearTimeout = window.clearInterval = (id) => void timers.delete(id);

  const call = (fn, args) => {
    try {
      if (typeof fn === 'function') fn(...args);
    } catch (e) {
      console.error('[clock]', e);
    }
  };

  // CSS animations and transitions: paused where they are found, moved on by the film's clock.
  const started = new WeakMap();
  const syncAnimations = () => {
    for (const a of document.getAnimations()) {
      try {
        if (!started.has(a)) {
          started.set(a, now);
          a.pause();
          a.currentTime = 0;
        } else {
          a.currentTime = now - started.get(a);
        }
      } catch {
        /* an animation that has gone away */
      }
    }
  };

  window.__clock = {
    get now() {
      return now;
    },
    /** Moves the film on by `ms`: timers that came due, then the frame's callbacks, then the animations. */
    step(ms) {
      const target = now + ms;
      for (let guard = 0; guard < 10000; guard++) {
        let next = null;
        for (const t of timers.values()) if (t.at <= target && (!next || t.at < next.at)) next = t;
        if (!next) break;
        now = Math.max(now, next.at);
        if (next.every) next.at += next.every;
        else timers.delete(next.id);
        call(next.fn, next.args);
      }
      now = target;
      const frame = [...rafs.values()];
      rafs = new Map();
      for (const cb of frame) call(cb, [now]);
      syncAnimations();
    },
    /** Resolves once the page has had real time to render what the step changed (React, layout, a paint). */
    settle() {
      return new Promise((done) => {
        realTimeout(() => {
          realRaf(() => {
            syncAnimations();
            realRaf(() => done(now));
          });
        }, 0);
      });
    },
  };
})();
