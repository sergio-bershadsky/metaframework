import { CONSOLE_TOKEN as TOKEN } from './console-tokens'

/**
 * One mermaid, loaded once, themed once — for every derived diagram.
 *
 * Decision-record amendment 2026-08-19-e: mermaid renders derived artifact
 * diagrams, React Flow is kept for the neighbourhood graph and the solution
 * map. That makes the loader a shared resource rather than a state-chart
 * detail, which is why it lives here instead of inside the first component
 * that needed it. `initialize` is global to the module — a second loader would
 * mean a second theme, and the console would drift out of tune with itself the
 * first time a token moved.
 *
 * Mermaid is heavy, so it follows the Monaco discipline in
 * `@/components/code/monaco.ts`: dynamically imported behind a module-level
 * singleton, so no page pays for it before a diagram is actually on screen.
 *
 * `theme: 'base'` is the one theme built to be recoloured; every variable it
 * exposes is mapped onto the console tokens — the same hex conversions Monaco's
 * theme reads — so a chart sits on the same ramp as every other panel. Font
 * families go through the CSS custom properties instead: the SVG lives in the
 * document, so `var()` resolves against the console's own font tokens.
 */

type MermaidModule = typeof import('mermaid').default

let instance: Promise<MermaidModule> | null = null

export function loadMermaid(): Promise<MermaidModule> {
  if (instance) return instance
  instance = import('mermaid').then(({ default: mermaid }) => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      fontFamily: 'var(--font-mono)',
      themeVariables: {
        fontSize: '13px',
        background: TOKEN.background,
        // Nodes — states, and flowchart boxes: the raised-panel surface every
        // other node in the console has.
        mainBkg: TOKEN.raised,
        primaryColor: TOKEN.raised,
        primaryTextColor: TOKEN.foreground,
        primaryBorderColor: TOKEN.borderStrong,
        textColor: TOKEN.foreground,
        stateLabelColor: TOKEN.foreground,
        // Flowcharts read `nodeBorder`/`nodeTextColor` rather than the state
        // diagram's variables. Set to the same tokens the derivation would have
        // produced, so naming them changes nothing about an existing chart and
        // leaves nothing to a default when a new diagram type arrives.
        nodeBorder: TOKEN.borderStrong,
        nodeTextColor: TOKEN.foreground,
        // Transitions and their labels.
        lineColor: TOKEN.borderStrong,
        transitionColor: TOKEN.borderStrong,
        transitionLabelColor: TOKEN.foreground,
        labelBackgroundColor: TOKEN.background,
        edgeLabelBackground: TOKEN.background,
        // Compound regions and flowchart subgraphs: page-level background so
        // the nested surface reads as a region, title bar on the raised step.
        compositeBackground: TOKEN.background,
        compositeTitleBackground: TOKEN.raised,
        compositeBorder: TOKEN.borderStrong,
        clusterBkg: TOKEN.background,
        clusterBorder: TOKEN.border,
        altBackground: TOKEN.background,
        // The [*] pseudostates take the accent, like the old entry dot.
        specialStateColor: TOKEN.primary,
        innerEndBackground: TOKEN.raised,
        // Notes carry compound-state entry/exit actions; muted, not shouting.
        noteBkgColor: TOKEN.raised,
        noteTextColor: TOKEN.muted,
        noteBorderColor: TOKEN.border,
      },
    })
    return mermaid
  })
  return instance
}

/**
 * Render diagram text to an SVG element, ready to be adopted into the document.
 *
 * Two things every caller would otherwise repeat, and one of them is a trap:
 *
 * - Mermaid serialises its HTML labels as HTML, so a `<br/>` a generator wrote
 *   into a label comes back unclosed — legal HTML, fatal XML. Closing it here
 *   is what lets the parse stay strict. Label *text* cannot smuggle one in:
 *   `<` survives only entity-escaped.
 * - `DOMParser` rather than `innerHTML`: the string is mermaid's own
 *   DOMPurify-sanitised output, but parsing it as a document and adopting the
 *   root element makes that trust boundary explicit.
 *
 * On failure the caller must still clean up mermaid's scratch element — it is
 * keyed by the render id the caller owns.
 */
export async function renderMermaid(id: string, text: string): Promise<SVGElement> {
  const mermaid = await loadMermaid()
  const { svg } = await mermaid.render(id, text)
  const xml = svg.replace(/<br>/g, '<br/>')
  const parsed = new DOMParser().parseFromString(xml, 'image/svg+xml')
  if (parsed.querySelector('parsererror')) throw new Error('mermaid produced unparseable SVG')
  return document.adoptNode(parsed.documentElement) as unknown as SVGElement
}
