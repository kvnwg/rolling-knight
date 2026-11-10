/**
 * Leaving for camp, in the middle of the screen: the floor number ticking back, one floor a tick,
 * from the floor you left to the one the run picks up at (the floor after the last boss you beat:
 * core/newGame.ts campFloor). The floors it passes run along a little track under it with the bosses'
 * floors marked; when it lands the number goes gold and it says where you are and that the fallen are
 * up again. It never takes a tap: the hub is yours the moment you're back.
 */
import { useEffect, useState } from 'react';
import { uiSound } from '../sound';
import { Chunky } from './Chunky';
import s from './floorRewind.module.css';

/** Before the first tick, while the screen fades over to the hub. */
const START = 420;
/** How long the landed number stays. */
const HOLD = 1900;
const FADE = 380;

/** The time between ticks: quicker the further there is to go, never a blur. */
export function rewindTick(steps: number): number {
  return steps <= 0 ? 0 : Math.round(Math.max(150, Math.min(300, 960 / steps)));
}

export function FloorRewind({ from, back, revived, onDone }: { from: number; back: number; revived: number; onDone: () => void }) {
  const steps = Math.max(0, from - back);
  const [n, setN] = useState(from);
  const [landed, setLanded] = useState(steps === 0);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const every = rewindTick(steps);
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    for (let k = 1; k <= steps; k++) {
      timers.push(
        setTimeout(() => {
          setN(from - k);
          if (k === steps) {
            setLanded(true);
            uiSound('reelLand', 3);
          } else uiSound('countTick');
        }, START + k * every),
      );
    }
    const end = START + steps * every + HOLD;
    timers.push(setTimeout(() => setLeaving(true), end - FADE));
    timers.push(setTimeout(onDone, end));
    return () => timers.forEach(clearTimeout);
    // (One run per trip: the parent keys it.)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const floors: number[] = [];
  for (let f = back; f <= from; f++) floors.push(f);
  return (
    <div className={s.wrap} data-landed={landed || undefined} data-leaving={leaving || undefined} aria-live="polite">
      <span className={`${s.cap} outlined`}>BACK TO CAMP</span>
      <div className={s.row}>
        <Chunky text="FLOOR" size={9} grad="white" />
        <span key={n} className={s.num}>
          <Chunky text={String(n)} size={24} grad={landed ? 'gold' : 'white'} />
        </span>
      </div>
      {steps > 0 && (
        <div className={s.track} aria-hidden>
          {floors.map((f) => (
            <i key={f} className={s.pip} data-on={f === n || undefined} data-gone={f > n || undefined} data-boss={f % 5 === 0 || undefined} />
          ))}
        </div>
      )}
      {landed && (
        <span className={`${s.sub} glass outlined`}>{steps === 0 ? 'Your squad rests' : back <= 1 ? 'Back to the first floor' : `After the floor ${back - 1} boss`}</span>
      )}
      {landed && revived > 0 && (
        <span className={`${s.sub} ${s.up} glass outlined`}>
          {revived === 1 ? 'Your fallen knight is back up' : `${revived} fallen knights are back up`}
        </span>
      )}
    </div>
  );
}
