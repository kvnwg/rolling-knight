/**
 * One set of sizes for every screen (ui/layout.ts): the UI always gets the room its screens were laid
 * out in, sizes change smoothly as a window is dragged (no cliffs), and the corner altar keeps its
 * knights as big with more reels until it fills its corner.
 */
import { describe, expect, it } from 'vitest';
import { ART_ACROSS, PX_MAX, PX_MIN, computeLayout, miniFit, miniPick, snap, type Layout } from '../src/ui/layout';
import { miniLayout } from '../src/ui/fx/altarArt';

/** Real screens: phones upright and on their side, the Claude app, tablets, desktops, CrazyGames' frames. */
const SCREENS: Array<[string, number, number, number, boolean]> = [
  ['small phone', 360, 640, 3, true],
  ['iPhone SE', 375, 667, 2, true],
  ['iPhone', 390, 844, 3, true],
  ['iPhone in the Claude app', 390, 700, 3, true],
  ['iPhone Pro Max', 430, 932, 3, true],
  ['iPhone Pro Max in the Claude app', 430, 790, 3, true],
  ['phone on its side', 844, 390, 3, true],
  ['small phone on its side', 667, 375, 2, true],
  ['iPad upright', 768, 1024, 2, true],
  ['iPad on its side', 1024, 768, 2, true],
  ['CrazyGames small', 821, 462, 1, false],
  ['CrazyGames', 1077, 606, 1, false],
  ['small desktop', 800, 600, 1, false],
  ['laptop', 1280, 720, 1, false],
  ['laptop 1366', 1366, 768, 1, false],
  ['MacBook', 1440, 900, 2, false],
  ['desktop', 1920, 1080, 1, false],
  ['big desktop', 2560, 1440, 1, false],
  ['ultrawide', 2560, 1080, 1, false],
  ['4K TV', 3840, 2160, 1, false],
  ['tall window', 700, 1000, 1, false],
  ['side panel', 560, 820, 2, false],
  ['side panel at 125%', 640, 1000, 1.25, false],
];

const each = (fn: (name: string, l: Layout) => void) => {
  for (const [name, w, h, dpr, touch] of SCREENS) fn(name, computeLayout(w, h, dpr, touch));
};

/** Is `v` a whole number of steps (device pixels on a sharp screen, half pixels otherwise)? */
const onStep = (v: number, dpr: number) => {
  const k = dpr >= 2 ? Math.round(dpr) : 2;
  return Math.abs(v * k - Math.round(v * k)) < 1e-6;
};

describe('the UI pixel', () => {
  it('stays readable and crisp on every screen', () => {
    each((name, l) => {
      expect(l.px, name).toBeGreaterThanOrEqual(PX_MIN);
      expect(l.px, name).toBeLessThanOrEqual(PX_MAX);
      expect(onStep(l.px, l.dpr), name).toBe(true);
      expect(onStep(l.hudPx, l.dpr), name).toBe(true);
      expect(onStep(l.miniU, l.dpr), name).toBe(true);
      expect(l.fpx, name).toBeGreaterThanOrEqual(2.5);
    });
  });

  it('never leaves a phone less room across than its screens were laid out in (nothing squeezes)', () => {
    for (let w = 320; w <= 480; w++) {
      for (const h of [560, 640, 700, 790, 844, 932]) {
        for (const dpr of [2, 3]) {
          const l = computeLayout(w, h, dpr, true);
          if (l.px > PX_MIN) expect(l.artW, `${w}x${h}@${dpr}`).toBeGreaterThanOrEqual(ART_ACROSS.phone);
        }
      }
    }
  });

  it('gives a phone held upright the same CSS sizes whatever its width, and more room as it widens', () => {
    const a = computeLayout(390, 844, 3, true);
    const b = computeLayout(430, 932, 3, true);
    expect(b.px).toBe(a.px);
    expect(b.artW).toBeGreaterThan(a.artW);
  });

  it('changes by at most one step for a pixel more or less of window (no cliffs)', () => {
    for (const dpr of [1, 2]) {
      for (const h of [400, 600, 800, 1000, 1200]) {
        let prev = computeLayout(300, h, dpr);
        for (let w = 301; w <= 2600; w++) {
          const l = computeLayout(w, h, dpr);
          const step = 1 / (dpr >= 2 ? Math.round(dpr) : 2);
          expect(Math.abs(l.px - prev.px), `${w}x${h}@${dpr} px`).toBeLessThanOrEqual(step + 1e-9);
          expect(Math.abs(l.hudPx - prev.hudPx), `${w}x${h}@${dpr} hud`).toBeLessThanOrEqual(step + 1e-9);
          prev = l;
        }
      }
    }
  });

  it('comes up on a big screen (a 4K TV is not a sea of tiny buttons)', () => {
    expect(computeLayout(2560, 1440, 1).px).toBeGreaterThan(computeLayout(1920, 1080, 1).px);
    expect(computeLayout(3840, 2160, 1).px).toBe(PX_MAX);
  });

  it('snaps down to whole device pixels', () => {
    expect(snap(3.31, 3)).toBeCloseTo(3);
    expect(snap(3.34, 3)).toBeCloseTo(10 / 3);
    expect(snap(2.74, 1)).toBe(2.5);
    expect(snap(2.74, 2)).toBe(2.5);
  });
});

