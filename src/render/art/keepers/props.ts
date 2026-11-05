/**
 * The things round the keepers in their screens' scenes, drawn about four times closer than the hub
 * (a bottle is a dozen pixels tall here): walls of planks and stone, beams, shelves, bottles that
 * glow, jars, books, brass gears, candles, hanging lanterns, velvet drapes, a slate of chalked
 * upgrades, a forge and an anvil, a balance, a crystal orb, notes pinned to a board, sigil stones,
 * a rising sun, a window on the night, curios, a weapon rack, a map, a banner, a ledger, coins and
 * flowers. Same materials and light (top left) as the hub's kit (hubKit.ts); things that glow paint
 * their emissive pixels and carry their own light for light.ts.
 */
import { mixHex } from '../draw';
import { blocks, GOLD, h2, IRON, Layer, LEAF, oval, PLANK, planks, poly, rk, rkd, sphere, STONE, timber, TIMBER, vnoise, type Ramp } from '../hubKit';

export const BRASS: Ramp = ['#3a200c', '#5e3812', '#8a5a1a', '#b8862a', '#e0b040', '#f8d468', '#fff0a8'];
export const WAX: Ramp = ['#a8987c', '#d0c4a8', '#ece2cc', '#fff8ec'];
export const EMBER: Ramp = ['#5a0e04', '#9a2208', '#d8460c', '#ff7a1a', '#ffb040', '#ffe080', '#fff8d0'];
export const SLATE_R: Ramp = ['#14161c', '#1c2028', '#252a34', '#30363f'];
export const PARCH: Ramp = ['#9a7a4e', '#c4a472', '#e2c896', '#f2e0b8', '#fff4dc'];

// ------------------------------------------------------------------ walls

/** Boards side by side (vertical) or stacked (horizontal) across a rectangle. */
export function wallPlanks(L: Layer, x0: number, y0: number, x1: number, y1: number, seed: number, ramp: Ramp = PLANK, dir: 'v' | 'h' = 'v', base?: number): void {
  planks(L, x0, y0, x1 - x0, y1 - y0, { dir, board: dir === 'v' ? 8 : 6, seed, ramp, joint: 46, nails: true, base: base ?? ramp.length * 0.42 });
}

/** Dressed stone in courses. */
export function wallStone(L: Layer, x0: number, y0: number, x1: number, y1: number, seed: number, ramp: Ramp = STONE): void {
  blocks(L, x0, y0, x1 - x0, y1 - y0, { bw: 14, bh: 8, seed, ramp, base: ramp.length * 0.5 });
}

/** Plaster, warm and a little uneven, over a rectangle. */
export function wallPlaster(L: Layer, x0: number, y0: number, x1: number, y1: number, seed: number, ramp: Ramp): void {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) L.px(x, y, rkd(ramp, ramp.length * 0.55 + (vnoise(x, y, 9, 6, seed) - 0.5) * 1.6 + (h2(x, y, seed) < 0.03 ? -0.8 : 0), x, y));
}

/** A squared beam across, or a post down. */
export function beam(L: Layer, x0: number, y0: number, x1: number, y1: number, seed: number, ramp: Ramp = TIMBER): void {
  timber(L, x0, y0, x1 - x0, y1 - y0, seed, ramp, 3.6);
}

/** A shelf board with two brackets, its shadow on the wall under it. */
export function shelf(L: Layer, x0: number, x1: number, y: number, ramp: Ramp = PLANK): void {
  for (let x = x0; x < x1; x++) {
    L.px(x, y, rk(ramp, 6));
    L.px(x, y + 1, rk(ramp, 4.4 + (h2(x, y, 3) - 0.5)));
    L.px(x, y + 2, rk(ramp, 2.6));
    L.px(x, y + 3, rk(ramp, 0.5));
    L.tone(x, y + 4, -0.32);
    L.tone(x, y + 5, -0.16);
  }
  for (const bx of [x0 + 3, x1 - 5]) {
    for (let i = 0; i < 4; i++) {
      L.px(bx + i, y + 3 + i, rk(ramp, 2));
      L.px(bx + i + 1, y + 3 + i, rk(ramp, 1));
    }
  }
}

// ------------------------------------------------------------------ glass and goods

/**
 * A glass bottle standing at (x, foot): a round or square body, a neck, a cork, the liquid inside (it
 * glows if `glow`), a highlight down the left, a label now and then.
 */
export function bottle(L: Layer, x: number, foot: number, o: { h: number; w: number; liquid: string; glow?: boolean; label?: boolean; round?: boolean; seed: number }): void {
  const body = o.h - 4;
  const liq = [mixHex(o.liquid, '#0a0410', 0.5), o.liquid, mixHex(o.liquid, '#ffffff', 0.35), mixHex(o.liquid, '#ffffff', 0.7)];
  const glass = ['#22303a', '#3e5a66', '#8ab0b8', '#e0f4f4'];
  const level = foot - Math.floor(body * (0.45 + h2(o.seed, 1, 5) * 0.4));
  for (let y = foot - body; y <= foot; y++) {
    const t = (y - (foot - body)) / body;
    const hw = o.round ? Math.round((o.w / 2) * Math.sqrt(Math.max(0.2, 1 - Math.pow(1 - t * 1.25, 2)))) : Math.floor(o.w / 2) - (t < 0.12 ? 1 : 0);
    for (let dx = -hw; dx <= hw; dx++) {
      const X = x + dx;
      const edge = Math.abs(dx) === hw;
      let c: string;
      if (y >= level) {
        const k = 1.6 - dx / (hw + 1) + (y === level ? 1.2 : 0);
        c = rk(liq, k);
        if (o.glow && !edge) L.gl(X, y, mixHex(c, '#ffffff', 0.15), c);
      } else c = rk(glass, edge ? 1 : 0.6 + (dx < 0 ? 0.5 : 0));
      if (edge) c = rk(glass, dx < 0 ? 2 : 0.6);
      if (!(o.glow && y >= level && !edge)) L.px(X, y, c);
      // The highlight down the left.
      if (dx === -hw + 1 && y > foot - body + 1 && y < foot - 1) L.px(X, y, rk(glass, 3));
    }
  }
  // Neck, lip and cork.
  const top = foot - body;
  for (let y = top - 3; y < top; y++) {
    L.px(x, y, rk(glass, 2));
    L.px(x + 1, y, rk(glass, 0.8));
    if (o.w >= 6) L.px(x - 1, y, rk(glass, 2.6));
  }
  L.px(x, top - 4, '#a8783e');
  L.px(x + 1, top - 4, '#7a5028');
  if (o.w >= 6) L.px(x - 1, top - 4, '#c89a5a');
  if (o.label && body >= 7) {
    const ly = foot - Math.floor(body / 2);
    for (let dx = -Math.floor(o.w / 2) + 1; dx <= Math.floor(o.w / 2) - 1; dx++) {
      L.px(x + dx, ly, rk(PARCH, 3 - dx * 0.3));
      L.px(x + dx, ly + 1, rk(PARCH, 2.4 - dx * 0.3));
    }
  }
  if (o.glow) L.light(x, foot - body / 2, 16 + o.h, o.liquid, 0.25);
}

