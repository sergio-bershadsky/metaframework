'use client'

import { loader } from '@monaco-editor/react'
import type * as Monaco from 'monaco-editor/editor/editor.api.js'
import { SRN_PATTERN } from '@/lib/catalog/mentions'
import { CANONICAL_SCHEMA_HOST, schemaUrlToSrn } from '@/lib/schema/url'
import { CONSOLE_TOKEN as TOKEN } from '@/lib/ui/console-tokens'

/**
 * One Monaco, loaded once, configured here.
 *
 * Three decisions are worth stating, because each was the alternative to
 * something worse:
 *
 *  1. **Monaco is imported locally, never from a CDN.** `@monaco-editor/react`
 *     defaults to fetching the AMD loader from jsdelivr; a catalog that stops
 *     rendering its own artifacts when the network is unavailable is not a
 *     catalog. `loader.config({ monaco })` hands it the bundled copy instead,
 *     and `init()` then resolves without touching the document.
 *  2. **Nothing loads until something needs it, and only what is needed.**
 *     Every import here is dynamic and behind `loadMonaco()`, so a page with no
 *     code on it never pays for Monaco at all — and the contributions and
 *     grammars are enumerated rather than pulled in wholesale, because Monaco's
 *     all-in entry brings the TypeScript compiler with it.
 *  3. **The SRN link provider is ours.** This is the thing an IDE could not give
 *     us: VS Code's JSON language service only links `$ref` pointers *inside the
 *     same document*, so `srn://acme/product/shop/datamodel/order` sat in an
 *     artifact as dead text. Inside Monaco we own the provider, so every SRN in
 *     every artifact is a link to that entity's page.
 */

let instance: Promise<typeof Monaco> | null = null

export const CONSOLE_THEME = 'metaframework-console'

/** Set by whichever editor is mounted; the link opener is a global singleton. */
let navigate: ((srn: string) => void) | null = null

/**
 * Route SRN link clicks. Registered once with Monaco, but the router changes
 * identity on every navigation, so the callback is swapped rather than
 * re-registered — a second opener would open the same link twice.
 */
export function setSrnNavigator(callback: (srn: string) => void): void {
  navigate = callback
}

/**
 * The editor's *contributions*, chosen for a read-only viewer.
 *
 * `editor.api` is the bare surface: an editor built from it alone has no link
 * detector, no folding, no find — and no cursor commands, so the arrow keys do
 * nothing. Monaco's `editor.main` entry registers all of them, but it also
 * registers the TypeScript language service, and that drags the entire
 * TypeScript compiler into the bundle: two thirds of the download, for a
 * catalog whose artifacts are YAML and JSON.
 *
 * So the list is explicit. Everything here answers a question a reader asks of
 * a file — where does this link go, what is inside this block, where else does
 * this word appear, how do I copy it — and nothing here is about editing text
 * the viewer will not let you edit.
 */
const CONTRIBUTIONS = [
  // Cursor movement and selection. Without it the editor is inert.
  () => import('monaco-editor/editor/browser/coreCommands.js'),
  () => import('monaco-editor/editor/contrib/wordOperations/browser/wordOperations.js'),
  () => import('monaco-editor/editor/contrib/lineSelection/browser/lineSelection.js'),
  () => import('monaco-editor/editor/contrib/clipboard/browser/clipboard.js'),
  // The SRN links this whole module exists for.
  () => import('monaco-editor/editor/contrib/links/browser/links.js'),
  () => import('monaco-editor/editor/contrib/hover/browser/hoverContribution.js'),
  // Reading structure: collapse a branch, match a bracket, find a name.
  () => import('monaco-editor/editor/contrib/folding/browser/folding.js'),
  () => import('monaco-editor/editor/contrib/bracketMatching/browser/bracketMatching.js'),
  () => import('monaco-editor/editor/contrib/find/browser/findController.js'),
  // Ctrl+M announces and toggles the tab trap — the keyboard escape hatch.
  () => import('monaco-editor/editor/contrib/toggleTabFocusMode/browser/toggleTabFocusMode.js'),
]

/**
 * Services that other people's contributions ask for.
 *
 * Monaco's contribution registry is GLOBAL and additive: any module anywhere in
 * the bundle that imports a controller registers that controller for every
 * editor created afterwards. The list above therefore decides what we *import*,
 * not what ends up registered — something in the graph pulls the code lens,
 * suggest and tree-view controllers in without us asking, and each of those is
 * constructed with a service that only `editor.main` would otherwise register.
 * The result was a runtime error the moment an editor mounted:
 *
 *     [createInstance] CodeLensContribution depends on UNKNOWN service ICodeLensCache
 *
 * Registering the three services is the cheap half of the fix and the safe one:
 * each is a `registerSingleton(..., InstantiationType.Delayed)`, so nothing is
 * constructed unless the contribution that needs it actually runs. Dropping the
 * contributions instead would mean either taking `editor.main` — and the whole
 * TypeScript compiler with it, which is what this file exists to avoid — or
 * policing an import graph we do not own.
 */
