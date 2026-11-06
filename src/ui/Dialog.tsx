/**
 * Talking to someone on a floor: their portrait and name, what they say (typed out), then your
 * replies dropping down beneath it as one list: up and down (or W and S) to pick, Enter, Space or F to
 * say it, a number key for the line with that number, a tap on a phone. A line about a job comes with
 * a job card on parchment, in icons (the goal and a number, what it pays and how much; a tap or I for
 * the words), and the replies that lead to a job carry the "!" that floats over the folk's head, so the
 * job stands apart from the small talk. A reply may hand you a job, take one back, give you something,
 * or (with the wrong sort of neighbor) start a fight.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatGold, mobKind, rewardText, type MobKind, type QuestReward } from '../core/quests';
import type { Game } from '../game';
import { npcPortrait, questMarker } from '../render/art/npcs';
import { toCanvas } from '../render/art/draw';
import type { DialogChoice, DialogJob, JobAim, Npc } from '../world/npcs';
import { Px, type IconName } from './px';
import { uiSound } from './sound';

/** Keys that say the selected line (or show the rest of what's being said). */
const SAY = new Set(['enter', ' ', 'f', 'e']);

export function DialogBox({ game, npc, onClose }: { game: Game; npc: Npc; onClose: () => void }) {
  const graph = useMemo(() => game.dialogFor(npc), [game, npc]);
  const [at, setAt] = useState('start');
  const [shown, setShown] = useState(0);
  const [sel, setSel] = useState(0);
  /** The job card shows its words. */
  const [info, setInfo] = useState(false);
  const node = graph[at] ?? graph.start;
  const portrait = useMemo(() => toCanvas(npcPortrait(npc.def)).toDataURL(), [npc]);
  // Type the words out, a few letters a frame; a tap shows them all.
  useEffect(() => {
    setShown(0);
    setSel(0);
    setInfo(false);
    const id = setInterval(() => setShown((n) => (n >= node.text.length ? n : n + 2)), 22);
    return () => clearInterval(id);
  }, [node]);
  const done = shown >= node.text.length;
  const close = () => {
    npc.talkedTo += 1;
    onClose();
  };
  const choose = (c: DialogChoice) => {
    uiSound('tap');
    const r = game.choose(npc, c);
    if (r.close || !c.next) close();
    else setAt(c.next);
  };
  const toggleInfo = () => {
    uiSound('tap');
    setInfo((o) => !o);
  };
  // The keyboard belongs to the conversation while it's open (nothing reaches the knight's controls).
  const now = {
    node,
    done,
    sel,
    choose,
    close,
    toggleInfo,
    skip: () => setShown(node.text.length),
    move: (d: number) => setSel((i) => (i + d + node.choices.length) % node.choices.length),
  };
  const live = useRef(now);
  live.current = now;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      e.stopImmediatePropagation();
      if (e.key !== 'Tab') e.preventDefault();
      if (e.repeat && !e.key.startsWith('Arrow')) return;
      const L = live.current;
      const k = e.key.toLowerCase();
      if (k === 'escape') return L.close();
      if (!L.done) {
        if (SAY.has(k)) L.skip();
        return;
      }
      const n = L.node.choices.length;
      if ((k === 'i' || k === '?') && L.node.job) L.toggleInfo();
      else if (k === 'arrowdown' || k === 's') L.move(1);
      else if (k === 'arrowup' || k === 'w') L.move(-1);
      else if (SAY.has(k)) L.choose(L.node.choices[Math.min(L.sel, n - 1)]);
      else if (/^[1-9]$/.test(k) && Number(k) <= n) L.choose(L.node.choices[Number(k) - 1]);
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, []);
  return (
    <div className="modal dialog-modal" onPointerDown={(e) => e.target === e.currentTarget && (done ? close() : setShown(node.text.length))}>
      <div className="dialog-box plate" role="dialog" aria-label={`Talking to ${node.speaker}`}>
        <div className="dlg-head">
          <div className="portrait">
            <img className="px" src={portrait} alt="" />
          </div>
          <div className="dlg-talk">
            <b className="who outlined">{node.speaker}</b>
            <p className="say" onPointerDown={() => setShown(node.text.length)}>
              {node.text.slice(0, shown)}
              {!done && <span className="caret">_</span>}
            </p>
          </div>
        </div>
        {node.job && done && <JobCard job={node.job} key={`job-${at}`} open={info} onToggle={toggleInfo} />}
        {done && (
          <ol className="replies" key={`replies-${at}`} role="listbox" aria-label="Your reply">
            {node.choices.map((c, i) => (
              <li key={i} style={{ ['--i' as string]: i }}>
                <button
                  className={`reply ${replyKind(c)} ${i === sel ? 'sel' : ''}`}
                  role="option"
                  aria-selected={i === sel}
                  onPointerEnter={(e) => e.pointerType === 'mouse' && setSel(i)}
                  onClick={() => choose(c)}
                >
                  <span className="cur" />
                  <span className="key">{i + 1}</span>
                  <span className="txt">{c.label}</span>
                  <ReplyTag c={c} />
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function replyKind(c: DialogChoice): string {
  const a = c.action?.type;
  if (a === 'fight') return 'fight';
  if (c.job || a === 'acceptQuest' || a === 'turnIn') return 'job';
  if (a === 'reward') return 'gift';
  if (!c.next) return 'bye';
  return '';
}

/** The bubbles that float over a folk's head ("!" a job for you, "?" one to hand back), for the UI. */
const bubbles = new Map<string, string>();
function bubble(kind: 'offer' | 'turnIn'): string {
  let u = bubbles.get(kind);
  if (!u) bubbles.set(kind, (u = toCanvas(questMarker(kind)).toDataURL()));
  return u;
}

function Bubble({ kind }: { kind: 'offer' | 'turnIn' }) {
  return <img className="px bubble" src={bubble(kind)} alt="" draggable={false} />;
}

/** What a reply does, as an icon at its right end: leads to a job, takes it, hands it back, a gift, a fight. */
function ReplyTag({ c }: { c: DialogChoice }) {
  const a = c.action?.type;
  const icon = (i: IconName, cls: string) => (
    <span className={`tag ${cls}`}>
      <Px icon={i} size="sm" />
    </span>
  );
  if (a === 'fight') return icon('swords', 'fight');
  if (a === 'acceptQuest') return icon('check', 'job');
  if (a === 'turnIn')
    return (
      <span className="tag job">
        <Bubble kind="turnIn" />
      </span>
    );
  if (c.job)
    return (
      <span className="tag job">
        <Bubble kind="offer" />
      </span>
    );
  if (a === 'reward') return icon('star', 'gift');
  return null;
}

/** A slay job's icon: the kind of monster it's after. */
const MOB_ICON: Record<MobKind, IconName> = {
  slime: 'mobSlime', beast: 'mobBeast', goblin: 'mobGoblin', flyer: 'mobFlyer', plant: 'mobPlant', golem: 'mobGolem',
  bug: 'mobBug', pumpkin: 'mobPumpkin', ghost: 'mobGhost', hog: 'mobHog', ram: 'mobRam', hen: 'mobHen',
};

function aimIcon(a: JobAim): IconName {
  switch (a.kind) {
    case 'slay': {
      const k = a.mob ? mobKind(a.mob) : null;
      return k ? MOB_ICON[k] : 'mobAny';
    }
    case 'slayElite':
      return 'star';
    case 'boss':
      return 'boss';
    case 'reach':
      return 'deeper';
    case 'collect':
      return a.item === 'hourglass' ? 'hourglass' : a.item === 'potion' ? 'potion' : 'coin';
    case 'sign':
      return 'quill';
  }
}

/** The number by the goal's icon: how many (x6), how far along (3/6), the floor to reach (9). */
function aimCount(a: JobAim): string {
  if (a.kind === 'sign' || (a.kind === 'boss' && a.n === 1 && a.done === undefined)) return '';
  if (a.done !== undefined) return `${Math.min(a.done, a.n)}/${a.n}`;
  return a.kind === 'reach' ? `${a.n}` : `x${a.n}`;
}

/**
 * The job a line is about, on parchment with a wax seal: the goal as an icon and a number, then what
 * it pays, icon and number. A tap (or I) shows it in words: its title, the goal, the pay, any fine print.
 */
function JobCard({ job, open, onToggle }: { job: DialogJob; open: boolean; onToggle: () => void }) {
  const mark = job.stage === 'offer' ? <Bubble kind="offer" /> : job.stage === 'done' ? <Bubble kind="turnIn" /> : <Px icon={job.stage === 'contract' ? 'flame' : job.stage === 'progress' ? 'clock' : 'check'} size="sm" />;
  const count = aimCount(job.aim);
  return (
    <button className={`job-card ${job.stage} ${open ? 'open' : ''}`} onClick={onToggle} aria-expanded={open} aria-label={`${job.title}: ${job.goal}`}>
      <span className="job-row">
        <span className="job-mark">{mark}</span>
        <span className="job-aim">
          <Px icon={aimIcon(job.aim)} size="sm" />
          {count && <b>{count}</b>}
          {job.stage === 'done' && <Px icon="check" size="sm" />}
        </span>
        <span className="job-to" />
        <span className="job-pay">{rewardChips(job.reward)}</span>
        <span className="job-more-cue" />
      </span>
      {job.progress !== undefined && (
        <span className="job-bar">
          <i style={{ width: `${Math.round(job.progress * 100)}%` }} />
        </span>
      )}
      {open && (
        <span className="job-words">
          <b>{job.title}</b>
          <span>{job.goal}.</span>
          <span>{rewardText(job.reward).replace(/^./, (c) => c.toUpperCase())}.</span>
          {job.fine && <small className="job-fine">{job.fine}</small>}
        </span>
      )}
    </button>
  );
}

/** What a job pays: an icon and a number each. */
function rewardChips(r: QuestReward) {
  const out: Array<{ icon: IconName; n: string }> = [];
  if (r.gold) out.push({ icon: 'coin', n: formatGold(r.gold) });
  if (r.hourglasses) out.push({ icon: 'hourglass', n: String(r.hourglasses) });
  if (r.luckSpins) out.push({ icon: 'clover', n: String(r.luckSpins) });
  if (r.potion) out.push({ icon: 'potion', n: '' });
  return out.map((c) => (
    <span className="pay-chip" key={c.icon}>
      <Px icon={c.icon} size="sm" />
      {c.n && <b>{c.n}</b>}
    </span>
  ));
}
