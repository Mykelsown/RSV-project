import type { ReactNode } from 'react'

type PanelCardProps = {
  children: ReactNode
  title?: string
  className?: string
}

export default function PanelCard({ children, title, className = '' }: PanelCardProps) {
  return (
    <section className={`panel-card ${className}`.trim()}>
      {title && <h2 className="panel-card__title">{title}</h2>}
      {children}
    </section>
  )
}