/** A wide jar with a lid, things in it (pickled who-knows, buttons, screws). */
export function jar(L: Layer, x: number, foot: number, w: number, h: number, inside: string, seed: number): void {
  const ins = [mixHex(inside, '#0a0410', 0.5), inside, mixHex(inside, '#ffffff', 0.3)];
  for (let y = foot - h + 2; y <= foot; y++) {
    for (let dx = -Math.floor(w / 2); dx <= Math.floor(w / 2); dx++) {
      const edge = Math.abs(dx) === Math.floor(w / 2);
      let c = edge ? '#3e5a66' : rk(ins, 1 + (h2(x + dx, y, seed) < 0.3 ? 1 : 0) - dx / w);
      if (dx === -Math.floor(w / 2) + 1) c = '#cfe8e8';
      L.px(x + dx, y, c);
    }
  }
  for (let dx = -Math.floor(w / 2) - 1; dx <= Math.floor(w / 2) + 1; dx++) {
    L.px(x + dx, foot - h + 1, rk(BRASS, 4 - dx * 0.2));
    L.px(x + dx, foot - h, rk(BRASS, 5 - dx * 0.2));
  }
}

/** A row of books, spines out, of different heights and colors, from x for `w` pixels. */
export function books(L: Layer, x: number, foot: number, w: number, seed: number, max = 11): void {
  const cols = ['#7a2a2a', '#2a4a7a', '#2e6a3e', '#6a4a8a', '#8a6a2a', '#3a3a4a', '#a8582a'];
  let i = 0;
  for (let bx = x; bx < x + w; ) {
    const bw = 2 + Math.floor(h2(i, 1, seed) * 2.4);
    const bh = Math.round(max * (0.62 + h2(i, 2, seed) * 0.38));
    const c = cols[Math.floor(h2(i, 3, seed) * cols.length)];
    const r = [mixHex(c, '#0a0408', 0.5), c, mixHex(c, '#ffffff', 0.3)];
    const lean = h2(i, 4, seed) < 0.12 && bx + bw + 2 < x + w;
    for (let yy = 0; yy < bh; yy++) {
      for (let k = 0; k < bw; k++) {
        const X = bx + k + (lean ? Math.floor(yy / 4) : 0);
        let col = rk(r, k === 0 ? 2 : k === bw - 1 ? 0 : 1);
        // Gold bands across the spine.
        if (yy === 2 || yy === bh - 3) col = k === 0 ? '#f0c850' : '#b8862a';
        L.px(X, foot - yy, col);
      }
    }
    bx += bw + (lean ? 2 : 0);
    i++;
  }
}

/** A brass gear: teeth round a ring, spokes, a hub. Turned by `turn` (radians). */
export function gear(L: Layer, cx: number, cy: number, r: number, teeth: number, o: { ramp?: Ramp; turn?: number; spokes?: number } = {}): void {
  const ramp = o.ramp ?? BRASS;
  const turn = o.turn ?? 0;
  for (let y = Math.floor(cy - r - 2); y <= Math.ceil(cy + r + 2); y++) {
    for (let x = Math.floor(cx - r - 2); x <= Math.ceil(cx + r + 2); x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = Math.hypot(dx, dy);
      const a = Math.atan2(dy, dx) - turn;
      const tooth = Math.cos(a * teeth) > 0.2;
      const outer = r + (tooth ? 2 : 0);
      if (d > outer) continue;
      const hub = d < r * 0.28;
      const ring = d > r * 0.62;
      const spokeN = o.spokes ?? 4;
      const spoke = Math.abs(Math.sin((a + turn * 0) * spokeN / 2 * 2)) < 0.22 * (r / Math.max(1, d)) + 0.06;
      if (!hub && !ring && !spoke) continue;
      if (d < r * 0.12) continue;
      const lit = (-dx - dy) / (r * 1.4);
      let k = 3.4 + lit * 2;
      if (d > outer - 1) k -= 1.4;
      if (ring && d < r * 0.66) k -= 1;
      L.px(x, y, rk(ramp, k));
    }
  }
}