describe('the HUD', () => {
  it('is smaller on a phone held upright, the UI pixel on a desktop or tablet', () => {
    const phone = computeLayout(390, 844, 3, true);
    expect(phone.hudPx).toBeLessThan(phone.px);
    for (const [w, h, dpr] of [
      [1920, 1080, 1],
      [768, 1024, 2],
      [1024, 768, 2],
    ]) {
      const l = computeLayout(w, h, dpr);
      expect(l.hudPx, `${w}x${h}`).toBe(l.px);
    }
  });

  it('leaves a short screen on its side room for the play', () => {
    each((name, l) => {
      if (!l.upright && l.hudPx > 1.5) expect(l.vh / l.hudPx, name).toBeGreaterThanOrEqual(219);
    });
  });
});

describe('the corner altar', () => {
  const size = (n: number) => {
    const m = miniLayout(n);
    return [m.W, m.H] as const;
  };

  it('keeps its knights as big with more reels, until it fills its corner', () => {
    each((name, l) => {
      for (let n = 1; n <= 6; n++) {
        const [w, h] = size(n);
        const u = miniFit(l, w, h);
        if (w * l.miniU <= l.miniBoxW && h * l.miniU <= l.miniBoxH) expect(u, `${name}, ${n} reels`).toBe(l.miniU);
        else expect(u, `${name}, ${n} reels`).toBeLessThan(l.miniU);
        // It fits its corner (at the least one CSS px a pixel).
        if (u > 1) {
          expect(w * u, `${name}, ${n} reels across`).toBeLessThanOrEqual(l.miniBoxW + 1e-6);
          expect(h * u, `${name}, ${n} reels down`).toBeLessThanOrEqual(l.miniBoxH + 1e-6);
        }
      }
    });
  });

  it('never draws its windows too small to make out a knight (taking its reels in one row if need be)', () => {
    each((name, l) => {
      for (let n = 1; n <= 6; n++) {
        const one = miniLayout(n, true);
        const { pick, u } = miniPick(l, [size(n), [one.W, one.H]]);
        const cell = miniLayout(n, pick === 1).cells[0];
        expect(cell.h * u, `${name}, ${n} reels`).toBeGreaterThanOrEqual(36);
      }
    });
  });

  it('keeps two rows wherever they draw the knights as big as one row would', () => {
    const l = computeLayout(1920, 1080, 1);
    const one = miniLayout(6, true);
    expect(miniPick(l, [size(6), [one.W, one.H]]).pick).toBe(0);
    const side = computeLayout(844, 390, 3, true);
    expect(miniPick(side, [size(6), [one.W, one.H]]).pick).toBe(1);
  });

  it('is bigger with more reels than with one', () => {
    each((name, l) => {
      const [w1, h1] = size(1);
      const [w3, h3] = size(3);
      expect(w3 * miniFit(l, w3, h3), name).toBeGreaterThan(w1 * miniFit(l, w1, h1));
    });
  });

  it('is never tiny on a phone held upright (a fifth of the width or more)', () => {
    each((name, l) => {
      if (!l.upright) return;
      const [w, h] = size(1);
      expect(w * miniFit(l, w, h), name).toBeGreaterThanOrEqual(l.vw * 0.17);
    });
  });
});

describe('the room words', () => {
  it('step on art pixels, not CSS pixels', () => {
    expect(computeLayout(390, 844, 3, true).across).toBe('n');
    expect(computeLayout(430, 932, 3, true).across).toBe('n');
    expect(computeLayout(768, 1024, 2, true).across).toBe('w');
    expect(computeLayout(1920, 1080, 1).across).toBe('x');
    expect(computeLayout(430, 790, 3, true).down).toBe('m');
    expect(computeLayout(390, 700, 3, true).down).toBe('s');
    expect(computeLayout(390, 844, 3, true).down).toBe('t');
    expect(computeLayout(821, 462, 1).down).toBe('s');
  });
});
