import type { HTMLAttributes, ReactNode } from 'react'
import { useRipple, type RippleVariant } from './useRipple'

interface RippleSurfaceProps extends HTMLAttributes<HTMLDivElement> {
  /** Wave tint: glass surfaces use green-400, white cards use green-600. */
  variant?: RippleVariant
  /** Hover lift with a slightly larger shadow. Disable for panels that resize. */
  lift?: boolean
  children?: ReactNode
}

/**
 * Wraps any card or widget with the shared hover and tap behaviour: a wave
 * expands from the pointer entry point, a soft spotlight tracks the cursor and
 * the card lifts a few pixels. All rounding must live on this element so the
 * effect clips to the card's corners.
 */
export default function RippleSurface({ variant = 'glass', lift = true, className = '', style, children, ...rest }: RippleSurfaceProps) {
  const { handlers, overlays } = useRipple(variant)
  const classes = ['ripple-surface', lift ? '' : 'ripple-surface--static', className].filter(Boolean).join(' ')
  return (
    <div {...rest} {...handlers} className={classes} style={style}>
      {children}
      {overlays}
    </div>
  )
}