/** A candle at (x, foot): wax with a drip, a wick, a glowing flame, and its light. */
export function candle(L: Layer, x: number, foot: number, h: number, o: { w?: number; light?: number } = {}): void {
  const w = o.w ?? 2;
  for (let y = foot - h + 1; y <= foot; y++) {
    for (let k = 0; k < w; k++) L.px(x + k, y, rk(WAX, k === 0 ? 3 : k === w - 1 ? 1 : 2));
  }
  L.px(x - 1, foot - h + 3, rk(WAX, 2));
  L.px(x + w - 1, foot - h + 1, rk(WAX, 3));
  L.px(x, foot - h, '#3a2a24');
  L.gl(x, foot - h - 1, '#ff9a3a');
  L.gl(x, foot - h - 2, '#ffd060');
  L.gl(x, foot - h - 3, '#fff4c0');
  if (w > 2) L.gl(x + 1, foot - h - 2, '#ffb040');
  L.halo(x, foot - h - 4, '#ffd060', 0.6);
  L.light(x, foot - h - 2, 30, '#ffb060', o.light ?? 0.42, 0.35);
}

/** A lantern hanging on a chain from y0, its glass at (x, y) lit. */
export function lantern(L: Layer, x: number, y0: number, y: number, o: { color?: string; light?: number; r?: number } = {}): void {
  for (let yy = y0; yy < y - 5; yy++) L.px(x, yy, yy % 2 ? '#2a2420' : '#4a423a');
  const glowC = o.color ?? '#ffd27a';
  // Cap.
  for (let dx = -3; dx <= 3; dx++) L.px(x + dx, y - 5, rk(IRON, 3 - Math.abs(dx) * 0.4));
  for (let dx = -2; dx <= 2; dx++) L.px(x + dx, y - 6, rk(IRON, 2));
  // Glass between bars.
  for (let yy = y - 4; yy <= y + 3; yy++) {
    for (let dx = -3; dx <= 3; dx++) {
      if (Math.abs(dx) === 3 || dx === 0) L.px(x + dx, yy, rk(IRON, dx < 0 ? 3 : 1.6));
      else L.gl(x + dx, yy, mixHex(glowC, '#ffffff', yy < y ? 0.3 : 0.05));
    }
  }
  for (let dx = -3; dx <= 3; dx++) L.px(x + dx, y + 4, rk(IRON, 2.6 - dx * 0.3));
  L.light(x, y, o.r ?? 70, glowC, o.light ?? 0.75, 0.12);
}

/** A tall drape of velvet hanging in folds from y0 to y1, its trim and tassels at the foot. */
export function drape(L: Layer, x0: number, x1: number, y0: number, y1: number, ramp: Ramp, o: { trim?: Ramp; seed: number; gather?: number }): void {
  const fold = 7 + Math.floor(h2(o.seed, 1, 3) * 3);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const p = ((x - x0) / fold) * Math.PI * 2;
      // Folds: light on the crest, dark in the valley; gathered tighter toward the top.
      const g = Math.sin(p + (y - y0) * 0.02 * (o.gather ?? 0));
      let k = ramp.length * 0.48 + g * 1.5 - (x - x0) / (x1 - x0) * 0.4 + (vnoise(x, y, 3, 14, o.seed) - 0.5) * 0.4;
      if (g > 0.85) k += 0.8;
      L.px(x, y, rkd(ramp, k, x, y));
    }
  }
  if (o.trim) {
    for (let x = x0; x < x1; x++) {
      L.px(x, y1 - 2, rk(o.trim, 4 - (x % 3 === 0 ? 1 : 0)));
      L.px(x, y1 - 1, rk(o.trim, 2.4));
      if (x % 4 === 1) {
        L.px(x, y1, rk(o.trim, 3));
        L.px(x, y1 + 1, rk(o.trim, 2));
      }
    }
  }
}

/** A slate board in a wooden frame with upgrades chalked on it: icons and little price ticks. */
export function slateBoard(L: Layer, x: number, y: number, w: number, h: number, seed: number): void {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      const edge = Math.min(xx - x, yy - y, x + w - 1 - xx, y + h - 1 - yy);
      if (edge < 2) L.px(xx, yy, rk(PLANK, edge === 0 ? 1 : yy === y + 1 || xx === x + 1 ? 5 : 3));
      else L.px(xx, yy, rkd(SLATE_R, 1.4 + (vnoise(xx, yy, 6, 4, seed) - 0.5) * 1.2, xx, yy));
    }
  }
  const chalk = '#e8e4d8';
  const dim = '#a8a49a';
  // Icons in two rows: a clover, a coin, an hourglass / a boot, a gear, an arrow up.
  const icons: Record<string, string[]> = {
    clover: ['.x.x.', 'xxxxx', '.xxx.', 'xx.xx', '..x..'],
    coin: ['.xxx.', 'x.x.x', 'x.x.x', 'x.x.x', '.xxx.'],
    glass: ['xxxxx', '.x.x.', '..x..', '.x.x.', 'xxxxx'],
    boot: ['.xx..', '.xx..', '.xx..', '.xxxx', 'xxxxx'],
    cog: ['.x.x.', 'xxxxx', '.x.x.', 'xxxxx', '.x.x.'],
    up: ['..x..', '.xxx.', 'x.x.x', '..x..', '..x..'],
  };
  const list = ['clover', 'coin', 'glass', 'boot', 'cog', 'up'];
  const per = Math.max(1, Math.floor((w - 6) / 12));
  list.forEach((name, i) => {
    const col = i % per;
    const row = Math.floor(i / per);
    const ix = x + 4 + col * 12;
    const iy = y + 4 + row * 10;
    if (iy + 8 > y + h - 2) return;
    icons[name].forEach((r, ry) => [...r].forEach((ch, rx) => ch === 'x' && L.px(ix + rx, iy + ry, chalk)));
    // A price tick or two beside it.
    for (let t = 0; t < 1 + (i % 3); t++) L.px(ix + 7, iy + 1 + t * 2, dim);
    L.px(ix + 8, iy + 1, dim);
  });
  // A chalk line and a smudge.
  for (let xx = x + 4; xx < x + w - 4; xx += 2) if (h2(xx, 3, seed) < 0.7) L.px(xx, y + h - 4, dim);
}

