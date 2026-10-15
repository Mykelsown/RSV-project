import { ArrowUpRight, Plus, type LucideIcon } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import IconCircle from './IconCircle'
import RippleButton from './RippleButton'
import RippleSurface from './RippleSurface'

type GlassWidgetProps = {
  icon: LucideIcon
  title: string
  badge?: string | number | null
  /** Tints the badge chip for status colours */
  badgeTone?: 'green' | 'amber' | 'red' | 'blue'
  action?: 'open' | 'add' | 'none'
  actionLabel?: string
  onAction?: () => void
  className?: string
  style?: CSSProperties
  children?: ReactNode
}

/**
 * Shared widget shell: header row with a circular icon, title, optional count
 * badge and a circular action button, then the widget body. Used by the
 * dashboard, the regulatory portal and the landing dashboard preview so the
 * surfaces feel like one product.
 */
export default function GlassWidget({ icon, title, badge = null, badgeTone, action = 'none', actionLabel, onAction, className = '', style, children }: GlassWidgetProps) {
  const label = actionLabel || (action === 'add' ? `Add to ${title}` : `Open ${title}`)
  return (
    <RippleSurface className={`glass-widget glass-surface ${className}`.trim()} style={style}>
      <header className="glass-widget__head">
        <IconCircle icon={icon} size={34} iconSize={18} />
        <h3 className="glass-widget__title">{title}</h3>
        {badge !== null && badge !== undefined && <span className={`glass-widget__badge ${badgeTone ? `glass-widget__badge--${badgeTone}` : ''}`.trim()}>{badge}</span>}
        {action !== 'none' && (
          <RippleButton
            type="button"
            className="circle-btn glass-widget__action"
            aria-label={label}
            title={label}
            onClick={onAction}
          >
            {action === 'add' ? <Plus size={16} strokeWidth={1.75} /> : <ArrowUpRight size={16} strokeWidth={1.75} />}
          </RippleButton>
        )}
      </header>
      <div className="glass-widget__body">{children}</div>
    </RippleSurface>
  )
}
