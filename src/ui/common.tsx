/** Shared UI pieces: outlined display lettering, bars, hero art at whole pixel sizes. */
import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { knightDef } from '../core/knights';
import { RARITY_COLOR, rarityIndex, type Rarity } from '../core/rarity';
import type { MutationId } from '../core/state';
import { KNIGHT_PIC_H, KNIGHT_PIC_W, knightUrl } from './sprites';

export const GRADIENTS = {
  gold: ['#fff7b0', '#ffc233', '#ff8a00'],
  cream: ['#ffffff', '#fff7e6', '#f2d9a8'],
  blue: ['#f0fdff', '#7fd6ff', '#2a8cf0'],
  green: ['#f2ffe0', '#9ef06b', '#3fae2a'],
  purple: ['#fbefff', '#d29bff', '#8a3ff0'],
  red: ['#fff0e8', '#ff8a6b', '#e5323d'],
  white: ['#ffffff', '#ffffff', '#e6e9f4'],
  rainbow: ['#ff5252', '#ffb300', '#69f0ae', '#40c4ff', '#e040fb'],
} as const;

export type Grad = keyof typeof GRADIENTS;

/** Big outlined display text in hard color bands (titles, banners, stamps). Size in art pixels. */
export function Chunky({ text, size = 10, grad = 'white', className, style }: { text: string; size?: number; grad?: Grad; className?: string; style?: CSSProperties }) {
  const stops = GRADIENTS[grad];
  const fill =
    grad === 'rainbow'
      ? `linear-gradient(90deg, ${stops.map((c, i) => `${c} ${(i * 100) / stops.length}% ${((i + 1) * 100) / stops.length}%`).join(', ')})`
      : `linear-gradient(180deg, ${stops[0]} 0 36%, ${stops[1]} 36% 70%, ${stops[2]} 70% 100%)`;
  return (
    <span className={`chunky ${className ?? ''}`} data-text={text} style={{ fontSize: `calc(${size} * var(--px))`, ['--fill' as string]: fill, ...style } as CSSProperties}>
      {text}
    </span>
  );
}

/** The display gradient for a rarity's name (rainbow for the top tiers). */
export function rarityGrad(r: Rarity): Grad {
  const i = rarityIndex(r);
  if (i >= rarityIndex('celestial')) return 'rainbow';
  if (i >= rarityIndex('legendary')) return 'gold';
  if (i >= rarityIndex('epic')) return 'purple';
  if (i >= rarityIndex('rare')) return 'blue';
  if (i >= rarityIndex('uncommon')) return 'green';
  return 'white';
}

export function Bar({ value, kind = 'hp', style, children }: { value: number; kind?: 'hp' | 'sp' | 'gold' | 'green' | 'purple'; style?: CSSProperties; children?: ReactNode }) {
  return (
    <div className={`bar ${kind}`} style={style}>
      <i style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
      {children}
    </div>
  );
}

/** A knight at s art pixels per sprite pixel (on var(--px)). The sprite image is KNIGHT_PIC_W x KNIGHT_PIC_H. */
export function HeroArt({ id, mutation = null, s = 1, frame, silhouette, style }: { id: string; mutation?: MutationId | null; s?: number; frame?: number; silhouette?: string; style?: CSSProperties }) {
  return (
    <img
      className="px"
      src={knightUrl(id, mutation, { frame, silhouette })}
      alt={knightDef(id).name}
      draggable={false}
      style={{ width: `calc(${KNIGHT_PIC_W * s} * var(--px))`, height: `calc(${KNIGHT_PIC_H * s} * var(--px))`, flex: 'none', ...style }}
    />
  );
}

/** A knight breathing (two idle frames). */
export function HeroLive(props: { id: string; mutation?: MutationId | null; s?: number; style?: CSSProperties }) {
  const [f, setF] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setF((x) => 1 - x), 460);
    return () => clearInterval(t);
  }, []);
  return <HeroArt {...props} frame={f} />;
}

/** A titled section of a panel, with an optional note after the title and something on the right. */
export function Section({ title, sub, children, right }: { title: string; sub?: ReactNode; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="stack">
      <div className="spread">
        <div className="section-title outlined">
          {title}
          {sub && <small>{sub}</small>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

export function rarityStyle(r: Rarity): CSSProperties {
  return { ['--rc' as string]: RARITY_COLOR[r] } as CSSProperties;
}

export function rarityOf(id: string): Rarity {
  return knightDef(id).rarity;
}
