import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { ensureGeneratedData } from './scripts/generatedDataPlugin.mjs'

// https://vite.dev/config/
export default defineConfig({
  plugins: [ensureGeneratedData(), react()],
  server: {
    // Allow temporary Cloudflare Quick Tunnel hostnames for external preview.
    allowedHosts: ['.trycloudflare.com'],
  },
})