// ------------------------------------------------------------------ the smithy

/** A forge: a stone hearth with an arched mouth full of glowing coals, a hood and chimney above. */
export function forge(L: Layer, x0: number, x1: number, y0: number, foot: number, seed: number): void {
  blocks(L, x0, y0, x1 - x0, foot - y0, { bw: 9, bh: 6, seed, ramp: ['#1e1416', '#2e2224', '#463436', '#5e4a48', '#7a6260', '#988078'], base: 3 });
  const mx = Math.floor((x0 + x1) / 2);
  const mw = Math.floor((x1 - x0) * 0.32);
  const mTop = Math.floor(y0 + (foot - y0) * 0.38);
  // The mouth: an arch of fire.
  for (let y = mTop; y < foot - 3; y++) {
    for (let x = mx - mw; x <= mx + mw; x++) {
      const nx = (x - mx) / mw;
      const arch = mTop + Math.round(Math.pow(Math.abs(nx), 2.2) * 5);
      if (y < arch) continue;
      const t = (y - mTop) / (foot - 3 - mTop);
      const flick = h2(x, Math.floor(y / 2), seed);
      const k = 1.5 + t * 4.2 - Math.abs(nx) * 1.2 + (flick - 0.5) * 1.4;
      L.gl(x, y, rk(EMBER, k));
    }
    // The arch's stones, dark and glowing at their edge.
    L.px(mx - mw - 1, y, '#3a2220');
    L.px(mx + mw + 1, y, '#2a1818');
  }
  for (let x = mx - mw - 2; x <= mx + mw + 2; x++) {
    const nx = (x - mx) / (mw + 2);
    const y = mTop - 1 + Math.round(Math.pow(Math.abs(nx), 2.2) * 5);
    L.px(x, y, '#5a3a30');
    L.halo(x, y + 1, '#ff7a1a', 0.5);
  }
  // A ledge of stone at the foot.
  for (let x = x0 - 2; x < x1 + 2; x++) {
    L.px(x, foot - 3, rk(STONE, 5));
    L.px(x, foot - 2, rk(STONE, 3));
    L.px(x, foot - 1, rk(STONE, 1));
  }
  // The hood over it.
  poly(L, [[x0 - 4, y0], [x1 + 4, y0], [x1 - 6, y0 - 14], [x0 + 6, y0 - 14]], (x, y) => rkd(IRON, 2.4 - (x - mx) / 30 + (y === y0 - 1 ? -1 : 0), x, y));
  for (let x = x0 - 4; x <= x1 + 4; x++) L.px(x, y0, rk(IRON, 1));
  L.light(mx, foot - 8, 110, '#ff8a3a', 1.15, 0.35);
}

/** An anvil standing with its foot at (cx, foot), a hot blade on it. */
export function anvil(L: Layer, cx: number, foot: number, hot = true): void {
  const r = IRON;
  // The face and the horn.
  for (let x = cx - 9; x <= cx + 8; x++) {
    L.px(x, foot - 11, rk(r, 5));
    L.px(x, foot - 10, rk(r, 4));
    L.px(x, foot - 9, rk(r, 3));
    L.px(x, foot - 8, rk(r, 1.6));
  }
  for (let i = 0; i < 6; i++) {
    L.px(cx - 10 - i, foot - 10 + Math.floor(i / 3), rk(r, 4 - i * 0.3));
    L.px(cx - 10 - i, foot - 9 + Math.floor(i / 3), rk(r, 2));
  }
  // The waist and the foot.
  for (let y = foot - 7; y <= foot - 3; y++) for (let x = cx - 4; x <= cx + 4; x++) L.px(x, y, rk(r, 2.6 - (x - cx) / 4));
  for (let y = foot - 2; y <= foot; y++) for (let x = cx - 8; x <= cx + 8; x++) L.px(x, y, rk(r, 2.4 - (x - cx) / 6 - (y - foot + 2) * 0.4));
  if (hot) {
    // A blade, red-hot at its tip.
    for (let x = cx - 6; x <= cx + 6; x++) {
      const t = (x - cx + 6) / 12;
      const c = rk(EMBER, 2 + t * 4);
      if (t > 0.35) L.gl(x, foot - 12, c);
      else L.px(x, foot - 12, rk(r, 3));
    }
    L.gl(cx + 7, foot - 12, '#fff8d0');
    L.light(cx + 4, foot - 13, 24, '#ff7a1a', 0.5, 0.3);
  }
}

/** Tools hanging on pegs: hammers, tongs, a file. */
export function toolRack(L: Layer, x0: number, x1: number, y: number, seed: number): void {
  for (let x = x0; x < x1; x++) {
    L.px(x, y, rk(TIMBER, 5));
    L.px(x, y + 1, rk(TIMBER, 3));
    L.px(x, y + 2, rk(TIMBER, 1));
  }
  let i = 0;
  for (let x = x0 + 4; x < x1 - 4; x += 8) {
    const kind = Math.floor(h2(i, 1, seed) * 3);
    L.px(x, y - 1, rk(IRON, 4));
    if (kind === 0) {
      // A hammer.
      for (let yy = y + 3; yy < y + 14; yy++) L.px(x, yy, rk(PLANK, 4));
      for (let yy = y + 1; yy < y + 4; yy++) for (let dx = -3; dx <= 3; dx++) L.px(x + dx, yy, rk(IRON, 4 - dx * 0.4 - (yy - y - 1)));
    } else if (kind === 1) {
      // Tongs.
      for (let yy = y + 1; yy < y + 16; yy++) {
        const s = yy > y + 11 ? yy - y - 11 : 0;
        L.px(x - 1 - (s >> 1), yy, rk(IRON, 4));
        L.px(x + 1 + (s >> 1), yy, rk(IRON, 2));
      }
    } else {
      // A file or a chisel.
      for (let yy = y + 1; yy < y + 12; yy++) L.px(x, yy, rk(IRON, yy > y + 8 ? 2 : 4));
      for (let yy = y + 1; yy < y + 4; yy++) L.px(x + 1, yy, rk(PLANK, 3));
    }
    i++;
  }
}

