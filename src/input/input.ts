/**
 * Controls, twin-stick like Enter the Gungeon. Keyboard and mouse: WASD or arrows to move, the mouse
 * to aim (anywhere, all the way round; the game draws a crosshair at it), the left button (held) or
 * J/K to attack where it points, Space or Shift to dodge roll, E or Q to roll your skill, 1/2/3 to
 * take control of a squad member, T to toggle Auto attack. Touch: a joystick that appears wherever the
 * left half of the screen is touched (anywhere, when `stickAnywhere` says so: at the hub, where there
 * are no fight buttons on the right), and the buttons the HUD draws (they call press(); the Attack
 * button calls hold(): held, it auto-aims; its finger dragged off it like a right stick, it aims that
 * way, the drag measured from where that finger went down).
 */
export interface Controls {
  mx: number;
  my: number;
  dodge: boolean;
  special: boolean;
  /** Attacking (the mouse button, J or K, or the touch Attack button held). */
  attack: boolean;
  /** Where the mouse points (screen px), to aim at; null on touch (the attack aims itself). */
  aim: { x: number; y: number } | null;
  /** The mouse is over the play area (not a button): the crosshair shows. */
  overPlay: boolean;
  /** Touch: the way the Attack button is dragged (a unit vector), or null (held still: auto-aim). */
  aimDir: { x: number; y: number } | null;
  switchTo: number | null;
  toggleAuto: boolean;
  /** C: asks to go back to camp (not Esc: on CrazyGames and in any fullscreen, Esc leaves fullscreen). */
  camp: boolean;
  /** The touch joystick, for the HUD to draw (screen pixels). */
  stick: { active: boolean; ox: number; oy: number; x: number; y: number };
  /** The Attack button's aim stick while it's dragged, for the HUD to draw (screen pixels). */
  aimStick: { active: boolean; ox: number; oy: number; x: number; y: number };
}

/** How far (CSS px) the Attack button must be dragged before the drag aims (less: auto-aim). */
export const AIM_DEAD = 14;
/** The aim stick's reach on screen (CSS px). */
const AIM_RADIUS = 46;

export interface ControlsApi {
  controls: Controls;
  dispose: () => void;
  press: (what: 'dodge' | 'special') => void;
  /**
   * The touch Attack button pressed or let go. `at`: where its finger went down and which it is
   * (otherwise the last finger to touch down: the press that reached the button).
   */
  hold: (on: boolean, at?: { x: number; y: number; id?: number }) => void;
}

