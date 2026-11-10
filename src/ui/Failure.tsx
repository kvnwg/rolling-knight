/**
 * When something goes wrong, it says so on the screen (a blank or frozen page tells no one anything):
 *
 *  - before the game is up (a browser missing something it needs): the whole screen, the error and a
 *    Reload button (bootFailure);
 *  - the interface crashing while it draws (Guard, an error boundary round the app): the same screen;
 *  - an error once it's running (the game loop, an event): a strip along the top with the message,
 *    the first one only, that a tap puts away (runtimeError).
 *
 * The error's own words are shown as they are, so whoever sees it can pass them on.
 */
import { Component, type ReactNode } from 'react';

function describe(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function panel(message: string): HTMLElement {
  const box = document.createElement('div');
  box.className = 'boot-fail';
  const title = document.createElement('b');
  title.textContent = "Roll a Knight! couldn't start";
  const what = document.createElement('code');
  what.textContent = message;
  const where = document.createElement('small');
  where.textContent = navigator.userAgent;
  const again = document.createElement('button');
  again.className = 'btn gold';
  again.textContent = 'Reload';
  again.addEventListener('click', () => location.reload());
  box.append(title, what, where, again);
  return box;
}

/** The game couldn't start: the error over the whole screen, with a Reload button. */
export function bootFailure(err: unknown): void {
  console.error(err);
  if (document.querySelector('.boot-fail')) return;
  document.body.appendChild(panel(describe(err)));
}

let shown = false;

/** Something went wrong while playing: the first error in a strip along the top (a tap puts it away). */
export function runtimeError(err: unknown): void {
  console.error(err);
  if (shown || document.querySelector('.boot-fail')) return;
  shown = true;
  const strip = document.createElement('div');
  strip.className = 'run-fail';
  strip.textContent = `Something went wrong: ${describe(err)}`;
  strip.addEventListener('click', () => strip.remove());
  document.body.appendChild(strip);
}

/** Round the app: a crash while drawing the interface shows what it was instead of an empty page. */
export class Guard extends Component<{ children: ReactNode }, { err: unknown }> {
  state: { err: unknown } = { err: null };

  static getDerivedStateFromError(err: unknown): { err: unknown } {
    return { err: err ?? 'unknown error' };
  }

  componentDidCatch(err: unknown): void {
    bootFailure(err);
  }

  render(): ReactNode {
    return this.state.err ? null : this.props.children;
  }
}
