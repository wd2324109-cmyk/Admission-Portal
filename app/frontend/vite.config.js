import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The API runs on :4000 in development; in production the Node server serves both the API and this build (same origin).
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:4000' } },
  build: { sourcemap: false },                       // no source maps in the public build
  esbuild: { drop: ['console', 'debugger'] },        // no console output in the public build
});
