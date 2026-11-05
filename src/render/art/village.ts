/**
 * The village: half-timbered houses with tiled roofs (big props standing at the north edge of a room,
 * their fronts facing it) and the small things of village life around them: flower pots, benches,
 * lamp posts, sign posts, sacks, wood piles, notice boards, flower beds, a market stall and a proper
 * well. All lit from the top left, inked, in clean pixels.
 *
 * A house's shape comes from its variant (`houseLayout`), so the map (where the door is, how wide it
 * is) and the art agree.
 */
import type { Biome } from '../../world/biomes';
import { houseLayout } from '../../world/decor';
import type { Prop } from '../../world/mapgen';
import { blank, type PixelBuf } from '../pixel/buf';
import type { DecalKind } from './decals';
import { ball, hash, inkOutline, line, mixHex, rect, setRGB, shade } from './draw';

/** What propArt returns (declared here too, so this module doesn't import props.ts). */
interface Art {
  buf: PixelBuf;
  ax: number;
  ay: number;
  light?: { dx: number; dy: number; color: string; r: number; flicker: boolean };
  flame?: { dx: number; dy: number; size: number };
}

const PLASTER = ['#7e715c', '#b4a688', '#d8ccae', '#ece2c8'];
const BEAM = ['#24180f', '#43301f', '#644831', '#86643f'];
const STONE = ['#3e3c3a', '#62605a', '#86847c', '#a8a59a', '#c8c4b8'];
const WOOD = ['#3a2416', '#5e3e24', '#845a36', '#a8784a', '#c89a64'];
const IRON = ['#1e1e24', '#3a3a44', '#5a5a66', '#8a8a96'];
const ROOFS = [
  ['#3a160e', '#6a2818', '#9a3c22', '#c0562e', '#dc7a46'],
  ['#341214', '#5e2020', '#86302a', '#aa4636', '#c86a50'],
  ['#222832', '#36404e', '#4c5868', '#687688', '#8a98a8'],
];
const THATCH = ['#4a3418', '#7a5a2c', '#a07a3e', '#c49c56', '#e0c27a'];
const GLASS = ['#141c28', '#22324a', '#4a6a8a', '#a8c8e0'];
const SHUTTERS = [
  ['#24402c', '#3a6046', '#548a60'],
  ['#24364e', '#365474', '#527498'],
  ['#4e2418', '#703424', '#904c34'],
];
const FLOWERS = ['#e04848', '#f088b0', '#f4d050', '#f4f0e8', '#c060d0', '#f08a3a'];
const LEAF = ['#163018', '#244a22', '#386a2e', '#5a8a3c'];
const INK = '#1c120c';

/** Darkens a pixel toward a cool shadow color (eaves, the chimney's shadow). */
function darken(b: PixelBuf, x: number, y: number, f: number): void {
  if (x < 0 || y < 0 || x >= b.w || y >= b.h) return;
  const i = (y * b.w + x) * 4;
  if (!b.px[i + 3]) return;
  b.px[i] = b.px[i] * (1 - f) + 0x2a * f * 0.6;
  b.px[i + 1] = b.px[i + 1] * (1 - f) + 0x24 * f * 0.6;
  b.px[i + 2] = b.px[i + 2] * (1 - f) + 0x40 * f * 0.6;
}

/** A flower box (or a window sill garden) w wide with its top-left at x, y. */
function flowerBox(b: PixelBuf, x: number, y: number, w: number, seed: number): void {
  rect(b, x, y + 2, w, 2, WOOD[2]);
  rect(b, x, y + 2, w, 1, WOOD[3]);
  rect(b, x, y + 4, w, 1, WOOD[1]);
  const c1 = FLOWERS[Math.floor(hash(seed, 1) * FLOWERS.length)];
  const c2 = FLOWERS[Math.floor(hash(seed, 2) * FLOWERS.length)];
  for (let i = 0; i < w; i++) {
    setRGB(b, x + i, y + 1, LEAF[(i + seed) % 3 === 0 ? 1 : 2]);
    if (i % 2 === 0) setRGB(b, x + i, y, LEAF[2]);
    // Leaves spilling over the edge.
    if (hash(seed, i, 3) < 0.3) setRGB(b, x + i, y + 3, LEAF[1]);
  }
  for (let i = 0; i < w - 1; i += 2) {
    const c = hash(seed, i, 4) < 0.5 ? c1 : c2;
    const fy = y + (hash(seed, i, 5) < 0.5 ? 0 : -1);
    setRGB(b, x + i + (i % 4 === 0 ? 0 : 1), fy, mixHex(c, '#ffffff', 0.3));
    setRGB(b, x + i + (i % 4 === 0 ? 1 : 0), fy + 1, shade(c, -0.25));
  }
}