/** A sword standing point down, or hung: blade, guard, grip, pommel. */
export function sword(L: Layer, x: number, y: number, len: number, o: { hilt?: string } = {}): void {
  for (let i = 0; i < len; i++) {
    L.px(x, y + i, rk(IRON, 5));
    L.px(x + 1, y + i, rk(IRON, 3));
  }
  L.px(x, y + len, rk(IRON, 4));
  for (let dx = -2; dx <= 3; dx++) L.px(x + dx, y - 1, o.hilt ?? rk(BRASS, 4 - dx * 0.3));
  for (let i = 2; i < 6; i++) {
    L.px(x, y - i, '#4a2c18');
    L.px(x + 1, y - i, '#2e1a0e');
  }
  L.px(x, y - 6, rk(BRASS, 5));
  L.px(x + 1, y - 6, rk(BRASS, 3));
}

/** A round shield with a boss and a painted device. */
export function shield(L: Layer, cx: number, cy: number, r: number, color: string, seed: number): void {
  const face = [mixHex(color, '#0a0408', 0.5), color, mixHex(color, '#ffffff', 0.3)];
  oval(L, cx, cy, r, r, (x, y, nx, ny) => {
    const d = nx * nx + ny * ny;
    if (d > 0.78) return rk(IRON, 3 - nx - ny);
    if (Math.abs(nx) < 0.14 || Math.abs(ny) < 0.14) return rk(GOLD, 4 - nx - ny);
    return rk(face, 1.2 - nx * 0.8 - ny * 0.8 + (h2(x, y, seed) < 0.1 ? -0.5 : 0));
  });
  sphere(L, cx, cy, 1.6, 1.6, GOLD, { spec: '#fffbe6' });
}

// ------------------------------------------------------------------ the junk shop and the counter tops

/** A brass balance: a post, a beam, two pans on cords; coins in one pan. */
export function balance(L: Layer, cx: number, foot: number): void {
  for (let y = foot - 16; y <= foot; y++) {
    L.px(cx, y, rk(BRASS, 5));
    L.px(cx + 1, y, rk(BRASS, 3));
  }
  for (let dx = -3; dx <= 4; dx++) L.px(cx + dx, foot, rk(BRASS, 4 - dx * 0.3));
  for (let dx = -10; dx <= 11; dx++) L.px(cx + dx, foot - 16 + (dx < 0 ? 0 : 1), rk(BRASS, 5 - Math.abs(dx) * 0.1));
  for (const [px, py] of [[-9, -15], [10, -14]]) {
    for (let i = 1; i < 7; i++) L.px(cx + px, foot + py + i, '#6a5a3a');
    for (let dx = -3; dx <= 3; dx++) {
      L.px(cx + px + dx, foot + py + 7, rk(BRASS, 5 - Math.abs(dx) * 0.4));
      if (Math.abs(dx) <= 2) L.px(cx + px + dx, foot + py + 8, rk(BRASS, 2.6));
    }
  }
  // Coins piled in the left pan.
  L.px(cx - 10, foot - 9, '#f8d468');
  L.px(cx - 9, foot - 9, '#e0b040');
  L.px(cx - 8, foot - 9, '#b8862a');
  L.px(cx - 9, foot - 10, '#fff0a8');
}

/** A little pile of gold coins on a counter. */
export function coins(L: Layer, cx: number, foot: number, n: number, seed: number): void {
  for (let i = 0; i < n; i++) {
    const x = cx + Math.round((h2(i, 1, seed) - 0.5) * n * 1.6);
    const stack = 1 + Math.floor(h2(i, 2, seed) * 3);
    for (let s = 0; s < stack; s++) {
      const y = foot - s * 2;
      for (let dx = -2; dx <= 2; dx++) {
        L.px(x + dx, y, rk(GOLD, 3 - dx * 0.4));
        L.px(x + dx, y - 1, rk(GOLD, 5.4 - Math.abs(dx) * 0.5));
      }
      L.px(x - 3, y, rk(GOLD, 2));
      L.px(x + 3, y, rk(GOLD, 1));
    }
  }
}

