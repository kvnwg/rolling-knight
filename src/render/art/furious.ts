/**
 * The furious merchant (world/thief.ts): Madame Thrift herself, robbed and coming for you. It's her
 * own chibi (art/npcs.ts dresses it), with her temper on it: a face gone red, her glasses glinting
 * red, a shout, steam huffing off her, her ledger thrown down and her fists up. As a foe she's shown
 * at twice the size, like every boss built on the mannequin (art/mobs.ts), her outline gone a dark
 * crimson. Three more pictures of her: the moment she turns (still at her stall, at her own size),
 * beaten (dazed, stars going round her head, at her own size again), and the red "!" over her head.
 *
 * Poses (art/mobs.ts MobPose): idle and walk are the mannequin's, stomping; in a wind-up both fists
 * go up with a fistful of coins over one of them; on the strike the arm comes down and out, the coins
 * leaving it.
 */
import { SHOPKEEPER, type NpcDef } from '../../world/npcs';
import { blank, type PixelBuf } from '../pixel/buf';
import { setRGB } from './draw';
import { OUTLINE } from './knights';
import type { MobFrame, MobPose } from './mobs';
import { NPC_ANCHOR, npcFrame, npcRig } from './npcs';

/** Her face, flushed. */
const FLUSH: readonly [string, string, string] = ['#a84638', '#da6a52', '#f49478'];
/** Her outline while she's a foe: ink gone crimson. */
const RAGE_INK = '#4a0a16';
const GLINT = ['#ff4a36', '#ffd9c2'] as const;
const MOUTH = '#4a0a10';
const STEAM = '#f6f0f4';
const COIN = ['#b8741a', '#ffd24a', '#fff3b0'] as const;

/** Her, angry: the same clothes, a red face, and nothing in her hand (the ledger's on the floor somewhere). */
const ANGRY: NpcDef = { ...SHOPKEEPER, look: { ...SHOPKEEPER.look, skin: FLUSH, item: undefined } };
/** Her, beaten: her own colors back, empty-handed. */
const DAZED: NpcDef = { ...SHOPKEEPER, look: { ...SHOPKEEPER.look, item: undefined } };

function clearPx(b: PixelBuf, x: number, y: number): void {
  if (x < 0 || y < 0 || x >= b.w || y >= b.h) return;
  b.px[(y * b.w + x) * 4 + 3] = 0;
}

function filled(b: PixelBuf, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < b.w && y < b.h && b.px[(y * b.w + x) * 4 + 3] > 0;
}

/** Outlines every empty pixel that touches one of `pts` edge-on (after they've all been set): the frame's outline grows to take them in. */
function inkRound(b: PixelBuf, pts: ReadonlyArray<readonly [number, number]>): void {
  for (const [x, y] of pts) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) if (!filled(b, x + dx, y + dy)) setRGB(b, x + dx, y + dy, OUTLINE);
}

/** Her face's temper: red glints on her glasses (they flicker), and her mouth open in a shout. */
function temper(b: PixelBuf, hx: number, hy: number, f: number, shout: boolean): void {
  const g = GLINT[f % 4 === 3 ? 1 : 0];
  setRGB(b, hx + 5, hy + 10, g);
  setRGB(b, hx + 8, hy + 10, g);
  // (On her chin's row: a row of face stays between it and her glasses.)
  if (shout) {
    setRGB(b, hx + 6, hy + 12, MOUTH);
    setRGB(b, hx + 7, hy + 12, MOUTH);
  }
}

/**
 * Steam huffing out of her ears: a jet either side of her head, then a puff further out, then it
 * rises and thins (overlay columns and rows, the left side's; the right mirrors it).
 */
const STEAM_PUFFS: ReadonlyArray<{ a: number; px: ReadonlyArray<readonly [number, number]> }> = [
  { a: 240, px: [[2, 9], [1, 9]] },
  { a: 240, px: [[1, 9], [0, 9], [0, 8], [1, 8]] },
  { a: 190, px: [[0, 7], [-1, 7], [-1, 6]] },
  { a: 120, px: [[-1, 5]] },
];
function steam(b: PixelBuf, hx: number, hy: number, f: number): void {
  const puff = STEAM_PUFFS[((f % 4) + 4) % 4];
  for (const [x, y] of puff.px) {
    for (const px of [hx + x, hx + 13 - x]) if (!filled(b, px, hy + y)) setRGB(b, px, hy + y, STEAM, puff.a);
  }
}

