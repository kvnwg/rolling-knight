import { createRoot } from 'react-dom/client';
import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/700.css';
import './ui/digits.css';
import './ui/styles.css';
import { App } from './ui/App';
import { installSkin } from './ui/skin';
import { pfLoad } from './render/pf/assets';
import { measureKnightPics } from './ui/sprites';

installSkin();
// The PixelForge sheets (knights and monsters) are decoded before the first frame, so nothing shows
// in the old art first (it takes a moment; if they fail, the old art stays).
// The knight pictures are sized from the sheets, so measure them before the first render.
void pfLoad().then(() => {
  measureKnightPics();
  createRoot(document.getElementById('root')!).render(<App />);
});
