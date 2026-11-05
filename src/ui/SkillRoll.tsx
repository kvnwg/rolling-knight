/**
 * The skill roll on screen.
 *
 * <SkillRoll game={game} /> sits inside the HUD's special slot (the octagonal 34 x 34 art-pixel well,
 * in place of the special's icon) and reads the controlled knight's roll every animation frame
 * (Unit.skillRoll, Unit.lastSkill: src/world/skills.ts). While the knight rolls, its skill icons spin
 * past in the slot's window: a kick back, a launch, then a brake onto the result, which the world
 * decided when the roll started. A rare result creeps in at the end with the window beating in its
 * tier's light, and a rarer skill than the one coming often slides by just before it lands. It lands
 * with a thud and a flash in its tier's color, sparks from Epic up, light rays and a shake from
 * Legendary up, and the skill's name pops up above the slot. While the cooldown runs the window shows
 * the skill it landed on, in the dark; once it's ready again the icons tick round now and then.
 * Reduce motion: no spin (a die while it rolls), no sparks, rays or shakes, a plain fade for the name.
 *
 * <SkillTable knightId luck /> is the hero sheet's list: every skill the knight can roll, one short
 * line each (its icon, name, tier and chance at that luck).
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { RARITY_COLOR, rarityIndex } from '../core/rarity';
import { SKILLS, TIER_NAME, TIER_RARITY, fmtChance, skillOdds, skillsFor, tierStep, type SkillDef, type SkillIcon, type SkillId, type SkillTier } from '../core/skillbook';
import type { Game } from '../game';
import type { Unit } from '../world/entities';
import { Chunky, type Grad } from './fx/Chunky';
import { sparklePic } from './fx/pixelArt';
import { RAINBOW, raysUrl } from './fx/rays';
import { Rays } from './fx/Rays';
import { iconArt } from './px';
import { skillIconArt } from './skillIcons';
import { uiSound } from './sound';
import s from './SkillRoll.module.css';

/** A skill tier's light (the altar's colors: the jackpot is Mythic pink). */
export function tierColor(t: SkillTier): string {
  return RARITY_COLOR[TIER_RARITY[t]];
}

const GRAD: Record<SkillTier, Grad> = { common: 'white', uncommon: 'green', rare: 'blue', epic: 'purple', legendary: 'gold', jackpot: 'rainbow' };
/** How long the name stays up (ms), and how big it is (art px), by tier step. */
const POP_MS = [1100, 1200, 1400, 1700, 2100, 2600];
const NAME_SIZE = [7, 7, 8, 9, 10, 11];

export type SkillSlotState = 'off' | 'ready' | 'rolling' | 'cooling';

/** What the special slot should look like for this knight. */
export function skillSlotState(h: Unit | null | undefined): SkillSlotState {
  if (!h || h.downed) return 'off';
  if (h.skillRoll) return 'rolling';
  return (h.specialT ?? 0) > 0 ? 'cooling' : 'ready';
}

/** The slot's label: SKILL ROLL when ready, ROLLING while it spins, the skill it landed on while cooling. */
export function skillSlotLabel(h: Unit | null | undefined): string {
  const st = skillSlotState(h);
  if (st === 'rolling') return 'ROLLING';
  if (st === 'cooling' && h?.lastSkill) return SKILLS[h.lastSkill.skill].name.toUpperCase();
  return 'SKILL ROLL';
}

/** A skill's picture at `scale` art pixels per icon pixel. */
export function SkillIconImg({ icon, scale = 1, style }: { icon: SkillIcon; scale?: number; style?: CSSProperties }) {
  const a = skillIconArt(icon);
  return <img src={a.url} alt="" draggable={false} style={{ width: `calc(${a.w * scale} * var(--px))`, height: `calc(${a.h * scale} * var(--px))`, imageRendering: 'pixelated', flex: 'none', ...style }} />;
}

// ------------------------------------------------------------------ the strip

/** Cells on the strip: 0 is what showed before, then fillers, RESULT, and one past it above. */
const CELLS = 10;
const RESULT = CELLS - 2;

