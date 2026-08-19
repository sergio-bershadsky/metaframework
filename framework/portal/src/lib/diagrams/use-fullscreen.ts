'use client'

import { type RefObject, useCallback, useEffect, useState } from 'react'

/**
 * Fullscreen for a diagram canvas.
 *
 * Uses the platform Fullscreen API rather than a CSS "fake fullscreen" overlay,
 * because only the real thing escapes the console shell — the shell is
 * `h-dvh overflow-hidden` with its own scroll containers, so an absolutely
 * positioned overlay would still be clipped by it.
 *
 * State is driven by the `fullscreenchange` event, never by the click, so the
 * button stays correct when the user leaves fullscreen by pressing Escape or
 * through the browser's own chrome.
 */
export function useFullscreen(ref: RefObject<HTMLElement | null>) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [supported, setSupported] = useState(true)

  useEffect(() => {
    setSupported(typeof document !== 'undefined' && document.fullscreenEnabled)

    const sync = () => setIsFullscreen(document.fullscreenElement === ref.current)
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [ref])

  const toggle = useCallback(async () => {
    const element = ref.current
    if (!element) return
    try {
      if (document.fullscreenElement === element) {
        await document.exitFullscreen()
      } else {
        await element.requestFullscreen()
      }
    } catch {
      // A rejected request (permissions policy, or an iframe without the
      // allow-fullscreen attribute) must leave the diagram usable rather than
      // throwing into the render tree.
      setSupported(false)
    }
  }, [ref])

  return { isFullscreen, supported, toggle }
}