/** A window w x h: frame, dark glass with a glint, white curtains, a sill. */
function windowAt(b: PixelBuf, x: number, y: number, w: number, h: number): void {
  rect(b, x - 1, y - 1, w + 2, h + 2, BEAM[1]);
  rect(b, x, y, w, h, GLASS[1]);
  rect(b, x, y + h - 2, w, 2, GLASS[0]);
  // The light falls on the top-left pane.
  setRGB(b, x + 2, y + 1, GLASS[3]);
  setRGB(b, x + 3, y + 1, GLASS[2]);
  setRGB(b, x + 2, y + 2, GLASS[2]);
  // Mullions.
  rect(b, x + Math.floor(w / 2), y, 1, h, BEAM[1]);
  rect(b, x, y + Math.floor(h / 2), w, 1, BEAM[1]);
  // Curtains drawn back to the sides.
  for (let k = 0; k < h - 1; k++) {
    setRGB(b, x, y + k, k < 2 ? '#f4f0e6' : '#d8d2c4');
    setRGB(b, x + w - 1, y + k, k < 2 ? '#e8e2d4' : '#c4bcae');
  }
  rect(b, x - 1, y + h + 1, w + 2, 1, BEAM[3]);
}

function shutters(b: PixelBuf, x: number, y: number, w: number, h: number, tint: number): void {
  const s = SHUTTERS[tint % SHUTTERS.length];
  for (const sx of [x - 4, x + w + 1]) {
    rect(b, sx, y - 1, 3, h + 2, s[1]);
    rect(b, sx, y - 1, 1, h + 2, s[2]);
    for (let k = 1; k < h + 1; k += 2) setRGB(b, sx + 1, y + k, s[0]);
  }
}

/** A half-timbered house: stone footing, plaster and beams, windows with boxes of flowers, a plank
 * door on a stone step, and a steep roof of small tiles (or thatch) with a chimney and moss. */
