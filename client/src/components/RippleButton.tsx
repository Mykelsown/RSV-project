import type { ButtonHTMLAttributes } from 'react'
import { usePressRipple } from './useRipple'

interface RippleButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  className?: string
  children?: React.ReactNode
}

/**
 * Every button in the product uses this host so clicks ripple from the press
 * point. The host keeps position and overflow so the ripple clips.
 */
export default function RippleButton({ className = '', onPointerDown, children, ...rest }: RippleButtonProps) {
  const { handlers, overlays } = usePressRipple()
  return (
    <button {...rest} {...handlers} onPointerDown={onPointerDown} className={`ripple-host ${className}`.trim()}>
      {children}
      {overlays}
    </button>
  )
}
