import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { defineConfig } from 'vite'

// Apart from the app's config, which loads the Cloudflare plugin and the
// offline worker, neither of which the panel has.
export default defineConfig({
  root: path.join(import.meta.dirname, 'ui'),
  publicDir: false,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, '../web'),
      '@shared': path.resolve(import.meta.dirname, '../shared'),
    },
  },
  build: {
    outDir: path.join(import.meta.dirname, 'dist'),
    emptyOutDir: true,
  },
})
