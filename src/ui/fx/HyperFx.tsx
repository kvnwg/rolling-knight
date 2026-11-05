/**
 * HYPER RARE's showcase (ported from Dumpster Legend's HyperFx.tsx), for the rarest find of the whole
 * game. The reveal plays on a longer clock with this drawn behind the knight:
 *
 * - the summoning (can't be skipped): stars warping in toward a point of light, a rainbow vortex
 *   spinning faster and faster, rings closing in, lightning striking the core harder and harder, a red
 *   alarm glow at the edges, the screen shaking, all of it sucked into the core at the end;
 * - the burst, as the knight rises out of it in silhouette: a white bloom, three shock waves, the vortex
 *   blown back out, a few hundred sparks with embers and beams of light;
 * - the count: a rainbow halo turning round the knight, sparks orbiting it, a firework for every rarity
 *   tier the counter passes and more in between;
 * - the landing: another burst, confetti raining down, fireworks and twinkles for as long as it's up.
 *
 * Everything is on one canvas of two canvas pixels per art pixel (whole art pixels: `snap`), scaled up
 * crisp to the screen. Reduce motion (`calm`) keeps the light and the halo, without the particles,
 * lightning or shaking, and stops once landed.
 */
import { useEffect, useRef, type MutableRefObject } from 'react';
import type { RevealPhases } from './revealTiming';
import s from './reveal.module.css';

/** What the reveal can ask of the showcase while it runs. */
export interface HyperHandle {
  /** A firework in `color` (the counter just passed a rarity tier). */
  firework(color: string): void;
}

/** The reveal's clock: started at `t0` (performance.now()), moved on by `offset` ms when skipped. */
export interface RevealClock {
  t0: number;
  offset: number;
}

const TAU = Math.PI * 2;
/** Canvas pixels per art pixel. */
const P = 2;
const RAIN = ['#ff5252', '#ff9f1c', '#ffe14d', '#69f0ae', '#40c4ff', '#7c6bff', '#e040fb'];
const BOLT = ['#8fd8ff', '#c48bff', '#ff8ad8'];
const CONFETTI = ['#ff5252', '#ffc233', '#5bc236', '#42a5f5', '#c48bff', '#ffffff'];

interface Part {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  col: string;
  /** Size in art pixels. */
  n: number;
  /** Velocity kept per second (1 = none lost). */
  drag: number;
  grav: number;
  /** 0 spark (blinks out at the end), 1 confetti (flips and sways), 2 rocket (trails, then bursts), 3 twinkle. */
  kind: 0 | 1 | 2 | 3;
  /** Rocket: the height it bursts at. Confetti: its sway phase. */
  aux: number;
}

interface Ring {
  r0: number;
  v: number;
  w: number;
  /** null: the rainbow, turning. */
  col: string | null;
  born: number;
  life: number;
  inward: boolean;
}

interface Bolt {
  pts: number[];
  born: number;
  life: number;
  col: string;
}

const snap = (v: number) => Math.round(v / P) * P;

