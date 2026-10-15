import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, ReferenceLine } from 'recharts'
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
import Donut from '../components/Donut'
import { prefersReducedMotion } from '../components/useRipple'
import { useAuth } from '../auth/AuthContext'
import { API_BASE } from '../App'


interface DashboardData {
  crude_intake_barrels: number
  actual_output_litres: number
  trucks_loaded: number
  fulfillment_percent: number
  status: string
  alerts: Alert[]
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

interface SimulationStatus {
  running: boolean
  mode: string
  dev_mode: boolean
  stats: {
    events_total: number
    crude_intake_today: number
    production_updates_today: number
    gantry_loads_today: number
  }
}

interface LiveEvent {
  type: string
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

const formatNumber = (num: number) => new Intl.NumberFormat('en-NG').format(Math.round(num))
const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })
const shortDay = (dateStr: string) => new Date(dateStr).toLocaleDateString('en-NG', { day: '2-digit', month: 'short' })
const formatLagosTime = (date: Date) => date.toLocaleString('en-NG', { timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
const lagosHour = (date: Date) => Number(new Intl.DateTimeFormat('en-NG', { timeZone: 'Africa/Lagos', hour: 'numeric', hour12: false }).format(date))
const formatRelative = (ts: string) => {
  const minutes = Math.floor((Date.now() - new Date(ts).getTime()) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return `${Math.floor(hours / 24)} d ago`
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
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([])

  const navRefs = useRef<Array<HTMLButtonElement | null>>([])
  const menuRef = useRef<HTMLDivElement>(null)
  const canManage = user?.role === 'operations_manager' || user?.role === 'executive'
  const isOperationsManager = user?.role === 'operations_manager'
  const visibleSections = SECTIONS.filter((section) => !(['reports', 'integration'].includes(section.id) && (user?.role === 'trading_desk' || user?.role === 'regulatory')))

  /* Clock and relative times refresh continuously */
  useEffect(() => {
    const interval = setInterval(() => setNigeriaTime(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  /* Greeting follows Africa/Lagos time */
  const hour = lagosHour(nigeriaTime)
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = (user?.full_name || '').split(' ')[0]
  const lagosDateLabel = nigeriaTime.toLocaleString('en-NG', { timeZone: 'Africa/Lagos', day: '2-digit', month: 'short', year: 'numeric' })

  /* Data fetching: unchanged endpoints and auth behaviour */
  const fetchDashboard = useCallback(async () => {
    if (!token) return
    const res = await fetch(`${API_BASE}/dashboard/today`, { headers: getAuthHeaders(token) })
    if (res.ok) setDashboardData(await res.json())
  }, [token])

  const fetchReconciliations = useCallback(async () => {
    if (!token) return
    const res = await fetch(`${API_BASE}/reconciliations`, { headers: getAuthHeaders(token) })
    if (res.ok) setReconciliations((await res.json()) || [])
  }, [token])

  const fetchLedger = useCallback(async () => {
    if (!token) return
    const res = await fetch(`${API_BASE}/ledger`, { headers: getAuthHeaders(token) })
    if (res.ok) setLedgerEntries((await res.json()) || [])
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
    if (summaryRes.ok) setAnalyticsSummary(await summaryRes.json())
    if (trendRes.ok) setTrendData((await trendRes.json()) || [])
    if (alertsRes.ok) setAlertsSummary(await alertsRes.json())
    if (productsRes.ok) setProductData(await productsRes.json())
    if (crudeRes.ok) setCrudeSources((await crudeRes.json()) || [])
    if (distributorsRes.ok) setDistributors((await distributorsRes.json()) || [])
  }, [token])

  useEffect(() => {
    fetchDashboard(); fetchReconciliations(); fetchLedger(); fetchAnalyticsData()
    const interval = setInterval(() => { fetchDashboard(); fetchReconciliations(); fetchLedger(); fetchAnalyticsData() }, 30000)
    return () => clearInterval(interval)
  }, [fetchDashboard, fetchReconciliations, fetchLedger, fetchAnalyticsData])

  /* SSE: same URL, same event listeners */
  useEffect(() => {
    if (!token) return
    const eventSource = new EventSource(`${API_BASE}/events?token=${encodeURIComponent(token)}`)
    eventSource.onopen = () => setSseConnected(true)
    eventSource.addEventListener('dashboard_update', (event) => {
      setDashboardData(JSON.parse(event.data))
    })
    eventSource.addEventListener('sim_event', (event) => {
      const payload = JSON.parse(event.data) as LiveEvent
      setLiveEvents((prev) => [payload, ...prev].slice(0, 50))
      fetchDashboard()
    })
    eventSource.onerror = () => setSseConnected(false)
    return () => eventSource.close()
  }, [token, fetchDashboard])

  useEffect(() => {
    if (!token) return
    fetch(`${API_BASE}/simulation/status`, { headers: getAuthHeaders(token) })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => setSimulationStatus(data))
      .catch(() => setSimulationStatus(null))
  }, [token])

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

  const refetchAll = async () => {
    if (!token) return
    setRefreshing(true)
    fetchDashboard(); fetchReconciliations(); fetchLedger(); fetchAnalyticsData()
    window.setTimeout(() => setRefreshing(false), 320)
  }

  const acknowledgeAlert = async (id: string) => {
    if (!token) return
    await fetch(`${API_BASE}/alerts/${id}/acknowledge`, { method: 'PATCH', headers: getAuthHeaders(token) })
    fetchDashboard(); fetchReconciliations(); fetchLedger(); fetchAnalyticsData()
  }

  const dismissAlert = (id: string) => setDismissedAlerts((prev) => [...prev, id])

  const seedData = async () => {
    if (!token) return
    await fetch(`${API_BASE}/seed`, { method: 'POST', headers: getAuthHeaders(token) })
    fetchReconciliations(); fetchLedger(); fetchDashboard(); fetchAnalyticsData()
  }

  const runReconciliation = async () => {
    if (!token) return
    await fetch(`${API_BASE}/reconcile/run`, { method: 'POST', headers: getAuthHeaders(token) })
    fetchReconciliations(); fetchLedger(); fetchDashboard(); fetchAnalyticsData()
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
    fetchReconciliations()
  }

  const controlSimulation = async (action: 'pause' | 'resume' | 'close_day') => {
    if (!token) return
    const res = await fetch(`${API_BASE}/simulation/control`, {
      method: 'POST',
      headers: { ...getAuthHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    if (res.ok) {
      const data = await res.json()
      setSimulationStatus(data)
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
  const fulfillmentTone = dashboardData ? statusTone(dashboardData.status) : 'white' as KPITone
  const openAlerts = (dashboardData?.alerts || []).filter((alert) => !dismissedAlerts.includes(alert.id))
  const latestProductionEvent = liveEvents.find((event) => event.type === 'production_update')
  const unitRows = (latestProductionEvent?.data.units as Array<Record<string, any>> | undefined) || []
  const chartData = reconciliations.slice(0, 7).reverse().map((rec) => {
    const scale = Math.max(rec.commitment_target_litres || DAILY_TARGET_LITRES, rec.actual_output_litres) * 1.06
    return {
      date: shortDay(rec.reconciliation_date),
      actual: rec.actual_output_litres,
      target: rec.commitment_target_litres || DAILY_TARGET_LITRES,
      scale,
      status: rec.status,
    }
  })
  const widgetStagger = (index: number): CSSProperties => ({ ['--stagger' as string]: `${index * 40}ms` })
  const ledgerPillFor = (entry: LedgerEntry) => {
    const match = reconciliations.find((rec) => rec.id === entry.reconciliation_id)
    return match ? match.status : 'Sealed'
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
          <div className="glass-tile dash-fulfillment" title="Today's fulfillment">
            <span className="dash-fulfillment__dot" data-tone={fulfillmentTone} />
            <strong>{fulfillment === null ? '--' : `${fulfillment.toFixed(1)}%`}</strong>
            <span>fulfilled</span>
          </div>
          <div className="glass-tile dash-clock">
            <strong>{formatLagosTime(nigeriaTime)}</strong>
            <span>WAT</span>
          </div>
          <RippleButton
            type="button"
            className={`circle-btn dash-header__btn dash-header__btn--refresh ${refreshing ? 'is-spinning' : ''}`}
            aria-label="Refresh all data"
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
          {shownTab === 'overview' && <OverviewBoard />}
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

  function OverviewBoard() {
    return (
      <div className="board__grid">
        {/* Today at a glance (tall) */}
        <GlassWidget icon={Gauge} title="Today at a glance" className="w-tall" style={widgetStagger(0)}>
          <Donut
            id="overview-fulfillment"
            value={fulfillment ?? 0}
            size={148}
            stroke={12}
            color={fulfillmentTone === 'green' ? 'var(--green-400)' : fulfillmentTone === 'amber' ? 'var(--amber)' : 'var(--red)'}
          >
            {fulfillment === null ? <strong>Waiting</strong> : <strong>{`${fulfillment.toFixed(1)}%`}</strong>}
            <span>of the 35M target</span>
          </Donut>
          {dashboardData && <StatusPill status={dashboardData.status} />}
          <div className="mini-tiles-3">
            <KPITile label="Crude intake" value={dashboardData?.crude_intake_barrels ?? null} unit="barrels" tone="blue" size="sm" />
            <KPITile label="Actual output" value={dashboardData?.actual_output_litres ?? null} unit="litres" tone="green" size="sm" />
            <KPITile label="Trucks loaded" value={dashboardData?.trucks_loaded ?? null} unit="today" tone="white" size="sm" />
          </div>
        </GlassWidget>

        {/* Alerts */}
        <GlassWidget icon={Bell} title="Alerts" badge={openAlerts.length || null} className="w-body" style={widgetStagger(1)}>
          {openAlerts.length === 0 && <p className="widget-empty">No open alerts. Production is on track.</p>}
          {openAlerts.map((alert) => (
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
                  <RippleButton type="button" className="round-mini" aria-label="Acknowledge alert" onClick={() => acknowledgeAlert(alert.id)}>
                    <Check size={14} strokeWidth={2} />
                  </RippleButton>
                )}
                <RippleButton type="button" className="round-mini" aria-label="Dismiss alert from view" onClick={() => dismissAlert(alert.id)}>
                  <X size={14} strokeWidth={2} />
                </RippleButton>
              </span>
            </div>
          ))}
        </GlassWidget>

        {/* Live activity */}
        <GlassWidget
          icon={Activity}
          title="Live activity"
          badge={liveEvents.length || null}
          className="w-body w-collapse"
          action="none"
          style={widgetStagger(2)}
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

        {/* 7-day trend */}
        <GlassWidget icon={ChartLine} title="7 day trend" className="w-body w-trend" style={widgetStagger(3)}>
          {chartData.length === 0 && <p className="widget-empty">No reconciliation data available.</p>}
          {chartData.length > 0 && (
            <div className="bar-chart" role="img" aria-label="Output against the daily target for the last seven days">
              <span className="bar-chart__line" style={{ bottom: `${(chartData[0].target / chartData[0].scale) * 100}%` }} />
              <div className="bar-chart__bars">
                {chartData.map((day, index) => (
                  <span key={day.date} className="bar-slot">
                    <i
                      className="bar-fill"
                      data-status={day.status.toLowerCase()}
                      style={{ height: `${(day.actual / day.scale) * 100}%`, ['--stagger' as string]: `${index * 40}ms` }}
                    />
                    <em>{day.date}</em>
                  </span>
                ))}
              </div>
            </div>
          )}
        </GlassWidget>

        {/* Production units */}
        <GlassWidget icon={Factory} title="Production units" className="w-body" style={widgetStagger(4)}>
          {unitRows.length === 0 && <p className="widget-empty">Waiting for the next reading.</p>}
          {unitRows.map((unit) => (
            <div key={String(unit.unit_name)} className="unit-row">
              <span className="unit-row__dot" data-status={String(unit.status).toLowerCase()} />
              <span className="unit-row__name">{String(unit.unit_name)}</span>
              <span className="unit-row__bar"><i style={{ width: `${Math.round(Number(unit.yield_percentage) || 0)}%` }} /></span>
              <strong>{Math.round(Number(unit.yield_percentage) || 0)}%</strong>
            </div>
          ))}
          {unitRows.length === 0 && (
            <div className="glass-mini-list">
              {['CDU-1', 'CDU-2', 'CDU-3'].map((unit) => (
                <div key={unit} className="unit-row"><span className="unit-row__dot" /><span className="unit-row__name">{unit}</span><span className="unit-row__bar" /><strong>--</strong></div>
              ))}
            </div>
          )}
        </GlassWidget>

        {/* Verified ledger */}
        <GlassWidget icon={Link2} title="Verified ledger" badge={ledgerEntries.length || null} className="w-body" style={widgetStagger(5)}>
          {(ledgerExpanded ? ledgerEntries : ledgerEntries.slice(0, 5)).map((entry) => (
            <div key={entry.id} className="ledger-row">
              <span className="ledger-row__date">{formatDate(entry.entry_date)}</span>
              <span className="hash-chip">{entry.content_hash.slice(0, 12)}</span>
              <StatusPill status={ledgerPillFor(entry)} />
            </div>
          ))}
          {ledgerEntries.length === 0 && <p className="widget-empty">No ledger entries yet.</p>}
          {ledgerEntries.length > 5 && (
            <button type="button" className="expand-link" onClick={() => setLedgerExpanded((open) => !open)}>
              {ledgerExpanded ? 'Show recent entries' : `Show all ${ledgerEntries.length} entries`}
            </button>
          )}
          <span className="trust-line"><ShieldCheck size={14} strokeWidth={1.75} /> Hash-chained and immutable.</span>
        </GlassWidget>

        {/* Reconciliation history (wide) */}
        <GlassWidget
          icon={ClipboardList}
          title="Reconciliation history"
          className="w-body w-wide"
          action="add"
          actionLabel={canManage ? 'Add a note' : undefined}
          onAction={canManage ? () => {
            const first = reconciliations[0]
            if (!first) return
            const key = first.reconciliation_date.slice(0, 10)
            setNoteOpen((prev) => ({ ...prev, [key]: true }))
            if (!noteDrafts[key]) setNoteDrafts((prev) => ({ ...prev, [key]: first.notes || '' }))
          } : undefined}
          style={widgetStagger(6)}
        >
          {reconciliations.length === 0 && <p className="widget-empty">No reconciliation records found.</p>}
          {reconciliations.length > 0 && (
            <div className="table-scroll">
              <table>
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
                  {reconciliations.map((rec) => {
                    const cleanDate = rec.reconciliation_date.slice(0, 10)
                    return (
                      <tr key={rec.id}>
                        <td>{formatDate(rec.reconciliation_date)}</td>
                        <td>{formatNumber(rec.crude_intake_total_barrels)}</td>
                        <td>{formatNumber(rec.expected_output_litres)}</td>
                        <td>{formatNumber(rec.actual_output_litres)}</td>
                        <td>{rec.trucks_loaded}</td>
                        <td className="num">{rec.fulfillment_percentage.toFixed(1)}%</td>
                        <td><StatusPill status={rec.status} /></td>
                        <td>
                          {canManage ? (
                            <span className="note-cell">
                              <button type="button" className="note-link" onClick={() => {
                                setNoteOpen((prev) => ({ ...prev, [cleanDate]: !prev[cleanDate] }))
                                if (!noteDrafts[cleanDate]) setNoteDrafts((prev) => ({ ...prev, [cleanDate]: rec.notes || '' }))
                              }}>
                                <StickyNote size={13} strokeWidth={1.75} />
                                {rec.notes ? 'Edit' : 'Add'}
                              </button>
                              {noteOpen[cleanDate] && (
                                <span className="note-editor">
                                  <textarea
                                    value={noteDrafts[cleanDate] ?? rec.notes ?? ''}
                                    onChange={(event) => setNoteDrafts((prev) => ({ ...prev, [cleanDate]: event.target.value }))}
                                    rows={3}
                                  />
                                  <RippleButton type="button" className="note-save" onClick={() => saveNote(rec.reconciliation_date, noteDrafts[cleanDate] ?? '')}>Save</RippleButton>
                                </span>
                              )}
                              {(rec.notes && !noteOpen[cleanDate]) && <span className="note-value">{rec.notes}</span>}
                            </span>
                          ) : (rec.notes || '--') }
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </GlassWidget>

        {/* Simulation control (operations manager only) */}
        {isOperationsManager && (
          <GlassWidget icon={Radio} title="Simulation control" className="w-body w-wide" style={widgetStagger(7)}>
            <div className="sim-rows">
              <div className="sim-toggle-row">
                <span className="sim-label" id="sim-toggle-label">Simulation running</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={Boolean(simulationStatus?.running)}
                  aria-labelledby="sim-toggle-label"
                  className={`sim-switch ${simulationStatus?.running ? 'is-on' : ''}`}
                  onClick={() => controlSimulation(simulationStatus?.running ? 'pause' : 'resume')}
                >
                  <span className="sim-switch__knob" />
                </button>
                <StatusPill status={simulationStatus ? (simulationStatus.running ? 'Simulated' : 'Offline') : 'Offline'} />
              </div>

              <div className="sim-rows__actions">
                {closeDayConfirm ? (
                  <>
                    <span className="sim-confirm-text">Seal today as a closed day and lock the record?</span>
                    <RippleButton type="button" className="pill-btn pill-btn--solid" onClick={() => { controlSimulation('close_day'); setCloseDayConfirm(false) }}>Confirm close day</RippleButton>
                    <RippleButton type="button" className="pill-btn" onClick={() => setCloseDayConfirm(false)}>Cancel</RippleButton>
                  </>
                ) : (
                  <RippleButton type="button" className="pill-btn" onClick={() => setCloseDayConfirm(true)}>Close day</RippleButton>
                )}
                <RippleButton type="button" className="pill-btn" onClick={seedData}>Seed 7 days</RippleButton>
                <RippleButton type="button" className="pill-btn" onClick={runReconciliation}>Run today's reconciliation</RippleButton>
              </div>

              <div className="stat-chips">
                <span className="stat-chip">Crude intakes <strong>{simulationStatus?.stats?.crude_intake_today ?? 0}</strong></span>
                <span className="stat-chip">Production updates <strong>{simulationStatus?.stats?.production_updates_today ?? 0}</strong></span>
                <span className="stat-chip">Gantry loads <strong>{simulationStatus?.stats?.gantry_loads_today ?? 0}</strong></span>
                <span className="stat-chip">Mode <strong>{simulationStatus?.mode ? simulationStatus.mode.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Off'}</strong></span>
              </div>
            </div>
          </GlassWidget>
        )}
      </div>
    )
  }

  /* Analytics, distribution, reports and integration sections share the same
     glass widget language. */
  function AnalyticsBoard() { return <AnalyticsSection analyticsSummary={analyticsSummary} trendData={trendData} alertsSummary={alertsSummary} /> }
  function DistributionBoard() { return <DistributionSection {...{ productData, crudeSources, distributors, formatNumber }} /> }
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
  function IntegrationBoard() { return <IntegrationSection {...{ simulationStatus }} /> }
}function latestEventLine(event: LiveEvent | undefined) {
  if (!event) return 'Waiting for live sensor activity'
  return eventLine(event)
}

function eventLine(event: LiveEvent) {
  const data = event.data || {}
  if (event.type === 'crude_intake') {
    return `${data.tanker_id}: ${data.volume_barrels ? Math.round(Number(data.volume_barrels)).toLocaleString() : 'Not available'} barrels of ${data.crude_type} from ${data.source_country}`
  }
  if (event.type === 'gantry_load') {
    return `${data.distributor_name} loaded ${data.volume_litres ? Math.round(Number(data.volume_litres)).toLocaleString() : 'Not available'}L of ${data.product_type} at ${data.gantry_id}`
  }
  return `Production update: ${data.combined_output_litres ? Math.round(Number(data.combined_output_litres)).toLocaleString() : 'Not available'}L total output so far today`
}

function reducedOr(natural: number, reduced: number) {
  return prefersReducedMotion() ? reduced : natural
}

/* Section boards: analytics and distribution live in their own modules,
   reports and integration here for cohesion. */
function AnalyticsSection({ analyticsSummary, trendData, alertsSummary }: any) {
  return (
    <div className="board__grid">
      <GlassWidget icon={ChartLine} title="Commitment summary" className="w-wide" style={widgetStaggerLocal(0)}>
        <div className="mini-tiles-4">
          <KPITile label="Days recorded" value={analyticsSummary ? Number(analyticsSummary.total_days_recorded) : null} unit="records" tone="white" size="sm" />
          <KPITile label="Hit rate" value={analyticsSummary ? Number(analyticsSummary.commitment_hit_rate_percentage) : null} unit="percent of days fulfilled" tone="green" size="sm" />
          <KPITile label="Average fulfillment" value={analyticsSummary ? Number(analyticsSummary.average_fulfillment_percentage) : null} unit="average" tone="blue" size="sm" />
          <KPITile label="Best day" value={analyticsSummary ? Number(analyticsSummary.best_day.fulfillment_percentage) : null} unit={analyticsSummary ? formatDate(analyticsSummary.best_day.date) : 'Not available'} tone="green" size="sm" />
        </div>
        <div className="mini-tiles-4">
          <KPITile label="Worst day" value={analyticsSummary ? Number(analyticsSummary.worst_day.fulfillment_percentage) : null} unit={analyticsSummary ? formatDate(analyticsSummary.worst_day.date) : 'Not available'} tone="red" size="sm" />
          <KPITile label="Total crude intake" value={analyticsSummary ? Number(analyticsSummary.total_crude_intake_barrels) : null} unit="barrels" tone="blue" size="sm" />
          <KPITile label="Total output" value={analyticsSummary ? Number(analyticsSummary.total_actual_output_litres) : null} unit="litres" tone="green" size="sm" />
          <KPITile label="Total trucks loaded" value={analyticsSummary ? Number(analyticsSummary.total_trucks_loaded) : null} unit="trucks" tone="white" size="sm" />
        </div>
      </GlassWidget>

      <GlassWidget icon={ChartLine} title="30 day trend" className="w-wide w-body" style={widgetStaggerLocal(1)}>
        {trendData.length === 0 && <p className="widget-empty">No trend data available.</p>}
        {trendData.length > 0 && (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="date" stroke="rgba(255,255,255,0.55)" fontSize={12} tickFormatter={(value: string) => shortDay(value)} />
              <YAxis stroke="rgba(255,255,255,0.55)" fontSize={12} tickFormatter={(value: number) => `${Math.round(value / 1000000)}M`} />
              <Tooltip contentStyle={{ backgroundColor: 'rgba(7,37,22,0.92)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 12, color: 'var(--white)' }} formatter={(value: any, name: any) => [formatNumber(Number(value)), name === 'actual_output_litres' ? 'Actual output' : 'Expected output']} />
              <ReferenceLine y={DAILY_TARGET_LITRES} stroke="var(--blue-300)" strokeDasharray="5 5" label={{ value: 'Daily target', fill: 'var(--blue-300)', position: 'insideTopRight' }} />
              <Line type="monotone" dataKey="actual_output_litres" stroke="#3ccf82" strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="expected_output_litres" stroke="rgba(255,255,255,0.55)" strokeWidth={2} strokeDasharray="5 5" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </GlassWidget>

      <GlassWidget icon={Bell} title="Alerts summary" className="w-wide w-body" style={widgetStaggerLocal(2)}>
        {!alertsSummary && <p className="widget-empty">No alert summary available.</p>}
        {alertsSummary && (
          <>
            <div className="mini-tiles-4">
              <KPITile label="Total" value={Number(alertsSummary.total_alerts)} size="sm" tone="white" />
              <KPITile label="Critical" value={Number(alertsSummary.critical_alerts)} size="sm" tone="red" />
              <KPITile label="Warning" value={Number(alertsSummary.warning_alerts)} size="sm" tone="amber" />
              <KPITile label="Not acknowledged" value={Number(alertsSummary.unacknowledged_alerts)} size="sm" tone="blue" />
            </div>
            <div className="mini-chart-wrap">
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={alertsSummary.alerts_by_week || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                  <XAxis dataKey="week_start" stroke="rgba(255,255,255,0.55)" fontSize={11} tickFormatter={(value: string) => shortDay(value)} />
                  <YAxis stroke="rgba(255,255,255,0.55)" fontSize={11} allowDecimals={false} />
                  <Tooltip contentStyle={{ backgroundColor: 'rgba(7,37,22,0.92)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 12, color: 'var(--white)' }} />
                  <Bar dataKey="count" fill="#3ccf82" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </GlassWidget>
    </div>
  )
}

function DistributionSection({ productData, crudeSources, distributors }: any) {
  const products = [
    { key: 'Petrol', color: '#3ccf82' },
    { key: 'Diesel', color: '#2f7cf0' },
    { key: 'Kerosene', color: 'rgba(255,255,255,0.7)' },
  ]
  return (
    <div className="board__grid">
      <GlassWidget icon={Fuel} title="Product breakdown" className="w-wide w-body" style={widgetStaggerLocal(0)}>
        {!productData && <p className="widget-empty">No product data available.</p>}
        {productData && products.map((entry) => {
          const product = productData[entry.key]
          const width = productData.grand_total_volume_litres > 0 ? (product.total_volume_litres / productData.grand_total_volume_litres) * 100 : 0
          return (
            <div key={entry.key} className="product-row">
              <span className="product-row__head">
                <strong>{entry.key}</strong>
                <span>{formatNumber(product.total_volume_litres)} litres, {product.total_trucks} trucks, {product.percentage_of_total.toFixed(2)} percent</span>
              </span>
              <span className="product-row__bar"><i style={{ width: `${width}%`, background: entry.color }} /></span>
            </div>
          )
        })}
      </GlassWidget>

      <GlassWidget icon={Ship} title="Crude sources" className="w-wide w-body" style={widgetStaggerLocal(1)}>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Source country</th><th>Barrels</th><th>Shipments</th><th>Share</th><th>Crude types</th></tr></thead>
            <tbody>
              {(crudeSources || []).sort((a: any, b: any) => b.total_volume_barrels - a.total_volume_barrels).map((source: any) => (
                <tr key={source.source_country}>
                  <td>{source.source_country}</td>
                  <td className="num">{formatNumber(source.total_volume_barrels)}</td>
                  <td className="num">{source.shipment_count}</td>
                  <td className="num">{source.percentage_of_total.toFixed(2)}%</td>
                  <td>{source.crude_types.map((c: any) => `${c.crude_type} (${c.shipment_count})`).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassWidget>

      <GlassWidget icon={Truck} title="Top distributors" className="w-wide w-body" style={widgetStaggerLocal(2)}>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Rank</th><th>Distributor</th><th>Volume</th><th>Trucks</th><th>Regions served</th><th>Top product</th></tr></thead>
            <tbody>
              {Array.isArray(distributors) && distributors.map((dist: any, idx: number) => (
                <tr key={dist.distributor_id}>
                  <td>#{idx + 1}</td>
                  <td>{dist.distributor_name}</td>
                  <td className="num">{formatNumber(dist.total_volume_litres)}</td>
                  <td className="num">{dist.total_trucks}</td>
                  <td>{Array.isArray(dist.regions_served) ? dist.regions_served.join(', ') : ''}</td>
                  <td>{dist.top_product}</td>
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
    <div className="board__grid">
      <GlassWidget
        icon={FileText}
        title="Operational reports"
        className="w-wide w-body"
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
    interval: 'Every 40 seconds (dev) / 4 hours (production)',
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

function IntegrationSection({ simulationStatus }: any) {
  const running = Boolean(simulationStatus?.running)
  const badgeFor = (index: number) => {
    if (index === 3) return 'Not connected'
    return running ? 'Simulated' : 'Offline'
  }
  return (
    <div className="board__grid">
      {INTEGRATION_CARDS.map((card, index) => (
        <GlassWidget
          key={card.title}
          icon={card.icon}
          title={card.title}
          className="w-body w-source"
          badge={badgeFor(index)}
          badgeTone={index === 3 ? 'red' : running ? 'green' : 'amber'}
          style={widgetStaggerLocal(index)}
        >
          <p className="widget-copy">{card.description}</p>
          <dl className="spec-list">
            <div><dt>Feed cadence</dt><dd>{card.interval}</dd></div>
            <div><dt>Production integration</dt><dd>{card.next}</dd></div>
          </dl>
        </GlassWidget>
      ))}

      <GlassWidget icon={Cable} title="Architecture and ingest" className="w-wide w-body" style={widgetStaggerLocal(4)}>
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

/* Imports used across sections */
