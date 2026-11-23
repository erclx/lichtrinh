import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { defineConfig } from 'vite'

const portOffset = Number(process.env.WORKTREE_PORT_OFFSET) || 0

// Moves local D1 state under another folder, so e2e runs and review drives
// write a throwaway copy rather than the developer's own database. The seed
// in `scripts/seed.ts` reads the same variable.
const stateRoot = process.env.LICHTRINH_STATE_ROOT
const cloudflareOptions =
  stateRoot === undefined
    ? {}
    : {
        persistState: {
          path: path.join(path.resolve(stateRoot), '.wrangler', 'state'),
        },
      }

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare(cloudflareOptions)],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      '@shared': path.resolve(import.meta.dirname, './shared'),
    },
  },
  base: process.env.VITE_BASE_URL ?? '/',
  server: {
    port: 5173 + portOffset,
    strictPort: true,
  },
  preview: {
    port: 4173 + portOffset,
    strictPort: true,
  },
})
