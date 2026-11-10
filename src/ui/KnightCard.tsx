/**
 * A knight's card, the same wherever knights are listed (the roster, the summon log, the codex): the
 * rarity's color as a crisp frame round the knight standing in its rarity's little pixel scene
 * (backdrop.ts), the name, then up to two fixed lines (level; power and odds), in icons and
 * numbers. Badges have fixed spots that keep clear of the knight: the leader's crown in the
 * picture's top left corner, the spare copies chip in its top right, NEW on the card's top edge.
 */
import { useRef, type CSSProperties, type ReactNode } from 'react';
import { knightDef } from '../core/knights';
import { oneInFor } from '../core/luck';
import { RARITY_COLOR, RARITY_NAME, RARITY_ODDS, type Rarity } from '../core/rarity';
import type { MutationId } from '../core/state';
import { backdropStyle } from './backdrop';
import { HeroArt, rarityStyle } from './common';
import { oneInShort } from './format';
import { KNIGHT_PIC_H, KNIGHT_PIC_W } from './sprites';

/** The box a card's knight is fitted into, in art pixels (var(--px)). */
export const CARD_KNIGHT = { w: 44, h: 36 };

/** CSS px per art pixel right now (App sets --px from the screen size). */
export function artPx(): number {
  if (typeof document === 'undefined') return 2.5;
  return parseFloat(document.documentElement.style.getPropertyValue('--px')) || 2.5;
}

/**
 * The size of a knight picture fitted into a box of `w` x `h` art pixels, at a whole number of
 * screen (device) pixels per sprite pixel: a fractional scale would draw some of its pixels wider
 * than others. Sized from KNIGHT_PIC_W/H, so a redrawn knight of another size fits the same box.
 */
export function knightFit(w: number, h: number): CSSProperties {
  const pix = knightPix(w, h);
  return { width: `${KNIGHT_PIC_W * pix}px`, height: `${KNIGHT_PIC_H * pix}px` };
}

/** CSS px to one of the knight's pixels when it's fitted into a box of `w` x `h` art pixels (knightFit). */
export function knightPix(w: number, h: number): number {
  const px = artPx();
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  const k = Math.max(1, Math.floor(Math.min((w * px * dpr) / KNIGHT_PIC_W, (h * px * dpr) / KNIGHT_PIC_H)));
  return k / dpr;
}

/** The art box's height (art px) on a card: .kcard .kc-art in styles.css. */
const CARD_ART_H = 40;

/** A rarity's odds as the altar's odds table has them, short ("1 in 1K", "1 in 2.5B"); Common is just Common. */
export function rarityOdds(r: Rarity): string {
  return RARITY_ODDS[r] <= 1 ? RARITY_NAME[r] : oneInShort(RARITY_ODDS[r]);
}

/**
 * A knight's own odds, as its reveal counts them up: its tier at luck 1 times its mutation's
 * ("1 in 2", "1 in 1K", "1 in 2.5B"). Every knight has them, the Commons too.
 */
export function knightOdds(rarity: Rarity, mutation: MutationId | null = null): string {
  return oneInShort(oneInFor(rarity, mutation));
}

/** Those odds on a little dark plate in the tier's colour: every card of a knight carries one. */
export function OddsChip({ rarity, mutation = null }: { rarity: Rarity; mutation?: MutationId | null }) {
  return (
    <span className="odds-chip num" style={{ ['--rc' as string]: RARITY_COLOR[rarity] } as CSSProperties} title="Its odds at the altar">
      {knightOdds(rarity, mutation)}
    </span>
  );
}

/** A value that pops (a quick bump) whenever it changes; not when it first shows. */
export function Bump({ value, children, className }: { value: number | string; children?: ReactNode; className?: string }) {
  const last = useRef(value);
  const count = useRef(0);
  if (last.current !== value) {
    last.current = value;
    count.current += 1;
  }
  return (
    <span key={count.current} className={`${className ?? ''}${count.current ? ' rk-bump' : ''}`}>
      {children ?? value}
    </span>
  );
}

/** A flash over its (positioned) parent whenever `value` changes. */
export function Flash({ value }: { value: number }) {
  const last = useRef(value);
  const count = useRef(0);
  if (last.current !== value) {
    last.current = value;
    count.current += 1;
  }
  return count.current ? <i key={count.current} className="rk-flash" /> : null;
}

export interface TileProps {
  id: string;
  mutation?: MutationId | null;
  /** The frame's color. */
  rarity: Rarity;
  /** Codex: drawn as a flat silhouette (not found yet). */
  silhouette?: string;
  name: ReactNode;
  /** Line two (class and level). */
  meta?: ReactNode;
  /** Line three: its two ends (power, odds). */
  left?: ReactNode;
  right?: ReactNode;
  /** Badges in the picture's top corners, and on the middle of the card's top edge. */
  tl?: ReactNode;
  tr?: ReactNode;
  top?: ReactNode;
  /** The knight you play: a gold ring. */
  lead?: boolean;
  dim?: boolean;
  onClick?: () => void;
  label?: string;
}

export function KnightTile(p: TileProps) {
  // The rarity's little scene behind the knight, in the knight's own pixels; its feet a pixel of the
  // card's above the foot of the box (the picture's four rows under the feet, then the margin).
  const pix = knightPix(CARD_KNIGHT.w, CARD_KNIGHT.h);
  const scene = backdropStyle(p.rarity, pix, CARD_ART_H * artPx(), 4 + artPx() / pix);
  const body = (
    <>
      <div className="kc-art" style={scene}>
        <HeroArt id={p.id} mutation={p.mutation ?? null} silhouette={p.silhouette} style={knightFit(CARD_KNIGHT.w, CARD_KNIGHT.h)} />
        {p.tl && <span className="kc-corner tl">{p.tl}</span>}
        {p.tr && <span className="kc-corner tr">{p.tr}</span>}
      </div>
      {p.top && <span className="kc-top">{p.top}</span>}
      <div className="kc-info">
        <div className="kc-name">{p.name}</div>
        {p.meta !== undefined && <div className="kc-meta">{p.meta}</div>}
        {/* Line three: whatever the card was given, and always the knight's own odds. */}
        <div className="kc-foot">
          <span className="l">{p.left}</span>
          <span className="r">{p.right ?? <OddsChip rarity={knightDef(p.id).rarity} mutation={p.mutation ?? null} />}</span>
        </div>
      </div>
    </>
  );
  const cls = `kcard${p.lead ? ' lead' : ''}${p.dim ? ' dim' : ''}`;
  const style = rarityStyle(p.rarity);
  return p.onClick ? (
    <button className={cls} style={style} onClick={p.onClick} aria-label={p.label}>
      {body}
    </button>
  ) : (
    <div className={cls} style={style} aria-label={p.label}>
      {body}
    </div>
  );
}