/**
 * Takes her hanging arms off (the body's sides close up behind them) and puts them where the pose
 * wants them: both fists up (a wind-up), or one up and the other thrown out (the strike).
 */
function arms(b: PixelBuf, rig: ReturnType<typeof npcRig>, pose: 'wind' | 'strike', f: number): void {
  const sleeve = ANGRY.look.sleeves ?? ANGRY.look.shirt;
  const [lx, ly] = rig.handL;
  const [rx, ry] = rig.handR;
  // The arms as the mannequin hangs them: two columns each side of the torso, from the shoulder row
  // (two above the hand) down to the hand's row, and the outline under them.
  for (const [hx0, side] of [[lx, -1], [rx, 1]] as const) {
    for (let y = ly - 1; y <= ly + 1; y++) for (const dx of [0, side, side * 2]) clearPx(b, hx0 + dx, y);
    // (The torso's own edge, where the arm was.)
    for (let y = ly - 1; y <= ly; y++) setRGB(b, hx0, y, OUTLINE);
  }
  const pts: Array<[number, number]> = [];
  const put = (x: number, y: number, hex: string) => {
    setRGB(b, x, y, hex);
    pts.push([x, y]);
  };
  // The left arm (hers; on the screen's left): up, fist by her head.
  put(lx - 1, ly - 2, sleeve[1]);
  put(lx - 2, ly - 3, sleeve[1]);
  put(lx - 2, ly - 4, sleeve[2]);
  put(lx - 2, ly - 5, FLUSH[2]);
  if (pose === 'wind') {
    // The right arm up too, a fistful of coins over it (they glint).
    put(rx + 1, ry - 2, sleeve[1]);
    put(rx + 2, ry - 3, sleeve[0]);
    put(rx + 2, ry - 4, sleeve[1]);
    put(rx + 2, ry - 5, FLUSH[1]);
    inkRound(b, pts);
    const up = f % 2;
    setRGB(b, rx + 2, ry - 7 - up, COIN[1]);
    setRGB(b, rx + 3, ry - 7, COIN[2]);
    setRGB(b, rx + 1, ry - 8, COIN[1]);
    setRGB(b, rx + 3, ry - 9 + up, COIN[0]);
  } else {
    // Thrown: the right arm straight out and down, the coins a step ahead of the hand.
    put(rx + 1, ry - 1, sleeve[1]);
    put(rx + 2, ry - 1, sleeve[0]);
    put(rx + 3, ry, sleeve[1]);
    put(rx + 4, ry, FLUSH[1]);
    inkRound(b, pts);
    setRGB(b, rx + 6, ry + 1, COIN[1]);
    setRGB(b, rx + 6, ry - 1, COIN[2]);
  }
}

/** Ink gone crimson (only the ink: nothing else in her is that color). */
function rageInk(b: PixelBuf): void {
  const o = [parseInt(OUTLINE.slice(1, 3), 16), parseInt(OUTLINE.slice(3, 5), 16), parseInt(OUTLINE.slice(5, 7), 16)];
  const r = [parseInt(RAGE_INK.slice(1, 3), 16), parseInt(RAGE_INK.slice(3, 5), 16), parseInt(RAGE_INK.slice(5, 7), 16)];
  for (let i = 0; i < b.px.length; i += 4) {
    if (b.px[i + 3] !== 255 || b.px[i] !== o[0] || b.px[i + 1] !== o[1] || b.px[i + 2] !== o[2]) continue;
    b.px[i] = r[0];
    b.px[i + 1] = r[1];
    b.px[i + 2] = r[2];
  }
}

function scale2(b: PixelBuf): PixelBuf {
  const out = blank(b.w * 2, b.h * 2);
  for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) {
    const i = ((y >> 1) * b.w + (x >> 1)) * 4;
    out.px.set(b.px.subarray(i, i + 4), (y * out.w + x) * 4);
  }
  return out;
}

