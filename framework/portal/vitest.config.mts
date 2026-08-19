import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * Vitest ran on bare defaults until route handlers became testable.
 *
 * App-directory modules import through the `@/` alias that tsconfig defines and
 * Next resolves; vitest resolves neither on its own, so a test that imports a
 * route handler failed at module load rather than at an assertion. Mirroring the
 * one alias here — and nothing else — keeps the default test discovery and
 * environment exactly as they were. The `.mts` extension is deliberate: this
 * package has no `"type": "module"`, so a `.ts` config is loaded as CommonJS and
 * Vite warns about the ESM syntax in it.
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
})
