type StatusPillProps = { status: string }

export default function StatusPill({ status }: StatusPillProps) {
  const normalized = status.toUpperCase()
  const variant = normalized === 'FULFILLED' ? 'fulfilled' : normalized === 'PARTIAL' ? 'partial' : normalized === 'SHORTFALL' ? 'shortfall' : 'neutral'
  const label = status.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())
  return <span className={`status-pill status-pill--${variant}`}>{label}</span>
}