export function houseArt(variant: number): Art {
  const L = houseLayout(variant);
  const seed = variant * 7919 + 3;
  const FW = L.tiles * 16;
  const OH = 5;
  const W = FW + OH * 2;
  const FH = L.storeys === 2 ? 40 : 27;
  const RH = L.storeys === 2 ? 30 : 34;
  const CH = 9;
  const H = CH + RH + FH;
  const b = blank(W, H);
  const fx = OH;
  const fy = H - FH;
  const base = H - 1;

  // --- the front wall: plaster, the light from the left, the eave's shadow along the top
  for (let y = fy; y <= base; y++) for (let x = fx; x < fx + FW; x++) setRGB(b, x, y, x < fx + 3 ? PLASTER[3] : PLASTER[2]);
  // The stone footing.
  for (let y = base - 3; y <= base; y++) {
    const row = base - y;
    for (let x = fx - 1; x <= fx + FW; x++) {
      const sx = (x + (row % 2) * 3) % 7;
      let k = y === base - 3 ? 4 : y === base ? 1 : 2 + (hash(Math.floor((x + (row % 2) * 3) / 7), row, seed) < 0.4 ? 1 : 0);
      if (sx === 0 && y !== base - 3) k = 0;
      setRGB(b, x, y, STONE[k]);
    }
  }
  const sill = base - 5;
  const floorBeam = L.storeys === 2 ? fy + 16 : -1;
  const beam = (y: number) => {
    rect(b, fx, y, FW, 1, BEAM[3]);
    rect(b, fx, y + 1, FW, 1, BEAM[1]);
  };
  beam(sill);
  if (floorBeam > 0) beam(floorBeam);
  beam(fy + 2);
  // Posts at the corners and between the bays.
  const bays = L.tiles;
  const postX = (k: number) => fx + Math.round((k * (FW - 2)) / bays);
  for (let k = 0; k <= bays; k++) {
    const x = postX(k);
    rect(b, x, fy + 1, 2, sill - fy, BEAM[2]);
    rect(b, x + 1, fy + 1, 1, sill - fy, BEAM[1]);
  }
  // Upper floor: a window in most bays, braces in the rest.
  const doorBay = Math.min(bays - 1, Math.floor((L.door / FW) * bays));
  if (L.storeys === 2) {
    for (let k = 0; k < bays; k++) {
      const x0 = postX(k) + 2;
      const x1 = postX(k + 1) - 1;
      const y0 = fy + 4;
      const y1 = floorBeam - 1;
      if (bays === 4 ? k === 1 || k === 2 : k % 2 === 0) {
        const ww = 7;
        const wx = Math.round((x0 + x1) / 2 - ww / 2) + 1;
        windowAt(b, wx, y0 + 1, ww, 6);
        flowerBox(b, wx - 1, y0 + 7, ww + 2, seed + k);
      } else {
        // A brace: two diagonals meeting in the middle (an inverted V).
        line(b, x0, y1, Math.round((x0 + x1) / 2), y0, BEAM[1]);
        line(b, x0 + 1, y1, Math.round((x0 + x1) / 2) + 1, y0, BEAM[2]);
        line(b, x1, y1, Math.round((x0 + x1) / 2) + 1, y0, BEAM[1]);
      }
    }
  }
  // Ground floor: the door, and a window with shutters and a flower box in the other bays.
  const gy0 = (floorBeam > 0 ? floorBeam + 2 : fy + 4) + 1;
  for (let k = 0; k < bays; k++) {
    if (k === doorBay) continue;
    const x0 = postX(k) + 2;
    const x1 = postX(k + 1) - 1;
    if (Math.abs((x0 + x1) / 2 - (fx + L.door)) < 10) continue;
    const ww = 6;
    const wx = Math.round((x0 + x1) / 2 - ww / 2) + 1;
    windowAt(b, wx, gy0 + 2, ww, 7);
    shutters(b, wx, gy0 + 2, ww, 7, L.tint + k);
    flowerBox(b, wx - 1, gy0 + 9, ww + 2, seed + 10 + k);
  }
  // The door: planks in a dark frame under a lintel, an iron ring, a stone step.
  const dw = 9;
  const dh = Math.min(15, sill - gy0 + 4);
  const dx = fx + L.door - Math.floor(dw / 2);
  const dy = base - 4 - dh + 1;
  rect(b, dx - 1, dy - 2, dw + 2, dh + 2, BEAM[0]);
  rect(b, dx - 2, dy - 3, dw + 4, 2, BEAM[2]);
  rect(b, dx - 2, dy - 3, dw + 4, 1, BEAM[3]);
  for (let x = 0; x < dw; x++) for (let y = 0; y < dh; y++) {
    const plank = Math.floor(x / 3);
    let col = plank % 2 ? WOOD[2] : WOOD[1];
    if (x % 3 === 0) col = WOOD[0];
    if (x === 1 && y < dh - 1) col = WOOD[3];
    // Iron straps across the planks.
    if (y === 2 || y === dh - 4) col = IRON[1];
    setRGB(b, dx + x, dy + y, col);
  }
  setRGB(b, dx + dw - 3, dy + Math.floor(dh / 2), '#e8c060');
  setRGB(b, dx + dw - 3, dy + Math.floor(dh / 2) + 1, '#a88030');
  rect(b, dx - 2, base - 1, dw + 4, 1, STONE[4]);
  rect(b, dx - 2, base, dw + 4, 1, STONE[2]);
  // A climbing vine up one corner post.
  const vx = L.door < FW / 2 ? fx + FW - 3 : fx + 1;
  for (let y = base - 4; y > fy + 6 + Math.floor(hash(seed, 7) * 8); y--) {
    const wob = Math.round(Math.sin(y * 0.7 + seed) * 1.5);
    setRGB(b, vx + wob, y, LEAF[2]);
    if (y % 3 === 0) {
      setRGB(b, vx + wob - 1, y, LEAF[3]);
      setRGB(b, vx + wob + 1, y + 1, LEAF[1]);
      if (hash(seed, y, 8) < 0.3) setRGB(b, vx + wob + 1, y - 1, FLOWERS[(seed + y) % FLOWERS.length]);
    }
  }
  // A hanging basket by the door.
  const hbx = dx + (L.door < FW / 2 ? dw + 4 : -6);
  if (hbx > fx + 2 && hbx < fx + FW - 5) {
    setRGB(b, hbx + 1, dy - 2, IRON[2]);
    setRGB(b, hbx + 1, dy - 1, IRON[2]);
    ball(b, hbx + 1.5, dy + 1.5, 2.6, 1.8, [LEAF[0], LEAF[1], LEAF[2], LEAF[3]]);
    setRGB(b, hbx, dy + 1, FLOWERS[(L.tint + 1) % FLOWERS.length]);
    setRGB(b, hbx + 2, dy + 2, FLOWERS[(L.tint + 3) % FLOWERS.length]);
    rect(b, hbx, dy + 3, 3, 1, WOOD[1]);
  }
  // The eave's shadow on the top of the wall.
  for (let y = fy + 2; y < fy + 6; y++) for (let x = fx; x < fx + FW; x++) darken(b, x, y, y < fy + 4 ? 0.45 : 0.3);

  // --- the roof
  const ry0 = CH;
  const ry1 = fy + 1;
  const thatch = L.roof === 'thatch';
  const R = thatch ? THATCH : ROOFS[L.roof === 'terracotta' ? 0 : L.roof === 'brick' ? 1 : 2];
  for (let y = ry0; y <= ry1; y++) {
    const t = (y - ry0) / (ry1 - ry0);
    const inset = Math.round((1 - t) * 5);
    const row = Math.floor((ry1 - y) / 4);
    const ty = (ry1 - y) % 4;
    for (let x = inset; x < W - inset; x++) {
      let k: number;
      if (thatch) {
        // Thatch: layered straw, combed down, a darker line under each course.
        const stroke = hash(x, row, seed) < 0.3;
        k = ty === 0 ? 1 : ty === 3 ? 3 : 2;
        if (stroke && ty !== 0) k -= 1;
        if (x < W * 0.3) k += 0.5;
      } else {
        const tx = (x + (row % 2) * 3) % 6;
        k = ty === 3 ? 3 : ty === 0 ? 1 : 2;
        if (tx === 0) k = 0.6;
        else if (tx === 1 && ty > 0) k += 0.8;
        else if (tx === 5) k -= 0.5;
        if (x < W * 0.28) k += 0.35;
        else if (x > W * 0.8) k -= 0.3;
      }
      // The sides of the roof catch less light.
      if (x === inset || x === W - inset - 1) k = Math.min(k, 1);
      setRGB(b, x, y, R[Math.max(0, Math.min(4, Math.round(k)))]);
    }
  }
  // The eave: a dark lip along the bottom edge.
  rect(b, 0, ry1, W, 1, R[0]);
  rect(b, 0, ry1 - 1, W, 1, R[1]);
  // The ridge: capping tiles along the top.
  for (let x = 5; x < W - 5; x++) {
    const cap = (x - 5) % 5;
    setRGB(b, x, ry0 - 1, cap === 0 ? R[1] : R[3]);
    setRGB(b, x, ry0, cap === 0 ? R[0] : cap < 3 ? R[4] : R[2]);
    setRGB(b, x, ry0 + 1, R[1]);
  }
  // Moss on the tiles (not on thatch).
  if (!thatch) {
    for (let k = 0; k < 4; k++) {
      const mx = 6 + Math.floor(hash(seed, k, 20) * (W - 14));
      const my = ry0 + 6 + Math.floor(hash(seed, k, 21) * (RH - 10));
      for (let j = 0; j < 6; j++) setRGB(b, mx + (j % 3), my + Math.floor(j / 3), j % 2 ? '#4e6a2c' : '#6e8a3a');
    }
  }
  // The chimney, with its shadow on the roof.
  const cx = OH + L.chimney - 3;
  const cy0 = 1;
  const cy1 = ry0 + 7;
  for (let y = cy1 - 6; y < cy1 + 5; y++) for (let x = cx + 7; x < cx + 7 + Math.max(2, Math.round((y - cy1 + 8) * 0.5)); x++) darken(b, x, y, 0.5);
  for (let y = cy0; y <= cy1; y++) {
    for (let x = cx; x < cx + 7; x++) {
      let col = x < cx + 2 ? STONE[3] : x > cx + 5 ? STONE[1] : STONE[2];
      if ((y - cy0) % 3 === 2) col = STONE[0];
      else if ((x - cx + ((y - cy0) % 6 < 3 ? 0 : 2)) % 4 === 0) col = STONE[1];
      setRGB(b, x, y, col);
    }
  }
  rect(b, cx - 1, cy0 - 1, 9, 2, STONE[4]);
  rect(b, cx + 1, cy0 - 1, 5, 1, '#141414');
  return { buf: inkOutline(b, INK), ax: Math.round(W / 2) + 1, ay: H + 1 };
}

