/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json' with { type: 'json' };

/** CrazyGames' SDK (v3), loaded before the game's own code: only the CrazyGames build has it on the page. */
const CRAZYGAMES_SDK = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';

// `--mode artifact` builds one page for the claude.ai artifact viewer (fonts, images and chunks
// inlined; tools/buildArtifact.mjs folds the JS and CSS into the HTML). The music and sounds stay
// files of their own, published beside the page (the page is a quarter the size, quick to open for
// anyone, and the audio comes in as it's needed).
// `--mode crazygames` builds the game for CrazyGames (dist-crazygames/; tools/crazygames/pack.mjs
// checks it against the portal's limits and zips it): the SDK's script goes in the page's head and
// __PORTAL__ switches the game's portal code on (src/platform/). `npm run dev -- --mode crazygames`
// runs it on localhost, where the SDK stands in for the portal with test ads.
export default defineConfig(({ mode }) => {
  const artifact = mode === 'artifact';
  const crazygames = mode === 'crazygames';
  return {
    plugins: [
      react(),
      ...(crazygames
        ? [
            {
              name: 'crazygames-sdk',
              transformIndexHtml: () => [{ tag: 'script', attrs: { src: CRAZYGAMES_SDK }, injectTo: 'head-prepend' as const }],
            },
          ]
        : []),
    ],
    base: './',
    define: { __APP_VERSION__: JSON.stringify(pkg.version), __PORTAL__: JSON.stringify(crazygames ? 'crazygames' : '') },
    build: {
      outDir: artifact ? 'dist-artifact' : crazygames ? 'dist-crazygames' : 'dist',
      // Older browsers too (Safari 14, Firefox 90, Chrome 90 and up): newer syntax is rewritten.
      target: ['es2020', 'safari14', 'firefox90', 'chrome90', 'edge90'],
      chunkSizeWarningLimit: 2000,
      ...(artifact
        ? {
            assetsInlineLimit: (file: string) => !file.endsWith('.mp3'),
            cssCodeSplit: false,
            modulePreload: false,
            rollupOptions: { output: { inlineDynamicImports: true } },
          }
        : {}),
    },
    test: {
      include: ['tests/**/*.test.ts'],
      environment: 'node',
      testTimeout: 60_000,
    },
  };
});