/** Her at her own size, angry, facing you: the frame the fight's poses are built on. */
function angry(pose: MobPose, f: number): PixelBuf {
  const anim = pose === 'walk' ? 'walk' : 'idle';
  // (A wind-up stands tall, a strike dips into it.)
  const fr = pose === 'wind' ? 0 : pose === 'strike' ? 1 : f;
  const b = npcFrame(ANGRY, anim, 'down', fr).buf;
  const rig = npcRig(anim, 'down', fr);
  temper(b, rig.hx, rig.hy, f, true);
  // (In a wind-up and a strike her fists are up where the steam would go.)
  if (pose === 'wind' || pose === 'strike') arms(b, rig, pose, f);
  else steam(b, rig.hx, rig.hy, f);
  return b;
}

const frames = new Map<string, MobFrame>();

/** The furious merchant as a foe, facing you (the renderer mirrors her by the way she's headed): twice her size. */
export function furiousFrame(pose: MobPose, f: number): MobFrame {
  const key = `${pose}|${((f % 4) + 4) % 4}`;
  let m = frames.get(key);
  if (!m) {
    const b = angry(pose, f);
    rageInk(b);
    const buf = scale2(b);
    // (The feet: the anchor's pixel, doubled, its bottom row on the ground. Shots leave from her raised hand.)
    m = { buf, ax: NPC_ANCHOR.x * 2, ay: NPC_ANCHOR.y * 2 + 1, mx: (NPC_ANCHOR.x + 5) * 2, my: (NPC_ANCHOR.y - 12) * 2 };
    frames.set(key, m);
  }
  return m;
}

/** The moment she turns: still behind her counter, at her own size, red in the face and shouting. */
export function turningFrame(f: number): { buf: PixelBuf; ax: number; ay: number } {
  const b = npcFrame(ANGRY, 'idle', 'down', 0).buf;
  const rig = npcRig('idle', 'down', 0);
  temper(b, rig.hx, rig.hy, f, true);
  steam(b, rig.hx, rig.hy, f);
  return { buf: b, ax: NPC_ANCHOR.x, ay: NPC_ANCHOR.y };
}

/**
 * Beaten: herself again, at her own size, dazed. Her eyes are shut behind her glasses, she sways (the
 * mannequin's breathing), and three stars go round her head, in front of it and behind.
 */
export function dazedFrame(f: number): { buf: PixelBuf; ax: number; ay: number } {
  const fr = Math.floor(f / 4);
  const body = npcFrame(DAZED, 'idle', 'down', fr).buf;
  const rig = npcRig('idle', 'down', fr);
  // Eyes shut: the lenses go dull.
  setRGB(body, rig.hx + 5, rig.hy + 10, '#6a7a8a');
  setRGB(body, rig.hx + 8, rig.hy + 10, '#6a7a8a');
  const b = blank(body.w, body.h);
  const cx = rig.hx + 6.5;
  const cy = rig.hy + 4;
  const stars: Array<[number, number, boolean]> = [];
  for (let k = 0; k < 3; k++) {
    const a = ((f % 12) / 12 + k / 3) * Math.PI * 2;
    stars.push([Math.round(cx + Math.cos(a) * 6), Math.round(cy + Math.sin(a) * 2), Math.sin(a) > 0]);
  }
  // Behind her head first, then her, then the ones in front.
  for (const [x, y, front] of stars) if (!front) setRGB(b, x, y, COIN[1]);
  for (let i = 0; i < body.px.length; i += 4) if (body.px[i + 3]) b.px.set(body.px.subarray(i, i + 4), i);
  for (const [x, y, front] of stars) {
    if (!front) continue;
    setRGB(b, x, y, COIN[2]);
    setRGB(b, x - 1, y, COIN[1]);
    setRGB(b, x + 1, y, COIN[1]);
    setRGB(b, x, y - 1, COIN[1]);
    setRGB(b, x, y + 1, COIN[1]);
  }
  return { buf: b, ax: NPC_ANCHOR.x, ay: NPC_ANCHOR.y };
}
