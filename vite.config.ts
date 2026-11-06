/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json' with { type: 'json' };

// `--mode artifact` builds one page for the claude.ai artifact viewer (fonts, images and chunks
// inlined; tools/buildArtifact.mjs folds the JS and CSS into the HTML). The music and sounds stay
// files of their own, published beside the page (the page is a quarter the size, quick to open for
// anyone, and the audio comes in as it's needed).
export default defineConfig(({ mode }) => {
  const artifact = mode === 'artifact';
  return {
    plugins: [react()],
    base: './',
    define: { __APP_VERSION__: JSON.stringify(pkg.version) },
    build: {
      outDir: artifact ? 'dist-artifact' : 'dist',
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