export function HyperFx({
  clock,
  ph,
  color,
  calm,
  noFlash,
  fxRef,
  view,
}: {
  clock: MutableRefObject<RevealClock>;
  ph: RevealPhases;
  /** The knight's rarity color. */
  color: string;
  calm: boolean;
  noFlash: boolean;
  fxRef: MutableRefObject<HyperHandle | null>;
  /**
   * The screen in CSS px, the UI pixel unit, where the knight stands (CSS px from the top left) and its
   * half width (art pixels): the halo and the orbits ring it.
   */
  view: { w: number; h: number; u: number; ix: number; iy: number; half: number };
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const W = Math.max(2, Math.ceil((view.w * P) / view.u));
  const H = Math.max(2, Math.ceil((view.h * P) / view.u));
  const wide = W > H;
  // Where the knight stands (canvas px) and how big it is: read each frame, so a re-measure doesn't restart
  // the show. (Dumpster Legend's showcase was laid out round an item about 24 art pixels from middle to edge.)
  const geo = useRef({ cx: 0, cy: 0, f: 1 });
  geo.current = { cx: (view.ix * P) / view.u, cy: (view.iy * P) / view.u, f: Math.max(1, view.half / 24) };

  useEffect(() => {
    const c = ref.current;
    const g = c?.getContext('2d');
    if (!c || !g) return;
    const tDark = ph.black;
    const tBurst = ph.black + ph.dark;
    const tLit = tBurst + ph.appear;
    const tLand = tLit + ph.count;
    const beatMs = ph.dark / Math.max(1, ph.beats);
    let { cx, cy, f } = geo.current;
    let far = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy));
    let seed = 0x9e3779b9;
    const rnd = () => {
      seed = (seed + 0x6d2b79f5) >>> 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];

    // ------------------------------------------------------------------ the summoning
    const stars = Array.from({ length: calm ? 0 : 150 }, () => ({ a: rnd() * TAU, r: far * (0.12 + 1.0 * rnd()), sp: 0.55 + rnd(), col: rnd() < 0.25 ? pick(RAIN) : (null as string | null) }));
    const vortex = Array.from({ length: calm ? 0 : 96 }, (_, i) => ({ a: rnd() * TAU, r: far * (0.18 + 0.7 * rnd()), col: RAIN[i % RAIN.length] }));
    const bolts: Bolt[] = [];
    let nextBolt = tDark + 650;
    const rings: Ring[] = [];
    let nextRing = tDark + ph.dark * 0.3;
    // ------------------------------------------------------------------ after the burst
    const parts: Part[] = [];
    const buckets = new Map<string, Part[]>();
    const beams: Array<{ a: number; born: number; col: string }> = [];
    let burst = false;
    let landed = false;
    let bloom = 0;
    let shake = 0;
    let shakeX = 0;
    let shakeY = 0;
    let shakeAt = 0;
    let nextFirework = 0;
    let nextTwinkle = 0;
    let confettiLeft = 0;
    let lastNow = performance.now();
    let lastDraw = 0;
    let raf = 0;
    let still = false;

    const spark = (x: number, y: number, vx: number, vy: number, life: number, col: string, n = 1, drag = 0.12, grav = 260, kind: Part['kind'] = 0, aux = 0) => {
      if (parts.length < 1400) parts.push({ x, y, vx, vy, age: 0, life, col, n, drag, grav, kind, aux });
    };
    /** A burst of `n` sparks from (x, y): `speed` its fastest, colors from `cols`. */
    const explode = (x: number, y: number, n: number, speed: number, cols: readonly string[], life = 1.6, ring = false) => {
      for (let i = 0; i < n; i++) {
        const a = ring ? (i / n) * TAU + rnd() * 0.12 : rnd() * TAU;
        const v = ring ? speed * (0.85 + rnd() * 0.25) : speed * (0.15 + 0.85 * Math.pow(rnd(), 0.7));
        spark(x, y, Math.cos(a) * v, Math.sin(a) * v, life * (0.55 + rnd() * 0.65), pick(cols), rnd() < 0.15 ? 2 : 1, ring ? 0.3 : 0.12, ring ? 110 : 260);
      }
    };
    const rocket = (col: string) => {
      // From below the screen, away from the knight, bursting in the top or bottom third.
      let x = W * (0.08 + rnd() * 0.84);
      if (Math.abs(x - cx) < 60 * f) x += x < cx ? -70 * f : 70 * f;
      const top = rnd() < 0.62;
      const burstY = top ? H * (0.06 + rnd() * (wide ? 0.3 : 0.24)) : H * (wide ? 0.62 : 0.66) + rnd() * H * 0.14;
      const vy = -Math.sqrt(2 * 1100 * Math.max(40, H + 6 - burstY)) * (0.98 + rnd() * 0.06);
      spark(x, H + 6, (rnd() - 0.5) * 40, vy, 4, col, 1, 1, 1100, 2, burstY);
    };
    fxRef.current = { firework: (col) => !calm && rocket(col) };

    const doBurst = (el: number) => {
      burst = true;
      if (calm) return;
      // The vortex and the stars it swallowed are blown back out.
      for (const v of vortex) {
        const x = cx + Math.cos(v.a) * Math.min(v.r, 30);
        const y = cy + Math.sin(v.a) * Math.min(v.r, 30);
        const sp = 260 + rnd() * 520;
        spark(x, y, Math.cos(v.a) * sp, Math.sin(v.a) * sp, 0.8 + rnd() * 0.9, v.col, 1, 0.1, 140);
      }
      vortex.length = 0;
      stars.length = 0;
      bolts.length = 0;
      // (Rainbow and white only until it lands: the counter's climb through the tiers stays a surprise.)
      explode(cx, cy, 280, 760, [...RAIN, '#ffffff', '#ffffff'], 2.1);
      // Embers drifting up, slowly.
      for (let i = 0; i < 46; i++) {
        const a = rnd() * TAU;
        const v = 30 + rnd() * 110;
        spark(cx, cy, Math.cos(a) * v, Math.sin(a) * v - 30, 2.2 + rnd() * 1.8, pick(['#ffd23f', '#fff3b0', '#ffffff']), 1, 0.5, -36);
      }
      rings.length = 0;
      rings.push(
        { r0: 6, v: 860, w: 3 * P, col: '#ffffff', born: el, life: 640, inward: false },
        { r0: 4, v: 560, w: 2 * P, col: '#ffe14d', born: el, life: 860, inward: false },
        { r0: 2, v: 340, w: P, col: null, born: el, life: 1150, inward: false },
      );
      for (let i = 0; i < 22; i++) beams.push({ a: rnd() * TAU, born: el + rnd() * 90, col: rnd() < 0.5 ? '#ffffff' : pick(RAIN) });
      bloom = noFlash ? 0.45 : 1;
      shake = 7 * P;
    };
    const doLand = (el: number) => {
      landed = true;
      if (calm) return;
      explode(cx, cy, 170, 640, ['#ffd23f', '#fff3b0', '#ffffff', color, ...RAIN], 1.8);
      rings.push(
        { r0: 30 * f, v: 700, w: 2 * P, col: '#ffffff', born: el, life: 700, inward: false },
        { r0: 20 * f, v: 420, w: P, col: null, born: el, life: 1000, inward: false },
      );
      confettiLeft = 160;
      for (let i = 0; i < 3; i++) rocket(pick(RAIN));
      nextFirework = el + 900;
      shake = Math.max(shake, 4 * P);
      if (!noFlash) bloom = Math.max(bloom, 0.5);
    };

    const glow = (x: number, y: number, r: number, inner: string, outer: string, alpha: number) => {
      if (alpha <= 0.01 || r <= 0) return;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, inner);
      gr.addColorStop(0.3, outer);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = Math.min(1, alpha);
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
      g.globalAlpha = 1;
    };
    const ring = (r: number, w: number, col: string | null, alpha: number, turn: number) => {
      if (r <= 0 || alpha <= 0.01) return;
      g.globalAlpha = Math.min(1, alpha);
      g.lineWidth = w;
      if (col) {
        g.strokeStyle = col;
        g.beginPath();
        g.arc(cx, cy, r, 0, TAU);
        g.stroke();
      } else {
        for (let i = 0; i < RAIN.length; i++) {
          g.strokeStyle = RAIN[i];
          g.beginPath();
          g.arc(cx, cy, r, turn + (i / RAIN.length) * TAU, turn + ((i + 1) / RAIN.length) * TAU);
          g.stroke();
        }
      }
      g.globalAlpha = 1;
    };
    const jag = (x0: number, y0: number, x1: number, y1: number, n: number, amp: number) => {
      const pts = [x0, y0];
      const dx = x1 - x0;
      const dy = y1 - y0;
      const len = Math.hypot(dx, dy) || 1;
      for (let i = 1; i < n; i++) {
        const k = i / n;
        const off = (rnd() * 2 - 1) * amp * Math.sin(k * Math.PI);
        pts.push(x0 + dx * k + (-dy / len) * off, y0 + dy * k + (dx / len) * off);
      }
      pts.push(x1, y1);
      return pts;
    };
    const strike = (el: number) => {
      const side = Math.floor(rnd() * 4);
      const x0 = side === 0 || side === 2 ? rnd() * W : side === 1 ? W + 4 : -4;
      const y0 = side === 1 || side === 3 ? rnd() * H : side === 0 ? -4 : H + 4;
      const col = pick(BOLT);
      const pts = jag(x0, y0, cx + (rnd() - 0.5) * 8, cy + (rnd() - 0.5) * 8, 12, 26);
      bolts.push({ pts, born: el, life: 140, col });
      for (let b = 0; b < 2; b++) {
        if (rnd() < 0.55) continue;
        const k = 2 * (2 + Math.floor(rnd() * 7));
        const bx = pts[k];
        const by = pts[k + 1];
        const ang = Math.atan2(cy - by, cx - bx) + (rnd() < 0.5 ? 1 : -1) * (0.5 + rnd() * 0.8);
        const len = 24 + rnd() * 60;
        bolts.push({ pts: jag(bx, by, bx + Math.cos(ang) * len, by + Math.sin(ang) * len, 5, 10), born: el, life: 110, col });
      }
      if (!noFlash) bloom = Math.max(bloom, 0.16);
    };
    const twinkle = (x: number, y: number, n: number, col: string) => {
      const px = snap(x);
      const py = snap(y);
      g.fillStyle = col;
      g.fillRect(px, py, P, P);
      if (n < 1) return;
      g.fillRect(px - n * P, py, n * P, P);
      g.fillRect(px + P, py, n * P, P);
      g.fillRect(px, py - n * P, P, n * P);
      g.fillRect(px, py + P, P, n * P);
    };

    const frame = (now: number) => {
      if (still) return;
      raf = requestAnimationFrame(frame);
      ({ cx, cy, f } = geo.current);
      far = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy));
      const el = now - clock.current.t0 + clock.current.offset;
      // Once the landing has settled, 30 frames a second is plenty for the twinkles.
      if (el > tLand + 2500 && now - lastDraw < 30) return;
      lastDraw = now;
      const dt = Math.min(0.05, (now - lastNow) / 1000);
      lastNow = now;
      if (!burst && el >= tBurst) doBurst(el);
      if (!landed && el >= tLand) doLand(el);

      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, W, H);
      // The shake: whole art pixels, a new offset every 33 ms.
      const s01 = Math.max(0, Math.min(1, el / tBurst));
      const build = !burst && !calm ? s01 * s01 * 4 * P : 0;
      shake *= Math.exp(-dt / 0.28);
      const amp = calm ? 0 : Math.max(build, shake);
      if (now - shakeAt > 33) {
        shakeAt = now;
        shakeX = snap((rnd() * 2 - 1) * amp);
        shakeY = snap((rnd() * 2 - 1) * amp);
      }
      if (amp >= 1) g.setTransform(1, 0, 0, 1, shakeX, shakeY);

      if (!burst) {
        // ---------------------------------------------------------------- the summoning
        const sk = s01;
        const fadeIn = Math.min(1, el / ph.black);
        const implode = Math.max(0, Math.min(1, (el - (tBurst - 260)) / 260));
        // A deep violet haze and, at the edges, the alarm's red.
        glow(cx, cy, far * (0.5 + 0.5 * sk), 'rgba(90,40,160,0.9)', 'rgba(40,20,90,0.6)', fadeIn * (0.25 + 0.45 * sk) * (1 - implode));
        if (!calm) {
          const per = 420 - 240 * sk;
          const blink = noFlash ? 0.6 : Math.floor(el / per) % 2 ? 1 : 0.35;
          const edge = g.createRadialGradient(cx, cy, far * 0.5, cx, cy, far);
          edge.addColorStop(0, 'rgba(255,30,60,0)');
          edge.addColorStop(1, 'rgba(255,30,60,1)');
          g.globalAlpha = fadeIn * (0.12 + 0.4 * sk) * blink * (1 - implode);
          g.fillStyle = edge;
          g.fillRect(-16, -16, W + 32, H + 32);
          g.globalAlpha = 1;
        }
        // Rings closing in on the core.
        if (!calm && el >= nextRing && el < tBurst - 300) {
          rings.push({ r0: far * 0.85, v: 0, w: P, col: pick([...RAIN, '#ffffff']), born: el, life: 520, inward: true });
          nextRing = el + 300 - 120 * sk;
        }
        // Stars warping in.
        const speed = (60 + 1100 * Math.pow(sk, 2.2)) * (1 + 5 * implode);
        g.lineCap = 'square';
        g.lineWidth = P;
        for (const st of stars) {
          st.r -= speed * st.sp * dt;
          if (st.r < 4) {
            st.a = rnd() * TAU;
            st.r = far * (0.95 + rnd() * 0.2);
          }
        }
        for (let pass = 0; pass < 2; pass++) {
          if (pass === 0) {
            for (let k = 0; k < 4; k++) {
              g.strokeStyle = `rgba(235,242,255,${(0.25 + k * 0.25) * fadeIn})`;
              g.beginPath();
              for (const st of stars) {
                if (st.col) continue;
                const b = Math.min(3, Math.floor((1 - st.r / far) * 4));
                if (b !== k) continue;
                const len = Math.min(46, 2 + speed * st.sp * 0.04);
                const ca = Math.cos(st.a);
                const sa = Math.sin(st.a);
                g.moveTo(snap(cx + ca * st.r), snap(cy + sa * st.r));
                g.lineTo(snap(cx + ca * (st.r + len)), snap(cy + sa * (st.r + len)));
              }
              g.stroke();
            }
          } else {
            for (const col of RAIN) {
              g.strokeStyle = col;
              g.globalAlpha = fadeIn;
              g.beginPath();
              for (const st of stars) {
                if (st.col !== col) continue;
                const len = Math.min(46, 2 + speed * st.sp * 0.04);
                const ca = Math.cos(st.a);
                const sa = Math.sin(st.a);
                g.moveTo(snap(cx + ca * st.r), snap(cy + sa * st.r));
                g.lineTo(snap(cx + ca * (st.r + len)), snap(cy + sa * (st.r + len)));
              }
              g.stroke();
              g.globalAlpha = 1;
            }
          }
        }
        // The rainbow vortex, faster and tighter as it builds.
        for (const v of vortex) {
          const w = (0.9 + 9 * sk * sk) * (1 + 2 * implode) * Math.sqrt(60 / Math.max(14, v.r));
          v.a += w * dt;
          v.r -= (14 + 210 * sk * sk) * (1 + 7 * implode) * dt;
          if (v.r < 5) {
            v.r = far * (0.45 + rnd() * 0.45);
            v.a = rnd() * TAU;
          }
        }
        g.lineWidth = P;
        g.lineCap = 'butt';
        for (const col of RAIN) {
          g.strokeStyle = col;
          g.globalAlpha = fadeIn * (0.55 + 0.45 * sk);
          g.beginPath();
          for (const v of vortex) {
            if (v.col !== col) continue;
            const arc = Math.min(0.9, (0.05 + 0.5 * sk) * (24 / Math.max(10, v.r)) * 6);
            g.moveTo(cx + Math.cos(v.a - arc) * v.r, cy + Math.sin(v.a - arc) * v.r);
            g.arc(cx, cy, v.r, v.a - arc, v.a);
          }
          g.stroke();
        }
        g.globalAlpha = 1;
        // The core: growing, throbbing with each heartbeat, swallowed to a point at the end.
        const k = el >= tDark ? Math.floor((el - tDark) / beatMs) : -1;
        const pulse = k >= 0 && !calm ? Math.exp(-(el - (tDark + k * beatMs)) / 150) : 0;
        let rc = (3 + 24 * sk * sk) * (1 + 0.5 * pulse);
        if (implode > 0) rc *= Math.max(0.1, 1 - implode);
        glow(cx, cy, rc * 4.5, 'rgba(255,255,255,1)', RAIN[Math.floor(el / 110) % RAIN.length], fadeIn * (0.7 + 0.3 * pulse));
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.arc(cx, cy, Math.max(P, rc * 0.7), 0, TAU);
        g.fill();
        if (!calm && Math.floor(el / 70) % 2 === 0) twinkle(cx, cy, Math.max(2, Math.round(rc / 3)), '#ffffff');
        // Lightning, more often as it builds.
        if (!calm && !noFlash && el >= nextBolt && el < tBurst - 120) {
          strike(el);
          nextBolt = el + (320 - 250 * Math.pow(sk, 1.4)) * (0.6 + 0.8 * rnd());
        }
        for (let i = bolts.length - 1; i >= 0; i--) {
          const b = bolts[i];
          const age = el - b.born;
          if (age > b.life) {
            bolts.splice(i, 1);
            continue;
          }
          // On, off and on again, as lightning does.
          if (age > 50 && age < 72) continue;
          g.lineJoin = 'miter';
          for (const [w, col, a] of [[3 * P, b.col, 0.55], [P, '#ffffff', 1]] as const) {
            g.globalAlpha = a;
            g.strokeStyle = col;
            g.lineWidth = w;
            g.beginPath();
            g.moveTo(b.pts[0], b.pts[1]);
            for (let j = 2; j < b.pts.length; j += 2) g.lineTo(b.pts[j], b.pts[j + 1]);
            g.stroke();
          }
          g.globalAlpha = 1;
        }
      } else {
        // ---------------------------------------------------------------- burst, count, landing
        const since = el - tBurst;
        // The light behind the knight: blazing at the burst, settling to a glow.
        glow(cx, cy, (150 + 60 * Math.exp(-since / 500)) * f, 'rgba(255,255,255,1)', landed ? color : 'rgba(255,240,200,0.8)', calm ? 0.35 : 0.3 + 0.6 * Math.exp(-since / 700));
        // Beams of light shooting out.
        for (let i = beams.length - 1; i >= 0; i--) {
          const b = beams[i];
          const age = el - b.born;
          if (age < 0) continue;
          if (age > 300) {
            beams.splice(i, 1);
            continue;
          }
          const k = age / 300;
          g.globalAlpha = 1 - k;
          g.strokeStyle = b.col;
          g.lineWidth = P * (2 - k);
          g.beginPath();
          g.moveTo(cx + Math.cos(b.a) * 20 * f * (1 + 4 * k), cy + Math.sin(b.a) * 20 * f * (1 + 4 * k));
          g.lineTo(cx + Math.cos(b.a) * far * Math.min(1, 0.3 + 3 * k), cy + Math.sin(b.a) * far * Math.min(1, 0.3 + 3 * k));
          g.stroke();
          g.globalAlpha = 1;
        }
        // The halo turning round the knight, and a thinner one the other way, once it's lit.
        if (el >= tLit) {
          const turn = calm ? 0 : ((el - tLit) / 1000) * 2.4;
          const lit = Math.min(1, (el - tLit) / 300);
          g.lineCap = 'butt';
          g.lineWidth = 2 * P;
          for (let i = 0; i < 14; i++) {
            g.strokeStyle = RAIN[i % RAIN.length];
            g.globalAlpha = 0.85 * lit;
            g.beginPath();
            g.arc(cx, cy, 76 * f, turn + (i / 14) * TAU, turn + ((i + 0.62) / 14) * TAU);
            g.stroke();
          }
          g.lineWidth = P;
          for (let i = 0; i < 24; i++) {
            g.strokeStyle = i % 2 ? '#ffffff' : RAIN[(i >> 1) % RAIN.length];
            g.globalAlpha = 0.6 * lit;
            g.beginPath();
            g.arc(cx, cy, 94 * f, -turn * 0.7 + (i / 24) * TAU, -turn * 0.7 + ((i + 0.4) / 24) * TAU);
            g.stroke();
          }
          g.globalAlpha = 1;
          // Sparks orbiting it.
          if (!calm) {
            for (let i = 0; i < 20; i++) {
              const a = turn * 0.8 + (i / 20) * TAU;
              const x = cx + Math.cos(a) * 132 * f;
              const y = cy + Math.sin(a) * 46 * f + Math.cos(a) * 14 * f;
              g.fillStyle = i % 3 ? RAIN[i % RAIN.length] : '#ffffff';
              g.fillRect(snap(x), snap(y), P, P);
              g.globalAlpha = 0.5;
              g.fillRect(snap(cx + Math.cos(a - 0.08) * 132 * f), snap(cy + Math.sin(a - 0.08) * 46 * f + Math.cos(a - 0.08) * 14 * f), P, P);
              g.globalAlpha = 1;
            }
          }
        }
        // Fireworks in between the counter's tiers, and on and on once it has landed.
        if (!calm && el >= tLit && el >= nextFirework) {
          rocket(pick(RAIN));
          nextFirework = el + (landed ? 1500 : 560) * (0.75 + rnd() * 0.5);
        }
        if (!calm && confettiLeft > 0) {
          const n = Math.min(confettiLeft, Math.ceil(dt * 70));
          confettiLeft -= n;
          for (let i = 0; i < n; i++) spark(rnd() * W, -6 - rnd() * 30, 0, 50 + rnd() * 70, 9, pick(CONFETTI), 1, 1, 0, 1, rnd() * TAU);
        }
        if (!calm && landed && el >= nextTwinkle) {
          const a = rnd() * TAU;
          const r = (60 + rnd() * 160) * f;
          spark(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.9, 0, 0, 0.55, rnd() < 0.5 ? '#ffffff' : pick(RAIN), 1, 1, 0, 3);
          nextTwinkle = el + 110;
        }
      }
      // Rings (closing in during the summoning, shock waves after).
      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i];
        const k = (el - r.born) / r.life;
        if (k >= 1) {
          rings.splice(i, 1);
          continue;
        }
        if (r.inward) ring(r.r0 * Math.pow(1 - k, 1.4), r.w, r.col, 0.15 + 0.7 * k, 0);
        else ring(r.r0 + (r.v * (el - r.born)) / 1000, r.w * (1 - 0.5 * k), r.col, 1 - k, el / 300);
      }
      // Sparks, embers, rockets, confetti and twinkles.
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.age += dt;
        if (p.age >= p.life || p.y > H + 40) {
          parts[i] = parts[parts.length - 1];
          parts.pop();
          continue;
        }
        if (p.kind === 2) {
          // A rocket: up, trailing sparks, then it bursts.
          p.vy += p.grav * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          spark(p.x, p.y + 2, (rnd() - 0.5) * 20, 20 + rnd() * 20, 0.3, '#ffe9a8', 1, 0.2, 40);
          if (p.y <= p.aux || p.vy >= -30) {
            explode(p.x, p.y, 54, 150, [p.col, p.col, '#ffffff'], 1.25, true);
            explode(p.x, p.y, 12, 70, [p.col, '#ffffff'], 0.9);
            p.age = p.life;
          }
        } else if (p.kind === 1) {
          // Confetti: falling, swaying side to side.
          p.y += p.vy * dt;
          p.x += Math.cos(p.aux + p.age * 3) * 22 * dt;
        } else if (p.kind === 0) {
          const keep = Math.pow(p.drag, dt);
          p.vx *= keep;
          p.vy = p.vy * keep + p.grav * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
        }
      }
      // Drawn a color at a time.
      for (const list of buckets.values()) list.length = 0;
      for (const p of parts) {
        let list = buckets.get(p.col);
        if (!list) buckets.set(p.col, (list = []));
        list.push(p);
      }
      for (const [col, list] of buckets) {
        if (!list.length) continue;
        g.fillStyle = col;
        for (const p of list) {
          const k = p.age / p.life;
          // Sparks blink out at the end of their lives instead of fading.
          if (p.kind === 0 && k > 0.7 && Math.floor(p.age * 18) % 2 === 1) continue;
          if (p.kind === 1) {
            const flat = Math.floor(p.age * 6 + p.aux) % 2 === 0;
            g.fillRect(snap(p.x), snap(p.y), flat ? 2 * P : P, flat ? P : 2 * P);
          } else if (p.kind === 3) twinkle(p.x, p.y, k < 0.3 ? 0 : k < 0.7 ? 2 : 1, col);
          else g.fillRect(snap(p.x), snap(p.y), p.n * P, p.n * P);
        }
      }
      // The bloom: white over everything here (under the knight, which rises out of it in silhouette).
      if (bloom > 0.01) {
        g.setTransform(1, 0, 0, 1, 0, 0);
        glow(cx, cy, far * 1.2, 'rgba(255,255,255,1)', 'rgba(255,255,255,0.85)', bloom);
        bloom *= Math.exp(-dt / (burst ? 0.16 : 0.05));
      }
      // Reduce motion: once landed, it's a still picture.
      if (calm && landed && el > tLand + 400) still = true;
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      fxRef.current = null;
    };
    // The showcase restarts only if the screen changes size.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [W, H]);

  return <canvas ref={ref} className={s.hyperFx} width={W} height={H} style={{ width: (W * view.u) / P, height: (H * view.u) / P }} aria-hidden />;
}

/** HYPER RARE's warning bands while it summons: hazard stripes and its name racing past, top and bottom. */
export function HyperBands({ words, repeats }: { words: string; repeats: number }) {
  const run = Array.from({ length: Math.max(2, repeats) }, () => `${words}  !!  `).join('');
  return (
    <>
      {(['top', 'bottom'] as const).map((at) => (
        <div key={at} className={s.hyperBand} data-at={at} aria-hidden>
          <div className={s.hyperTrack}>
            <span>{run}</span>
            <span>{run}</span>
          </div>
        </div>
      ))}
    </>
  );
}
