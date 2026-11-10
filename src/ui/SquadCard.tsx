/**
 * A squad member's card in a fight (bottom left on a desktop, under the floor's plate on a phone),
 * alive to what happens to its knight:
 *  - hurt: the bar drops at once, a pale chunk of what was lost lingers and drains after it, the card
 *    jolts and its portrait flashes red, and the damage floats off the card in red;
 *  - healed: a bright green lead runs out to the new health and the bar sweeps up to it, the card
 *    glows green, the heal floats off with a few sparks;
 *  - in danger (under 30%): the bar beats like a heart and the portrait's edge pulses red;
 *  - down: grey, a skull over it;
 *  - always: its health in numbers on the bar, the portrait breathing (a pixel up and down, each card
 *    on its own beat), a little reel in the portrait's corner showing the skill it's rolling, and on
 *    the knight you play a gold card with a crown and a shine passing over now and then.
 * Driven by its own animation frame (reading the world's unit), so it moves at the screen's rate.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { CLASSES } from '../core/knights';
import { RARITY_COLOR } from '../core/rarity';
import type { Game } from '../game';
import type { Unit } from '../world/entities';
import { CLASS_TINT } from './ClassTag';
import { CLASS_ICON } from './classIcons';
import { fmt } from './format';
import { Px } from './px';
import { SkillRoll } from './SkillRoll';
import { knightFaceUrl } from './sprites';
import { backdropUrl } from './backdrop';

interface Pop {
  key: number;
  text: string;
  heal: boolean;
}

let popKeys = 0;

export function SquadCard({ game, slot, knightId, mutation, name, cls, rarity, me, onPick }: {
  game: Game;
  slot: number;
  knightId: string;
  mutation: string | null;
  name: string;
  cls: keyof typeof CLASSES;
  rarity: keyof typeof RARITY_COLOR;
  me: boolean;
  onPick: () => void;
}) {
  const cardRef = useRef<HTMLButtonElement>(null);
  const fillRef = useRef<HTMLElement>(null);
  const ghostRef = useRef<HTMLElement>(null);
  const leadRef = useRef<HTMLElement>(null);
  const numRef = useRef<HTMLElement>(null);
  const [pops, setPops] = useState<Pop[]>([]);

  useEffect(() => {
    let raf = 0;
    let uid = -1;
    let shown = 1; // the bar
    let ghost = 1; // what was lost, draining after it
    let holdUntil = 0; // the lost chunk lingers this long before it drains
    let lastHp = -1;
    let lastT = 0;
    let acc = 0; // damage (negative) or healing (positive) gathered for the next number
    let accAt = 0;
    let lastNum = '';
    let state = '';
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, Math.max(0, (now - (lastT || now)) / 1000));
      lastT = now;
      const w = game.world;
      const h: Unit | undefined = w?.heroes.find((x) => x.slot === slot);
      const card = cardRef.current;
      if (!h || !card) return;
      const max = Math.max(1, h.maxHp);
      const hp = Math.max(0, h.downed ? 0 : h.hp);
      const v = Math.max(0, Math.min(1, hp / max));
      if (h.uid !== uid) {
        // A new floor (or a new knight): no fanfare for the change.
        uid = h.uid;
        shown = ghost = v;
        lastHp = hp;
        acc = 0;
      }
      const dHp = hp - lastHp;
      lastHp = hp;
      const calm = game.state.settings.reduceMotion;
      if (dHp < -0.5) {
        // Hurt: the card jolts, the portrait flashes.
        acc += dHp;
        accAt = now;
        if (!calm) {
          card.animate(
            [{ transform: 'translate(0,0)' }, { transform: 'translate(-2px,1px)' }, { transform: 'translate(2px,-1px)' }, { transform: 'translate(-1px,0)' }, { transform: 'translate(0,0)' }],
            { duration: 200, easing: 'steps(4, jump-none)' },
          );
        }
        card.dataset.hit = '';
        window.setTimeout(() => card && delete card.dataset.hit, 160);
      } else if (dHp > 0.5) {
        acc += dHp;
        accAt = now;
        card.dataset.heal = '';
        window.setTimeout(() => card && delete card.dataset.heal, 420);
      }
      // The bar: down at once (the lost chunk stays a moment, then drains after it); up by a sweep,
      // the green lead already out at the new health.
      if (v < shown) {
        if (ghost < shown) ghost = shown;
        shown = v;
        holdUntil = now + 380;
      } else if (v > shown) {
        shown = calm ? v : Math.min(v, shown + 0.9 * dt);
      }
      if (ghost > shown && now > holdUntil) ghost = Math.max(shown, ghost - (0.25 + (ghost - shown) * 3) * dt);
      if (ghost < shown) ghost = shown;
      const lead = v;
      const pct = (x: number) => `${Math.max(0, Math.min(1, x)) * 100}%`;
      if (fillRef.current) fillRef.current.style.width = pct(shown);
      if (ghostRef.current) ghostRef.current.style.width = pct(ghost);
      if (leadRef.current) leadRef.current.style.width = pct(Math.max(shown, lead));
      // The numbers on the bar.
      const label = `${fmt(Math.ceil(hp))}`;
      if (numRef.current && label !== lastNum) {
        numRef.current.textContent = label;
        lastNum = label;
      }
      // A number floats off the card for what happened in the last quarter second.
      if (acc !== 0 && now - accAt > 240) {
        const n = Math.round(acc);
        acc = 0;
        if (n !== 0 && !calm) {
          const pop: Pop = { key: ++popKeys, text: n < 0 ? `${n}` : `+${n}`, heal: n > 0 };
          setPops((p) => [...p.slice(-3), pop]);
          window.setTimeout(() => setPops((p) => p.filter((x) => x.key !== pop.key)), 900);
        }
      }
      // Danger, and down.
      const st = h.downed ? 'down' : v < 0.3 ? 'low' : 'ok';
      if (st !== state) {
        state = st;
        card.dataset.state = st;
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [game, slot]);

  return (
    <button
      ref={cardRef}
      className={`member plate live ${me ? 'me gold' : ''}`}
      style={{ ['--rc' as string]: RARITY_COLOR[rarity], ['--beat' as string]: `${slot * 0.37}s` } as CSSProperties}
      onClick={onPick}
      title={`${name}, ${CLASSES[cls].name}${me ? ' (you)' : ': tap to play'}`}
    >
      <span className="portrait" style={{ backgroundImage: `url(${backdropUrl(rarity, 18, 18, -8)})` }}>
        <img className="px face" src={knightFaceUrl(knightId, mutation as never)} alt="" draggable={false} />
        <i className="hurt" />
        {me && (
          <span className="crown" title="The knight you play">
            <Px icon="crown" size="sm" />
          </span>
        )}
        <span className="down-skull" title="Down">
          <Px icon="skull" size="sm" />
        </span>
        <span className="mini-roll" title="The skill it's rolling">
          <SkillRoll game={game} slot={slot} sound={false} size={10} well={0} round pop={false} />
        </span>
      </span>
      <span className="nm">
        <span>{name}</span>
        <span className="cls-chip" style={{ ['--cc' as string]: CLASS_TINT[cls] }} title={CLASSES[cls].name}>
          <Px icon={CLASS_ICON[cls]} size="xs" />
        </span>
      </span>
      <span className="bar hp live-bar">
        <i ref={ghostRef} className="ghost" />
        <i ref={leadRef} className="lead" />
        <i ref={fillRef} className="fill" />
        <b ref={numRef} className="hpnum" />
      </span>
      {pops.map((p) => (
        <span key={p.key} className={`card-pop ${p.heal ? 'heal' : ''}`}>
          {p.text}
        </span>
      ))}
      {me && <i className="shine" aria-hidden />}
    </button>
  );
}
