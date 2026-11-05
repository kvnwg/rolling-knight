/**
 * The altar's reels, drawn on a canvas at 60 fps from the current spin (whose results were decided
 * when it started). Knight silhouettes scroll past (they lean far rarer than the real odds, and most
 * of the time a near miss sits right next to the real result: decoration only), the reel lands on
 * any luck tokens first, then on its knight, which flashes into color.
 */
import { useEffect, useRef } from 'react';
import { BAL } from '../core/balance';
import { CLASS_IDS, knightId } from '../core/knights';
import { RARITIES, RARITY_COLOR, rarityIndex, type Rarity } from '../core/rarity';
import type { Spin } from '../core/state';
import type { Game } from '../game';
import { KNIGHT_PIC_H, KNIGHT_PIC_W, knightUrl } from './sprites';

const FILLER: Record<Rarity, number> = {
  common: 12, uncommon: 16, rare: 18, epic: 20, legendary: 18, mythic: 10, ancient: 8, exalted: 7, celestial: 6, astral: 6, divine: 4, eternal: 3, primordial: 2, absolute: 1,
};

const imgCache = new Map<string, HTMLImageElement>();
function img(url: string): HTMLImageElement {
  let i = imgCache.get(url);
  if (!i) {
    i = new Image();
    i.src = url;
    imgCache.set(url, i);
  }
  return i;
}

