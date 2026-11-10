import { createRoot } from 'react-dom/client';
import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/700.css';
import './ui/digits.css';
import './ui/styles.css';
import { App } from './ui/App';
import { bootFailure, Guard, runtimeError } from './ui/Failure';
import { installSkin } from './ui/skin';
import { pfLoad } from './render/pf/assets';
import { measureKnightPics } from './ui/sprites';
import { portal } from './platform/portal';
import { setSaveStore } from './core/save';
import { engine } from './audio/engine';

/** How long the sheets may take to decode before the game starts without them (the old art shows until they're in). */
const SHEETS_WAIT_MS = 8000;

let started = false;
/**
 * Errors that aren't the game's: another origin's script (the browser only says "Script error."),
 * or the portal's SDK and what it loads. The game doesn't put those on the screen.
 */
function foreign(e: ErrorEvent | PromiseRejectionEvent): boolean {
  if (__PORTAL__ === '') return false;
  if (e instanceof ErrorEvent) return e.message === 'Script error.' || (!!e.filename && !e.filename.startsWith(location.origin));
  const stack = String((e.reason as { stack?: unknown } | null)?.stack ?? '');
  return !(e.reason instanceof Error) || /crazygames/i.test(stack);
}
// Whatever goes wrong says so on the screen: the whole screen before the game is up, a strip after.
const onError = (err: unknown) => (started ? runtimeError(err) : bootFailure(err));
window.addEventListener('error', (e) => !foreign(e) && onError(e.error ?? e.message));
window.addEventListener('unhandledrejection', (e) => !foreign(e) && onError(e.reason));

try {
  installSkin();
} catch (e) {
  bootFailure(e);
}
// On a portal: its SDK first (the save is kept in it, and it says what the device is), and it's told
// the game is loading until the first frame is up. With no portal this resolves at once.
const ready = portal.init().then(() => {
  setSaveStore(portal.store());
  portal.onMute((muted) => engine.setMuted(muted));
  portal.loadingStart();
});
// The PixelForge sheets (knights and monsters) are decoded before the first frame, so nothing shows
// in the old art first (it takes a moment; if they fail, or a browser is slow decoding them, the old
// art stays until they're in). The knight pictures are sized from the sheets, so measure them before
// the first render.
const sheets = Promise.race([pfLoad(), new Promise<void>((done) => setTimeout(done, SHEETS_WAIT_MS))]);
void Promise.all([sheets, ready]).then(() => {
  try {
    measureKnightPics();
    createRoot(document.getElementById('root')!).render(
      <Guard>
        <App />
      </Guard>,
    );
    started = true;
    portal.loadingStop();
  } catch (e) {
    bootFailure(e);
  }
});
