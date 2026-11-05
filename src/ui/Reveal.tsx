/**
 * The full-screen reveal for a find that's rare *for you* (luck.ts judges it): the screen goes black,
 * a heartbeat, the knight rises in its rarity's light, its "1 in X" counts up, and rays turn behind
 * it. BIG, HUGE, INSANE, and HYPER RARE (the rarest find of your whole game) take longer and shout
 * louder. Beginner's luck is labeled as such. Tap to close once the count lands.
 */
import { useEffect, useRef, useState } from 'react';
import { CLASSES, knightDef } from '../core/knights';
import { RARITY_COLOR, RARITY_NAME, type Rarity } from '../core/rarity';
import type { MutationId, RollDrama } from '../core/state';
import { sfx } from '../audio/sfx';
import { oneIn } from './format';
import { KnightSprite } from './sprites';

export interface RevealItem {
  knightId: string;
  rarity: Rarity;
  mutation: MutationId | null;
  oneIn: number;
  drama: RollDrama;
  isNew: boolean;
  mult: number;
  scripted?: 'warmup';
}

const DARK_MS: Record<RollDrama, number> = { big: 700, huge: 1300, insane: 2000, hyper: 2400 };
const COUNT_MS: Record<RollDrama, number> = { big: 1600, huge: 2300, insane: 3000, hyper: 3600 };
const KICK: Record<RollDrama, string> = { big: 'BIG FIND!', huge: 'HUGE FIND!', insane: 'INSANE FIND!', hyper: 'HYPER RARE!' };

export function Reveal({ item, onDone }: { item: RevealItem; onDone: () => void }) {
  const [phase, setPhase] = useState<'dark' | 'show' | 'done'>('dark');
  const [count, setCount] = useState(1);
  const start = useRef(performance.now());
  const def = knightDef(item.knightId);
  const color = RARITY_COLOR[item.rarity];
  useEffect(() => {
    start.current = performance.now();
    setPhase('dark');
    setCount(1);
    sfx.play('heartbeat');
    let raf = 0;
    const dark = DARK_MS[item.drama];
    const total = COUNT_MS[item.drama];
    let landed = false;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const t = performance.now() - start.current;
      if (t < dark) return;
      setPhase((p) => (p === 'dark' ? 'show' : p));
      const k = Math.min(1, (t - dark) / total);
      // Counts up fast, then crawls to the real number.
      const e = 1 - Math.pow(1 - k, 3);
      setCount(Math.max(1, Math.round(Math.exp(Math.log(item.oneIn) * e))));
      if (k >= 1 && !landed) {
        landed = true;
        setPhase('done');
        sfx.play('fanfare', item.drama === 'hyper' ? 3 : item.drama === 'insane' ? 2 : 1);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [item]);
  const close = () => {
    if (phase === 'done' || performance.now() - start.current > DARK_MS[item.drama] + 600) onDone();
  };
  return (
    <div className="reveal outlined" style={{ ['--rc' as string]: color }} onClick={close}>
      {phase !== 'dark' && <div className="rays" />}
      {phase !== 'dark' && (
        <>
          <div className="kick">{KICK[item.drama]}</div>
          <div className="hero">
            <KnightSprite id={item.knightId} mutation={item.mutation} scale={7} />
          </div>
          <div className="kick" style={{ color }}>
            {RARITY_NAME[item.rarity].toUpperCase()} {CLASSES[def.cls].name.toUpperCase()}
            {item.mutation ? ` · ${item.mutation.toUpperCase()}` : ''}
            {item.isNew ? ' · NEW!' : ''}
          </div>
          <div className="name">{def.name}</div>
          <div className="odds">{oneIn(count)}</div>
          {item.mult > 1 && <div className="kick" style={{ color: '#8af07a' }}>luck tokens ×{item.mult}</div>}
        </>
      )}
      {phase === 'done' && <div className="tapnote">Tap to continue</div>}
    </div>
  );
}
