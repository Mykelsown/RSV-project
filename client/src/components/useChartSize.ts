import { useEffect, useRef, useState } from 'react'

export type ChartBreakpoint = 'small' | 'medium' | 'large'

export interface ChartSize {
  width: number
  breakpoint: ChartBreakpoint
}

/* Measures the host card with a ResizeObserver and reports width plus a
   breakpoint: small under 640px, medium under 1024px, large above. Redraw
   triggers are debounced to 150ms so streaming resizes stay smooth. */
const DEBOUNCE_MS = 150

export const breakpointFor = (width: number): ChartBreakpoint => {
  if (width < 640) return 'small'
  if (width < 1024) return 'medium'
  return 'large'
}

export function useChartSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const [size, setSize] = useState<ChartSize>({ width: 0, breakpoint: 'medium' })

  useEffect(() => {
    const element = ref.current
    if (!element) return

    let timer = 0
    const apply = (width: number) => {
      setSize({ width, breakpoint: breakpointFor(width) })
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const width = Math.round(entry.contentRect.width)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => apply(width), DEBOUNCE_MS)
    })

    observer.observe(element)
    apply(Math.round(element.getBoundingClientRect().width))

    const onOrientation = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => apply(Math.round(element.getBoundingClientRect().width)), DEBOUNCE_MS)
    }
    window.addEventListener('orientationchange', onOrientation)

    return () => {
      window.clearTimeout(timer)
      observer.disconnect()
      window.removeEventListener('orientationchange', onOrientation)
    }
  }, [])

  return { ref, ...size }
}

/* Extra redraw: callers bump the returned trigger when a section switch,
   expand or collapse changes layout without resizing the window. */
export function useRedrawTrigger(signal: unknown) {
  const [trigger, setTrigger] = useState(0)
  useEffect(() => {
    const timer = window.setTimeout(() => setTrigger((value) => value + 1), DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [signal])
  return trigger
}
