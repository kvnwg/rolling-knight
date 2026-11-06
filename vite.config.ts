/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json' with { type: 'json' };

// `--mode artifact` builds one self-contained page for the claude.ai artifact viewer
// (fonts, images and chunks inlined; tools/buildArtifact.mjs folds the JS and CSS into the HTML).
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
            assetsInlineLimit: 100_000_000,
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
