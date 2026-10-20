import type { ChartBreakpoint } from './useChartSize'

export const SKY_300 = '#7dd3fc'
export const SKY_400 = '#38bdf8'
export const SKY_500 = '#0ea5e9'
export const SKY_700 = '#0369a1'
export const GREEN_400 = '#3ccf82'
export const GREEN_500 = '#1c9a56'
export const AMBER = '#e0a21f'
export const RED = '#d94452'
export const WHITE_70 = 'rgba(255, 255, 255, 0.7)'
export const GRID_8 = 'rgba(255, 255, 255, 0.08)'

export const FONT_BODY = "'Instrument Sans', sans-serif"

/* Status color for fulfillment %: green from 95, amber from 75, red below. */
export const statusColor = (percent: number) =>
  percent >= 95 ? GREEN_400 : percent >= 75 ? AMBER : RED

export const statusName = (percent: number) =>
  percent >= 95 ? 'Fulfilled' : percent >= 75 ? 'Partial' : 'Shortfall'

export interface ChartThemeContext {
  width: number
  breakpoint: ChartBreakpoint
  /* Whether the chart lives on a light (landing page) or glass (dashboard)
     surface. Text colors flip for light surfaces. */
  light?: boolean
}

const textDim = (light: boolean) => (light ? 'rgba(14, 26, 20, 0.62)' : WHITE_70)
const gridDim = (light: boolean) => (light ? 'rgba(14, 26, 20, 0.08)' : GRID_8)

/* Options shape we pass to Google Charts. LOOSE typing on purpose: Google
   Charts option keys differ per chart type. */
export type ChartOptionsLike = Record<string, unknown>

/* Base options shared by every chart in the app. */
export const baseOptions = (ctx: ChartThemeContext): ChartOptionsLike => {
  const { width, breakpoint, light = false } = ctx
  const small = breakpoint === 'small'
  const vTicks = small ? 4 : 6
  const opts: ChartOptionsLike = {
    backgroundColor: 'transparent',
    fontName: FONT_BODY,
    fontSize: 12,
    chartArea: small
      ? { left: 36, right: 16, top: 14, bottom: 34 }
      : { left: 48, right: 24, top: 18, bottom: 40 },
    titleTextStyle: {
      color: light ? 'rgba(14, 26, 20, 0.88)' : 'rgba(255, 255, 255, 0.9)',
      fontName: FONT_BODY,
      fontSize: 14,
    },
    legend: { position: 'none' },
    hAxis: {
      textStyle: { color: textDim(light), fontName: FONT_BODY, fontSize: small ? 11 : 12 },
      gridlines: { color: 'transparent' },
      baselineColor: gridDim(light),
      textPosition: 'out',
      maxAlternation: 1,
      minTextSpacing: small ? 60 : 24,
      slantedText: false,
    },
    vAxis: {
      textStyle: { color: textDim(light), fontName: FONT_BODY, fontSize: small ? 11 : 12 },
      gridlines: { color: gridDim(light), count: vTicks },
      minorGridlines: { color: 'transparent' },
      baselineColor: gridDim(light),
    },
    tooltip: {
      isHtml: true,
      trigger: small ? 'selection' : 'focus',
    },
    animation: {
      duration: 600,
      easing: 'out',
      startup: true,
    },
    enableInteractivity: true,
  }
  if (width > 0) {
    opts.width = width
  }
  return opts
}

/* Percent axis 0 to 120 for the 7 day fulfillment combo chart. */
export const fulfillmentAxisOverrides = (options: ChartOptionsLike): ChartOptionsLike => {
  const vAxis = { ...(options.vAxis as ChartOptionsLike | undefined) }
  Object.assign(vAxis, {
    minValue: 0,
    maxValue: 120,
    format: "#'%'",
  })
  return {
    ...options,
    vAxis,
  }
}

/* Integer axis for the alerts per week column chart. */
export const integerAxisOverrides = (options: ChartOptionsLike): ChartOptionsLike => {
  const vAxis = { ...(options.vAxis as ChartOptionsLike | undefined) }
  Object.assign(vAxis, { minValue: 0, format: '#' })
  return { ...options, vAxis }
}

/* Dashed sky blue target line series for combo charts. */
export const targetLineSeries = (barType: string): ChartOptionsLike => ({
  0: { type: barType, targetAxisIndex: 0 },
  1: { type: 'line', targetAxisIndex: 0, color: SKY_300, lineWidth: 2, lineDashStyle: [8, 6], pointSize: 0 },
})

/* Data table helper for the visually hidden fallback table. */
export interface HiddenTableData {
  columns: string[]
  rows: (string | number)[][]
}