export function createControls(onKey?: (key: string) => void, stickAnywhere?: () => boolean): ControlsApi {
  const c: Controls = {
    mx: 0, my: 0, dodge: false, special: false, attack: false, aim: null, overPlay: false, aimDir: null, switchTo: null, toggleAuto: false, camp: false,
    stick: { active: false, ox: 0, oy: 0, x: 0, y: 0 },
    aimStick: { active: false, ox: 0, oy: 0, x: 0, y: 0 },
  };
  const keys = new Set<string>();
  let mouseAttack = false;
  let touchAttack = false;
  const attackNow = () => {
    c.attack = mouseAttack || touchAttack || keys.has('j') || keys.has('k');
  };
  const typing = (e: KeyboardEvent) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
  const update = () => {
    if (c.stick.active) return;
    const x = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
    const y = (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0);
    const l = Math.hypot(x, y) || 1;
    c.mx = x / l;
    c.my = y / l;
  };
  /**
   * A key by where it sits on the keyboard, not what's printed on it (e.code: KeyW is the key in W's
   * place on any layout, so French players get ZQSD and the rest move with it), as a QWERTY name.
   * Keys with no such code (old browsers) go by what they print.
   */
  const keyOf = (e: KeyboardEvent): string => {
    const code = e.code ?? '';
    if (code.startsWith('Key')) return code.slice(3).toLowerCase();
    if (code.startsWith('Digit')) return code.slice(5);
    if (code.startsWith('Arrow')) return code.toLowerCase();
    if (code === 'Space') return ' ';
    if (code === 'ShiftLeft' || code === 'ShiftRight') return 'shift';
    return e.key.toLowerCase();
  };
  const down = (e: KeyboardEvent) => {
    if (typing(e)) return;
    const k = keyOf(e);
    if (k === ' ' || k === 'shift') {
      c.dodge = true;
      e.preventDefault();
    } else if (k === 'e' || k === 'q') c.special = true;
    else if (k === '1' || k === '2' || k === '3') c.switchTo = Number(k) - 1;
    else if (k === 't') c.toggleAuto = true;
    else if (k === 'c' && !e.repeat) c.camp = true;
    if (k.startsWith('arrow')) e.preventDefault();
    keys.add(k);
    update();
    attackNow();
    onKey?.(k);
  };
  const up = (e: KeyboardEvent) => {
    keys.delete(keyOf(e));
    update();
    attackNow();
  };
  // The touch Attack button: its finger, and where it went down (the aim stick's middle).
  let aimId: number | null = null;
  /** The last finger to touch down anywhere (seen first, on the way in, before any button keeps it). */
  let lastPress: { x: number; y: number; id: number } | null = null;
  const press = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') lastPress = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };
  /** The Attack button's finger at (x, y): past the dead zone the drag aims; back inside it, auto-aim. */
  const dragTo = (x: number, y: number) => {
    if (!touchAttack) return;
    const s = c.aimStick;
    const dx = x - s.ox;
    const dy = y - s.oy;
    const l = Math.hypot(dx, dy);
    if (l < AIM_DEAD) {
      c.aimDir = null;
      s.active = false;
      s.x = s.ox;
      s.y = s.oy;
      return;
    }
    const k = l > AIM_RADIUS ? AIM_RADIUS / l : 1;
    s.active = true;
    s.x = s.ox + dx * k;
    s.y = s.oy + dy * k;
    c.aimDir = { x: dx / l, y: dy / l };
  };
  const letGo = () => {
    touchAttack = false;
    aimId = null;
    c.aimDir = null;
    c.aimStick.active = false;
    attackNow();
  };
  const blur = () => {
    keys.clear();
    mouseAttack = false;
    letGo();
    update();
    attackNow();
  };
  // The mouse: it aims wherever it is; hold the left button on the play area to attack there.
  const mouseDown = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    if (!(e.target as HTMLElement).dataset?.play) return;
    mouseAttack = true;
    c.aim = { x: e.clientX, y: e.clientY };
    attackNow();
  };
  const mouseMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    c.aim = { x: e.clientX, y: e.clientY };
    c.overPlay = !!(e.target as HTMLElement | null)?.dataset?.play;
  };
  const mouseUp = (e: PointerEvent) => {
    if (e.pointerId === aimId) letGo();
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    mouseAttack = false;
    attackNow();
  };
  const mouseOut = (e: PointerEvent) => {
    // Off the window: no crosshair.
    if (e.pointerType === 'mouse' && !e.relatedTarget) c.overPlay = false;
  };
  // Touch joystick on the left half of the play area.
  let touchId: number | null = null;
  const RADIUS = 46;
  const start = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') return;
    const el = e.target as HTMLElement;
    if (!el.dataset?.play) return;
    if (touchId !== null || (e.clientX > window.innerWidth * 0.55 && !stickAnywhere?.())) return;
    touchId = e.pointerId;
    c.stick = { active: true, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY };
  };
  const move = (e: PointerEvent) => {
    if (e.pointerId === aimId) dragTo(e.clientX, e.clientY);
    if (e.pointerId !== touchId) return;
    const dx = e.clientX - c.stick.ox;
    const dy = e.clientY - c.stick.oy;
    const l = Math.hypot(dx, dy);
    const k = l > RADIUS ? RADIUS / l : 1;
    c.stick.x = c.stick.ox + dx * k;
    c.stick.y = c.stick.oy + dy * k;
    const mag = Math.min(1, l / RADIUS);
    c.mx = l > 6 ? (dx / l) * mag : 0;
    c.my = l > 6 ? (dy / l) * mag : 0;
  };
  const end = (e: PointerEvent) => {
    if (e.pointerId === aimId && e.type === 'pointercancel') letGo();
    if (e.pointerId !== touchId) return;
    touchId = null;
    c.stick.active = false;
    c.mx = 0;
    c.my = 0;
    update();
  };
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', blur);
  window.addEventListener('pointerdown', start);
  window.addEventListener('pointerdown', press, true);
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
  window.addEventListener('pointerdown', mouseDown);
  window.addEventListener('pointermove', mouseMove);
  window.addEventListener('pointerup', mouseUp);
  window.addEventListener('pointerout', mouseOut);
  return {
    controls: c,
    press: (what) => {
      c[what] = true;
    },
    hold: (on, at) => {
      if (!on) {
        letGo();
        return;
      }
      touchAttack = true;
      c.aim = null;
      c.aimDir = null;
      // Where the finger went down is the aim stick's middle (the press seen on its way in, when the
      // button doesn't say).
      const p = at ?? lastPress;
      aimId = p?.id ?? null;
      const x = p?.x ?? 0;
      const y = p?.y ?? 0;
      c.aimStick = { active: false, ox: x, oy: y, x, y };
      attackNow();
    },
    dispose: () => {
      window.removeEventListener('pointerdown', mouseDown);
      window.removeEventListener('pointermove', mouseMove);
      window.removeEventListener('pointerup', mouseUp);
      window.removeEventListener('pointerout', mouseOut);
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      window.removeEventListener('pointerdown', start);
      window.removeEventListener('pointerdown', press, true);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    },
  };
}
