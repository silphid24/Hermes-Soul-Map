import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Allow temporary Cloudflare Quick Tunnel hostnames for external preview.
    allowedHosts: ['.trycloudflare.com'],
  },
})
