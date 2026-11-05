import type { CSSProperties } from 'react';
import s from './Chunky.module.css';

export const GRADIENTS = {
  gold: ['#fff7b0', '#ffc233', '#ff8a00'],
  blue: ['#f0fdff', '#7fd6ff', '#2a8cf0'],
  green: ['#f2ffe0', '#9ef06b', '#3fae2a'],
  purple: ['#fbefff', '#d29bff', '#8a3ff0'],
  red: ['#fff0e8', '#ff8a6b', '#e5323d'],
  white: ['#ffffff', '#ffffff', '#e6e9f4'],
  rainbow: ['#ff5252', '#ffb300', '#69f0ae', '#40c4ff', '#e040fb'],
} as const;

export type Grad = keyof typeof GRADIENTS;

/**
 * Big outlined display text in hard color bands (stamps, banners, "LEGENDARY!", "COMBO!"), ported from
 * Dumpster Legend. `size` is in art pixels (times the UI's --u); `grad` a named gradient or three
 * bands of your own (light, mid, dark).
 */
export function Chunky({
  text,
  size = 12,
  grad = 'white',
  className,
  style,
}: {
  text: string;
  size?: number;
  grad?: Grad | readonly string[];
  className?: string;
  style?: CSSProperties;
}) {
  const stops = typeof grad === 'string' ? GRADIENTS[grad] : grad;
  // Hard color bands, not a smooth blend: pixel-art lettering.
  const fill =
    grad === 'rainbow'
      ? `linear-gradient(90deg, ${stops.map((c, i) => `${c} ${(i * 100) / stops.length}% ${((i + 1) * 100) / stops.length}%`).join(', ')})`
      : `linear-gradient(180deg, ${stops[0]} 0 36%, ${stops[1]} 36% 70%, ${stops[2] ?? stops[1]} 70% 100%)`;
  return (
    <span
      className={`${s.chunky} ${className ?? ''}`}
      data-text={text}
      style={{ fontSize: `calc(${size} * var(--u, 3px))`, ['--fill' as string]: fill, ...style } as CSSProperties}
    >
      {text}
    </span>
  );
}
