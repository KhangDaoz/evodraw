import { defineConfig } from 'vite';
import 'dotenv/config'; // picks up apps/desktop/.env at build time if present

// Bake the backend URL into the bundle at build time. The packaged app has no
// runtime .env (forge packs with asar and never copies .env), so relying on
// dotenv at runtime silently fell back to localhost:4000 → xhr poll error.
const DEFAULT_SERVER_URL =
  process.env.DEFAULT_SERVER_URL || 'https://evodraw-v9rt.onrender.com';

export default defineConfig({
  define: {
    'process.env.DEFAULT_SERVER_URL': JSON.stringify(DEFAULT_SERVER_URL),
  },
  build: {
    rollupOptions: {
      external: ['electron'],
    },
  },
});
