import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

export type RippleVariant = 'glass' | 'light'

export interface RippleWave {
  x: number
  y: number
  size: number
  index: number
}

function pointInElement(event: ReactPointerEvent<HTMLElement>) {
  const rect = event.currentTarget.getBoundingClientRect()
  return { x: event.clientX - rect.left, y: event.clientY - rect.top }
}

function elementSize(element: HTMLElement) {
  const rect = element.getBoundingClientRect()
  return { width: rect.width, height: rect.height }
}

/* Diameter that covers the whole element when scaled from 0 at (x, y). */
function waveSizeAt(x: number, y: number, width: number, height: number) {
  const dx = Math.max(x, width - x)
  const dy = Math.max(y, height - y)
  return Math.hypot(dx, dy) * 2 + 24
}

const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/*
 * Card level ripple: a soft wave expands from the pointer entry point while a
 * faint radial spotlight follows the cursor inside the surface.
 */
export function useRipple(variant: RippleVariant = 'glass') {
  const [wave, setWave] = useState<RippleWave | null>(null)
  const [spotlight, setSpotlight] = useState<{ x: number; y: number; size: number } | null>(null)
  const counter = useRef(0)
  const frame = useRef(0)

  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  const expandWave = useCallback((x: number, y: number, element: HTMLElement) => {
    counter.current += 1
    const { width, height } = elementSize(element)
    setWave({ x, y, size: waveSizeAt(x, y, width, height), index: counter.current })
  }, [])

  const handlers = {
    onPointerEnter: (event: ReactPointerEvent<HTMLElement>) => {
      const { x, y } = pointInElement(event)
      const { width, height } = elementSize(event.currentTarget)
      if (event.pointerType !== 'mouse') {
        // Touch devices ripple on tap, no trailing spotlight.
        expandWave(x, y, event.currentTarget)
        return
      }
      expandWave(x, y, event.currentTarget)
      setSpotlight({ x, y, size: Math.max(width, height) * 0.9 })
    },
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
      if (event.pointerType !== 'mouse') return
      const { clientX, clientY } = event
      const element = event.currentTarget
      cancelAnimationFrame(frame.current)
      frame.current = requestAnimationFrame(() => {
        const rect = element.getBoundingClientRect()
        setSpotlight((prev) => (prev ? { ...prev, x: clientX - rect.left, y: clientY - rect.top } : prev))
      })
    },
    onPointerLeave: () => setSpotlight(null),
  }

  const overlays = (
    <>
      {spotlight && (
        <span
          aria-hidden="true"
          className="ripple-spotlight"
          style={{ left: spotlight.x, top: spotlight.y, width: spotlight.size, height: spotlight.size, opacity: 1, transform: 'translate(-50%, -50%)' }}
        />
      )}
      {wave && (
        <span
          aria-hidden="true"
          key={wave.index}
          className={`ripple-wave ripple-wave--${variant}`}
          style={{ left: wave.x, top: wave.y, width: wave.size, height: wave.size }}
        />
      )}
    </>
  )

  return { handlers, overlays }
}

/*
 * Button level ripple: a small press-point wave on the 180ms press duration.
 */
export function usePressRipple() {
  const [press, setPress] = useState<RippleWave | null>(null)
  const counter = useRef(0)

  const handlers = {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      counter.current += 1
      const { x, y } = pointInElement(event)
      setPress({ x, y, size: 160, index: counter.current })
    },
  }

  const overlays = press ? (
    <span
      aria-hidden="true"
      key={press.index}
      className="ripple-press"
      style={{ left: press.x, top: press.y, width: press.size, height: press.size }}
    />
  ) : null

  return { handlers, overlays }
}

export { prefersReducedMotion }