function rnd(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Strip {
  cells: Array<{ rarity: Rarity; id: string } | { token: number }>;
}

/** Each reel's strip for a spin: fillers, then (per segment) a token or the result, with near misses. */
function buildStrips(spin: Spin): Strip[] {
  return spin.reels.map((reel, i) => {
    const r = rnd(spin.id * 31 + i * 7);
    const pick = (): { rarity: Rarity; id: string } => {
      let total = 0;
      for (const k of RARITIES) total += FILLER[k];
      let x = r() * total;
      let rar: Rarity = 'common';
      for (const k of RARITIES) {
        x -= FILLER[k];
        if (x < 0) {
          rar = k;
          break;
        }
      }
      return { rarity: rar, id: knightId(rar, CLASS_IDS[Math.floor(r() * CLASS_IDS.length)]) };
    };
    const cells: Strip['cells'] = [];
    const segs = reel.tokens.length + 1;
    for (let s = 0; s < segs; s++) {
      for (let k = 0; k < 40; k++) cells.push(pick());
      const stop: Strip['cells'][number] = s < reel.tokens.length ? { token: reel.tokens[s] } : { rarity: reel.rarity, id: reel.knightId };
      // The near miss: something rarer right next to the real stop.
      if (r() < BAL.feel.reels.nearMissChance && 'rarity' in stop) {
        const up: Rarity = RARITIES[Math.min(RARITIES.length - 1, rarityIndex(stop.rarity) + 1 + Math.floor(r() * 2))] ?? stop.rarity;
        cells[cells.length - 1] = { rarity: up, id: knightId(up, CLASS_IDS[Math.floor(r() * 6)]) };
      }
      cells.push(stop);
      for (let k = 0; k < 3; k++) cells.push(pick());
    }
    return { cells };
  });
}

/** Where a reel's strip is at time t (in cells), and whether it's resting on a stop. */
function reelPos(spin: Spin, i: number, t: number): { pos: number; seg: number; resting: boolean } {
  const reel = spin.reels[i];
  const base = spin.baseSpinSeconds;
  const stagger = Math.min(0.35, base * 0.12);
  const hold = BAL.roll.tokens.holdSeconds;
  const segs = reel.tokens.length + 1;
  let start = 0;
  for (let s = 0; s < segs; s++) {
    const dur = base + (s === 0 ? i * stagger : 0);
    const end = start + dur;
    const stopCell = s * 44 + 40;
    const fromCell = s === 0 ? 0 : (s - 1) * 44 + 40;
    if (t < end) {
      const k = Math.max(0, Math.min(1, (t - start) / dur));
      const ease = 1 - Math.pow(1 - k, 3);
      return { pos: fromCell + (stopCell - fromCell) * ease, seg: s, resting: false };
    }
    if (s === segs - 1 || t < end + hold) return { pos: stopCell, seg: s, resting: true };
    start = end + hold;
  }
  return { pos: (segs - 1) * 44 + 40, seg: segs - 1, resting: true };
}

export function ReelsCanvas({ game, cell, reelsMax = 5, className }: { game: Game; cell: number; reelsMax?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0;
    let strips: Strip[] = [];
    let stripId = -1;
    let last: Spin | null = null;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const c = ref.current;
      if (!c) return;
      const spin = game.state.roll.current ?? last;
      if (game.state.roll.current) last = game.state.roll.current;
      const n = Math.min(reelsMax, spin ? spin.reels.length : 1);
      const cw = cell;
      const ch = Math.round(cell * 0.9);
      const gap = 2;
      const W = n * (cw + gap) + gap;
      const H = ch * 3 + 4;
      if (c.width !== W || c.height !== H) {
        c.width = W;
        c.height = H;
      }
      const ctx = c.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = '#1a1014';
      ctx.fillRect(0, 0, W, H);
      if (!spin) return;
      if (spin.id !== stripId) {
        strips = buildStrips(spin);
        stripId = spin.id;
      }
      const t = game.state.roll.current ? game.state.roll.timer : 99;
      for (let i = 0; i < n; i++) {
        const reel = spin.reels[i];
        const x0 = gap + i * (cw + gap);
        const { pos, seg, resting } = reelPos(spin, i, t);
        const landed = reel.landed || t >= reel.landAt;
        // Reel background, glowing in the rarity's color once it lands (the build-up climbs to it).
        ctx.fillStyle = '#2a1c18';
        ctx.fillRect(x0, 2, cw, H - 4);
        const strip = strips[i];
        const top = pos - 1;
        for (let k = Math.floor(top) - 1; k <= Math.ceil(top) + 3; k++) {
          const cellData = strip.cells[k];
          if (!cellData) continue;
          const y = Math.round(2 + (k - top) * ch);
          const isStop = Math.abs(k - pos) < 0.01 && resting;
          if ('token' in cellData) {
            ctx.fillStyle = '#1e3a1e';
            ctx.fillRect(x0 + 2, y + 2, cw - 4, ch - 4);
            ctx.fillStyle = isStop ? '#8af07a' : '#4a8a3a';
            ctx.font = `bold ${Math.round(ch * 0.42)}px "Pixelify Sans", monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`×${cellData.token}`, x0 + cw / 2, y + ch / 2);
            continue;
          }
          const showColor = isStop && (landed || seg === strip.cells.length);
          if (showColor) {
            ctx.fillStyle = RARITY_COLOR[cellData.rarity];
            ctx.globalAlpha = 0.35;
            ctx.fillRect(x0 + 1, y + 1, cw - 2, ch - 2);
            ctx.globalAlpha = 1;
          }
          const im = img(knightUrl(cellData.id, showColor ? reel.mutation : null, { silhouette: showColor ? undefined : '#08060a' }));
          if (im.complete) {
            const s = Math.max(1, Math.floor((ch - 2) / KNIGHT_PIC_H));
            const iw = KNIGHT_PIC_W * s;
            const ih = KNIGHT_PIC_H * s;
            ctx.drawImage(im, Math.round(x0 + cw / 2 - iw / 2), Math.round(y + ch - ih), iw, ih);
          }
          if (!showColor && cw >= 40) {
            ctx.fillStyle = RARITY_COLOR[cellData.rarity];
            ctx.globalAlpha = 0.85;
            ctx.fillRect(x0 + 2, y + ch - 3, cw - 4, 2);
            ctx.globalAlpha = 1;
          }
        }
        // The win line.
        ctx.fillStyle = landed ? RARITY_COLOR[reel.rarity] : '#ffd25a';
        ctx.fillRect(x0, 2 + ch, cw, 1);
        ctx.fillRect(x0, 2 + ch * 2 - 1, cw, 1);
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = '#000';
        ctx.fillRect(x0, 2, cw, ch);
        ctx.fillRect(x0, 2 + ch * 2, cw, ch);
        ctx.globalAlpha = 1;
      }
      // A Lucky or Golden spin lights the frame.
      if (spin.lucky || spin.golden) {
        ctx.strokeStyle = spin.golden ? '#ffd25a' : '#8af07a';
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, W - 2, H - 2);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [game, cell, reelsMax]);
  return <canvas ref={ref} className={className} />;
}
