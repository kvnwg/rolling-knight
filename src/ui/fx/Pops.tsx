/**
 * Feedback for the roster's buttons, drawn over everything (open sheets included): a "+3 shards"
 * or "+120 gold" pop that jumps off the button you pressed and flies to where it lands (the shard
 * bar, the gold readout), and short notes at the top of the screen ("Grimwald reached level 3!").
 * Rendered into <body>: inside a sheet, its backdrop blur would make fixed positions relative to the
 * sheet (and scroll with it).
 */
import { useCallback, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Px } from '../px';

export type PopKind = 'gold' | 'shard';

interface Pop {
  id: number;
  text: string;
  kind: PopKind;
  x: number;
  y: number;
  dx: number;
  dy: number;
}

interface Note {
  id: number;
  text: string;
  color?: string;
}

export interface RosterFx {
  /** A pop from `from` (the button pressed) flying to `to` (where it lands; it rises in place if none). */
  pop: (from: Element | null, to: Element | null, text: string, kind: PopKind) => void;
  /** A short note at the top of the screen. */
  note: (text: string, color?: string) => void;
  /** Rendered once by whoever owns the effects. */
  layer: ReactNode;
}

const POP_MS = 1000;
const NOTE_MS = 3100;
let nextId = 1;

/** `calm` (Reduce motion): pops rise and fade where they start instead of flying. */
export function useRosterFx(calm = false): RosterFx {
  const [pops, setPops] = useState<Pop[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const pop = useCallback(
    (from: Element | null, to: Element | null, text: string, kind: PopKind) => {
      if (!from) return;
      const a = from.getBoundingClientRect();
      const b = calm ? null : to?.getBoundingClientRect();
      const x = a.left + a.width / 2;
      const y = a.top + a.height / 2;
      const id = nextId++;
      const dx = b ? b.left + b.width / 2 - x : 0;
      const dy = b ? b.top + b.height / 2 - y : 0;
      setPops((list) => [...list.slice(-5), { id, text, kind, x, y, dx, dy }]);
      window.setTimeout(() => setPops((list) => list.filter((p) => p.id !== id)), POP_MS);
    },
    [calm],
  );
  const note = useCallback((text: string, color?: string) => {
    const id = nextId++;
    setNotes((list) => [...list.slice(-2), { id, text, color }]);
    window.setTimeout(() => setNotes((list) => list.filter((n) => n.id !== id)), NOTE_MS);
  }, []);
  const layer =
    typeof document === 'undefined'
      ? null
      : createPortal(
          <>
            {pops.map((p) => (
              <div
                key={p.id}
                className={`rk-pop ${p.kind}${p.dx || p.dy ? '' : ' still'}`}
                style={{ left: p.x, top: p.y, ['--dx' as string]: `${p.dx}px`, ['--dy' as string]: `${p.dy}px` } as CSSProperties}
              >
                <Px icon={p.kind === 'gold' ? 'coin' : 'shard'} size="sm" />
                {p.text}
              </div>
            ))}
            {notes.length > 0 && (
              <div className="rk-notes">
                {notes.map((n) => (
                  <div key={n.id} className="toast glass outlined" style={{ ['--tc' as string]: n.color } as CSSProperties}>
                    <span className="who">{n.text}</span>
                  </div>
                ))}
              </div>
            )}
          </>,
          document.body,
        );
  return { pop, note, layer };
}
