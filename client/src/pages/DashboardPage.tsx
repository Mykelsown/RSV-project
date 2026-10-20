import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  LayoutDashboard, ChartLine, Fuel, Ship, Factory, Bell, Activity, Truck, ShieldCheck,
  RefreshCw, LogOut, Check, X, ChevronDown, Menu, Gauge, Link2, Download, AlertTriangle,
  AlertCircle, Info, ClipboardList, Radio, Cable, Plug, FileText, StickyNote, Database,
} from 'lucide-react'
import '../App.css'
import GlassWidget from '../components/GlassWidget'
import RippleButton from '../components/RippleButton'
import KPITile, { type KPITone } from '../components/KPITile'
import StatusPill from '../components/StatusPill'
import LiveDot from '../components/LiveDot'
import IconCircle from '../components/IconCircle'
import GoogleChartCard from '../components/GoogleChartCard'
import FulfillmentRing from '../components/FulfillmentRing'
import { SKY_300, SKY_500, GREEN_400, AMBER, RED, statusColor } from '../components/chartTheme'
import { prefersReducedMotion } from '../components/useRipple'
import { useAuth } from '../auth/AuthContext'
import { API_BASE } from '../App'
import { SLOW_REFRESH_MS, REFRESH_AFTER_HIDDEN_MS } from '../config/refresh'
import {
  formatNumber, formatCompact, formatPercent, formatDate, shortDay,
  formatLagosTime, formatLagosStamp, formatRelative, lagosHour,
} from '../components/format'

interface DashboardData {
  crude_intake_barrels: number
  actual_output_litres: number
  trucks_loaded: number
  fulfillment_percent: number
  status: string
  alerts: Alert[]
  simulation?: {
    running: boolean
    paused: boolean
    mode: string
    dev_mode: boolean
    stats: SimulationStats
  }
}

interface Alert {
  id: string
  triggered_at: string
  alert_type: string
  severity: string
  message: string
}

interface Reconciliation {
  id: string
  reconciliation_date: string
  crude_intake_total_barrels: number
  expected_output_litres: number
  actual_output_litres: number
  trucks_loaded: number
  commitment_target_litres: number
  fulfillment_percentage: number
  status: string
  notes: string | null
  created_at: string
}

interface LedgerEntry {
  id: string
  entry_date: string
  reconciliation_id: string
  content_hash: string
  previous_hash: string
  created_at: string
}

interface SimulationStats {
  events_total: number
  crude_intake_today: number
  production_updates_today: number
  gantry_loads_today: number
}

interface SimulationStatus {
  running: boolean
  paused: boolean
  paused_at: string | null
  mode: string
  dev_mode: boolean
  stats: SimulationStats
}

interface LiveEvent {
  type: string
  kind?: string
  timestamp: string
  data: Record<string, unknown>
}

const getAuthHeaders = (token: string | null): Record<string, string> => {
  if (!token) return {}
  return { Authorization: `Bearer ${token}` }
}

const DAILY_TARGET_LITRES = 35000000

const statusTone = (status: string): KPITone => {
  const normalized = status.toUpperCase()
  if (normalized === 'FULFILLED') return 'green'
  if (normalized === 'PARTIAL') return 'amber'
  return 'red'
}

type TabId = 'overview' | 'analytics' | 'distribution' | 'reports' | 'integration'