/** Curios for the junk dealer's shelves: helm, clock, skull, owl, horseshoe, kettle. Returns the width used. */
export function curio(L: Layer, kind: string, x: number, foot: number, seed: number): number {
  switch (kind) {
    case 'helm': {
      oval(L, x + 5, foot - 4, 5, 5, (_x, y, nx, ny) => (y > foot ? null : rk(IRON, 3.6 - nx * 1.4 - ny + (h2(_x, y, seed) < 0.06 ? -1.2 : 0))));
      for (let dx = 1; dx <= 9; dx++) L.px(x + dx, foot - 4, '#14141a');
      L.px(x + 5, foot - 3, rk(IRON, 2));
      L.px(x + 5, foot - 2, rk(IRON, 2));
      return 11;
    }
    case 'clock': {
      for (let y = foot - 12; y <= foot; y++) for (let dx = 0; dx < 8; dx++) L.px(x + dx, y, rk(TIMBER, dx === 0 ? 6 : dx === 7 ? 2 : 4));
      oval(L, x + 4, foot - 8, 3, 3, (_x, _y, nx, ny) => rk(PARCH, 3.6 - nx * 0.5 - ny * 0.5));
      L.px(x + 4, foot - 9, '#2a1a14');
      L.px(x + 4, foot - 8, '#2a1a14');
      L.px(x + 5, foot - 8, '#2a1a14');
      L.px(x + 4, foot - 3, rk(BRASS, 5));
      L.px(x + 4, foot - 2, rk(BRASS, 3));
      return 9;
    }
    case 'skull': {
      oval(L, x + 4, foot - 4, 4, 4, (_x, _y, nx, ny) => rk(['#8a8270', '#bab29e', '#e2dac6', '#fbf6ea'], 2.6 - nx - ny));
      L.px(x + 2, foot - 4, '#2a1a14');
      L.px(x + 3, foot - 4, '#2a1a14');
      L.px(x + 5, foot - 4, '#2a1a14');
      L.px(x + 6, foot - 4, '#2a1a14');
      L.px(x + 4, foot - 2, '#5a4a3a');
      for (let dx = 2; dx <= 6; dx += 2) L.px(x + dx, foot, '#e2dac6');
      return 9;
    }
    case 'owl': {
      oval(L, x + 4, foot - 5, 4, 5, (_x, _y, nx, ny) => rk(['#3a2414', '#6a4426', '#946a40', '#c49a68'], 2.4 - nx - ny * 0.6));
      for (const ex of [x + 2, x + 6]) {
        L.px(ex, foot - 7, '#f8d468');
        L.px(ex, foot - 6, '#1a1010');
      }
      L.px(x + 4, foot - 5, '#e0a040');
      L.px(x + 1, foot - 10, '#3a2414');
      L.px(x + 7, foot - 10, '#3a2414');
      return 9;
    }
    case 'horseshoe': {
      for (let i = 0; i < 9; i++) {
        const a = Math.PI * (i / 8);
        L.px(x + 4 + Math.round(Math.cos(a) * 4), foot - 4 - Math.round(Math.sin(a) * 4), rk(IRON, 4 - i * 0.2));
      }
      L.px(x, foot - 3, rk(IRON, 3));
      L.px(x + 8, foot - 3, rk(IRON, 2));
      return 10;
    }
    case 'kettle': {
      oval(L, x + 5, foot - 3, 5, 4, (_x, y, nx, ny) => (y < foot - 5 ? null : rk(['#4a2a1a', '#8a4a2a', '#c8743a', '#f0a868'], 2.4 - nx - ny)));
      for (let dx = 2; dx <= 8; dx++) L.px(x + dx, foot - 6, '#6a3a20');
      L.px(x + 5, foot - 8, '#8a4a2a');
      for (let i = 0; i < 4; i++) L.px(x + 10 + (i >> 1), foot - 4 + i, '#8a4a2a');
      return 13;
    }
    default:
      return 0;
  }
}

/** A birdcage hanging from y0, a little bird in it. */
export function birdcage(L: Layer, x: number, y0: number, y: number): void {
  for (let yy = y0; yy < y - 9; yy++) L.px(x, yy, '#5a4a30');
  for (let yy = y - 9; yy <= y; yy++) {
    const hw = yy < y - 6 ? 2 + (yy - (y - 9)) : 5;
    for (let dx = -hw; dx <= hw; dx += 2) L.px(x + dx, yy, rk(BRASS, 4 - dx * 0.2));
  }
  for (let dx = -5; dx <= 5; dx++) {
    L.px(x + dx, y, rk(BRASS, 4));
    L.px(x + dx, y - 6, rk(BRASS, 5));
  }
  L.px(x, y - 3, '#e8c040');
  L.px(x + 1, y - 3, '#ffe27a');
  L.px(x, y - 4, '#ffe27a');
  L.px(x + 2, y - 3, '#e0802a');
}

// ------------------------------------------------------------------ the sage, the shrine, the altar

/** A standing stone carved with runes that glow teal. */
export function sigilStone(L: Layer, cx: number, foot: number, h: number, seed: number, glow = '#7af0e0'): void {
  const w = Math.max(5, Math.round(h * 0.42));
  for (let y = foot - h; y <= foot; y++) {
    const t = (y - (foot - h)) / h;
    const hw = Math.round(w * (t < 0.2 ? 0.55 + t * 2 : 1) / 2 + 0.5);
    for (let dx = -hw; dx <= hw; dx++) L.px(cx + dx, y, rk(['#1a2224', '#283436', '#3a4a4a', '#506462', '#6a827e'], 2.6 - dx / hw - (h2(cx + dx, y, seed) < 0.1 ? 0.6 : 0)));
  }
  // Runes.
  const glyphs = [['x.x', '.x.', 'x.x'], ['xxx', 'x..', 'xxx'], ['.x.', 'xxx', '.x.'], ['x..', 'xxx', '..x']];
  for (let i = 0; i < 2 && foot - h + 4 + i * 5 + 3 < foot - 2; i++) {
    const gph = glyphs[Math.floor(h2(i, 1, seed) * glyphs.length)];
    gph.forEach((r, ry) => [...r].forEach((ch, rx) => ch === 'x' && L.gl(cx - 1 + rx, foot - h + 4 + i * 5 + ry, glow)));
  }
  L.light(cx, foot - h / 2, 30, glow, 0.35, 0.2);
}

/** A rose-gold rising sun in relief, glowing, its rays fanning up. */
export function sunEmblem(L: Layer, cx: number, cy: number, r: number): void {
  const ROSE = ['#6a2a3a', '#a84a5a', '#e07a7a', '#ffb0a0', '#ffd8c0', '#fff4e8'];
  for (let i = 0; i < 13; i++) {
    const a = Math.PI + (Math.PI * i) / 12;
    for (let d = r + 2; d < r + 2 + (i % 2 ? r * 0.6 : r * 0.9); d++) L.gl(cx + Math.round(Math.cos(a) * d), cy + Math.round(Math.sin(a) * d), rk(ROSE, 3.6 - (d - r) / r));
  }
  oval(L, cx, cy, r, r, (x, y, nx, ny) => {
    if (y > cy) return null;
    L.gl(x, y, rk(ROSE, 4.2 - nx * 0.8 - ny * 1.2));
    return null;
  });
  for (let x = cx - r - 4; x <= cx + r + 4; x++) L.px(x, cy + 1, rk(ROSE, 1));
  L.light(cx, cy - r / 2, r * 6, '#ffb0a0', 0.6, 0.1);
}

