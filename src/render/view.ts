/**
 * The world as the game canvas shows it, for what's drawn over the canvas in the page (the HUD's spell
 * slam drops its icon onto a knight's raised weapon). The renderer sets one every frame (Game.view):
 * the world point at the screen's top-left (the camera with its shake; the frame's slide below a
 * whole art pixel included) and the CSS pixels per world pixel (the zoom over the device's pixel
 * ratio). Sprites sit on whole world pixels, so a point on one is rounded first, as the renderer does.
 */
export interface ScreenView {
  /** The world point at the screen's top-left corner (world px). */
  x: number;
  y: number;
  /** CSS pixels per world (art) pixel. */
  k: number;
}

/**
 * The view the renderer draws: `camX`, `camY` the view's top-left (world px, unrounded, shake
 * included), `scale` screen pixels per art pixel, `dpr` the canvas's device pixels per CSS pixel.
 */
export function screenView(camX: number, camY: number, scale: number, dpr: number): ScreenView {
  return { x: camX, y: camY, k: scale / Math.max(1e-6, dpr) };
}

/** A world point on the page (CSS px from its top-left). `snap`: on the pixel grid, as sprites are drawn. */
export function toScreen(v: ScreenView, x: number, y: number, snap = false): { x: number; y: number } {
  const wx = snap ? Math.round(x) : x;
  const wy = snap ? Math.round(y) : y;
  return { x: (wx - v.x) * v.k, y: (wy - v.y) * v.k };
}

/** A point on the page (CSS px) as a world point: toScreen's inverse. */
export function toWorld(v: ScreenView, x: number, y: number): { x: number; y: number } {
  return { x: v.x + x / v.k, y: v.y + y / v.k };
}
