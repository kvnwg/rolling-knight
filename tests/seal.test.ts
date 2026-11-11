/**
 * A new game's altar is sealed (ui/fx/AltarSeal.tsx breaks it): it doesn't spin until the seal is
 * broken, then it spins as ever; a save from before the seal never has one.
 */
import { describe, expect, it } from 'vitest';
import { newGame } from '../src/core/newGame';
import { mend } from '../src/core/save';
import { Game } from '../src/game';
import { sealLayout, sealPixels } from '../src/ui/fx/sealArt';

describe('the sealed altar', () => {
  it('spins only once its seal is broken', () => {
    const g = new Game(true);
    g.state.roll.sealed = true;
    for (let i = 0; i < 200; i++) g.tick(0.05);
    expect(g.state.roll.count).toBe(0);
    expect(g.state.roll.current).toBeNull();
    expect(Object.keys(g.state.roster)).toHaveLength(0);
    g.breakSeal();
    expect(g.state.roll.sealed).toBe(false);
    for (let i = 0; i < 200; i++) g.tick(0.05);
    expect(g.state.roll.count).toBeGreaterThan(0);
    expect(Object.keys(g.state.roster).length).toBeGreaterThan(0);
  });

  it('starts sealed on a new game from Settings, and stays broken in a save', () => {
    const g = new Game(true);
    g.reset();
    expect(g.state.roll.sealed).toBe(true);
    g.breakSeal();
    const back = mend(JSON.parse(JSON.stringify(g.state)));
    expect(!!back.roll.sealed).toBe(false);
    // An older save (no seal in it) is never sealed; nor is a game the tools and tests make.
    const old = JSON.parse(JSON.stringify(newGame(3)));
    delete old.roll.sealed;
    expect(!!mend(old).roll.sealed).toBe(false);
    expect(!!new Game(true).state.roll.sealed).toBe(false);
  });
});

describe("the seal's pixel art", () => {
  // The altars as the desktop and a phone lay them out (art pixels): the box, and its reel window.
  const desk = sealLayout(286, 175, { x: 18, y: 45, w: 250, h: 82 });
  const phone = sealLayout(116, 121, { x: 18, y: 45, w: 86, h: 44 });

  it('hangs the big lock on a wide altar and the small one on a narrow one, in the reel window', () => {
    expect(desk.size).toBe('big');
    expect(phone.size).toBe('small');
    for (const [L, win] of [
      [desk, { x: 18, y: 45, w: 250, h: 82 }],
      [phone, { x: 18, y: 45, w: 86, h: 44 }],
    ] as const) {
      // Centred on a pixel (odd across), the keyhole and the crossing on its middle column.
      expect(L.lockW % 2).toBe(1);
      expect(L.lockX + (L.lockW - 1) / 2).toBe(win.x + Math.floor(win.w / 2));
      expect(L.kx).toBe(L.cx);
      // The chains cross inside the shackle, above the body's keyhole.
      expect(L.cy).toBeGreaterThan(L.lockY);
      expect(L.cy).toBeLessThan(L.ky);
      expect(Math.abs(L.lockY + L.lockH / 2 - (win.y + win.h / 2))).toBeLessThanOrEqual(1);
    }
  });

  it('draws every piece whole: the lock its size in every state, the chains through the crossing', () => {
    for (const L of [desk, phone]) {
      const P = sealPixels(L);
      const pics = [P.lock, P.lockBright, P.lockOpen];
      for (const pic of pics) {
        expect(pic.length).toBe(pics[0].length);
        expect(pic.length).toBeGreaterThanOrEqual(L.lockH);
        for (const row of pic) expect(row.length).toBe(L.lockW);
      }
      // Only the keyhole's light differs between the lock at rest and lit up.
      const changed = P.lock.flatMap((row, y) => row.filter((c, x) => c !== P.lockBright[y][x])).length;
      expect(changed).toBeGreaterThan(5);
      expect(changed).toBeLessThan(60);
      // Each length of chain is the altar's size; the across and down chains both reach the crossing.
      for (const piece of [P.left, P.right, P.top, P.bottom]) {
        expect(piece.length).toBe(L.H);
        expect(piece[0].length).toBe(L.W);
      }
      // (At the crossing: an edge-on link of each, a side of it either side of its slit.)
      expect(P.left[L.cy - 2][L.cx]).not.toBeNull();
      expect(P.top[L.cy][L.cx - 2]).not.toBeNull();
      // They run the altar's width and height.
      expect(P.left[L.cy].slice(0, 4).some(Boolean) || P.left.some((row) => row[0])).toBe(true);
      expect(P.right.some((row) => row[L.W - 1])).toBe(true);
      expect(P.top[0].some(Boolean)).toBe(true);
      expect(P.bottom[L.H - 1].some(Boolean)).toBe(true);
    }
  });
});