const REQUIRED_SERVICES = [
  () => import('monaco-editor/editor/contrib/codelens/browser/codeLensCache.js'),
  () => import('monaco-editor/editor/contrib/suggest/browser/suggestMemory.js'),
  () => import('monaco-editor/editor/common/services/treeViewsDndService.js'),
]

/** The languages this catalog is written in, and nothing else. */
const GRAMMARS = [
  () => import('monaco-editor/languages/definitions/yaml/register.js'),
  () => import('monaco-editor/languages/definitions/markdown/register.js'),
]

export function loadMonaco(): Promise<typeof Monaco> {
  if (instance) return instance

  instance = (async () => {
    installWorkers()

    const [monaco, json] = await Promise.all([
      import('monaco-editor/editor/editor.api.js'),
      import('monaco-editor/languages/features/json/register.js'),
      ...REQUIRED_SERVICES.map((load) => load()),
      ...CONTRIBUTIONS.map((load) => load()),
      ...GRAMMARS.map((load) => load()),
    ])

    monaco.editor.defineTheme(CONSOLE_THEME, CONSOLE_THEME_DATA)
    // Applying the theme is what injects its `.mtk*` colour rules into the
    // document — and those rules are what `colorize()` output is styled by, so
    // a prose fence is dark-themed without an editor ever existing.
    monaco.editor.setTheme(CONSOLE_THEME)
    registerSrnLinks(monaco)

    // Everything the editor needs is in the page already; fetching a `$schema`
    // would be a silent network call from a document nobody asked to validate.
    json.jsonDefaults.setDiagnosticsOptions({
      validate: true,
      allowComments: false,
      enableSchemaRequest: false,
      schemas: [],
    })

    loader.config({ monaco } as unknown as Parameters<typeof loader.config>[0])
    await loader.init()
    return monaco
  })()

  return instance
}

/**
 * Monaco resolves workers through this global. The `new URL(...)` argument must
 * be a literal relative path for the bundler to emit a worker chunk, which is
 * why `editor.worker.ts` and `json.worker.ts` exist at all.
 */
function installWorkers(): void {
  const environment = {
    getWorker(_id: string, label: string) {
      if (label === 'json') {
        return new Worker(new URL('./json.worker.ts', import.meta.url), { type: 'module' })
      }
      return new Worker(new URL('./editor.worker.ts', import.meta.url), { type: 'module' })
    },
  }
  ;(self as unknown as { MonacoEnvironment?: unknown }).MonacoEnvironment = environment
}

/* ------------------------------------------------------------------ links */

/**
 * Every entity address in a YAML or JSON artifact, as a Monaco link.
 *
 * Two spellings, one destination, because a `schema.json` uses both. `x-srn`
 * states the entity's identity as an SRN; every cross-entity `$ref` states the
 * *same kind of fact* as that SRN's canonical URL projection
 * (`https://schemas.metaframework.dev/…`, decision-record amendment
 * 2026-08-19-d). Linking only the first would leave the one reference a reader
 * actually wants to follow — the `$ref` to the base a model extends — as dead
 * text, which is exactly the gap this provider exists to close.
 *
 * The URL form is resolved through {@link schemaUrlToSrn}, so it is the same
 * rename the rest of the portal uses and a URL that is not a legal entity
 * address is simply not a link. Both spellings emit an `srn:` target, so the
 * opener below has one case to handle.
 *
 * The provider runs per model and returns ranges; the opener turns a click into
 * a client-side navigation. Both halves are needed — Monaco's default opener
 * only understands http(s), so an `srn:` link without an opener is a link that
 * highlights and does nothing.
 */
function registerSrnLinks(monaco: typeof Monaco): void {
  // Stops at a quote, whitespace or a JSON-Pointer fragment: a `$ref` sits
  // inside a string, and the fragment is a location *within* the target, not
  // part of its address.
  const schemaUrlSource = `${CANONICAL_SCHEMA_HOST.replace(/[.]/g, '\\.')}/[^"'\\s#?]+`

  monaco.languages.registerLinkProvider(['yaml', 'json'], {
    provideLinks(model) {
      const links: Monaco.languages.ILink[] = []

      const push = (line: number, index: number, text: string, srn: string) => {
        const start = index + 1
        links.push({
          range: new monaco.Range(line, start, line, start + text.length),
          url: srn,
          tooltip: `Open ${srn}`,
        })
      }

      for (let line = 1; line <= model.getLineCount(); line++) {
        const text = model.getLineContent(line)
        const hasSrn = text.includes('srn://')
        const hasUrl = text.includes(CANONICAL_SCHEMA_HOST)
        if (!hasSrn && !hasUrl) continue

        // `matchAll` needs a fresh lastIndex per line; the shared pattern is
        // global, so it is re-created rather than reset.
        if (hasSrn) {
          for (const match of text.matchAll(new RegExp(SRN_PATTERN.source, 'g'))) {
            push(line, match.index ?? 0, match[0], match[0])
          }
        }

        if (hasUrl) {
          for (const match of text.matchAll(new RegExp(schemaUrlSource, 'g'))) {
            const srn = schemaUrlToSrn(match[0])
            if (srn) push(line, match.index ?? 0, match[0], srn)
          }
        }
      }

      return { links }
    },
  })

  monaco.editor.registerLinkOpener({
    open(resource) {
      if (resource.scheme !== 'srn') return false
      // `Uri` splits `srn://acme/product/shop` into authority + path; putting
      // them back is exact, because an SRN has no query, fragment or userinfo.
      const srn = `srn://${resource.authority}${resource.path}`
      if (!navigate) return false
      navigate(srn)
      return true
    },
  })
}

