/**
 * The console palette, as hex — for renderers that cannot read CSS.
 *
 * Monaco parses theme colours as hex and cannot read a CSS custom property;
 * mermaid's `themeVariables` are the same kind of consumer. So the oklch tokens
 * in globals.css are converted once, here, and every canvas that needs a
 * literal colour imports this module — the comment beside each value is the
 * token it came from, and they must be regenerated together. Two hand-converted
 * copies of the palette is how a console drifts out of tune with itself.
 */
export const CONSOLE_TOKEN = {
  background: '#111318', // --surface
  raised: '#171920', // --surface-raised
  foreground: '#edeef2', // --foreground
  muted: '#858992', // --muted-foreground
  border: '#24262c', // --border
  borderStrong: '#393d46', // --border-strong
  primary: '#7689ff', // --primary
  destructive: '#e94646', // --destructive
  /** A value step on the neutral ramp — oklch(0.79 0.008 268), not a hue. */
  neutral: '#b8bac0',
} as const
