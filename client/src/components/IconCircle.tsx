import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

type IconCircleProps = {
  icon: LucideIcon
  /** glass sits on photo/glass surfaces, light on white cards, blue/red/amber as accents */
  tone?: 'glass' | 'light' | 'blue' | 'red' | 'amber'
  size?: number
  iconSize?: number
  children?: ReactNode
}

/**
 * Soft circular container that every feature and widget icon sits inside.
 * Icon sizes stay consistent: 18px in widgets, 22px in feature cards, 20px in
 * nav, at stroke width 1.75.
 */
export default function IconCircle({ icon: Icon, tone = 'glass', size = 34, iconSize = 18, children }: IconCircleProps) {
  return (
    <span
      aria-hidden="true"
      className={`icon-circle icon-circle--${tone}`}
      style={{ width: size, height: size }}
    >
      <Icon size={iconSize} strokeWidth={1.75} />
      {children}
    </span>
  )
}
