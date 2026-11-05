/**
 * An offer on a keeper's counter, as a card (the gun shop's): a header with its level, its picture in
 * a slot pressed into the paper, its name, a short line or two of icons and numbers, and the price
 * button, a coin and a number on green. Bought: the card flashes, the price floats up out of it and
 * the level pops. Can't afford it: the button shakes its head and floats how much is missing. Done:
 * a grey button with a check. Locked: a ribbon with a padlock across the picture, a padlock on the
 * button. Words (what it does, what opens it) wait in the popup its picture or name opens.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useHoldRepeat } from '../upgrades/parts';
import { Px, type IconName } from '../px';
import { Glyph } from './KeeperScreen';
import s from './keeper.module.css';

export interface CardLine {
  icon?: IconName;
  text: ReactNode;
  tone?: 'good' | 'muted' | 'bad' | 'gold';
}

export type CardButton =
  | {
      kind: 'buy';
      label: ReactNode;
      icon?: IconName;
      /** Green when it can be bought now; beige with red writing when it can't. */
      ready: boolean;
      /** Brass instead of green (a big one-off). */
      gold?: boolean;
      /** Buys once (repeat 0) or again while held (1, 2, ...); false when it couldn't. */
      onPress: (repeat: number) => boolean;
      /** Keep buying while held. */
      hold?: boolean;
      /** Floats up when it buys ("-1,080"), or worked out after it did (a reforge's result). */
      paid?: string | (() => string);
      /** Floats up, in red, when it can't ("340 short"). */
      short?: string;
    }
  | { kind: 'done'; label?: ReactNode }
  | { kind: 'locked'; label?: ReactNode };

export interface OfferCardProps {
  /** The header's left (Lv.3) and right (3/8); no header when both are left out. */
  level?: ReactNode;
  levelRight?: ReactNode;
  art: ReactNode;
  /** A tag in the slot's corner: NEW, x3, ONE-OFF. */
  /** A tag in the picture's corner: words, an icon, or (neither) a little square of `color`. */
  tag?: { text?: string; icon?: string; kind?: 'gold' | 'new' | 'dupe'; color?: string; title?: string };
  name: ReactNode;
  lines: CardLine[];
  /** The price button (none for a card that only shows something). */
  button?: CardButton;
  /** A taller picture slot (a knight). */
  tall?: boolean;
  /** Under the button: what opens it, or how much is missing. */
  note?: ReactNode;
  state?: 'open' | 'locked' | 'done';
  special?: boolean;
  /** Words on the padlock ribbon (locked cards; just the padlock when left out). */
  ribbon?: string;
  onArt?: () => void;
  title?: string;
}

interface Float {
  key: number;
  text: string;
  tone: 'good' | 'bad';
}

export function OfferCard(p: OfferCardProps) {
  const [flash, setFlash] = useState(0);
  const [nope, setNope] = useState(0);
  const [float, setFloat] = useState<Float | null>(null);
  const n = useRef(0);
  const btn = p.button;
  const press = (repeat: number): boolean => {
    if (btn?.kind !== 'buy') return false;
    const ok = btn.onPress(repeat);
    if (ok) {
      setFlash((x) => x + 1);
      const paid = typeof btn.paid === 'function' ? btn.paid() : btn.paid;
      if (paid) setFloat({ key: ++n.current, text: paid, tone: 'good' });
    } else if (repeat === 0) {
      setNope((x) => x + 1);
      if (btn.short) setFloat({ key: ++n.current, text: btn.short, tone: 'bad' });
    }
    return ok;
  };
  const hold = useHoldRepeat(press);
  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(0), 520);
    return () => window.clearTimeout(t);
  }, [flash]);
  useEffect(() => {
    if (!nope) return;
    const t = window.setTimeout(() => setNope(0), 400);
    return () => window.clearTimeout(t);
  }, [nope]);
  useEffect(() => {
    if (!float) return;
    const t = window.setTimeout(() => setFloat((f) => (f?.key === float.key ? null : f)), 950);
    return () => window.clearTimeout(t);
  }, [float]);

  return (
    <div className={s.card} data-state={p.state ?? 'open'} data-special={p.special || undefined} data-flash={flash ? flash : undefined} title={p.title}>
      {flash > 0 && <i key={`flash${flash}`} className={s.flashFx} aria-hidden />}
      {(p.level !== undefined || p.levelRight !== undefined) && (
        <div className={s.head}>
          <span className={s.lv} key={flash}>
            {p.level}
          </span>
          {p.levelRight !== undefined && <small>{p.levelRight}</small>}
        </div>
      )}
      <div className={s.well} onClick={p.onArt} role={p.onArt ? 'button' : undefined} data-tall={p.tall || undefined}>
        {p.art}
        {p.tag && (
          <span
            className={s.tag}
            data-kind={p.tag.kind}
            data-icon={p.tag.icon && !p.tag.text ? '' : undefined}
            data-dot={!p.tag.icon && !p.tag.text ? '' : undefined}
            title={p.tag.title}
            style={p.tag.color ? { background: p.tag.color, color: '#1e0f08' } : undefined}
          >
            {p.tag.icon && <Glyph icon={p.tag.icon} size="xs" />}
            {p.tag.text}
          </span>
        )}
        {p.state === 'locked' && (
          <span className={s.ribbon}>
            <Px icon="lock" size="sm" />
            {p.ribbon}
          </span>
        )}
      </div>
      <div className={s.name} onClick={p.onArt}>
        {p.name}
      </div>
      <div className={s.lines}>
        {p.lines.map((l, i) => (
          <div key={i} className={s.line} data-tone={l.tone}>
            {l.icon && <Px icon={l.icon} size="xs" />}
            <span>{l.text}</span>
          </div>
        ))}
      </div>
      {!btn ? null : btn.kind === 'buy' ? (
        <button
          key={nope ? `n${nope}` : 'b'}
          className={`btn ${s.buy}`}
          data-kind={btn.ready ? (btn.gold ? 'gold' : 'buy') : 'short'}
          data-nope={nope > 0 || undefined}
          {...(btn.hold ? hold : { onClick: () => press(0) })}
        >
          {btn.icon && <Px icon={btn.icon} size="xs" />}
          <span>{btn.label}</span>
        </button>
      ) : (
        <button className={`btn ${s.buy}`} data-kind={btn.kind} disabled={!p.onArt} onClick={p.onArt}>
          {btn.kind === 'locked' ? <Px icon="lock" size="sm" /> : <Px icon="check" size="sm" />}
          {btn.label && <span>{btn.label}</span>}
        </button>
      )}
      {p.note && <div className={s.need}>{p.note}</div>}
      {float && (
        <span key={`float${float.key}`} className={s.float} data-tone={float.tone}>
          {float.text}
        </span>
      )}
    </div>
  );
}
