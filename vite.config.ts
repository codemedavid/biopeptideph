import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: {
    // In production, vercel.json rewrites /api/* to the Express serverless
    // function. `vite` has no equivalent, so admin login / the access gate
    // can't work locally unless we forward /api to a running backend.
    // Start it with `npm run dev:api` (serves api/index.js on :3001), then
    // `npm run dev` proxies /api to it. Use `npm run dev:full` to run both.
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
