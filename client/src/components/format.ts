/* Shared formatting: compact values (21.4M, 112.4K), percentages that never
   lie above 999%+, and Africa/Lagos timestamps. The full value always
   travels in a title attribute or aria-label. */

export const formatNumber = (num: number) => new Intl.NumberFormat('en-NG').format(Math.round(num))

const lead = (value: number, digits: number) => {
  const text = value.toFixed(digits)
  return text.replace(/\.0+$/, '')
}

/* Values of one million and above show as 21.4M, one thousand and above as
   112.4K, everything below keeps its integer form. */
export const formatCompact = (value: number | null | undefined): string => {
  if (value === null || value === undefined || Number.isNaN(value)) return '--'
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `${lead(value / 1_000_000, 1)}M`
  if (abs >= 1_000) return `${lead(value / 1_000, 1)}K`
  return `${Math.round(value)}`
}

/* Percentages show one decimal and never display above 999%. */
export const formatPercent = (value: number | null | undefined): string => {
  if (value === null || value === undefined || Number.isNaN(value)) return '--'
  if (value > 999) return '999%+'
  const clamped = Math.max(0, value)
  return `${clamped.toFixed(1)}%`
}

/* Compact percent for chart axes and pills. */
export const formatPercentShort = (value: number): string => {
  if (value > 999) return '999%+'
  return `${Math.round(value)}%`
}

export const formatDate = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })

export const shortDay = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString('en-NG', { day: '2-digit', month: 'short' })

export const formatLagosTime = (date: Date) =>
  date.toLocaleString('en-NG', { timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })

export const formatLagosClock = (date: Date) =>
  date.toLocaleString('en-NG', { timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit' })

export const formatLagosStamp = (iso: string | number | Date) =>
  new Date(iso).toLocaleString('en-NG', { timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit', hour12: false })

export const lagosHour = (date: Date) =>
  Number(new Intl.DateTimeFormat('en-NG', { timeZone: 'Africa/Lagos', hour: 'numeric', hour12: false }).format(date))

export const formatRelative = (ts: string) => {
  const minutes = Math.floor((Date.now() - new Date(ts).getTime()) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return `${Math.floor(hours / 24)} d ago`
}
