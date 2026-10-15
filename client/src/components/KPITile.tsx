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

/* Metrics that already counted up this session never replay, even when the
   widget remounts after a section switch. */
const countedMetrics = new Set<string>()

/* Count up once on first load over 600ms, then show new values instantly. */
function useCountValue(value: number | null, metric: string) {
  const [display, setDisplay] = useState(() => (value !== null && countedMetrics.has(metric) ? value : 0))

  useEffect(() => {
    if (value === null) return
    if (countedMetrics.has(metric) || prefersReducedMotion()) {
      countedMetrics.add(metric)
      setDisplay(value)
      return
    }
    let cancelled = false
    const start = performance.now()
    const step = (now: number) => {
      if (cancelled) return
      const progress = Math.min(1, (now - start) / 600)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(value * eased)
      if (progress < 1) requestAnimationFrame(step)
      else countedMetrics.add(metric)
    }
    requestAnimationFrame(step)
    return () => {
      cancelled = true
    }
  }, [value, metric])

  return display
}

export default function KPITile({ label, value, unit, tone = 'white', size = 'md' }: KPITileProps) {
  const display = useCountValue(value, label)
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
