'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * Expand a diagram to fill the browser viewport.
 *
 * Deliberately NOT the platform Fullscreen API: that takes over the whole
 * display and hides the browser's own chrome, which is the wrong scale for
 * "let me see this diagram properly". This simply promotes the panel to a
 * fixed, viewport-filling overlay and leaves the browser as it was.
 *
 * `position: fixed` escapes the console shell's scroll containers because
 * `overflow` does not clip fixed descendants — only an ancestor establishing a
 * containing block (a transform, filter or contain) would, and the shell has
 * none between the diagram and the viewport.
 */
export function useExpandable() {
  const [expanded, setExpanded] = useState(false)

  const toggle = useCallback(() => setExpanded((value) => !value), [])
  const collapse = useCallback(() => setExpanded(false), [])

  // Escape is the gesture people already expect from anything that fills the
  // screen, whether or not it is a real fullscreen element.
  useEffect(() => {
    if (!expanded) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpanded(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded])

  return { expanded, toggle, collapse }
}
