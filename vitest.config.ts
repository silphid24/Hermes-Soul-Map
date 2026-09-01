import { defineConfig } from 'vitest/config'
import { ensureGeneratedData } from './scripts/generatedDataPlugin.mjs'

export default defineConfig({
  plugins: [ensureGeneratedData()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: false,
  },
})