export default function DashboardPage() {
  const { token, user, logout } = useAuth()
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null)
  const [reconciliations, setReconciliations] = useState<Reconciliation[]>([])
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([])
  const [sseConnected, setSseConnected] = useState(false)
  const [nigeriaTime, setNigeriaTime] = useState(() => new Date())
  const [activityOpen, setActivityOpen] = useState(true)
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({})
  const [noteOpen, setNoteOpen] = useState<Record<string, boolean>>({})
  const [openedRows, setOpenedRows] = useState<Record<string, boolean>>({})
  const [tab, setTab] = useState<TabId>('overview')
  const [shownTab, setShownTab] = useState<TabId>('overview')
  const [boardStage, setBoardStage] = useState<'in' | 'out'>('in')
  const [firstLoad, setFirstLoad] = useState(true)
  const [dismissedAlerts, setDismissedAlerts] = useState<string[]>([])
  const [ledgerExpanded, setLedgerExpanded] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [closeDayConfirm, setCloseDayConfirm] = useState(false)

  const [analyticsSummary, setAnalyticsSummary] = useState<any>(null)
  const [trendData, setTrendData] = useState<any[]>([])
  const [alertsSummary, setAlertsSummary] = useState<any>(null)
  const [productData, setProductData] = useState<any>(null)
  const [crudeSources, setCrudeSources] = useState<any[]>([])
  const [distributors, setDistributors] = useState<any[]>([])
  const [reportType, setReportType] = useState<'weekly' | 'monthly' | 'custom'>('weekly')
  const [reportFormat, setReportFormat] = useState<'json' | 'csv'>('csv')
  const [reportStart, setReportStart] = useState('')
  const [reportEnd, setReportEnd] = useState('')
  const [reportGenerating, setReportGenerating] = useState(false)
  const [reportMessage, setReportMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [simulationStatus, setSimulationStatus] = useState<SimulationStatus | null>(null)
  const [simLivePaused, setSimLivePaused] = useState<boolean | null>(null)
  const [simPending, setSimPending] = useState(false)
  const [simError, setSimError] = useState<string | null>(null)
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([])
  const [slowUpdatedAt, setSlowUpdatedAt] = useState<Date | null>(null)

  const navRefs = useRef<Array<HTMLButtonElement | null>>([])
  const menuRef = useRef<HTMLDivElement>(null)
  const canManage = user?.role === 'operations_manager' || user?.role === 'executive'
  const isOperationsManager = user?.role === 'operations_manager'
  const visibleSections = SECTIONS.filter((section) => !(['reports', 'integration'].includes(section.id) && (user?.role === 'trading_desk' || user?.role === 'regulatory')))

  /* Clock refresh: allowed timer, no network calls */
  useEffect(() => {
    const interval = setInterval(() => setNigeriaTime(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  /* Greeting follows Africa/Lagos time */
  const hour = lagosHour(nigeriaTime)
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = (user?.full_name || '').split(' ')[0]
  const lagosDateLabel = nigeriaTime.toLocaleString('en-NG', { timeZone: 'Africa/Lagos', day: '2-digit', month: 'short', year: 'numeric' })

  /* Live data fetches (today's totals). Called on demand and by SSE. */
  const fetchDashboard = useCallback(async () => {
    if (!token) return
    try {
      const res = await fetch(`${API_BASE}/dashboard/today`, { headers: getAuthHeaders(token) })
      if (res.ok) setDashboardData(await res.json())
    } catch {
      /* SSE or the next action will update the live data */
    }
  }, [token])

  /* Slow data: changes only when a day closes. Refreshes on one 30 minute
     interval, paused while the tab is hidden, and immediately on demand. */
  const fetchReconciliations = useCallback(async () => {
    if (!token) return
    try {
      const res = await fetch(`${API_BASE}/reconciliations`, { headers: getAuthHeaders(token) })
      if (res.ok) setReconciliations((await res.json()) || [])
    } catch { /* next interval or action picks it up */ }
  }, [token])

  const fetchLedger = useCallback(async () => {
    if (!token) return
    try {
      const res = await fetch(`${API_BASE}/ledger`, { headers: getAuthHeaders(token) })
      if (res.ok) setLedgerEntries((await res.json()) || [])
    } catch { /* next interval or action picks it up */ }
  }, [token])

  const fetchAnalyticsData = useCallback(async () => {
    if (!token) return
    const [summaryRes, trendRes, alertsRes, productsRes, crudeRes, distributorsRes] = await Promise.all([
      fetch(`${API_BASE}/analytics/summary`, { headers: getAuthHeaders(token) }),
      fetch(`${API_BASE}/analytics/trend?days=30`, { headers: getAuthHeaders(token) }),
      fetch(`${API_BASE}/analytics/alerts-summary`, { headers: getAuthHeaders(token) }),
      fetch(`${API_BASE}/analytics/products`, { headers: getAuthHeaders(token) }),
      fetch(`${API_BASE}/analytics/crude-sources`, { headers: getAuthHeaders(token) }),
      fetch(`${API_BASE}/analytics/distributors?limit=10`, { headers: getAuthHeaders(token) }),
    ])
    try {
      if (summaryRes.ok) setAnalyticsSummary(await summaryRes.json())
      if (trendRes.ok) setTrendData((await trendRes.json()) || [])
      if (alertsRes.ok) setAlertsSummary(await alertsRes.json())
      if (productsRes.ok) setProductData(await productsRes.json())
      if (crudeRes.ok) setCrudeSources((await crudeRes.json()) || [])
      if (distributorsRes.ok) setDistributors((await distributorsRes.json()) || [])
    } catch { /* next interval or action picks it up */ }
  }, [token])

  const refetchSlow = useCallback(() => {
    void fetchReconciliations()
    void fetchLedger()
    void fetchAnalyticsData()
    setSlowUpdatedAt(new Date())
  }, [fetchReconciliations, fetchLedger, fetchAnalyticsData])

  useEffect(() => {
    if (!token) return
    refetchSlow()
    let timer = 0

    const start = () => {
      window.clearInterval(timer)
      timer = window.setInterval(() => {
        if (document.visibilityState === 'visible') refetchSlow()
      }, SLOW_REFRESH_MS)
    }
    start()

    let hiddenAt: number | null = null
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now()
        window.clearInterval(timer)
      } else {
        const hiddenFor = hiddenAt ? Date.now() - hiddenAt : 0
        hiddenAt = null
        start()
        if (hiddenFor > REFRESH_AFTER_HIDDEN_MS) refetchSlow()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [token, refetchSlow])

  /* SSE: same URL, same event names. Live data only; nothing here polls. */
  useEffect(() => {
    if (!token) return
    const eventSource = new EventSource(`${API_BASE}/events?token=${encodeURIComponent(token)}`)
    eventSource.onopen = () => {
      setSseConnected(true)
      /* After a drop, catch up immediately outside any interval. */
      fetchDashboard()
      refetchSlow()
      fetchSimulationStatus()
    }
    eventSource.addEventListener('dashboard_update', (event) => {
      const payload = JSON.parse(event.data) as DashboardData
      setDashboardData(payload)
      if (payload.simulation) setSimLivePaused(payload.simulation.paused)
    })
    eventSource.addEventListener('sim_event', (event) => {
      const payload = JSON.parse(event.data) as LiveEvent
      setLiveEvents((prev) => [payload, ...prev].slice(0, 50))
      fetchDashboard()
    })
    eventSource.addEventListener('sim_state', (event) => {
      const payload = JSON.parse(event.data) as SimulationStatus & { type?: string }
      setSimLivePaused(Boolean(payload.paused))
      if (payload.stats) {
        setSimulationStatus((prev) => (prev ? { ...prev, paused: Boolean(payload.paused), stats: payload.stats as SimulationStats } : prev))
      }
    })
    eventSource.onerror = () => setSseConnected(false)
    return () => eventSource.close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, fetchDashboard, refetchSlow])

  /* Simulation status: fetched on load, after every action and on reconnect. */
  const fetchSimulationStatus = useCallback(async () => {
    if (!token) return
    try {
      const res = await fetch(`${API_BASE}/simulation/status`, { headers: getAuthHeaders(token) })
      if (res.ok) setSimulationStatus(await res.json())
    } catch {
      setSimulationStatus(null)
    }
  }, [token])

  useEffect(() => {
    if (token) fetchSimulationStatus()
  }, [token, fetchSimulationStatus])

  /* Fallback status refresher when SSE is unavailable: on the slow interval
     only, per the refresh strategy. */
  useEffect(() => {
    if (!token || sseConnected) return
    const interval = window.setInterval(fetchSimulationStatus, SLOW_REFRESH_MS)
    return () => window.clearInterval(interval)
  }, [token, sseConnected, fetchSimulationStatus])

  /* First load orchestration: settle and count up once, never on refresh */
  useEffect(() => {
    const timer = window.setTimeout(() => setFirstLoad(false), reducedOr(900, 0))
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* Report range default */
  useEffect(() => {
    const today = new Date()
    syncWeeklyRange(today.toISOString().slice(0, 10))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* Sliding nav indicator */
  useLayoutEffect(() => {
    const measure = () => {
      const index = visibleSections.findIndex((section) => section.id === tab)
      const element = navRefs.current[index]
      if (!element) {
        setIndicator(null)
        return
      }
      setIndicator({ x: element.offsetLeft, w: element.offsetWidth })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, visibleSections.length])
  const [indicator, setIndicator] = useState<{ x: number; w: number } | null>(null)

  /* Menu sheet closes on outside click */
  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [menuOpen])

  const syncWeeklyRange = (value: string) => {
    const d = new Date(value)
    const day = d.getDay() || 7
    const monday = new Date(d)
    monday.setDate(d.getDate() - day + 1)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    setReportStart(monday.toISOString().slice(0, 10))
    setReportEnd(sunday.toISOString().slice(0, 10))
  }

  const syncMonthlyRange = (value: string) => {
    const d = new Date(`${value}-01`)
    const first = new Date(d.getFullYear(), d.getMonth(), 1)
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0)
    setReportStart(first.toISOString().slice(0, 10))
    setReportEnd(last.toISOString().slice(0, 10))
  }

  /* Section crossfade: outgoing 200ms, incoming 320ms */
  const switchTab = (next: TabId) => {
    if (next === tab && next === shownTab) return
    setTab(next)
    if (prefersReducedMotion()) {
      setShownTab(next)
      setBoardStage('in')
      return
    }
    setBoardStage('out')
    window.setTimeout(() => {
      setShownTab(next)
      setBoardStage('in')
    }, 200)
  }

  const refetchAll = () => {
    if (!token) return
    setRefreshing(true)
    fetchDashboard()
    refetchSlow()
    fetchSimulationStatus()
    window.setTimeout(() => setRefreshing(false), 320)
  }

  const acknowledgeAlert = async (id: string) => {
    if (!token) return
    await fetch(`${API_BASE}/alerts/${id}/acknowledge`, { method: 'PATCH', headers: getAuthHeaders(token) })
    fetchDashboard()
    refetchSlow()
  }

  const dismissAlert = (id: string) => setDismissedAlerts((prev) => [...prev, id])

  const seedData = async () => {
    if (!token) return
    await fetch(`${API_BASE}/seed`, { method: 'POST', headers: getAuthHeaders(token) })
    fetchDashboard()
    refetchSlow()
  }

  const runReconciliation = async () => {
    if (!token) return
    await fetch(`${API_BASE}/reconcile/run`, { method: 'POST', headers: getAuthHeaders(token) })
    fetchDashboard()
    refetchSlow()
  }

  const saveNote = async (date: string, notes: string) => {
    if (!token) return
    const cleanDate = date.slice(0, 10)
    await fetch(`${API_BASE}/reconciliations/${cleanDate}/notes`, {
      method: 'PATCH',
      headers: { ...getAuthHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes }),
    })
    setNoteOpen((prev) => ({ ...prev, [cleanDate]: false }))
    refetchSlow()
  }

  /* Simulation toggle: derives from server data, optimistic with rollback. */
  const controlSimulation = async (action: 'pause' | 'resume' | 'close_day') => {
    if (!token) return
    const previous = simulationStatus
    setSimPending(true)
    setSimError(null)
    /* Optimistic flip for pause and resume. */
    if (action === 'pause' && previous) setSimulationStatus({ ...previous, paused: true })
    if (action === 'resume' && previous) setSimulationStatus({ ...previous, paused: false })
    try {
      const res = await fetch(`${API_BASE}/simulation/control`, {
        method: 'POST',
        headers: { ...getAuthHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        const message = body && body.error ? body.error : 'Simulation control is not available.'
        setSimulationStatus(previous)
        setSimError(message)
        return
      }
      const data = await res.json()
      setSimulationStatus(data)
      fetchSimulationStatus()
    } catch {
      setSimulationStatus(previous)
      setSimError('Network error. The simulation state on the server is unchanged.')
    } finally {
      setSimPending(false)
    }
  }

  const generateReport = async () => {
    if (!token || !reportStart || !reportEnd) return
    setReportGenerating(true)
    setReportMessage(null)
    try {
      const res = await fetch(`${API_BASE}/reports/generate`, {
        method: 'POST',
        headers: { ...getAuthHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ report_type: reportType, start_date: reportStart, end_date: reportEnd, format: reportFormat }),
      })
      if (!res.ok) throw new Error('Unable to generate report')
      const disposition = res.headers.get('Content-Disposition') || ''
      const match = disposition.match(/filename="?([^";]+)"?/i)
      const filename = match ? match[1] : `rsv-report-${reportStart}-to-${reportEnd}.${reportFormat}`
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      setReportMessage({ type: 'success', text: `Report downloaded: ${filename}` })
    } catch (err) {
      setReportMessage({ type: 'error', text: err instanceof Error ? err.message : 'Report failed to generate' })
    } finally {
      setReportGenerating(false)
    }
  }

  const fulfillment = dashboardData?.fulfillment_percent ?? null
  const openAlerts = (dashboardData?.alerts || []).filter((alert) => !dismissedAlerts.includes(alert.id))
  const latestProductionEvent = liveEvents.find((event) => event.type === 'production_update')
  const unitRows = (latestProductionEvent?.data.units as Array<Record<string, any>> | undefined) || []
  const paused = simLivePaused ?? simulationStatus?.paused ?? false
  const simRunning = simulationStatus?.running ?? false
  const pausedChipVisible = paused && simRunning
  const simLastChanged = simulationStatus?.paused_at
  const updatedStamp = slowUpdatedAt ? `Updated ${formatLagosStamp(slowUpdatedAt)} WAT` : 'Updated just now'

  const widgetStagger = (index: number): CSSProperties => ({ ['--stagger' as string]: `${index * 40}ms` })
  const ledgerPillFor = (entry: LedgerEntry) => {
    const match = reconciliations.find((rec) => rec.id === entry.reconciliation_id)
    return match ? match.status : 'Sealed'
  }

  const overviewProps = {
    fulfillment, dashboardData, openAlerts, dismissAlert, acknowledgeAlert, canManage,
    liveEvents, activityOpen, setActivityOpen, unitRows, isOperationsManager,
    reconciliations, ledgerEntries, ledgerExpanded, setLedgerExpanded, ledgerPillFor,
    shownTab, boardStage, widgetStagger, saveNote, slowUpdatedAt,
    simRunning, paused, simPending, simError, simLastChanged, simulationStatus,
    controlSimulation, seedData, runReconciliation, closeDayConfirm, setCloseDayConfirm,
    noteDrafts, setNoteDrafts, noteOpen, setNoteOpen, openedRows, setOpenedRows,
  }

  return (
    <div className="dash">
      <div className="dash__bg" aria-hidden="true">
        <img src="/images/refinery-hero.jpg" alt="" onError={(event) => { event.currentTarget.style.display = 'none' }} />
        <div className="dash__vignette" />
      </div>

      <header className="dash-header glass-surface">
        <div className="dash-header__brand">
          <span className="lp-logo-mark dash-logo"><Fuel size={17} strokeWidth={1.75} /></span>
          <div className="dash-header__greeting">
            <strong>{greeting}, {firstName}</strong>
            <span>{lagosDateLabel}, WAT</span>
          </div>
        </div>

        {pausedChipVisible && (
          <span className="paused-chip" role="status">
            <span className="paused-chip__dot" aria-hidden="true" />
            Simulation paused
          </span>
        )}

        <nav className="seg-nav" aria-label="Dashboard sections">
          <span
            className="seg-nav__indicator"
            aria-hidden="true"
            style={indicator ? { transform: `translateX(${indicator.x}px)`, width: `${indicator.w}px`, opacity: 1 } : { opacity: 0 }}
          />
          {visibleSections.map((section, index) => (
            <button
              key={section.id}
              ref={(element) => { navRefs.current[index] = element }}
              type="button"
              className={`seg-nav__item ${tab === section.id ? 'is-active' : ''}`}
              aria-current={tab === section.id ? 'page' : undefined}
              onClick={() => switchTab(section.id as TabId)}
            >
              <section.icon size={17} strokeWidth={1.75} />
              <span>{section.label}</span>
            </button>
          ))}
        </nav>

        <div className="dash-header__tools">
          <div className="glass-tile dash-fulfillment" title={fulfillment === null ? undefined : formatPercent(fulfillment)}>
            <span className="dash-fulfillment__dot" data-tone={fulfillment === null ? 'blue' : statusTone(dashboardData!.status)} />
            <strong>{formatPercent(fulfillment)}</strong>
            <span>fulfilled</span>
          </div>
          <div className="glass-tile dash-clock">
            <strong>{formatLagosTime(nigeriaTime)}</strong>
            <span>WAT</span>
          </div>
          <RippleButton
            type="button"
            className={`circle-btn dash-header__btn dash-header__btn--refresh ${refreshing ? 'is-spinning' : ''}`}
            aria-label={`Refresh all data, ${updatedStamp}`}
            title={updatedStamp}
            onClick={refetchAll}
          >
            <RefreshCw size={16} strokeWidth={1.75} />
          </RippleButton>
          <div className="dash-menu" ref={menuRef}>
            <RippleButton
              type="button"
              className="circle-btn dash-header__btn"
              aria-label="Account menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <Menu size={16} strokeWidth={1.75} />
            </RippleButton>
            {menuOpen && (
              <div className="glass-surface dash-menu__sheet" role="menu">
                <strong>{user?.full_name}</strong>
                <span className="dash-role-badge">{user?.role?.replaceAll('_', ' ')}</span>
                <span className="dash-menu__live"><LiveDot label={sseConnected ? 'Live feed connected' : 'Feed offline'} /></span>
                <RippleButton type="button" className="dash-menu__logout" onClick={logout}>
                  <LogOut size={15} strokeWidth={1.75} /> Log out
                </RippleButton>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="dash-main">
        <div className={`board board--${boardStage} ${firstLoad ? 'is-settling' : ''}`} data-tab={shownTab}>
          {shownTab === 'overview' && <OverviewBoard {...overviewProps} />}
          {shownTab === 'analytics' && <AnalyticsBoard />}
          {shownTab === 'distribution' && <DistributionBoard />}
          {shownTab === 'reports' && <ReportsBoard />}
          {shownTab === 'integration' && <IntegrationBoard />}
        </div>
      </main>

      <nav className="bottom-tabs glass-surface" aria-label="Dashboard sections">
        {visibleSections.map((section) => (
          <button
            key={section.id}
            type="button"
            className={`bottom-tabs__item ${tab === section.id ? 'is-active' : ''}`}
            onClick={() => switchTab(section.id as TabId)}
          >
            <section.icon size={20} strokeWidth={1.75} />
            <span>{section.short}</span>
          </button>
        ))}
      </nav>
    </div>
  )


  /* Analytics, distribution, reports and integration sections share the same
     glass widget language. */
  function AnalyticsBoard() { return <AnalyticsSection analyticsSummary={analyticsSummary} trendData={trendData} alertsSummary={alertsSummary} redrawSignal={`${shownTab}-${boardStage}`} /> }
  function DistributionBoard() { return <DistributionSection {...{ productData, crudeSources, distributors, redrawSignal: `${shownTab}-${boardStage}` }} /> }
  function ReportsBoard() {
    return (
      <ReportsSection
        {...{
          reportType, reportFormat, reportStart, reportEnd, reportGenerating, reportMessage,
          setReportType, setReportFormat, setReportStart, setReportEnd, syncWeeklyRange, syncMonthlyRange, generateReport,
        }}
      />
    )
  }
  function IntegrationBoard() { return <IntegrationSection {...{ simulationStatus, paused }} /> }
}function latestEventLine(event: LiveEvent | undefined) {
  if (!event) return 'Waiting for live sensor activity'
  return eventLine(event)
}

function eventLine(event: LiveEvent) {
  const data = event.data || {}
  if (event.type === 'crude_intake') {
    const barrels = data.volume_barrels ? Math.round(Number(data.volume_barrels)) : null
    if (event.kind === 'meter_reading') {
      return `Terminal meter reading: +${barrels ? barrels.toLocaleString() : '0'} bbl ${data.crude_type} via ${data.tanker_id}`
    }
    return `${data.tanker_id} arrived with ${barrels ? barrels.toLocaleString() : '0'} bbl ${data.crude_type}`
  }
  if (event.type === 'gantry_load') {
    return `${data.distributor_name} loaded ${data.volume_litres ? Math.round(Number(data.volume_litres)).toLocaleString() : 'a load'} L of ${data.product_type} at ${data.gantry_id}`
  }
  const combined = data.combined_output_litres ? Math.round(Number(data.combined_output_litres)).toLocaleString() : null
  if (combined && Number(data.combined_output_litres) > 0) {
    const units = data.units as Array<Record<string, unknown>> | undefined
    const running = units ? units.filter((unit) => unit.status === 'RUNNING').length : 0
    return `Production update: +${combined} L across ${running || units?.length || 3} units this tick`
  }
  return 'Production units reported their latest readings'
}

function reducedOr(natural: number, reduced: number) {
  return prefersReducedMotion() ? reduced : natural
}

/* Simulation control: same widget for every tab, server state only. */
interface SimulationControlProps {
  className?: string
  stagger?: CSSProperties
  running: boolean
  paused: boolean
  pending: boolean
  error: string | null
  lastChanged?: string | null
  stats?: SimulationStats
  devMode: boolean
  mode: string
  onControl: (action: 'pause' | 'resume' | 'close_day') => void
  onSeed: () => void
  onReconcile: () => void
  closeDayConfirm: boolean
  setCloseDayConfirm: (open: boolean) => void
  entitled: boolean
}

function SimulationControl(props: SimulationControlProps) {
  const { className, stagger, running, paused, pending, error, lastChanged, stats, devMode, mode, onControl, onSeed, onReconcile, closeDayConfirm, setCloseDayConfirm } = props
  return (
    <GlassWidget icon={Radio} title="Simulation control" className={className} style={stagger}>
      <div className="sim-rows">
        <div className="sim-toggle-row">
          <span className="sim-label" id="sim-toggle-label">Simulation running</span>
          <button
            type="button"
            role="switch"
            aria-checked={running && !paused}
            aria-labelledby="sim-toggle-label"
            className={`sim-switch ${!paused ? 'is-on' : ''} ${pending ? 'is-busy' : ''}`}
            disabled={pending}
            onClick={() => onControl(paused ? 'resume' : 'pause')}
          >
            <span className="sim-switch__knob" />
            {pending && <span className="sim-switch__spinner" aria-hidden="true" />}
          </button>
          <span className={`sim-state ${paused ? 'is-paused' : 'is-running'}`}>
            <span className="sim-state__dot" aria-hidden="true" />
            {running ? (paused ? 'Paused' : 'Running') : 'Off'}
            {lastChanged && <em>since {formatLagosStamp(lastChanged)} WAT</em>}
          </span>
        </div>

        {error && <p className="sim-error" role="alert">{error}</p>}

        <div className="sim-rows__actions">
          {closeDayConfirm ? (
            <>
              <span className="sim-confirm-text">Seal today as a closed day and lock the record?</span>
              <RippleButton type="button" className="pill-btn pill-btn--solid" onClick={() => { onControl('close_day'); setCloseDayConfirm(false) }}>Confirm close day</RippleButton>
              <RippleButton type="button" className="pill-btn" onClick={() => setCloseDayConfirm(false)}>Cancel</RippleButton>
            </>
          ) : (
            <RippleButton type="button" className="pill-btn" onClick={() => setCloseDayConfirm(true)}>Close day</RippleButton>
          )}
          <RippleButton type="button" className="pill-btn" onClick={onSeed}>Seed 7 days</RippleButton>
          <RippleButton type="button" className="pill-btn" onClick={onReconcile}>Run today's reconciliation</RippleButton>
        </div>

        <div className="stat-chips">
          <span className="stat-chip">Crude intakes <strong>{stats?.crude_intake_today ?? 0}</strong></span>
          <span className="stat-chip">Production updates <strong>{stats?.production_updates_today ?? 0}</strong></span>
          <span className="stat-chip">Gantry loads <strong>{stats?.gantry_loads_today ?? 0}</strong></span>
          <span className="stat-chip">Mode <strong>{devMode ? 'Live dev' : mode ? mode.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Off'}</strong></span>
        </div>
      </div>
    </GlassWidget>
  )
}

function AnalyticsSection({ analyticsSummary, trendData, alertsSummary, redrawSignal }: any) {
  const outputRows = useMemo(() => {
    const rows: any[][] = [['Day', 'Actual output', 'Expected output', 'Daily target']]
    for (const point of (trendData || []) as any[]) {
      rows.push([
        shortDay(point.date),
        Number(point.actual_output_litres) || 0,
        Number(point.expected_output_litres) || 0,
        DAILY_TARGET_LITRES,
      ])
    }
    return rows
  }, [trendData])

  const alertsRows = useMemo(() => {
    const rows: any[][] = [['Week', 'Alerts']]
    for (const week of (alertsSummary?.alerts_by_week || []) as any[]) {
      rows.push([shortDay(week.week_start), Number(week.count) || 0])
    }
    return rows
  }, [alertsSummary])

  return (
    <div className="board__rows">
      <GlassWidget icon={ChartLine} title="Commitment summary" className="col-12" style={widgetStaggerLocal(0)}>
        <div className="mini-tiles-4">
          <KPITile label="Days recorded" value={analyticsSummary ? Number(analyticsSummary.total_days_recorded) : null} unit="records" tone="white" size="sm" />
          <KPITile label="Hit rate" value={analyticsSummary ? Number(analyticsSummary.commitment_hit_rate_percentage) : null} unit="percent of days fulfilled" tone="green" size="sm" isPercent />
          <KPITile label="Average fulfillment" value={analyticsSummary ? Number(analyticsSummary.average_fulfillment_percentage) : null} unit="average" tone="blue" size="sm" isPercent />
          <KPITile label="Best day" value={analyticsSummary ? Number(analyticsSummary.best_day.fulfillment_percentage) : null} unit={analyticsSummary ? formatDate(analyticsSummary.best_day.date) : 'Not available'} tone="green" size="sm" isPercent />
        </div>
        <div className="mini-tiles-4">
          <KPITile label="Worst day" value={analyticsSummary ? Number(analyticsSummary.worst_day.fulfillment_percentage) : null} unit={analyticsSummary ? formatDate(analyticsSummary.worst_day.date) : 'Not available'} tone="red" size="sm" isPercent />
          <KPITile label="Total crude intake" value={analyticsSummary ? Number(analyticsSummary.total_crude_intake_barrels) : null} unit="barrels" tone="blue" size="sm" compact />
          <KPITile label="Total output" value={analyticsSummary ? Number(analyticsSummary.total_actual_output_litres) : null} unit="litres" tone="green" size="sm" compact />
          <KPITile label="Total trucks loaded" value={analyticsSummary ? Number(analyticsSummary.total_trucks_loaded) : null} unit="trucks" tone="white" size="sm" />
        </div>
      </GlassWidget>

      <div className="col-12 google-chart-card" style={widgetStaggerLocal(1)}>
        <GoogleChartCard
          icon={ChartLine}
          title="30 day output trend"
          subtitle="Actual and expected output with the daily commitment"
          ariaLabel="Line chart of actual and expected output for the last thirty days with the 35 million litre daily target"
          chartType="LineChart"
          data={outputRows as unknown[]}
          isEmpty={outputRows.length <= 1}
          emptyContent="No trend data available."
          redrawSignal={redrawSignal}
          options={{
            series: {
              0: { color: GREEN_400, lineWidth: 2, pointSize: 0 },
              1: { color: 'rgba(255,255,255,0.55)', lineWidth: 2, lineDashStyle: [6, 6], pointSize: 0 },
              2: { color: SKY_300, lineWidth: 2, lineDashStyle: [8, 6], pointSize: 0 },
            },
            legend: { position: 'bottom', textStyle: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontName: 'Instrument Sans' } },
            vAxis: { format: 'compact' },
            curveType: 'function',
          } as Record<string, unknown>}
        />
      </div>

      <div className="col-12 google-chart-card" style={widgetStaggerLocal(2)}>
        <GoogleChartCard
          icon={Bell}
          title="Alerts per week"
          subtitle="The last eight weeks of alerts"
          ariaLabel="Column chart of alerts per week for the last eight weeks"
          chartType="ColumnChart"
          data={alertsRows as unknown[]}
          isEmpty={alertsRows.length <= 1}
          emptyContent="No alerts recorded yet."
          redrawSignal={redrawSignal}
          options={{
            colors: [SKY_500],
            vAxis: { minValue: 0, format: '#' },
            barGap: '35%',
          } as Record<string, unknown>}
        >
          {alertsSummary && alertsRows.length > 1 && (
            <div className="mini-tiles-4">
              <KPITile label="Total" value={Number(alertsSummary.total_alerts)} size="sm" tone="white" />
              <KPITile label="Critical" value={Number(alertsSummary.critical_alerts)} size="sm" tone="red" />
              <KPITile label="Warning" value={Number(alertsSummary.warning_alerts)} size="sm" tone="amber" />
              <KPITile label="Not acknowledged" value={Number(alertsSummary.unacknowledged_alerts)} size="sm" tone="blue" />
            </div>
          )}
        </GoogleChartCard>
      </div>
    </div>
  )
}

function DistributionSection({ productData, crudeSources, distributors, redrawSignal }: any) {
  const productRows = useMemo(() => {
    const rows: any[][] = [['Product', 'Share', { role: 'style' }]]
    if (productData) {
      rows.push(['Petrol', productData.Petrol?.percentage_of_total ?? 0, `color: ${GREEN_400}; fontSize: 12; color: #ffffff`])
      rows.push(['Diesel', productData.Diesel?.percentage_of_total ?? 0, `color: ${SKY_300}; fontSize: 12`])
      rows.push(['Kerosene', productData.Kerosene?.percentage_of_total ?? 0, `color: rgba(255,255,255,0.7); fontSize: 12`])
    }
    return rows
  }, [productData])

  return (
    <div className="board__rows">
      <div className="col-12 google-chart-card" style={widgetStaggerLocal(0)}>
        <GoogleChartCard
          icon={Fuel}
          title="Product breakdown"
          subtitle="Share of loaded volume by product type"
          ariaLabel="Horizontal bar chart of loaded volume share for petrol, diesel and kerosene"
          chartType="BarChart"
          data={productRows as unknown[]}
          isEmpty={!productData || productRows.length <= 1}
          emptyContent="No product data available."
          redrawSignal={redrawSignal}
          options={{
            bars: 'horizontal',
            colors: [GREEN_400, SKY_300, 'rgba(255,255,255,0.7)'],
            annotations: { style: 'none' },
            dataLabel: { color: 'rgba(255,255,255,0.92)', fontSize: 12, fontName: 'Instrument Sans' },
            vAxis: { format: "#'%'", minValue: 0, maxValue: 100 },
          } as Record<string, unknown>}
        >
          {productData && (
            <div className="product-mini-list">
              {(['Petrol', 'Diesel', 'Kerosene'] as const).map((key) => {
                const product = productData[key]
                if (!product) return null
                return (
                  <div key={key} className="widget-row">
                    <IconCircle icon={Fuel} tone={key === 'Petrol' ? 'glass' : key === 'Diesel' ? 'blue' : 'glass'} size={28} iconSize={15} />
                    <span className="widget-row__text">
                      <strong>{key}</strong> {formatCompact(product.total_volume_litres)} litres, {product.total_trucks} trucks, {product.percentage_of_total?.toFixed(2)} percent
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </GoogleChartCard>
      </div>

      <GlassWidget icon={Ship} title="Crude sources" className="col-12" style={widgetStaggerLocal(1)}>
        <div className="table-scroll">
          <table className="stack-table">
            <thead><tr><th>Source country</th><th>Barrels</th><th>Shipments</th><th>Share</th><th>Crude types</th></tr></thead>
            <tbody>
              {(crudeSources || []).slice().sort((a: any, b: any) => b.total_volume_barrels - a.total_volume_barrels).map((source: any) => (
                <tr key={source.source_country}>
                  <td data-label="Source country">{source.source_country}</td>
                  <td data-label="Barrels" className="num" title={formatNumber(source.total_volume_barrels)}>{formatCompact(source.total_volume_barrels)}</td>
                  <td data-label="Shipments" className="num stack-extra">{source.shipment_count}</td>
                  <td data-label="Share" className="num stack-extra">{formatPercent(source.percentage_of_total)}</td>
                  <td data-label="Crude types" className="stack-extra">{source.crude_types.map((c: any) => `${c.crude_type} (${c.shipment_count})`).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassWidget>

      <GlassWidget icon={Truck} title="Top distributors" className="col-12" style={widgetStaggerLocal(2)}>
        <div className="table-scroll">
          <table className="stack-table">
            <thead><tr><th>Rank</th><th>Distributor</th><th>Volume</th><th>Trucks</th><th>Regions served</th><th>Top product</th></tr></thead>
            <tbody>
              {Array.isArray(distributors) && distributors.map((dist: any, idx: number) => (
                <tr key={dist.distributor_id}>
                  <td data-label="Rank">#{idx + 1}</td>
                  <td data-label="Distributor">{dist.distributor_name}</td>
                  <td data-label="Volume" className="num" title={formatNumber(dist.total_volume_litres)}>{formatCompact(dist.total_volume_litres)}</td>
                  <td data-label="Trucks" className="num stack-extra">{dist.total_trucks}</td>
                  <td data-label="Regions served" className="stack-extra">{Array.isArray(dist.regions_served) ? dist.regions_served.join(', ') : ''}</td>
                  <td data-label="Top product" className="stack-extra">{dist.top_product}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassWidget>
    </div>
  )
}

function ReportsSection(props: any) {
  const { reportType, reportFormat, reportStart, reportEnd, reportGenerating, reportMessage, generateReport, syncWeeklyRange, syncMonthlyRange } = props
  const setReportType = props.setReportType as (v: 'weekly' | 'monthly' | 'custom') => void
  return (
    <div className="board__rows">
      <GlassWidget
        icon={FileText}
        title="Operational reports"
        className="col-12"
        style={widgetStaggerLocal(0)}
      >
        <div className="report-form">
          <div className="report-form__row">
            <label>
              <span>Report type</span>
              <select className="glass-input" value={reportType} onChange={(event) => setReportType(event.target.value as 'weekly' | 'monthly' | 'custom')}>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            <label>
              <span>Format</span>
              <select className="glass-input" value={reportFormat} onChange={(event) => props.setReportFormat(event.target.value)}>
                <option value="csv">Comma-separated values</option>
                <option value="json">Structured JSON</option>
              </select>
            </label>
          </div>

          {reportType === 'weekly' && (
            <label className="report-form__single">
              <span>Week</span>
              <input type="date" className="glass-input" value={reportStart ? new Date(reportStart).toISOString().slice(0, 10) : ''} onChange={(event) => syncWeeklyRange(event.target.value)} />
            </label>
          )}

          {reportType === 'monthly' && (
            <label className="report-form__single">
              <span>Month</span>
              <input type="month" className="glass-input" onChange={(event) => syncMonthlyRange(event.target.value)} />
            </label>
          )}

          {reportType === 'custom' && (
            <div className="report-form__row">
              <label><span>Start date</span><input type="date" className="glass-input" value={reportStart} onChange={(event) => props.setReportStart(event.target.value)} /></label>
              <label><span>End date</span><input type="date" className="glass-input" value={reportEnd} onChange={(event) => props.setReportEnd(event.target.value)} /></label>
            </div>
          )}

          <RippleButton type="button" className="pill-btn pill-btn--solid report-generate" disabled={reportGenerating || !reportStart || !reportEnd} onClick={generateReport}>
            <Download size={15} strokeWidth={1.75} /> {reportGenerating ? 'Generating' : 'Generate report'}
          </RippleButton>

          {reportMessage && (
            <p className={`report-message ${reportMessage.type === 'success' ? 'is-success' : 'is-error'}`} role="status">
              {reportMessage.text}
            </p>
          )}

          <p className="info-note">
            Reports include the period summary, daily reconciliation records and the hash chain verification confirming ledger integrity for the selected range.
          </p>
        </div>
      </GlassWidget>
    </div>
  )
}

const INTEGRATION_CARDS = [
  {
    icon: Ship,
    title: 'Crude terminal sensor',
    description: 'Monitors tanker arrivals and crude intake volumes at the Lekki terminal. In production it connects to the flow metering API at the terminal.',
    interval: 'Meter readings in dev mode / tanker arrivals in production',
    next: 'Replace with the terminal SCADA endpoint by implementing the DataSource interface.',
  },
  {
    icon: Factory,
    title: 'Production unit monitors',
    description: 'Reads throughput and yield from CDU-1, CDU-2 and CDU-3. In production it connects to distributed control system OPC-UA feeds.',
    interval: 'Every 30 seconds (dev) / 30 minutes (production)',
    next: 'Replace with an OPC-UA or Modbus TCP adapter implementing the DataSource interface.',
  },
  {
    icon: Truck,
    title: 'Gantry loading system',
    description: 'Captures truck loading events at the gantries. In production it connects to the gantry controller webhook.',
    interval: 'Every 30 seconds (dev) / 30 minutes (production)',
    next: 'Point the controller webhook at POST /api/v1/ingest/gantry-load.',
  },
  {
    icon: Database,
    title: 'ERP and allocation system',
    description: 'Crude allocation data from the trading desk ERP, with cargo allocation confirmations and purchase order references.',
    interval: 'Not connected yet',
    next: 'Connect through the ERP REST API and register the adapter in the simulation registry.',
  },
]

function IntegrationSection({ simulationStatus, paused }: any) {
  const active = Boolean(simulationStatus?.running) && !paused
  const badgeFor = (index: number) => {
    if (index === 3) return 'Not connected'
    return active ? 'Simulated' : paused ? 'Paused' : 'Offline'
  }
  return (
    <div className="board__rows">
      {INTEGRATION_CARDS.map((card, index) => (
        <GlassWidget
          key={card.title}
          icon={card.icon}
          title={card.title}
          className="col-6"
          badge={badgeFor(index)}
          badgeTone={index === 3 ? 'red' : active ? 'green' : 'amber'}
          style={widgetStaggerLocal(index)}
        >
          <p className="widget-copy">{card.description}</p>
          <dl className="spec-list">
            <div><dt>Feed cadence</dt><dd>{card.interval}</dd></div>
            <div><dt>Production integration</dt><dd>{card.next}</dd></div>
          </dl>
        </GlassWidget>
      ))}

      <GlassWidget icon={Cable} title="Architecture and ingest" className="col-12" style={widgetStaggerLocal(4)}>
        <p className="widget-copy">
          Every external feed implements one standard DataSource interface and is registered at startup. Connecting a live system is a drop-in adapter change, no application rework, with SIM_MODE=off when live feeds take over.
        </p>
        <ul className="endpoint-list" aria-label="Ingest endpoints">
          <li><code>POST /api/v1/ingest/crude-intake</code> crude terminal meter readings</li>
          <li><code>POST /api/v1/ingest/production-reading</code> production unit DCS readings</li>
          <li><code>POST /api/v1/ingest/gantry-load</code> gantry automation events</li>
        </ul>
      </GlassWidget>
    </div>
  )
}

/* Momentary helper icons */
const widgetStaggerLocal = (index: number): CSSProperties => ({ ['--stagger' as string]: `${index * 40}ms` })

/* Nav sections */
const SECTIONS = [
  { id: 'overview', label: 'Overview', short: 'Home', icon: LayoutDashboard },
  { id: 'analytics', label: 'Analytics', short: 'Stats', icon: ChartLine },
  { id: 'distribution', label: 'Crude and Distribution', short: 'Crude', icon: Fuel },
  { id: 'reports', label: 'Reports', short: 'Reports', icon: FileText },
  { id: 'integration', label: 'Integration', short: 'Feeds', icon: Plug },
] as const


interface OverviewBoardProps {
  slowUpdatedAt: Date | null
  fulfillment: number | null
  dashboardData: DashboardData | null
  openAlerts: Alert[]
  dismissAlert: (id: string) => void
  acknowledgeAlert: (id: string) => void
  canManage: boolean
  liveEvents: LiveEvent[]
  activityOpen: boolean
  setActivityOpen: (next: boolean | ((prev: boolean) => boolean)) => void
  unitRows: Array<Record<string, any>>
  isOperationsManager: boolean
  reconciliations: Reconciliation[]
  ledgerEntries: LedgerEntry[]
  ledgerExpanded: boolean
  setLedgerExpanded: (next: boolean | ((prev: boolean) => boolean)) => void
  ledgerPillFor: (entry: LedgerEntry) => string
  shownTab: TabId
  boardStage: 'in' | 'out'
  widgetStagger: (index: number) => CSSProperties
  saveNote: (date: string, notes: string) => void
  simRunning: boolean
  paused: boolean
  simLastChanged?: string | null
  simPending: boolean
  simError: string | null
  simulationStatus: SimulationStatus | null
  controlSimulation: (action: 'pause' | 'resume' | 'close_day') => void
  seedData: () => void
  runReconciliation: () => void
  closeDayConfirm: boolean
  setCloseDayConfirm: (open: boolean) => void
  noteDrafts: Record<string, string>
  setNoteDrafts: (next: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void
  noteOpen: Record<string, boolean>
  setNoteOpen: (next: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)) => void
  openedRows: Record<string, boolean>
  setOpenedRows: (next: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)) => void
}

function OverviewBoard(props: OverviewBoardProps) {
  const historyRecords = props.reconciliations.slice(0, 7)
  const {
    fulfillment, dashboardData, openAlerts, dismissAlert, acknowledgeAlert, canManage,
    liveEvents, activityOpen, setActivityOpen, unitRows, isOperationsManager,
    reconciliations, ledgerEntries, ledgerExpanded, setLedgerExpanded, ledgerPillFor,
    shownTab, boardStage, widgetStagger, saveNote, slowUpdatedAt,
    simRunning, paused, simPending, simError, simLastChanged, simulationStatus,
    controlSimulation, seedData, runReconciliation, closeDayConfirm, setCloseDayConfirm,
    noteDrafts, setNoteDrafts, noteOpen, setNoteOpen, openedRows, setOpenedRows,
  } = props
  const [alertsExpanded, setAlertsExpanded] = useState(false)
  const updatedStamp = slowUpdatedAt ? `Updated ${formatLagosStamp(slowUpdatedAt)} WAT` : 'Updated just now'
    const trendRows = useMemo(() => {
      const lastSeven = reconciliations.slice(0, 7).reverse()
      const rows: any[][] = [
        ['Day', 'Fulfillment', { type: 'string', role: 'tooltip', p: { html: true } }, { type: 'string', role: 'style' }, 'Target'],
      ]
      for (const rec of lastSeven) {
        const percent = rec.fulfillment_percentage
        const color = statusColor(percent)
        rows.push([
          shortDay(rec.reconciliation_date),
          percent,
          `<div class="rsv-tooltip"><strong>${formatDate(rec.reconciliation_date)}</strong><span>${formatNumber(rec.actual_output_litres)} L of ${formatNumber(rec.commitment_target_litres || DAILY_TARGET_LITRES)} L</span><span>${formatPercent(percent)}</span></div>`,
          `color: ${color};`,
          100,
        ])
      }
      return rows
    }, [reconciliations])

    const trendEmpty = reconciliations.length === 0

    return (
      <div className="board__rows">
        <section className="board-group">
          <header className="board-group__head">
            <h2>Today</h2>
            <p>How the refinery is doing right now</p>
          </header>
          <div className="board-row board-row--today">
            <div className="glass-widget glass-surface today-tile today-tile--ring" style={widgetStagger(0)}>
              <FulfillmentRing percent={fulfillment} size={96} small={false} />
              <span className="today-tile__label">Fulfillment</span>
              <span className="today-tile__sub" title={fulfillment === null ? undefined : `${formatNumber((fulfillment / 100) * DAILY_TARGET_LITRES)} of ${formatNumber(DAILY_TARGET_LITRES)} litres`}>
                {dashboardData && <StatusPill status={dashboardData.status} />} of the 35M target
              </span>
            </div>
            <div className="glass-widget glass-surface today-tile" style={widgetStagger(1)}>
              <strong className="today-tile__value" title={dashboardData ? formatNumber(dashboardData.crude_intake_barrels) : undefined}>{formatCompact(dashboardData?.crude_intake_barrels ?? null)}<em> bbl</em></strong>
              <span className="today-tile__label">Crude intake</span>
              <span className="today-tile__sub">Metered at the terminal, WAT day</span>
            </div>
            <div className="glass-widget glass-surface today-tile" style={widgetStagger(2)}>
              <strong className="today-tile__value" title={dashboardData ? formatNumber(dashboardData.actual_output_litres) : undefined}>{formatCompact(dashboardData?.actual_output_litres ?? null)}<em> L</em></strong>
              <span className="today-tile__label">Actual output</span>
              <span className="today-tile__sub">From the three CDU units</span>
            </div>
            <div className="glass-widget glass-surface today-tile" style={widgetStagger(3)}>
              <strong className="today-tile__value">{dashboardData?.trucks_loaded ?? '--'}<em> trucks</em></strong>
              <span className="today-tile__label">Trucks loaded</span>
              <span className="today-tile__sub">Across four gantries</span>
            </div>
          </div>
        </section>

        <section className="board-group">
          <header className="board-group__head">
            <h2>Needs attention</h2>
            <p>Open alerts and the live feed</p>
          </header>
          <div className="board-row board-row--6">
            <GlassWidget icon={Bell} title="Alerts" badge={openAlerts.length || null} className="col-6 h-tall" style={widgetStagger(0)}>
              {openAlerts.length === 0 && <p className="widget-empty">No open alerts. Production is on track.</p>}
              <div className="widget-scroll">
                {(alertsExpanded ? openAlerts : openAlerts.slice(0, 5)).map((alert) => (
                  <div key={alert.id} className="widget-row">
                    <IconCircle
                      icon={alert.severity === 'CRITICAL' ? AlertTriangle : alert.severity === 'WARNING' ? AlertCircle : Info}
                      tone={alert.severity === 'CRITICAL' ? 'red' : alert.severity === 'WARNING' ? 'amber' : 'blue'}
                      size={28}
                      iconSize={15}
                    />
                    <span className="widget-row__text">{alert.message}</span>
                    <span className="widget-row__buttons">
                      {canManage && (
                        <RippleButton type="button" className="round-mini" aria-label={`Acknowledge alert: ${alert.message}`} onClick={() => acknowledgeAlert(alert.id)}>
                          <Check size={14} strokeWidth={2} />
                        </RippleButton>
                      )}
                      <RippleButton type="button" className="round-mini" aria-label="Dismiss alert from view" onClick={() => dismissAlert(alert.id)}>
                        <X size={14} strokeWidth={2} />
                      </RippleButton>
                    </span>
                  </div>
                ))}
              </div>
              {openAlerts.length > 5 && (
                <button type="button" className="expand-link" aria-expanded={alertsExpanded} onClick={() => setAlertsExpanded((open) => !open)}>{alertsExpanded ? 'Show the first five alerts' : `View all ${openAlerts.length} alerts`}</button>
              )}
            </GlassWidget>

            <GlassWidget
              icon={Activity}
              title="Live activity"
              badge={liveEvents.length || null}
              className="col-6 h-tall"
              style={widgetStagger(1)}
            >
              <button type="button" className="collapse-row" aria-expanded={activityOpen} onClick={() => setActivityOpen((open) => !open)}>
                <span className="collapse-row__chevron" data-open={activityOpen}><ChevronDown size={15} strokeWidth={1.75} /></span>
                <span className="collapse-row__text">
                  {liveEvents.length === 0
                    ? 'Waiting for live sensor activity'
                    : activityOpen
                      ? 'Streaming from the refinery floor'
                      : latestEventLine(liveEvents[0])}
                </span>
              </button>
              {activityOpen && (
                <div className="activity-list">
                  {liveEvents.length === 0 && <p className="widget-empty">Waiting for the first live event.</p>}
                  {liveEvents.map((event, index) => (
                    <div key={`${event.type}-${event.timestamp}-${index}`} className="widget-row is-live">
                      <IconCircle
                        icon={event.type === 'crude_intake' ? Ship : event.type === 'gantry_load' ? Truck : Factory}
                        tone="glass"
                        size={28}
                        iconSize={15}
                      />
                      <span className="widget-row__text">{eventLine(event)}</span>
                      <span className="widget-row__time">{formatRelative(event.timestamp)}</span>
                    </div>
                  ))}
                </div>
              )}
            </GlassWidget>
          </div>
        </section>

        <section className="board-group">
          <header className="board-group__head">
            <h2>Operations</h2>
            <p>Production units and the simulation</p>
          </header>
          <div className="board-row board-row--6">
            <GlassWidget icon={Factory} title="Production units" className={isOperationsManager ? 'col-6 h-mid' : 'col-12 h-mid'} style={widgetStagger(0)}>
              {unitRows.length === 0 && <p className="widget-empty">Waiting for the next reading.</p>}
              <div className="widget-scroll">
                {unitRows.map((unit) => (
                  <div key={String(unit.unit_name)} className="unit-row">
                    <span className="unit-row__dot" data-status={String(unit.status).toLowerCase()} />
                    <span className="unit-row__name">{String(unit.unit_name)}</span>
                    <span className="unit-row__bar" role="img" aria-label={`${String(unit.unit_name)} yield ${Math.round(Number(unit.yield_percentage) || 0)} percent`}><i style={{ width: `${Math.round(Number(unit.yield_percentage) || 0)}%` }} /></span>
                    <strong>{Math.round(Number(unit.yield_percentage) || 0)}%</strong>
                  </div>
                ))}
              </div>
              {unitRows.length === 0 && (
                <div className="glass-mini-list">
                  {['CDU-1', 'CDU-2', 'CDU-3'].map((unit) => (
                    <div key={unit} className="unit-row"><span className="unit-row__dot" /><span className="unit-row__name">{unit}</span><span className="unit-row__bar" /><strong>--</strong></div>
                  ))}
                </div>
              )}
            </GlassWidget>

            {isOperationsManager && (
              <SimulationControl
                className="col-6 h-mid"
                stagger={widgetStagger(1)}
                running={simRunning}
                paused={paused}
                pending={simPending}
                error={simError}
                lastChanged={simLastChanged}
                stats={simulationStatus?.stats}
                devMode={simulationStatus?.dev_mode ?? false}
                mode={simulationStatus?.mode ?? 'off'}
                onControl={controlSimulation}
                onSeed={seedData}
                onReconcile={runReconciliation}
                closeDayConfirm={closeDayConfirm}
                setCloseDayConfirm={setCloseDayConfirm}
                entitled={isOperationsManager}
              />
            )}
          </div>
        </section>

        <section className="board-group">
          <header className="board-group__head">
            <h2>Records</h2>
            <p>Reconciliation history and the ledger, {updatedStamp.toLowerCase()}</p>
          </header>
          <div className="board-row board-row--12">
            <GlassWidget
              icon={ClipboardList}
              title="Reconciliation history"
              className="col-7 h-tall-records"
              style={widgetStagger(0)}
            >
              {historyRecords.length === 0 && <p className="widget-empty">No reconciliation records found.</p>}
              {historyRecords.length > 0 && (
                <div className="table-scroll">
                  <table className="stack-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Crude intake</th>
                        <th>Expected</th>
                        <th>Actual</th>
                        <th>Trucks</th>
                        <th>Fulfillment</th>
                        <th>Status</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyRecords.map((rec) => {
                        const cleanDate = rec.reconciliation_date.slice(0, 10)
                        const isOpen = openedRows[cleanDate] ?? false
                        const noteEditorOpen = noteOpen[cleanDate]
                        return (
                          <tr key={rec.id} className={isOpen ? 'is-open' : ''}>
                            <td data-label="Date">{formatDate(rec.reconciliation_date)}</td>
                            <td data-label="Crude intake" className="num" title={formatNumber(rec.crude_intake_total_barrels)}>{formatCompact(rec.crude_intake_total_barrels)}</td>
                            <td data-label="Expected" className="num stack-extra" title={formatNumber(rec.expected_output_litres)}>{formatCompact(rec.expected_output_litres)}</td>
                            <td data-label="Actual" className="num stack-extra" title={formatNumber(rec.actual_output_litres)}>{formatCompact(rec.actual_output_litres)}</td>
                            <td data-label="Trucks" className="num stack-extra">{rec.trucks_loaded}</td>
                            <td data-label="Fulfillment" className="num">{formatPercent(rec.fulfillment_percentage)}</td>
                            <td data-label="Status"><StatusPill status={rec.status} /></td>
                            <td data-label="Notes" className="stack-extra">
                              {canManage ? (
                                <span className="note-cell">
                                  <button type="button" className="note-link" onClick={() => {
                                    setNoteOpen((prev) => ({ ...prev, [cleanDate]: !prev[cleanDate] }))
                                    if (!noteDrafts[cleanDate]) setNoteDrafts((prev) => ({ ...prev, [cleanDate]: rec.notes || '' }))
                                  }}>
                                    <StickyNote size={13} strokeWidth={1.75} />
                                    {rec.notes ? 'Edit' : 'Add'}
                                  </button>
                                  {noteEditorOpen && (
                                    <span className="note-editor">
                                      <textarea
                                        value={noteDrafts[cleanDate] ?? rec.notes ?? ''}
                                        onChange={(event) => setNoteDrafts((prev) => ({ ...prev, [cleanDate]: event.target.value }))}
                                        rows={3}
                                        aria-label={`Note for ${formatDate(rec.reconciliation_date)}`}
                                      />
                                      <RippleButton type="button" className="note-save" onClick={() => saveNote(rec.reconciliation_date, noteDrafts[cleanDate] ?? '')}>Save</RippleButton>
                                    </span>
                                  )}
                                  {(rec.notes && !noteEditorOpen) && <span className="note-value">{rec.notes}</span>}
                                </span>
                              ) : (rec.notes || '--')}
                            </td>
                            <td className="stack-toggle">
                              <button
                                type="button"
                                className="round-mini"
                                aria-expanded={isOpen}
                                aria-label={isOpen ? `Collapse details for ${formatDate(rec.reconciliation_date)}` : `Expand details for ${formatDate(rec.reconciliation_date)}`}
                                onClick={() => setOpenedRows((prev) => ({ ...prev, [cleanDate]: !isOpen }))}
                              >
                                <ChevronDown size={14} strokeWidth={1.75} />
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </GlassWidget>

            <GlassWidget icon={Link2} title="Verified ledger" badge={ledgerEntries.length || null} className="col-5 h-tall-records" style={widgetStagger(1)}>
              <div className="widget-scroll">
                {(ledgerExpanded ? ledgerEntries : ledgerEntries.slice(0, 6)).map((entry) => (
                  <div key={entry.id} className="ledger-row">
                    <span className="ledger-row__date">{formatDate(entry.entry_date)}</span>
                    <span className="hash-chip" title={entry.content_hash}>{entry.content_hash.slice(0, 12)}</span>
                    <StatusPill status={ledgerPillFor(entry)} />
                  </div>
                ))}
                {ledgerEntries.length === 0 && <p className="widget-empty">No ledger entries yet.</p>}
              </div>
              {ledgerEntries.length > 6 && (
                <button type="button" className="expand-link" onClick={() => setLedgerExpanded((open) => !open)}>
                  {ledgerExpanded ? 'Show recent entries' : `Show all ${ledgerEntries.length} entries`}
                </button>
              )}
              <span className="trust-line"><ShieldCheck size={14} strokeWidth={1.75} /> Hash-chained and immutable.</span>
            </GlassWidget>
          </div>
        </section>

        <section className="board-group">
          <header className="board-group__head">
            <h2>Trend</h2>
            <p>Fulfillment over the last 7 days</p>
          </header>
          <div className="board-row board-row--12">
            <div className="col-6 google-chart-card h-trend" style={widgetStagger(0)}>
              <GoogleChartCard
                icon={ChartLine}
                title="7 day fulfillment trend"
                subtitle="Daily fulfillment against the 100 percent target"
                ariaLabel="Column chart of daily fulfillment for the last seven days with a dashed line at the 100 percent daily target"
                chartType="ComboChart"
                data={trendRows as unknown[]}
                className="h-trend"
                isEmpty={trendEmpty}
                emptyContent={
                  isOperationsManager
                    ? 'No history yet. Seed it below.'
                    : 'History builds as each day closes at 23:59.'
                }
                redrawSignal={`${shownTab}-${boardStage}`}
          options={{
            series: {
              0: { type: 'bars', color: GREEN_400 },
              1: { type: 'line', color: SKY_300, lineDashStyle: [8, 6], pointSize: 0, lineWidth: 2 },
            },
            barGap: '26%',
            vAxis: { viewWindow: { min: 0, max: 120 }, format: "#'%'", minValue: 0, maxValue: 120 },
          } as Record<string, unknown>}
              >
                {trendEmpty && isOperationsManager && (
                  <RippleButton type="button" className="pill-btn pill-btn--solid" onClick={seedData}>Seed 7 days</RippleButton>
                )}
              </GoogleChartCard>
            </div>

            <GlassWidget icon={Gauge} title="How to read this chart" className="col-6 h-trend guide-card" style={widgetStagger(1)}>
              <ul className="guide-list">
                <li><span className="guide-swatch" style={{ background: GREEN_400 }} /> Fulfilled: 95% and above</li>
                <li><span className="guide-swatch" style={{ background: AMBER }} /> Partial: 75% to 95%</li>
                <li><span className="guide-swatch" style={{ background: RED }} /> Shortfall: below 75%</li>
                <li><span className="guide-swatch guide-swatch--dashed" /> Dashed sky blue line: the 100% daily target</li>
              </ul>
              <p className="guide-note">
                Fulfillment is the day's actual output divided by the 35 million litre daily commitment.
                Each column is one closed, reconciled day; open the Trend section in Analytics for the thirty day view.
              </p>
            </GlassWidget>
          </div>
        </section>
      </div>
    )
  }
