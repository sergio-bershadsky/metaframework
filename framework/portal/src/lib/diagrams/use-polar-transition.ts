'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { easeOutCubic, interpolatePolar, type PolarLayout, type PolarPoint, shortestTurn } from './polar'

/**
 * Re-centring, animated one frame at a time.
 *
 * Two things about this are deliberate and neither is negotiable.
 *
 * The interpolation is POLAR. Radius and angle move independently, so a node
 * that ends up a quarter turn away travels there along an arc and the whole map
 * visibly rotates into its new centre. Tweening x and y instead would slide
 * every node along a straight line through the middle of the canvas, which
 * looks like a list being re-sorted rather than like a structure being viewed
 * from a different place.
 *
 * The frames are STATE, not CSS. React Flow derives every edge from the node
 * positions in its store, and a CSS transition on the node element never
 * reaches the store — the boxes would glide while their edges snapped to the
 * final geometry on the first frame. Publishing an interpolated position map
 * per frame drives the store itself, so edges are re-routed with the nodes for
 * free. It costs one render per frame for ~650ms, which is what React Flow's
 * own animated-nodes example pays too.
 */

/** Long enough to read as rotation, short enough not to be waited on. */
export const RECENTRE_MS = 650

export interface PolarFrame {
  /** Where each node is drawn right now. */
  points: ReadonlyMap<string, PolarPoint>
  /** Ids to draw: the new layout's, plus any still on their way out. */
  visible: ReadonlySet<string>
  /** True while the map is in motion; the canvas suppresses hit-testing. */
  animating: boolean
}

export function usePolarTransition(layout: PolarLayout, exitRadius: number): PolarFrame {
  const reduced = usePrefersReducedMotion()

  const [frame, setFrame] = useState<PolarFrame>(() => ({
    points: layout.points,
    visible: new Set(layout.points.keys()),
    animating: false,
  }))

  // What is on screen this instant. Owned by the animation loop rather than
  // derived from state, so a click landing mid-flight starts from where the
  // nodes actually are instead of from where the last transition began.
  const live = useRef<ReadonlyMap<string, PolarPoint>>(frame.points)

  useEffect(() => {
    const from = new Map<string, PolarPoint>()
    const to = new Map<string, PolarPoint>()

    for (const [id, target] of layout.points) {
      to.set(id, target)
      from.set(id, live.current.get(id) ?? entryPoint(id, target, layout, live.current))
    }

    // A node that has dropped out of the neighbourhood leaves the way it would
    // have arrived: outward along its own spoke. It is dropped when the
    // transition ends, so nothing lingers off-canvas.
    for (const [id, current] of live.current) {
      if (layout.points.has(id)) continue
      from.set(id, current)
      to.set(id, { radius: exitRadius, angle: current.angle })
    }

    const settle = () => {
      live.current = layout.points
      setFrame({ points: layout.points, visible: new Set(layout.points.keys()), animating: false })
    }

    if (reduced || !moves(from, to)) {
      settle()
      return
    }

    const visible = new Set(to.keys())
    const started = performance.now()
    let raf = requestAnimationFrame(function step(now: number) {
      const t = Math.min(1, (now - started) / RECENTRE_MS)
      if (t >= 1) {
        settle()
        return
      }
      const eased = easeOutCubic(t)
      const points = new Map<string, PolarPoint>()
      for (const [id, target] of to) {
        points.set(id, interpolatePolar(from.get(id) as PolarPoint, target, eased))
      }
      live.current = points
      setFrame({ points, visible, animating: true })
      raf = requestAnimationFrame(step)
    })

    return () => cancelAnimationFrame(raf)
  }, [layout, exitRadius, reduced])

  return frame
}

/**
 * Where a node that was not on the map comes in from.
 *
 * It emerges from whatever it hangs off — its parent's current radius at its
 * own final angle — so a newly revealed ring unfolds out of the structure that
 * owns it. With no parent on screen it comes from the centre, which is exactly
 * where the reader's attention already is.
 */
function entryPoint(
  id: string,
  target: PolarPoint,
  layout: PolarLayout,
  live: ReadonlyMap<string, PolarPoint>,
): PolarPoint {
  const parent = layout.parent.get(id)
  const anchor = parent ? live.get(parent) : undefined
  return { radius: anchor?.radius ?? 0, angle: target.angle }
}

/** Nothing to animate when every node is already where it belongs. */
function moves(from: ReadonlyMap<string, PolarPoint>, to: ReadonlyMap<string, PolarPoint>): boolean {
  if (from.size !== to.size) return true
  for (const [id, target] of to) {
    const start = from.get(id)
    if (!start) return true
    if (Math.abs(start.radius - target.radius) > 0.5) return true
    if (Math.abs(shortestTurn(start.angle, target.angle)) > 1e-3) return true
  }
  return false
}

const NEVER_CHANGES = () => () => {}

/**
 * False while the server's HTML is being hydrated, true afterwards.
 *
 * React Flow rounds the transforms it writes during SSR and does not round the
 * ones it writes in the browser, so a canvas rendered on the server hydrates
 * into a mismatch React refuses to patch up. Every other diagram in the portal
 * dodges this by accident — their layout is computed in an effect, so there is
 * nothing to render server-side. This map computes its layout synchronously, so
 * it has to say no to SSR on purpose.
 */
export function useIsHydrated(): boolean {
  return useSyncExternalStore(
    NEVER_CHANGES,
    () => true,
    () => false,
  )
}

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

/**
 * Whether the reader has asked for less motion.
 *
 * Read as an external store rather than through an effect: the preference is
 * something the browser already owns, and subscribing to it means a reader who
 * changes the setting mid-session is honoured without a reload. The server
 * snapshot is `false` so hydration matches the markup, which is safe because
 * the value only ever gates an animation, never what is rendered.
 */
export function usePrefersReducedMotion(): boolean {
  const subscribe = useCallback((notify: () => void) => {
    const query = window.matchMedia(REDUCED_MOTION)
    query.addEventListener('change', notify)
    return () => query.removeEventListener('change', notify)
  }, [])

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  )
}
