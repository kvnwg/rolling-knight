/**
 * "Back to camp?": CAMP (or C) in the dungeon asks before it goes, because leaving costs floors
 * (the run steps back to the floor after the last boss: core/newGame.ts campFloor). It says what
 * you give up and what you get (the squad rests, the fallen are up again), with STAY as the easy
 * answer: a tap outside it, or Esc, stays. The fight waits while it's up.
 */
import { Chunky } from './fx/Chunky';
import { Px } from './px';

export function CampAsk({ floor, back, fallen, onStay, onGo }: { floor: number; back: number; fallen: number; onStay: () => void; onGo: () => void }) {
  const lost = floor - back;
  return (
    <div className="modal camp-ask" onPointerDown={(e) => e.target === e.currentTarget && onStay()}>
      <div className="sheet" role="dialog" aria-label="Back to camp?">
        <div className="hero-banner">
          <Chunky text="BACK TO CAMP?" size={10} grad="gold" />
        </div>
        <div className="ca-floors outlined" aria-hidden={lost <= 0}>
          <span className="ca-floor">
            <small>NOW</small>
            <b className="num">{floor}</b>
          </span>
          {lost > 0 && (
            <>
              <span className="ca-arrow">
                <Px icon="arrowUp" size="sm" />
              </span>
              <span className="ca-floor back">
                <small>RESTART AT</small>
                <b className="num">{back}</b>
              </span>
            </>
          )}
        </div>
        <p className="ca-line outlined">
          {lost > 0 ? (
            <>
              You give up <b>{lost === 1 ? '1 floor' : `${lost} floors`}</b>: the run goes back to floor {back}
              {back > 1 ? `, after the floor ${back - 1} boss` : ''}.
            </>
          ) : lost < 0 ? (
            <>
              The boss is beaten: the run picks up on <b>floor {back}</b>.
            </>
          ) : (
            <>Your run stays on floor {floor}.</>
          )}
        </p>
        <p className="ca-line good outlined">
          <Px icon="heart" size="sm" /> {fallen > 0 ? (fallen === 1 ? 'Your fallen knight gets back up' : `Your ${fallen} fallen knights get back up`) : 'Your squad rests'} and everyone is healed.
        </p>
        <div className="ca-btns">
          <button className="btn big" onClick={onStay}>
            STAY
            <kbd className="ca-key">ESC</kbd>
          </button>
          <button className="btn gold big" onClick={onGo}>
            GO TO CAMP
            <kbd className="ca-key">ENTER</kbd>
          </button>
        </div>
      </div>
    </div>
  );
}