// ------------------------------------------------------------------ small things

function pot(seed: number): Art {
  const b = blank(10, 13);
  const kind = Math.floor(hash(seed, 1) * 3);
  // A terracotta pot, lit on the left.
  for (let y = 8; y < 13; y++) {
    const half = y === 8 ? 4 : y > 11 ? 2 : 3;
    for (let x = 5 - half; x < 5 + half; x++) setRGB(b, x, y, y === 8 ? '#e0905a' : x < 4 ? '#c8703e' : x > 6 ? '#8a4224' : '#a8562e');
  }
  if (kind === 0) {
    // Flowers.
    ball(b, 5, 5.5, 4.4, 3, LEAF);
    const c = FLOWERS[Math.floor(hash(seed, 2) * 4)];
    for (const [x, y] of [[3, 3], [6, 2], [8, 5], [2, 6], [5, 5]] as const) {
      setRGB(b, x, y, mixHex(c, '#ffffff', 0.3));
      setRGB(b, x + 1, y, c);
      setRGB(b, x, y + 1, shade(c, -0.3));
    }
  } else if (kind === 1) {
    // A clipped round shrub.
    ball(b, 5, 4.5, 4.4, 4, LEAF);
    setRGB(b, 3, 2, '#7aa84a');
    setRGB(b, 4, 2, '#6a9a40');
  } else {
    // Tall leaves.
    for (let i = 0; i < 5; i++) line(b, 5, 8, 1 + i * 2, 1 + (i % 2) * 2, LEAF[1 + (i % 3)]);
    setRGB(b, 5, 1, LEAF[3]);
  }
  return { buf: inkOutline(b, INK), ax: 6, ay: 14 };
}

