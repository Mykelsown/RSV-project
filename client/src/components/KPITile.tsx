import { useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from './useRipple'

export type KPITone = 'green' | 'blue' | 'amber' | 'red' | 'white'

type KPITileProps = {
  label: string
  /** Numeric value; counts up once on first load, then updates instantly. */
  value: number | null
  unit?: string
  tone?: KPITone
  size?: 'md' | 'sm'
}

/* Count up once on first load over 600ms, then show new values instantly. */
function useCountValue(value: number | null) {
  const [display, setDisplay] = useState(0)
  const animated = useRef(false)
  const firstValue = useRef(true)

  useEffect(() => {
    if (value === null) return
    if (!animated.current) {
      animated.current = true
      if (prefersReducedMotion()) {
        setDisplay(value)
        firstValue.current = false
        return
      }
      const start = performance.now()
      const from = 0
      const step = (now: number) => {
        const progress = Math.min(1, (now - start) / 600)
        const eased = 1 - Math.pow(1 - progress, 3)
        setDisplay(from + (value - from) * eased)
        if (progress < 1) requestAnimationFrame(step)
        else firstValue.current = false
      }
      requestAnimationFrame(step)
    } else {
      setDisplay(value)
    }
  }, [value])

  return display
}

export default function KPITile({ label, value, unit, tone = 'white', size = 'md' }: KPITileProps) {
  const display = useCountValue(value)
  const [pulsing, setPulsing] = useState(false)
  const previous = useRef<number | null>(null)

  useEffect(() => {
    if (previous.current === null || previous.current === value) return
    setPulsing(true)
    const timer = window.setTimeout(() => setPulsing(false), 200)
    return () => window.clearTimeout(timer)
  }, [value])

  useEffect(() => {
    previous.current = value
  }, [value])

  const formatted = value === null ? 'Not available' : new Intl.NumberFormat('en-NG', { maximumFractionDigits: 1 }).format(Math.round(display * 10) / 10)

  return (
    <section className={`kpi-tile kpi-tile--${tone} ${size === 'sm' ? 'kpi-tile--sm' : ''} ${pulsing ? 'is-pulsing' : ''}`.trim()}>
      <span className="kpi-tile__label">{label}</span>
      <span className="kpi-tile__value">{formatted}</span>
      {unit && <span className="kpi-tile__unit">{unit}</span>}
    </section>
  )
}
