/// <reference types="vitest" />
import { defineConfig } from 'vite';

// LEVEL X builds to a single self-contained web bundle that the Even phone app
// loads inside a WebView. No dev server features beyond static serving are needed.
export default defineConfig({
  base: './',
  // Dedicated dev port. strictPort makes Vite fail instead of silently moving or
  // sharing a port with another local dev server (5173 is Vite's default and
  // was already used by another project on this machine).
  server: {
    host: '0.0.0.0',
    port: 5180,
    strictPort: true,
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    // The math/logic suites are pure and run under Node. DOM-dependent suites
    // opt into jsdom per-file via a `// @vitest-environment jsdom` pragma.
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/core/math/**', 'src/sensors/**', 'src/input/**', 'src/display/renderer/**'],
    },
  },
});
