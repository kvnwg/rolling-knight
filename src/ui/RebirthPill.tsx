/**
 * The push to rebirth: once this run has reached the floor a rebirth needs, a gold button pulses at
 * the top of the screen (in a fight and at camp) until you do it: REBIRTH READY, and what it brings,
 * for good. In a fight it takes you back to camp and opens the Shrine; at camp it opens the Shrine.
 */
import type { CSSProperties } from 'react';
import { BAL } from '../core/balance';
import { canRebirth } from '../core/newGame';
import { rebirthStatMult, squadSlots } from '../core/roster';
import type { GameState } from '../core/state';
import type { Game } from '../game';
import { Px } from './px';
import { uiSound } from './sound';

/** What the next rebirth brings, for good, as one short line. */
export function rebirthPitch(st: Pick<GameState, 'rebirths'>): string {
  const next = st.rebirths + 1;
  const luck = 1 + next * BAL.rebirth.luckPer;
  const gold = 1 + next * BAL.rebirth.goldMultPer;
  const power = rebirthStatMult(next);
  const slot = squadSlots({ rebirths: next }) > squadSlots(st) ? ' + a squad slot' : '';
  return `Luck x${luck.toFixed(2)}, gold x${gold.toFixed(1)}, power x${power.toFixed(1)}${slot}, for good`;
}

export function RebirthPill({ game, onGo, style }: { game: Game; onGo: () => void; style?: CSSProperties }) {
  const st = game.state;
  if (!canRebirth(st)) return null;
  return (
    <button
      className="btn gold rebirth-pill"
      style={style}
      title="Rebirth at the Shrine: start again from floor 1, stronger for good"
      onClick={(e) => {
        e.stopPropagation();
        uiSound('open');
        onGo();
      }}
    >
      <span className="rp-icon">
        <Px icon="rebirth" size="sm" />
      </span>
      <span className="rp-text">
        <b>REBIRTH READY</b>
        <small>{rebirthPitch(st)}</small>
      </span>
      <i className="rp-shine" aria-hidden />
    </button>
  );
}