/** A crystal orb on a little brass stand, a swirl of light inside it. */
export function crystalOrb(L: Layer, cx: number, foot: number, r: number, hue = '#9a6af0'): void {
  const ramp = [mixHex(hue, '#0a0418', 0.6), mixHex(hue, '#0a0418', 0.25), hue, mixHex(hue, '#ffffff', 0.4), mixHex(hue, '#ffffff', 0.75)];
  const cy = foot - 4 - r;
  oval(L, cx, cy, r, r, (x, y, nx, ny) => {
    const swirl = Math.sin(Math.atan2(ny, nx) * 3 + Math.hypot(nx, ny) * 6);
    const k = 2.2 - nx * 0.6 - ny * 0.9 + swirl * 0.6;
    L.gl(x, y, rk(ramp, k));
    return null;
  });
  L.gl(Math.round(cx - r * 0.45), Math.round(cy - r * 0.45), '#ffffff');
  L.gl(Math.round(cx - r * 0.45) + 1, Math.round(cy - r * 0.45), mixHex(hue, '#ffffff', 0.8));
  for (let dx = -r + 1; dx <= r - 1; dx++) {
    L.px(cx + dx, foot - 3, rk(BRASS, 5 - Math.abs(dx) * 0.3));
    L.px(cx + dx, foot - 2, rk(BRASS, 3));
  }
  for (let dx = -r - 1; dx <= r + 1; dx++) {
    L.px(cx + dx, foot - 1, rk(BRASS, 4 - dx * 0.2));
    L.px(cx + dx, foot, rk(BRASS, 2));
  }
  L.light(cx, cy, r * 9, hue, 0.8, 0.15);
}

/** A window onto the night: blue sky, stars, a moon, panes in a wooden frame. */
export function nightWindow(L: Layer, x: number, y: number, w: number, h: number, seed: number): void {
  const SKY = ['#0c1430', '#14204a', '#1e2e62', '#2a3e7a'];
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      const edge = Math.min(xx - x, yy - y, x + w - 1 - xx, y + h - 1 - yy);
      if (edge < 2) L.px(xx, yy, rk(TIMBER, edge === 0 ? 1 : 5));
      else if (xx === x + Math.floor(w / 2) || yy === y + Math.floor(h / 2)) L.px(xx, yy, rk(TIMBER, 4));
      else {
        const t = (yy - y) / h;
        L.gl(xx, yy, rk(SKY, 2.8 - t * 2.6), rk(SKY, 2.8 - t * 2.6));
        if (h2(xx, yy, seed) < 0.025) L.gl(xx, yy, '#e8f0ff');
      }
    }
  }
  oval(L, x + w * 0.7, y + h * 0.28, 2.5, 2.5, (xx, yy) => {
    L.gl(xx, yy, '#f4f0d0');
    return null;
  });
}

/** A parchment note pinned up: lines of scribble, a pin; 'wanted' has a goblin's face, 'chicken' a chicken. */
export function note(L: Layer, x: number, y: number, w: number, h: number, seed: number, kind: 'text' | 'wanted' | 'chicken' = 'text'): void {
  const tilt = (h2(seed, 1, 7) - 0.5) * 0.12;
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      const X = x + xx + Math.round(yy * tilt);
      const edge = xx === 0 || yy === 0 || xx === w - 1 || yy === h - 1;
      let k = 3 - (yy / h) * 0.8 + (h2(X, y + yy, seed) < 0.08 ? -0.6 : 0);
      if (edge) k -= 0.9;
      if (yy === h - 1 && h2(xx, 2, seed) < 0.3) continue;
      L.px(X, y + yy, rk(PARCH, k));
    }
  }
  const ink = '#4a3020';
  if (kind === 'wanted') {
    for (let xx = 2; xx < w - 2; xx++) if (xx % 2 === 0) L.px(x + xx, y + 2, '#8a2a1a');
    oval(L, x + w / 2, y + h / 2, w * 0.24, h * 0.2, (xx, yy, nx) => {
      void xx;
      void yy;
      return nx < -0.5 || nx > 0.5 ? '#4a7a2a' : '#6a9a3a';
    });
    L.px(Math.round(x + w / 2 - 2), Math.round(y + h / 2), '#ffe27a');
    L.px(Math.round(x + w / 2 + 1), Math.round(y + h / 2), '#ffe27a');
    for (let xx = 2; xx < w - 2; xx += 1) if (h2(xx, 9, seed) < 0.6) L.px(x + xx, y + h - 3, ink);
  } else if (kind === 'chicken') {
    oval(L, x + w / 2, y + h / 2 + 1, w * 0.22, h * 0.2, '#f4ece0');
    L.px(Math.round(x + w / 2 + 2), Math.round(y + h / 2 - 1), '#e0802a');
    L.px(Math.round(x + w / 2), Math.round(y + h / 2 - 2), '#c8302a');
    L.px(Math.round(x + w / 2 + 1), Math.round(y + h / 2), ink);
  } else {
    for (let yy = 3; yy < h - 2; yy += 2) for (let xx = 2; xx < w - 2; xx++) if (h2(xx, yy, seed) < 0.7) L.px(x + xx + Math.round(yy * tilt), y + yy, ink);
  }
  // The pin.
  L.px(x + Math.floor(w / 2), y + 1, '#c8302a');
  L.px(x + Math.floor(w / 2) + 1, y + 1, '#7a1a1a');
  L.px(x + Math.floor(w / 2), y, '#ff8a7a');
}

