import type { NextConfig } from "next";

/**
 * The offline guarantee, stated as a policy rather than left to luck.
 *
 * This portal renders catalogs that are frequently private, on machines that
 * are frequently air-gapped, and every asset it needs is already same-origin:
 * `next/font` self-hosts its two families at build time, Monaco is bundled
 * rather than pulled from jsdelivr (see `components/code/monaco.ts`), mermaid
 * and elkjs are npm dependencies, and the only network call the client makes is
 * `EventSource('/api/watch')`. `default-src 'self'` turns all of that from a
 * property that happens to hold today into one the browser enforces: no
 * script, style, font, image, frame or fetch may leave the origin, so a
 * dependency that starts phoning home fails visibly instead of silently
 * shipping a company's architecture somewhere.
 *
 * Two directives are relaxed, and neither of them opens an origin:
 *
 *  - `script-src 'unsafe-inline'`: the App Router streams its RSC payload as
 *    inline `self.__next_f.push(...)` scripts on every page. The only way off
 *    it is a per-request nonce, which cannot come from here — it needs a
 *    `proxy.ts`, because a header in this file is baked into the routes
 *    manifest at build time and is therefore the same string for every
 *    request. That route is open (every page is already `force-dynamic`, so
 *    the nonce's dynamic-rendering requirement costs nothing), but it is a
 *    separate change and it does not affect the offline guarantee: inline
 *    scripts are still *our* scripts, and no external host becomes reachable.
 *  - `style-src 'unsafe-inline'`: two independent sources, neither noncible.
 *    Mermaid emits a `<style>` block inside every SVG it renders — the theme
 *    variables in `lib/ui/mermaid.ts` are delivered that way and there is no
 *    nonce option on `mermaid.initialize` — and React writes `style` attributes
 *    for every measured layout in the console. Attributes cannot carry a nonce
 *    at all, and a nonce in this directive would *disable* `'unsafe-inline'`
 *    rather than complement it, so both would break.
 *
 * `worker-src 'self'` is deliberately not widened to `blob:`. Monaco's two
 * workers are real chunks under `/_next/static`, constructed from a
 * `new URL(..., import.meta.url)` the bundler rewrites; the blob shim only
 * appears when workers are served cross-origin, which cannot happen here.
 *
 * `upgrade-insecure-requests` is deliberately absent. The CLI serves plain
 * HTTP, and on any host that is not `localhost` the directive would rewrite
 * every same-origin asset request to `https://` and break the page. There are
 * no external subresources left for it to protect.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  // `unsafe-eval` is development-only: React reconstructs server error stacks
  // through `eval`, and the dev server's HMR runtime is compiled with it.
  // Neither exists in a production build.
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  // Monaco, twice over: its bundled stylesheet carries base64 backgrounds
  // (the colour-picker strip, the touch-keyboard control), and its theming
  // participant generates the red squiggle under a JSON syntax error as a
  // `data:image/svg+xml` background rule at theme time. Nothing here reaches
  // for a remote image.
  "img-src 'self' data:",
  "font-src 'self'",
  "worker-src 'self'",
  // `/api/watch` — the reload stream. Nothing else opens a socket.
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  /**
   * Headers are checked before the filesystem, so `/:path*` covers the routes,
   * the `/schemas` and `/artifacts` handlers and `/_next/static` alike — the
   * policy has to reach the document, and reaching everything else costs one
   * header on responses nobody parses it from.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "Content-Security-Policy", value: contentSecurityPolicy }],
      },
    ];
  },

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
