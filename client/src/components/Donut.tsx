import { useEffect, useRef, useState, type ReactNode } from 'react'
import { prefersReducedMotion } from './useRipple'

type DonutProps = {
  /** Percent 0 to 100 for the ring fill. */
  value: number
  size?: number
  stroke?: number
  color?: string
  track?: string
  /** Animates once on first mount; later value changes apply instantly. */
  animate?: boolean
  children?: ReactNode
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)
const clampPercent = (value: number) => Math.min(100, Math.max(0, value))

/**
 * The shared fulfillment ring. The stroke animates from 0 to the value once
 * over 900ms and then tracks new data without replaying.
 */
export default function Donut({ value, size = 150, stroke = 12, color = 'var(--green-400)', track = 'rgba(255,255,255,0.16)', animate = true, children }: DonutProps) {
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const target = circumference * (clampPercent(value) / 100)

  const [progress, setProgress] = useState(animate && !prefersReducedMotion() ? 0 : target)
  const animated = useRef(false)

  useEffect(() => {
    if (!animate || !prefersReducedMotion()) {
      animated.current = true
    }
    if (!animate || prefersReducedMotion()) return
    let raf = 0
    const start = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 900)
      setProgress(target * easeOutCubic(t))
      if (t < 1) raf = requestAnimationFrame(step)
      else animated.current = true
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (animated.current) setProgress(target)
  }, [target])

  return (
    <span role="img" aria-label={`Fulfillment ${clampPercent(value).toFixed(1)} percent`} className="donut" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="donut__center">{children}</span>
    </span>
  )
}