function bench(): Art {
  const b = blank(18, 10);
  // Backrest, seat and legs in 3/4 view.
  rect(b, 1, 0, 16, 2, WOOD[2]);
  rect(b, 1, 0, 16, 1, WOOD[3]);
  rect(b, 2, 2, 1, 3, WOOD[1]);
  rect(b, 15, 2, 1, 3, WOOD[1]);
  rect(b, 0, 4, 18, 3, WOOD[3]);
  rect(b, 0, 4, 18, 1, WOOD[4]);
  rect(b, 0, 6, 18, 1, WOOD[1]);
  rect(b, 1, 7, 2, 3, WOOD[1]);
  rect(b, 15, 7, 2, 3, WOOD[1]);
  rect(b, 8, 7, 2, 2, WOOD[0]);
  return { buf: inkOutline(b, INK), ax: 10, ay: 11 };
}

function lampPost(biome: Biome): Art {
  const b = blank(9, 30);
  // An iron post on a stone foot, a glass lantern with a warm flame and a little roof.
  rect(b, 2, 26, 5, 4, STONE[2]);
  rect(b, 2, 26, 5, 1, STONE[4]);
  rect(b, 2, 29, 5, 1, STONE[1]);
  rect(b, 4, 9, 1, 17, IRON[2]);
  rect(b, 5, 9, 1, 17, IRON[1]);
  rect(b, 3, 22, 3, 1, IRON[3]);
  rect(b, 2, 2, 5, 1, IRON[2]);
  rect(b, 1, 1, 7, 1, IRON[1]);
  rect(b, 3, 0, 3, 1, IRON[2]);
  rect(b, 2, 3, 5, 6, IRON[1]);
  rect(b, 3, 3, 3, 5, '#ffd98a');
  rect(b, 3, 3, 1, 3, '#fff6d8');
  setRGB(b, 4, 6, '#ffb84a');
  rect(b, 2, 9, 5, 1, IRON[2]);
  return { buf: inkOutline(b, '#100c10'), ax: 5, ay: 31, light: { dx: 0, dy: -25, color: biome.light.fire, r: 70, flicker: true } };
}

