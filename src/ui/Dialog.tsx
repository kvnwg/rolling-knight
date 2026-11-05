/**
 * Talking to someone on a floor: their portrait and name, what they say (typed out), and your lines
 * to pick from. A line may hand you a job, take one back, give you something, or (with the wrong
 * sort of neighbor) start a fight.
 */
import { useEffect, useMemo, useState } from 'react';
import type { Game } from '../game';
import { npcFrame } from '../render/art/npcs';
import { toCanvas } from '../render/art/draw';
import type { Npc } from '../world/npcs';
import { uiSound } from './sound';

export function DialogBox({ game, npc, onClose }: { game: Game; npc: Npc; onClose: () => void }) {
  const graph = useMemo(() => game.dialogFor(npc), [game, npc]);
  const [at, setAt] = useState('start');
  const [shown, setShown] = useState(0);
  const node = graph[at] ?? graph.start;
  const portrait = useMemo(() => toCanvas(npcFrame(npc.def, 'idle', 'down', 0).buf).toDataURL(), [npc]);
  // Type the words out, a few letters a frame; a tap shows them all.
  useEffect(() => {
    setShown(0);
    const id = setInterval(() => setShown((n) => (n >= node.text.length ? n : n + 2)), 22);
    return () => clearInterval(id);
  }, [node]);
  const done = shown >= node.text.length;
  const close = () => {
    npc.talkedTo += 1;
    onClose();
  };
  return (
    <div className="modal dialog-modal" onPointerDown={(e) => e.target === e.currentTarget && (done ? close() : setShown(node.text.length))}>
      <div className="dialog-box plate">
        <div className="portrait">
          <img className="px" src={portrait} alt="" />
        </div>
        <div className="body">
          <b className="who outlined">{node.speaker}</b>
          <p className="say" onPointerDown={() => setShown(node.text.length)}>
            {node.text.slice(0, shown)}
            {!done && <span className="caret">_</span>}
          </p>
          {done && (
            <div className="choices">
              {node.choices.map((c, i) => (
                <button
                  key={i}
                  className={`btn small ${c.action?.type === 'fight' ? 'red' : c.action?.type === 'acceptQuest' || c.action?.type === 'turnIn' ? 'gold' : 'navy'}`}
                  onClick={() => {
                    uiSound('tap');
                    const r = game.choose(npc, c);
                    if (r.close || !c.next) close();
                    else setAt(c.next);
                  }}
                >
                  <span>{c.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
