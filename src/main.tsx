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

/** How long the sheets may take to decode before the game starts without them (the old art shows until they're in). */
const SHEETS_WAIT_MS = 8000;

let started = false;
// Whatever goes wrong says so on the screen: the whole screen before the game is up, a strip after.
const onError = (err: unknown) => (started ? runtimeError(err) : bootFailure(err));
window.addEventListener('error', (e) => onError(e.error ?? e.message));
window.addEventListener('unhandledrejection', (e) => onError(e.reason));

try {
  installSkin();
} catch (e) {
  bootFailure(e);
}
// The PixelForge sheets (knights and monsters) are decoded before the first frame, so nothing shows
// in the old art first (it takes a moment; if they fail, or a browser is slow decoding them, the old
// art stays until they're in). The knight pictures are sized from the sheets, so measure them before
// the first render.
const sheets = Promise.race([pfLoad(), new Promise<void>((done) => setTimeout(done, SHEETS_WAIT_MS))]);
void sheets.then(() => {
  try {
    measureKnightPics();
    createRoot(document.getElementById('root')!).render(
      <Guard>
        <App />
      </Guard>,
    );
    started = true;
  } catch (e) {
    bootFailure(e);
  }
});