function signpost(seed: number): Art {
  const b = blank(18, 22);
  rect(b, 8, 4, 2, 18, WOOD[2]);
  rect(b, 8, 4, 1, 18, WOOD[3]);
  // Two arrow boards, one each way, with carved lines for lettering.
  const boards: Array<[number, number, number]> = [[3, 1, -1], [9, 7, 1]];
  if (hash(seed, 1) < 0.5) boards.push([2, 12, -1]);
  for (const [x, y, dir] of boards) {
    rect(b, x, y, 9, 4, WOOD[3]);
    rect(b, x, y, 9, 1, WOOD[4]);
    rect(b, x, y + 3, 9, 1, WOOD[1]);
    const tip = dir < 0 ? x - 1 : x + 9;
    setRGB(b, tip, y + 1, WOOD[3]);
    setRGB(b, tip, y + 2, WOOD[2]);
    rect(b, x + 2, y + 2, 5, 1, WOOD[1]);
  }
  return { buf: inkOutline(b, INK), ax: 9, ay: 23 };
}

function sacks(seed: number): Art {
  const b = blank(15, 11);
  const burlap = ['#5e4a30', '#8a7048', '#b49464', '#d4b888'];
  const n = hash(seed, 1) < 0.5 ? 2 : 3;
  for (let i = 0; i < n; i++) {
    const x = 4 + i * 4 - (n === 3 ? 2 : 0);
    const y = i === 2 ? 4 : 6;
    ball(b, x, y, 3.6, 4, burlap);
    rect(b, x - 1, y - 4, 3, 1, '#6a4a2a');
    setRGB(b, x, y - 5, burlap[2]);
  }
  return { buf: inkOutline(b, INK), ax: 8, ay: 12 };
}

function woodpile(): Art {
  const b = blank(18, 12);
  // Logs stacked end-on: rings of pale wood in bark.
  const logs: Array<[number, number]> = [[3, 8], [8, 8], [13, 8], [5, 4], [10, 4], [8, 0]];
  for (const [x, y] of logs) {
    ball(b, x + 1.5, y + 2, 2.6, 2.4, [WOOD[1], WOOD[2], WOOD[3], WOOD[3]]);
    setRGB(b, x + 1, y + 1, '#e0c08c');
    setRGB(b, x + 2, y + 1, '#c8a070');
    setRGB(b, x + 1, y + 2, '#c8a070');
    setRGB(b, x + 2, y + 2, '#a88050');
  }
  return { buf: inkOutline(b, INK), ax: 9, ay: 13 };
}