/** A small seeded random stream (the strip for a roll is the same every frame). */
function stream(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The icons a roll spins past: the knight's own skills, leaning far rarer than the real odds; most
 * of the time a rarer skill than the result slides by just before it, and another sits past it.
 */
function stripFor(list: readonly SkillDef[], result: SkillDef, from: SkillIcon, seed: number): SkillIcon[] {
  const rnd = stream(seed);
  const pick = (not: SkillIcon | null): SkillDef => {
    const pool = list.filter((x) => x.icon !== not);
    let total = 0;
    for (const x of pool) total += 1 + tierStep(x.tier) * 0.9;
    let r = rnd() * total;
    for (const x of pool) {
      r -= 1 + tierStep(x.tier) * 0.9;
      if (r < 0) return x;
    }
    return pool[pool.length - 1] ?? result;
  };
  const icons: SkillIcon[] = [from];
  for (let i = 1; i < RESULT; i++) icons.push(pick(icons[i - 1]).icon);
  const rarer = list.filter((x) => tierStep(x.tier) > tierStep(result.tier));
  if (rarer.length && rnd() < 0.65) icons[RESULT - 1] = rarer[Math.floor(rnd() * rarer.length)].icon;
  if (icons[RESULT - 1] === result.icon) icons[RESULT - 1] = pick(result.icon).icon;
  icons.push(result.icon);
  icons.push(rarer.length && rnd() < 0.5 ? rarer[Math.floor(rnd() * rarer.length)].icon : pick(result.icon).icon);
  return icons;
}

/** Where the strip is (in cells) `u` of the way through a roll: a kick back, then a brake onto RESULT. */
function stripPos(u: number, k: number): number {
  const kick = 0.08;
  if (u < kick) return -0.18 * Math.sin((Math.PI * u) / kick);
  const v = Math.min(1, (u - kick) / (1 - kick));
  return RESULT * (1 - Math.pow(1 - v, k));
}

interface Pop {
  key: number;
  skill: SkillId;
}

let popKeys = 0;

/**
 * The skill roll for the HUD's special slot. Mount it inside the slot's `.well` (it fills it). `slot`
 * follows a squad slot instead of the knight you control; `size` is the well's size in art pixels
 * (34 for the special slot); `sound` plays the reel's ticks and thud (on by default).
 */
export function SkillRoll({ game, slot, size = 34, sound = true, well, round }: { game: Game; slot?: number; size?: number; sound?: boolean; well?: number; round?: boolean }) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const stripRef = useRef<HTMLSpanElement>(null);
  const bumpRef = useRef<HTMLSpanElement>(null);
  const flashRef = useRef<HTMLSpanElement>(null);
  const sparksRef = useRef<HTMLSpanElement>(null);
  const imgs = useRef<(HTMLImageElement | null)[]>([]);
  const [pop, setPop] = useState<Pop | null>(null);
  // The window's inset from the slot's edge: `well` when given (a wooden key's round inlay), else the octagon's.
  const inset = well ?? Math.round((size * 5) / 34);
  const win = size - 2 * inset;
  const scale = Math.max(1, Math.floor((win - 2) / 10));
  const geo = useRef({ win, scale });
  geo.current = { win, scale };
  const soundRef = useRef(sound);
  soundRef.current = sound;

  useEffect(() => {
    let raf = 0;
    let heroUid = -1;
    let lastN = 0;
    let rollSeed = -1;
    let roll: { icons: SkillIcon[]; step: number; k: number; passed: number } | null = null;
    let shown: SkillIcon | null = null;
    let state: SkillSlotState | '' = '';
    let idle: { t0: number; icons: SkillIcon[] } | null = null;
    let nextIdle = 0;
    let idleI = 0;
    let lastTick = 0;
    let tease = false;
    const dice = iconArt('dice', 'md');

    const setCell = (i: number, icon: SkillIcon | 'dice') => {
      const img = imgs.current[i];
      if (!img) return;
      const a = icon === 'dice' ? dice : skillIconArt(icon);
      if (img.getAttribute('src') !== a.url) img.setAttribute('src', a.url);
      const sc = geo.current.scale;
      img.style.width = `calc(${a.w * sc} * var(--px))`;
      img.style.height = `calc(${a.h * sc} * var(--px))`;
    };
    /** Shows cell p (fractional: between cells) in the window, in whole art pixels. */
    const setPos = (p: number) => {
      const el = stripRef.current;
      if (!el) return;
      const y = -Math.round((CELLS - 1 - p) * geo.current.win);
      el.style.transform = `translateY(calc(${y} * var(--px)))`;
    };
    const show = (icon: SkillIcon | null) => {
      shown = icon;
      if (icon) setCell(0, icon);
      setPos(0);
    };
    const setState = (st: SkillSlotState) => {
      if (st === state) return;
      state = st;
      if (rootRef.current) rootRef.current.dataset.state = st;
    };
    const setTease = (on: boolean, color?: string) => {
      if (on === tease) return;
      tease = on;
      const root = rootRef.current;
      if (!root) return;
      if (on) {
        root.dataset.tease = '';
        if (color) root.style.setProperty('--tc', color);
      } else delete root.dataset.tease;
    };
    const tick = (level: number) => {
      const now = performance.now();
      if (!soundRef.current || now - lastTick < 40) return;
      lastTick = now;
      uiSound('reelTick', level);
    };

    const land = (id: SkillId, calm: boolean) => {
      const sk = SKILLS[id];
      const step = tierStep(sk.tier);
      const tc = tierColor(sk.tier);
      // The strip stops on its result (the cell past it peeks in on the thud).
      if (!roll || calm) {
        setCell(RESULT, sk.icon);
        setCell(RESULT + 1, shown && shown !== sk.icon ? shown : sk.icon);
      }
      roll = null;
      setTease(false);
      shown = sk.icon;
      setPos(RESULT);
      rootRef.current?.style.setProperty('--tc', tc);
      flashRef.current?.animate([{ opacity: 0.9 }, { opacity: 0 }], { duration: 240 + step * 70, easing: 'steps(4, jump-none)' });
      if (!calm) {
        bumpRef.current?.animate([{ transform: `translateY(calc(${1 + Math.min(2, step)} * var(--px)))` }, { transform: 'none' }], { duration: 170, easing: 'steps(2, jump-none)' });
        if (step >= 3) sparks(step, tc);
        if (step >= 4) {
          // The whole slot shakes.
          const d = step >= 5 ? 2 : 1;
          const at = ([x, y]: number[]) => ({ transform: `translate(calc(${x} * var(--px)), calc(${y} * var(--px)))` });
          rootRef.current?.parentElement?.animate([[0, 0], [d, -d], [-d, d], [d, d], [-d, -d], [0, 0]].map(at), { duration: 360, easing: 'steps(6, jump-none)' });
        }
      }
      if (soundRef.current) {
        uiSound('reelLand', rarityIndex(TIER_RARITY[sk.tier]));
        if (step >= 3) uiSound('stamp');
      }
      setPop({ key: ++popKeys, skill: id });
    };

    const sparks = (step: number, color: string) => {
      const box = sparksRef.current;
      if (!box) return;
      const pic = sparklePic();
      const n = step >= 5 ? 16 : step >= 4 ? 12 : 8;
      const reach = geo.current.win * (step >= 4 ? 1.5 : 1.15);
      for (let i = 0; i < n; i++) {
        const img = document.createElement('img');
        img.src = pic.url;
        img.alt = '';
        img.style.width = `calc(${pic.w} * var(--px))`;
        img.style.height = `calc(${pic.h} * var(--px))`;
        img.style.left = `calc(${-pic.w / 2} * var(--px))`;
        img.style.top = `calc(${-pic.h / 2} * var(--px))`;
        // A hard shadow in the tier's light (the jackpot's in the rainbow).
        img.style.filter = `drop-shadow(var(--px) var(--px) 0 ${step >= 5 ? RAINBOW[i % RAINBOW.length] : color})`;
        box.appendChild(img);
        const a = (i / n) * Math.PI * 2 + (step % 2) * 0.3;
        const x = Math.round(Math.cos(a) * reach);
        const y = Math.round(Math.sin(a) * reach);
        const anim = img.animate(
          [
            { transform: 'translate(0, 0) scale(0.5)', opacity: 1 },
            { transform: `translate(calc(${x} * var(--px)), calc(${y} * var(--px))) scale(1)`, opacity: 1, offset: 0.7 },
            { transform: `translate(calc(${x} * var(--px)), calc(${y + 3} * var(--px))) scale(0.6)`, opacity: 0 },
          ],
          { duration: 520 + step * 60, easing: 'steps(7, jump-none)' },
        );
        anim.onfinish = () => img.remove();
      }
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const w = game.world;
      const h = w ? w.heroes.find((x) => x.slot === (slot ?? w.controlled)) : undefined;
      const calm = game.state.settings.reduceMotion;
      if (rootRef.current) {
        if (calm) rootRef.current.dataset.calm = '';
        else delete rootRef.current.dataset.calm;
      }
      if (!h || !w) {
        heroUid = -1;
        roll = null;
        setTease(false);
        setState('off');
        return;
      }
      if (h.uid !== heroUid) {
        // A different knight in the slot: what it shows now, no fanfare for what it rolled before.
        heroUid = h.uid;
        lastN = h.lastSkill?.n ?? 0;
        rollSeed = -1;
        roll = null;
        idle = null;
        setTease(false);
        const list = h.knightId ? skillsFor(h.knightId) : [];
        idleI = 0;
        show(h.lastSkill ? SKILLS[h.lastSkill.skill].icon : (list[0]?.icon ?? null));
        nextIdle = now + 900;
      }
      // Landed (the world fired the skill this frame or since the last one).
      if (h.lastSkill && h.lastSkill.n !== lastN) {
        lastN = h.lastSkill.n;
        rollSeed = -1;
        land(h.lastSkill.skill, calm);
      }
      const r = h.skillRoll;
      if (r && h.knightId) {
        setState('rolling');
        idle = null;
        if (r.seed !== rollSeed) {
          rollSeed = r.seed;
          const result = SKILLS[r.skill];
          const step = tierStep(result.tier);
          const icons = stripFor(skillsFor(h.knightId), result, shown ?? result.icon, r.seed);
          roll = { icons, step, k: step >= 3 ? 3.4 : step >= 2 ? 2.8 : 2.2, passed: 0 };
          if (calm) {
            setCell(0, 'dice');
            setPos(0);
          } else icons.forEach((icon, i) => setCell(i, icon));
        }
        if (roll && !calm) {
          const u = Math.min(1, r.t / r.dur);
          const p = stripPos(u, roll.k);
          setPos(p);
          const passed = Math.max(0, Math.floor(p + 0.5));
          if (passed > roll.passed) {
            roll.passed = passed;
            // The ticks climb toward a rare result as it nears.
            tick(passed >= RESULT - 2 ? roll.step * 2 : 0);
          }
          setTease(roll.step >= 3 && u > 0.55, tierColor(SKILLS[r.skill].tier));
        }
        return;
      }
      setTease(false);
      roll = null;
      const st = skillSlotState(h);
      setState(st);
      if (st !== 'ready' || calm || !h.knightId) {
        idle = null;
        return;
      }
      // Ready: now and then the icons tick round one, so the slot says what it rolls.
      if (idle) {
        const t = (now - idle.t0) / 160;
        if (t >= 1) {
          show(idle.icons[1]);
          idle = null;
          nextIdle = now + 1500;
        } else setPos(Math.round(t * 4) / 4);
      } else if (now >= nextIdle) {
        const list = skillsFor(h.knightId);
        idleI = (idleI + 1) % list.length;
        const next = list[idleI].icon === shown ? list[(idleI + 1) % list.length].icon : list[idleI].icon;
        idle = { t0: now, icons: [shown ?? next, next] };
        setCell(0, idle.icons[0]);
        setCell(1, next);
        setPos(0);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [game, slot]);

  const sk = pop ? SKILLS[pop.skill] : null;
  const step = sk ? tierStep(sk.tier) : 0;
  return (
    <span
      ref={rootRef}
      className={s.root}
      data-round={round || undefined}
      data-state="off"
      style={{ ['--inset' as string]: `calc(${inset} * var(--px))`, ['--cell' as string]: `calc(${win} * var(--px))`, ['--size' as string]: size } as CSSProperties}
    >
      {sk && step >= 4 && !game.state.settings.reduceMotion && (
        <Rays key={`r${pop!.key}`} url={raysUrl(step >= 5 ? RAINBOW : [tierColor(sk.tier), '#ffffff'], 16, 0.5)} className={s.rays} style={{ ['--dur' as string]: `${POP_MS[step]}ms` } as CSSProperties} />
      )}
      <span className={s.win}>
        <span ref={bumpRef} className={s.bump}>
          <span ref={stripRef} className={s.strip}>
            {Array.from({ length: CELLS }, (_, k) => {
              const i = CELLS - 1 - k;
              return (
                <span key={i} className={s.cell}>
                  <img
                    ref={(el) => {
                      imgs.current[i] = el;
                    }}
                    alt=""
                    draggable={false}
                  />
                </span>
              );
            })}
          </span>
        </span>
        <span ref={flashRef} className={s.flash} />
      </span>
      <span ref={sparksRef} className={s.sparks} />
      {pop && <SkillPop key={pop.key} skill={pop.skill} onDone={() => setPop((cur) => (cur?.key === pop.key ? null : cur))} />}
    </span>
  );
}

/** The landed skill's name over the slot, its tier under it from Rare up; nudged to stay on screen. */
function SkillPop({ skill, onDone }: { skill: SkillId; onDone: () => void }) {
  const sk = SKILLS[skill];
  const step = tierStep(sk.tier);
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const anchor = el?.parentElement;
    if (!el || !anchor) return;
    // (Measured without the pop's own animation: the slot's center and the pop's full width.)
    const a = anchor.getBoundingClientRect();
    const cx = a.left + a.width / 2;
    const half = el.offsetWidth / 2;
    const margin = 4;
    let shift = 0;
    if (cx + half > window.innerWidth - margin) shift = window.innerWidth - margin - (cx + half);
    if (cx - half + shift < margin) shift = margin - (cx - half);
    el.style.setProperty('--shift', `${Math.round(shift)}px`);
  }, []);
  useEffect(() => {
    // (Once per pop: a new pop is a new component.)
    const t = setTimeout(onDone, POP_MS[step]);
    return () => clearTimeout(t);
  }, []);
  return (
    <span ref={ref} className={s.pop} data-step={step} style={{ ['--dur' as string]: `${POP_MS[step]}ms`, ['--tc' as string]: tierColor(sk.tier) } as CSSProperties}>
      <Chunky text={`${sk.name.toUpperCase()}!`} size={NAME_SIZE[step]} grad={GRAD[sk.tier]} />
      {step >= 2 && <span className={s.tier}>{step >= 5 ? 'JACKPOT!' : TIER_NAME[sk.tier].toUpperCase()}</span>}
    </span>
  );
}

// ------------------------------------------------------------------ the hero sheet's table

/**
 * Every skill a knight can roll, commonest first: its picture, name, tier, chance at `luck` and its
 * line. `cd` shows the roll's cooldown in the heading; `highlight` marks one skill (the last rolled).
 */
export function SkillTable({ knightId, luck = 1, cd, highlight }: { knightId: string; luck?: number; cd?: number; highlight?: SkillId }) {
  const odds = skillOdds(knightId, luck);
  return (
    <div className={s.table}>
      <div className={s.head}>
        <b>Skill roll</b>
        {cd ? <span>rolls again as it fires</span> : null}
      </div>
      {odds.map(({ skill, chance }) => (
        <div key={skill.id} className={s.row} data-on={highlight === skill.id ? '' : undefined} style={{ ['--tc' as string]: tierColor(skill.tier) } as CSSProperties}>
          <span className={s.icon}>
            <SkillIconImg icon={skill.icon} />
          </span>
          <span className={s.name}>
            {skill.name}
            <span className={s.tier}>{skill.tier === 'jackpot' ? 'JACKPOT' : TIER_NAME[skill.tier].toUpperCase()}</span>
          </span>
          <span className={s.odds}>{fmtChance(chance)}</span>
        </div>
      ))}
    </div>
  );
}