/* ------------------------------------------------------------------ theme */

/**
 * The console palette, as Monaco wants it — the shared hex conversions in
 * `@/lib/ui/console-tokens`, since Monaco cannot read a CSS custom property.
 *
 * The rules deliberately introduce NO new hue. Colour in this portal means
 * entity kind, and a code block has no kind; so identifiers take the one
 * sanctioned accent (`--primary`), values and prose take the neutral ramp, and
 * only genuinely invalid text takes `--destructive`. A rainbow syntax theme
 * would be the single largest violation of that rule anywhere in the console.
 */
const CONSOLE_THEME_DATA: Monaco.editor.IStandaloneThemeData = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: '', foreground: TOKEN.foreground },
    // Keys are identifiers — the thing a reviewer scans an artifact for.
    { token: 'type', foreground: TOKEN.primary },
    { token: 'string.key', foreground: TOKEN.primary },
    { token: 'tag', foreground: TOKEN.primary },
    // Values read as plain text; that is what they are.
    { token: 'string', foreground: TOKEN.foreground },
    { token: 'string.value', foreground: TOKEN.foreground },
    { token: 'number', foreground: TOKEN.neutral },
    { token: 'keyword', foreground: TOKEN.neutral },
    { token: 'namespace', foreground: TOKEN.neutral },
    { token: 'comment', foreground: TOKEN.muted, fontStyle: 'italic' },
    { token: 'operators', foreground: TOKEN.muted },
    { token: 'delimiter', foreground: TOKEN.muted },
    { token: 'string.invalid', foreground: TOKEN.destructive },
    { token: 'string.escape.invalid', foreground: TOKEN.destructive },
    { token: 'invalid', foreground: TOKEN.destructive },
  ],
  colors: {
    'editor.background': TOKEN.background,
    'editor.foreground': TOKEN.foreground,
    // Bracket-pair colorization is disabled per editor, but the palette is
    // pinned here as well: the feature colours brackets from these six slots,
    // bypassing the token rules entirely, so any editor that ever comes up with
    // the option on would paint yellow/pink/blue nesting depths into a console
    // where colour means entity kind. With every slot on the neutral ramp the
    // failure mode ceases to exist rather than being merely switched off.
    'editorBracketHighlight.foreground1': TOKEN.muted,
    'editorBracketHighlight.foreground2': TOKEN.muted,
    'editorBracketHighlight.foreground3': TOKEN.muted,
    'editorBracketHighlight.foreground4': TOKEN.muted,
    'editorBracketHighlight.foreground5': TOKEN.muted,
    'editorBracketHighlight.foreground6': TOKEN.muted,
    'editorBracketHighlight.unexpectedBracket.foreground': TOKEN.destructive,
    'editorGutter.background': TOKEN.background,
    'editorLineNumber.foreground': TOKEN.borderStrong,
    'editorLineNumber.activeForeground': TOKEN.muted,
    'editor.lineHighlightBackground': TOKEN.raised,
    'editor.lineHighlightBorder': '#00000000',
    'editor.selectionBackground': '#7689ff52',
    'editor.inactiveSelectionBackground': '#7689ff29',
    'editor.selectionHighlightBackground': '#7689ff29',
    'editor.wordHighlightBackground': '#7689ff1f',
    'editorCursor.foreground': TOKEN.primary,
    'editorWhitespace.foreground': TOKEN.border,
    'editorIndentGuide.background1': TOKEN.border,
    'editorIndentGuide.activeBackground1': TOKEN.borderStrong,
    'editorBracketMatch.background': '#7689ff1f',
    'editorBracketMatch.border': TOKEN.borderStrong,
    'editorLink.activeForeground': TOKEN.primary,
    'editorWidget.background': TOKEN.raised,
    'editorWidget.border': TOKEN.borderStrong,
    'editorHoverWidget.background': TOKEN.raised,
    'editorHoverWidget.border': TOKEN.borderStrong,
    'editorError.foreground': TOKEN.destructive,
    'editorOverviewRuler.border': '#00000000',
    'scrollbarSlider.background': '#393d4666',
    'scrollbarSlider.hoverBackground': '#393d46a6',
    'scrollbarSlider.activeBackground': '#393d46cc',
    focusBorder: '#00000000',
  },
}