function noticeBoard(seed: number): Art {
  const b = blank(18, 20);
  rect(b, 2, 6, 2, 14, WOOD[2]);
  rect(b, 14, 6, 2, 14, WOOD[1]);
  // A little roof of planks over the board.
  rect(b, 0, 2, 18, 2, WOOD[3]);
  rect(b, 0, 2, 18, 1, WOOD[4]);
  rect(b, 1, 4, 16, 1, WOOD[1]);
  rect(b, 3, 5, 12, 9, WOOD[3]);
  rect(b, 3, 5, 12, 1, WOOD[2]);
  // Notices pinned up.
  const notes: Array<[number, number, number, number]> = [[4, 7, 4, 5], [9, 6, 4, 4], [9, 11, 5, 3]];
  for (const [x, y, w, h] of notes) {
    rect(b, x, y, w, h, '#f0e8d4');
    rect(b, x + w - 1, y + 1, 1, h - 1, '#c8bca4');
    for (let k = y + 1; k < y + h - 1; k += 2) rect(b, x + 1, k, w - 2, 1, '#9a8e7a');
    setRGB(b, x + 1, y, hash(seed, x) < 0.5 ? '#c83a2a' : '#3a6ac8');
  }
  return { buf: inkOutline(b, INK), ax: 9, ay: 21 };
}

function flowerBed(seed: number): Art {
  const b = blank(18, 9);
  // A low planter of boards, packed with flowers.
  rect(b, 0, 4, 18, 4, WOOD[2]);
  rect(b, 0, 4, 18, 1, WOOD[3]);
  rect(b, 0, 7, 18, 1, WOOD[1]);
  for (let x = 1; x < 17; x++) {
    setRGB(b, x, 3, LEAF[(x % 3) + 1]);
    if (x % 2) setRGB(b, x, 2, LEAF[2]);
  }
  for (let x = 1; x < 17; x += 2) {
    const c = FLOWERS[(Math.floor(hash(seed, x) * 3) + Math.floor(hash(seed, 9) * 4)) % FLOWERS.length];
    const y = hash(seed, x, 2) < 0.5 ? 1 : 2;
    setRGB(b, x, y, mixHex(c, '#ffffff', 0.3));
    setRGB(b, x + 1, y, c);
    setRGB(b, x, y + 1, shade(c, -0.3));
  }
  return { buf: inkOutline(b, INK), ax: 10, ay: 10 };
}

function stall(seed: number): Art {
  const b = blank(32, 26);
  const cloth = hash(seed, 1) < 0.5 ? ['#8a1e1e', '#c83a32', '#f0eadc'] : ['#1e3e7a', '#3a64b0', '#f0eadc'];
  // Posts, a striped awning with a scalloped hem, a counter of goods.
  rect(b, 2, 8, 2, 18, WOOD[2]);
  rect(b, 28, 8, 2, 18, WOOD[1]);
  for (let y = 0; y < 9; y++) {
    const inset = Math.max(0, 3 - Math.floor(y / 2));
    for (let x = inset; x < 32 - inset; x++) {
      const stripe = Math.floor(x / 4) % 2;
      let col = stripe ? cloth[2] : cloth[1];
      if (y < 2) col = stripe ? '#ffffff' : mixHex(cloth[1], '#ffffff', 0.25);
      if (y === 8 && x % 4 === 3) continue;
      if (y >= 7) col = stripe ? '#d8d0c0' : cloth[0];
      setRGB(b, x, y, col);
    }
  }
  rect(b, 1, 16, 30, 3, WOOD[3]);
  rect(b, 1, 16, 30, 1, WOOD[4]);
  rect(b, 1, 19, 30, 6, WOOD[2]);
  for (let x = 4; x < 30; x += 5) rect(b, x, 19, 1, 6, WOOD[1]);
  // Goods: apples, cabbages, loaves.
  for (let i = 0; i < 6; i++) {
    const gx = 4 + i * 4;
    const kind = (i + Math.floor(hash(seed, 2) * 3)) % 3;
    const ramp = kind === 0 ? ['#7a1a14', '#c0321e', '#e85a3a', '#ff9a7a'] : kind === 1 ? ['#2e5a26', '#4e8a38', '#7ab44c', '#b8e07a'] : ['#7a4a1a', '#b0702a', '#d8984a', '#f0c27a'];
    ball(b, gx + 1, 14.5, 2, 1.6, ramp);
    ball(b, gx + 2.5, 13.5, 1.6, 1.4, ramp);
  }
  return { buf: inkOutline(b, INK), ax: 16, ay: 27 };
}

