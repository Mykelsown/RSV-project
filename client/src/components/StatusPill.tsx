type StatusPillProps = {
  status: string
  /** false when the pill sits on a light (white or paper) surface */
  onDark?: boolean
}

export default function StatusPill({ status, onDark = true }: StatusPillProps) {
  const normalized = status.toUpperCase()
  const variant =
    normalized === 'FULFILLED' ? 'fulfilled'
    : normalized === 'SIMULATED' ? 'simulated'
    : normalized === 'PARTIAL' || normalized === 'OFFLINE' ? 'partial'
    : normalized === 'SHORTFALL' || normalized === 'NOT CONNECTED' ? 'shortfall'
    : 'neutral'
  const label = status
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
  return <span className={`status-pill status-pill--${variant} ${onDark ? '' : 'status-pill--light'}`.trim()}>{label}</span>
}
