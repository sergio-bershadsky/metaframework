import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * Vitest ran on bare defaults until route handlers became testable.
 *
 * App-directory modules import through the `@/` alias that tsconfig defines and
 * Next resolves; vitest resolves neither on its own, so a test that imports a
 * route handler failed at module load rather than at an assertion. Mirroring the
 * one alias here — and nothing else — keeps the default test discovery and
 * environment exactly as they were.
 *
 * The `.mts` extension is inherited, not required. It was chosen when this
 * package had no `"type": "module"` and a `.ts` config would have been loaded
 * as CommonJS; `package.json` declares `"type": "module"` now, so a `.ts` name
 * loads as ESM and warns about nothing (checked by renaming it and running the
 * suite). Nothing references the filename, so the extension is free either way
 * — which is the reason to say so here rather than leave a rationale standing
 * that stopped being true.
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
})