function well(biome: Biome): Art {
  const b = blank(22, 28);
  // A round stone well (water inside), two posts, a shingle roof, a bucket on its rope.
  for (let y = 0; y < 10; y++) for (let x = 0; x < 22; x++) {
    const dx = (x + 0.5 - 11) / 10.5;
    const top = (y + 0.5 - 4) / 4;
    if (dx * dx + top * top <= 1 && y < 8) {
      const inner = (x + 0.5 - 11) ** 2 / 64 + (y + 0.5 - 4) ** 2 / 7 <= 1;
      setRGB(b, x, y + 14, inner ? (y < 3 ? '#0e1a24' : y < 5 ? '#1e3a4e' : '#2e5a6e') : dx < -0.3 ? STONE[4] : STONE[3]);
    }
  }
  setRGB(b, 8, 18, '#a8d8e8');
  setRGB(b, 9, 18, '#6aa8c0');
  for (let y = 22; y < 28; y++) for (let x = 0; x < 22; x++) {
    const dx = (x + 0.5 - 11) / 11;
    if (Math.abs(dx) > 1) continue;
    const row = y - 22;
    const sx = (x + (row % 2) * 2) % 5;
    let col = x < 7 ? STONE[3] : x > 16 ? STONE[1] : STONE[2];
    if (sx === 0 || row % 2 === 1 && y === 25) col = STONE[0];
    if (y === 27) col = STONE[1];
    setRGB(b, x, y, col);
  }
  rect(b, 2, 6, 2, 16, WOOD[2]);
  rect(b, 18, 6, 2, 16, WOOD[1]);
  rect(b, 4, 9, 14, 1, WOOD[1]);
  line(b, 11, 10, 11, 15, '#c8b890');
  rect(b, 10, 15, 3, 3, WOOD[2]);
  rect(b, 10, 15, 3, 1, IRON[2]);
  for (let y = 0; y < 7; y++) {
    const inset = Math.max(0, 3 - y);
    for (let x = inset; x < 22 - inset; x++) {
      const tx = (x + (y % 2) * 2) % 4;
      setRGB(b, x, y, tx === 0 ? WOOD[1] : y < 2 ? WOOD[4] : y > 4 ? WOOD[2] : WOOD[3]);
    }
  }
  return { buf: inkOutline(b, INK), ax: 11, ay: 29, ...(biome.liquid?.glow ? { light: { dx: 0, dy: -10, color: biome.liquid.glow, r: 30, flicker: false } } : {}) };
}

export type VillageKind = 'house' | 'pot' | 'bench' | 'lampPost' | 'signpost' | 'sack' | 'woodpile' | 'noticeBoard' | 'flowerBed' | 'stall' | 'wellStone';

export function villageArt(kind: VillageKind, biome: Biome, seed: number): Art {
  switch (kind) {
    case 'house':
      return houseArt(Math.round((seed - 7) / 104729));
    case 'pot':
      return pot(seed);
    case 'bench':
      return bench();
    case 'lampPost':
      return lampPost(biome);
    case 'signpost':
      return signpost(seed);
    case 'sack':
      return sacks(seed);
    case 'woodpile':
      return woodpile();
    case 'noticeBoard':
      return noticeBoard(seed);
    case 'flowerBed':
      return flowerBed(seed);
    case 'stall':
      return stall(seed);
    case 'wellStone':
      return well(biome);
  }
}

/** Decals a prop wants painted round its foot: flowers and tufts along a house front, beside the door. */
export function frontDecor(p: Prop): Array<{ kind: DecalKind; x: number; y: number; seed: number }> {
  if (p.kind !== 'house') return [];
  const L = houseLayout(p.seed % 5);
  const FW = L.tiles * 16;
  const left = p.x - FW / 2;
  const out: Array<{ kind: DecalKind; x: number; y: number; seed: number }> = [];
  for (let x = left + 3; x < left + FW - 2; x += 6) {
    if (Math.abs(x - (left + L.door)) < 10) continue;
    const r = hash(p.seed, x);
    if (r < 0.62) out.push({ kind: r < 0.4 ? 'flowers' : 'tuft', x, y: p.y + 2, seed: Math.floor(r * 1e9) });
  }
  return out;
}