/** A banner hanging from a pole: a cloth with a pointed foot and a device. */
export function banner(L: Layer, x: number, y: number, w: number, h: number, color: string, device: string): void {
  const r = [mixHex(color, '#0a0408', 0.5), color, mixHex(color, '#ffffff', 0.25)];
  for (let xx = x - 2; xx <= x + w + 1; xx++) L.px(xx, y - 1, rk(TIMBER, 5));
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      const foot = y + h - 1 - Math.abs(xx - (x + (w - 1) / 2)) * 0.6;
      if (yy > foot) continue;
      const k = 1.4 - (xx - x) / w + (Math.sin((xx - x) * 0.9) * 0.3);
      L.px(xx, yy, rk(r, k));
    }
  }
  const dx = x + Math.floor(w / 2);
  const dy = y + Math.floor(h * 0.4);
  for (const [a, b] of [[0, -2], [-1, -1], [0, -1], [1, -1], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [0, 1], [0, 2]]) L.px(dx + a, dy + b, device);
}

/** An open ledger on a counter, its lines of figures, a quill in an inkpot beside it. */
export function ledger(L: Layer, cx: number, foot: number): void {
  for (let y = foot - 5; y <= foot; y++) {
    for (let dx = -12; dx <= 12; dx++) {
      const page = Math.abs(dx) > 0;
      const k = page ? 3.6 - (y - foot + 5) * 0.1 - Math.abs(dx) * 0.03 + (dx > 0 ? -0.3 : 0) : 1.6;
      L.px(cx + dx, y - (Math.abs(dx) > 10 ? 1 : 0), rk(PARCH, k));
    }
  }
  for (let y = foot - 4; y <= foot - 1; y += 2) for (let dx = -10; dx <= 10; dx++) if (dx !== 0 && h2(dx, y, 5) < 0.7) L.px(cx + dx, y, '#6a5040');
  for (let dx = -13; dx <= 13; dx++) L.px(cx + dx, foot + 1, '#5a2a1a');
}

/** A clay pot of flowers (or leaves) at (x, foot). */
export function flowerPot(L: Layer, x: number, foot: number, w: number, cols: readonly string[], seed: number): void {
  const TERRA = ['#3a160c', '#5e2414', '#86361e', '#a84a2a', '#c8663a', '#e0864e'];
  for (let y = foot - Math.round(w * 0.8); y <= foot; y++) {
    const t = (y - (foot - w * 0.8)) / (w * 0.8);
    const hw = Math.round(w / 2 - t * 1.5);
    for (let dx = -hw; dx <= hw; dx++) L.px(x + dx, y, rk(TERRA, 3.6 - dx / hw * 1.4 + (y === Math.round(foot - w * 0.8) ? 1.2 : 0)));
  }
  const top = Math.round(foot - w * 0.8);
  for (let i = 0; i < w + 4; i++) {
    const a = (h2(i, 1, seed) - 0.5) * 2.4;
    const len = 3 + h2(i, 2, seed) * w * 0.7;
    for (let t = 0; t < len; t++) L.px(x + Math.round(Math.sin(a) * t * 0.8), top - Math.round(t), rk(LEAF, 3 + t * 0.4));
    if (h2(i, 3, seed) < 0.45) {
      const fx = x + Math.round(Math.sin(a) * len * 0.8);
      const fy = top - Math.round(len);
      const c = cols[i % cols.length];
      L.px(fx, fy, c);
      L.px(fx + 1, fy, mixHex(c, '#000000', 0.25));
      L.px(fx, fy - 1, mixHex(c, '#ffffff', 0.4));
    }
  }
}

/** A wooden counter across the bottom of the scene: its top from `top`, its front down to `foot`. */
export function counter(L: Layer, x0: number, x1: number, top: number, foot: number, o: { ramp?: Ramp; seed: number; cloth?: Ramp; panels?: boolean; trim?: Ramp }): void {
  const r = o.ramp ?? PLANK;
  // The top, seen a little from above: boards running along it, a lit front edge.
  planks(L, x0, top, x1 - x0, 4, { dir: 'h', board: 2, seed: o.seed, ramp: r, base: r.length * 0.62, joint: 38 });
  for (let x = x0; x < x1; x++) {
    L.px(x, top + 4, rk(r, r.length - 1.2));
    L.px(x, top + 5, rk(r, 1.2));
  }
  // The front: panels framed in rails and stiles.
  for (let y = top + 6; y < foot; y++) {
    for (let x = x0; x < x1; x++) {
      const px = (x - x0) % 30;
      const rail = y === top + 6 || y === top + 7 || y >= foot - 2;
      const stile = px < 3;
      let k = r.length * 0.38 + (vnoise(x, y * 4, 8, 1.4, o.seed) - 0.5) * 0.9;
      if (rail || stile) k += 0.9;
      if (px === 0) k = 0.6;
      if (y === top + 8 || (px === 3 && !rail)) k -= 1;
      if (o.panels !== false && !rail && !stile && (px === 4 || y === top + 9)) k += 0.5;
      L.px(x, y, rkd(r, k, x, y));
    }
  }
  if (o.trim) for (let x = x0; x < x1; x++) L.px(x, top + 7, rk(o.trim, 3 - ((x - x0) % 4 === 0 ? 1 : 0)));
  if (o.cloth) {
    // A cloth over the top, hanging a little way down the front with a scalloped hem.
    for (let x = x0; x < x1; x++) {
      const hem = top + 9 + (Math.sin((x - x0) * 0.5) > 0 ? 1 : 0);
      for (let y = top; y <= hem; y++) L.px(x, y, rk(o.cloth, y <= top + 3 ? 3.2 - (x % 9 === 0 ? 0.5 : 0) : 2.2 + Math.sin((x - x0) * 0.5) * 0.8));
    }
  }
}
