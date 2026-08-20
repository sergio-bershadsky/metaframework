import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * The portal ships to npm as a CLI, so the published tarball has to carry a
   * server that runs with no `npm install` behind it. `standalone` makes Next
   * trace what the server actually imports into `.next/standalone`, including
   * the slice of `node_modules` it reaches — the alternative, shipping the full
   * dependency tree, is an order of magnitude more bytes for the same server.
   *
   * The trace deliberately does not copy `public/` or `.next/static`; the
   * package's `prepack` does, because for us there is no CDN in front.
   */
  output: "standalone",

  /**
   * Two things the trace pulls in that must not reach the tarball.
   *
   * `sharp` and its `@img/*` prebuilds are 27MB of it, and they are *platform*
   * binaries: what npm installed here is darwin-arm64, so publishing them would
   * ship a macOS blob to every Linux user and still not help them. Next only
   * loads sharp to optimise `next/image`, and this portal renders no
   * `next/image` at all — the whole of `public/` is SVG. Nothing calls it.
   *
   * The whole of `src/` is the second. The server is compiled into
   * `.next/server`; nothing under `src/` is read at runtime. It is traced
   * anyway because the tracer follows a chunk's `.js.map` into its `sources`,
   * so a module that ends up in a chunk of its own drags its TypeScript in —
   * `src/lib/history/git.ts` shipped 30kB that way. Excluding the directory
   * rather than a file pattern means the next module to land in its own chunk
   * does not repeat it.
   */
  outputFileTracingExcludes: {
    "**": ["node_modules/sharp/**/*", "node_modules/@img/**/*", "src/**/*"],
  },
};

export default nextConfig;
