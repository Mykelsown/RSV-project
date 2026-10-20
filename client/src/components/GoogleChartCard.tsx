import { useMemo, type CSSProperties, type ReactNode } from 'react'
import { Chart } from 'react-google-charts'
import { Gauge } from 'lucide-react'
import GlassWidget from './GlassWidget'
import { baseOptions, type HiddenTableData } from './chartTheme'
import { useChartSize } from './useChartSize'
import type { LucideIcon } from 'lucide-react'

export interface GoogleChartCardProps {
  title: string
  subtitle?: string
  icon?: LucideIcon
  badge?: string | number | null
  ariaLabel: string
  /* Chart data in the raw rows-with-columns shape Google Charts expects. */
  data?: unknown[]
  chartType: 'ComboChart' | 'PieChart' | 'LineChart' | 'BarChart' | 'ColumnChart'
  options?: Record<string, unknown>
  className?: string
  style?: CSSProperties
  height?: number
  minHeight?: number
  loading?: boolean
  isEmpty?: boolean
  emptyContent?: string
  light?: boolean
  children?: ReactNode
  /* Extra redraw signal, e.g. section switch or expand/collapse: remounts
     the chart so it redraws at the new layout. */
  redrawSignal?: unknown
}

const visuallyHidden: CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
}

export default function GoogleChartCard(props: GoogleChartCardProps) {
  const {
    title, subtitle, icon, badge, ariaLabel, data = [], chartType, options = {},
    className, style, height, loading = false, isEmpty = false, emptyContent,
    light = false, children, redrawSignal,
  } = props
  const { ref, width, breakpoint } = useChartSize<HTMLDivElement>()

  const themed = useMemo(() => {
    const base = baseOptions({ width: width || 0, breakpoint, light })
    return { ...base, ...options } as Record<string, unknown>
    // options identity changes on every render of callers; the memo guards
    // only the width and breakpoint inputs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, width, breakpoint, light])

  const effectiveHeight = height ?? (breakpoint === 'small' ? 240 : 300)
  /* Data for the hidden table: first row holds the headers when present. */
  const tableData = useMemo<HiddenTableData>(() => {
    const rows: unknown[] = Array.isArray(data) ? data : []
    if (rows.length > 0 && Array.isArray(rows[0])) {
      const [head, ...body] = rows as unknown[][]
      return {
        columns: (head as unknown[]).map(String),
        rows: body as (string | number)[][],
      }
    }
    return { columns: [], rows: [] }
  }, [data])

  return (
    <GlassWidget icon={icon ?? Gauge} title={title} subtitle={subtitle} badge={badge} className={className} style={style}>
      <div ref={ref} className={`google-chart-host ${isEmpty || loading ? 'is-empty' : ''}`} style={{ minHeight: props.minHeight ?? effectiveHeight }}>
        {loading && <div className="chart-skeleton" role="status" aria-label={`${title} loading`} />}
        {!loading && isEmpty && (
          <p className="widget-empty">{emptyContent ?? 'No data yet.'}</p>
        )}
        {!loading && !isEmpty && width > 0 && (
          <Chart
            key={`chart-${redrawSignal ?? 'static'}-${breakpoint}-${Math.round(width)}`}
            chartType={chartType}
            data={data}
            options={{ ...themed, height: effectiveHeight } as Record<string, unknown>}
            width={width}
            height={effectiveHeight + 40}
            aria-label={ariaLabel}
            style={{ overflow: 'hidden' }}
          />
        )}
        <table style={visuallyHidden}>
          <caption>{ariaLabel}</caption>
          {tableData.columns.length > 0 && (
            <thead>
              <tr>{tableData.columns.map((column, index) => <th key={`${column}-${index}`}>{column}</th>)}</tr>
            </thead>
          )}
          <tbody>
            {tableData.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{String(cell)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      {children}
    </GlassWidget>
  )
}

/* Donut center overlay: HTML percent and status pill positioned over the
   middle of a big pieHole donut. */
export function DonutCenter({ children }: { children: ReactNode }) {
  return <div className="google-donut-center">{children}</div>
}
