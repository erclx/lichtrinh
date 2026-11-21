import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { defineConfig } from 'vite'

const portOffset = Number(process.env.WORKTREE_PORT_OFFSET) || 0

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
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
