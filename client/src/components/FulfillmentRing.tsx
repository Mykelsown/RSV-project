import { useMemo } from 'react'
import { Chart } from 'react-google-charts'
import StatusPill from './StatusPill'
import { statusColor, statusName } from './chartTheme'
import { formatPercent } from './format'

type FulfillmentRingProps = {
  percent: number | null
  size?: number
  small?: boolean
}


/* Today's fulfillment ring: a Google donut with the value slice in the
   status color and the remainder as a faint track. Percent and the status
   pill are HTML placed over the center, no legend and no slice labels. The
   SVG ring renders when the Google Charts script is blocked. */
export default function FulfillmentRing({ percent, size = 96, small = false }: FulfillmentRingProps) {
  const display = percent ?? 0
  const color = statusColor(Math.min(display, 120))

  const dataRows = useMemo(() => {
    if (percent === null) return [['Status', 'Percent'], ['Waiting', 0], ['Remaining', 100]]
    return [['Status', 'Percent'], [statusName(display), Math.max(0, Math.min(display, 100))], ['Remaining', Math.max(0, 100 - Math.min(display, 100))]]
  }, [percent, display])

  const options = useMemo(() => ({
    backgroundColor: 'transparent',
    pieHole: 0.74,
    legend: { position: 'none' },
    pieSliceText: 'none',
    slices: [
      { color: percent === null ? 'rgba(255,255,255,0.16)' : color },
      { color: 'rgba(255,255,255,0.12)' },
    ],
    animation: { duration: 600, easing: 'out', startup: true },
    enableInteractivity: false,
    tooltip: { trigger: 'none' },
    width: size + 24,
    height: size + 24,
  }), [color, percent, size])

  return (
    <span
      role="img"
      aria-label={percent === null ? 'Fulfillment pending' : `Fulfillment ${formatPercent(display)}`}
      className="fulfillment-ring"
      style={{ width: size + 24, height: size + 24 }}
    >
      <Chart
        chartType="PieChart"
        data={dataRows}
        options={options as Record<string, unknown>}
        width={size + 24}
        height={size + 24}
        style={{ position: 'absolute', inset: 0 }}
      />
      <span className="fulfillment-ring__center">
        <strong style={{ fontSize: small ? 17 : 21 }}>{percent === null ? '--' : formatPercent(display)}</strong>
        {percent !== null && <StatusPill status={display >= 95 ? 'FULFILLED' : display >= 75 ? 'PARTIAL' : 'SHORTFALL'} />}
      </span>
    </span>
  )
}

