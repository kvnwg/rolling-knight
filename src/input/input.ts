/**
 * Controls. Keyboard: WASD or arrows to move, the left mouse button (held) or J/K to attack toward the
 * mouse, Space or Shift to dodge roll, E or Q to roll your skill early, 1/2/3 to take control of a squad
 * member, T to toggle Auto. Touch: a joystick that appears wherever the left half of the screen is
 * touched (anywhere, when `stickAnywhere` says so: at the hub, where there are no fight buttons on the
 * right), and the buttons the HUD draws (they call press(), and hold() for the attack button).
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
  switchTo: number | null;
  toggleAuto: boolean;
  /** The touch joystick, for the HUD to draw (screen pixels). */
  stick: { active: boolean; ox: number; oy: number; x: number; y: number };
}

export function createControls(onKey?: (key: string) => void, stickAnywhere?: () => boolean): { controls: Controls; dispose: () => void; press: (what: 'dodge' | 'special') => void; hold: (on: boolean) => void } {
  const c: Controls = { mx: 0, my: 0, dodge: false, special: false, attack: false, aim: null, switchTo: null, toggleAuto: false, stick: { active: false, ox: 0, oy: 0, x: 0, y: 0 } };
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
  const down = (e: KeyboardEvent) => {
    if (typing(e)) return;
    const k = e.key.toLowerCase();
    if (k === ' ' || k === 'shift') {
      c.dodge = true;
      e.preventDefault();
    } else if (k === 'e' || k === 'q') c.special = true;
    else if (k === '1' || k === '2' || k === '3') c.switchTo = Number(k) - 1;
    else if (k === 't') c.toggleAuto = true;
    if (k.startsWith('arrow')) e.preventDefault();
    keys.add(k);
    update();
    attackNow();
    onKey?.(k);
  };
  const up = (e: KeyboardEvent) => {
    keys.delete(e.key.toLowerCase());
    update();
    attackNow();
  };
  const blur = () => {
    keys.clear();
    mouseAttack = false;
    touchAttack = false;
    update();
    attackNow();
  };
  // The mouse: hold the left button on the play area to attack toward the pointer.
  const mouseDown = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    if (!(e.target as HTMLElement).dataset?.play) return;
    mouseAttack = true;
    c.aim = { x: e.clientX, y: e.clientY };
    attackNow();
  };
  const mouseMove = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') c.aim = { x: e.clientX, y: e.clientY };
  };
  const mouseUp = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    mouseAttack = false;
    attackNow();
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
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
  window.addEventListener('pointerdown', mouseDown);
  window.addEventListener('pointermove', mouseMove);
  window.addEventListener('pointerup', mouseUp);
  return {
    controls: c,
    press: (what) => {
      c[what] = true;
    },
    hold: (on) => {
      touchAttack = on;
      if (on) c.aim = null;
      attackNow();
    },
    dispose: () => {
      window.removeEventListener('pointerdown', mouseDown);
      window.removeEventListener('pointermove', mouseMove);
      window.removeEventListener('pointerup', mouseUp);
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      window.removeEventListener('pointerdown', start);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    },
  };
}
