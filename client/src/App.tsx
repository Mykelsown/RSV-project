import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LineChart, Line, ReferenceLine } from 'recharts'
import { Navigate, Route, Routes } from 'react-router-dom'
import './App.css'
import { AuthProvider, useAuth } from './auth/AuthContext'
import LandingPage from './LandingPage'
import LoginPage from './LoginPage'
import LiveDot from './components/LiveDot'
import KPICard from './components/KPICard'
import PanelCard from './components/PanelCard'
import StatusPill from './components/StatusPill'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api/v1'

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

const dashboardSections = [
  { id: 'overview', label: 'Overview', description: 'Live production data and alerts', icon: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z' },
  { id: 'analytics', label: 'Analytics', description: 'Trends, KPIs, and alert history', icon: 'M3 17 8 12l4 3 8-9m-6 0h6v6' },
  { id: 'distribution', label: 'Crude & Distribution', description: 'Sources, products, distributors', icon: 'M3 7h18M5 7l1 13h12l1-13M9 7V4h6v3m-5 5v4m4-4v4' },
  { id: 'reports', label: 'Reports', description: 'Generate verified period reports', icon: 'M6 3h9l4 4v14H6zM14 3v5h5M9 12h7m-7 4h7' },
  { id: 'integration', label: 'Integration', description: 'Data source connections', icon: 'M12 3v5m0 8v5m-9-9h5m8 0h5m-13-5 3 3m4 4 3 3m0-10-3 3m-4 4-3 3' },
] as const

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { token, user } = useAuth()
  if (!token || !user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function RoleRoute({ children, allowedRoles }: { children: ReactNode; allowedRoles: string[] }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (!allowedRoles.includes(user.role)) {
    return <Navigate to={user.role === 'regulatory' ? '/regulatory' : '/dashboard'} replace />
  }
  return <>{children}</>
}

function DashboardPage() {
  const { token, user, logout } = useAuth()
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null)
  const [reconciliations, setReconciliations] = useState<Reconciliation[]>([])
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([])
  const [sseConnected, setSseConnected] = useState(false)
  const [nigeriaTime, setNigeriaTime] = useState(new Date())
  const [ledgerExpanded, setLedgerExpanded] = useState(false)
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({})
  const [noteOpen, setNoteOpen] = useState<Record<string, boolean>>({})
  const [activeTab, setActiveTab] = useState<'overview' | 'analytics' | 'distribution' | 'reports' | 'integration'>('overview')
  const [contentVisible, setContentVisible] = useState(false)
  const sectionNavRef = useRef<HTMLDivElement>(null)
  const sectionCardRefs = useRef(new Map<string, HTMLButtonElement>())
  const visibleSections = dashboardSections.filter((section) => !(['reports', 'integration'].includes(section.id) && (user?.role === 'trading_desk' || user?.role === 'regulatory')))
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
  const [activityFeedCollapsed, setActivityFeedCollapsed] = useState(false)

  useEffect(() => {
    const root = sectionNavRef.current
    if (!root) return
    const observer = new IntersectionObserver((entries) => {
      const centered = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
      const section = centered?.target.getAttribute('data-section')
      if (section) setActiveTab(section as typeof activeTab)
    }, { root, rootMargin: '-42% 0px -42% 0px', threshold: [0, 0.2, 0.5, 1] })
    sectionCardRefs.current.forEach((card) => observer.observe(card))
    return () => observer.disconnect()
  }, [user?.role])

  useEffect(() => {
    setContentVisible(false)
    const frame = requestAnimationFrame(() => setContentVisible(true))
    return () => cancelAnimationFrame(frame)
  }, [activeTab])

  useEffect(() => { const interval = setInterval(() => setNigeriaTime(new Date()), 1000); return () => clearInterval(interval) }, [])

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
    const d = new Date(value)
    const first = new Date(d.getFullYear(), d.getMonth(), 1)
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0)
    setReportStart(first.toISOString().slice(0, 10))
    setReportEnd(last.toISOString().slice(0, 10))
  }

  useEffect(() => {
    const today = new Date()
    const defaultWeek = new Date(today)
    syncWeeklyRange(defaultWeek.toISOString().slice(0, 10))
  }, [])

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

  useEffect(() => {
    if (!token) return
    const eventSource = new EventSource(`${API_BASE}/events?token=${encodeURIComponent(token)}`)
    eventSource.onopen = () => setSseConnected(true)
    eventSource.addEventListener('dashboard_update', (event) => {
      const data = JSON.parse(event.data)
      setDashboardData(data)
    })
    eventSource.addEventListener('sim_event', (event) => {
      const payload = JSON.parse(event.data) as LiveEvent
      setLiveEvents((prev) => [payload, ...prev].slice(0, 50))
      fetchDashboard()
    })
    eventSource.onerror = () => setSseConnected(false)
    return () => eventSource.close()
  }, [token])

  useEffect(() => {
    if (!token) return
    fetch(`${API_BASE}/simulation/status`, { headers: getAuthHeaders(token) })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => setSimulationStatus(data))
      .catch(() => setSimulationStatus(null))
  }, [token])

  const acknowledgeAlert = async (id: string) => {
    if (!token) return
    await fetch(`${API_BASE}/alerts/${id}/acknowledge`, { method: 'PATCH', headers: getAuthHeaders(token) })
    fetchDashboard(); fetchReconciliations(); fetchLedger(); fetchAnalyticsData()
  }

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
        body: JSON.stringify({
          report_type: reportType,
          start_date: reportStart,
          end_date: reportEnd,
          format: reportFormat,
        }),
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

  const formatNigeriaTime = (date: Date) => date.toLocaleString('en-NG', { timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
  const formatNigeriaDate = (date: Date) => date.toLocaleString('en-NG', { timeZone: 'Africa/Lagos', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
  const formatNumber = (num: number) => new Intl.NumberFormat('en-NG').format(Math.round(num))
  const formatCompactNumber = (num: number) => new Intl.NumberFormat('en-NG', { notation: 'compact', maximumFractionDigits: 1 }).format(num)
  const formatHash = (hash: string) => hash.substring(0, 16) + '...'
  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })

  const getFulfillmentColor = (pct: number) => { if (pct >= 95) return 'text-green-400'; if (pct >= 75) return 'text-amber-400'; return 'text-red-400' }

  const chartData = reconciliations.slice(0, 7).reverse().map((r) => ({ date: formatDate(r.reconciliation_date), fulfillment: r.fulfillment_percentage, status: r.status }))

  const overviewContent = (
    <>
      <main className="overview-layout max-w-7xl mx-auto p-6 space-y-6">
        {user?.role === 'operations_manager' && (
          <div className="flex flex-wrap gap-4 overview-actions">
            <button onClick={seedData} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors">Seed 7 Days Data</button>
            <button onClick={runReconciliation} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-medium transition-colors">Run Today's Reconciliation</button>
            <button onClick={() => controlSimulation('pause')} className="bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 rounded-lg font-medium transition-colors">Pause Simulation</button>
            <button onClick={() => controlSimulation('resume')} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg font-medium transition-colors">Resume Simulation</button>
            <button onClick={() => controlSimulation('close_day')} className="bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 rounded-lg font-medium transition-colors">Close Day</button>
          </div>
        )}

        <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 overview-simulation">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <div className="text-sm text-slate-400">Live simulation status</div>
              <div className="text-lg font-semibold text-white">{simulationStatus ? (simulationStatus.running ? 'Active' : 'Offline') : 'Unknown'}</div>
            </div>
            <div className="text-sm text-slate-300">
              Mode: <span className="font-semibold text-white">{simulationStatus?.mode?.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()) || 'Off'}</span> · Events: <span className="font-semibold text-white">{simulationStatus?.stats?.events_total ?? 0}</span>
            </div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3 text-sm text-slate-300">
            <div className="rounded-lg bg-slate-900 p-3">Crude intakes: <span className="text-white font-semibold">{simulationStatus?.stats?.crude_intake_today ?? 0}</span></div>
            <div className="rounded-lg bg-slate-900 p-3">Production updates: <span className="text-white font-semibold">{simulationStatus?.stats?.production_updates_today ?? 0}</span></div>
            <div className="rounded-lg bg-slate-900 p-3">Gantry loads: <span className="text-white font-semibold">{simulationStatus?.stats?.gantry_loads_today ?? 0}</span></div>
          </div>
        </div>

        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden overview-activity">
          <button
            onClick={() => setActivityFeedCollapsed((prev) => !prev)}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-700/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-base font-semibold">Live Activity Feed</span>
              {liveEvents.length > 0 && (
                <span className="rounded-full bg-cyan-600 px-2 py-0.5 text-xs font-bold text-white">
                  {liveEvents.length}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {activityFeedCollapsed && liveEvents.length > 0 && (
                <span className="text-xs text-slate-400 truncate max-w-xs">
                  {liveEvents[0].type === 'crude_intake'
                    ? `${liveEvents[0].data.tanker_id}: ${liveEvents[0].data.volume_barrels ? Math.round(Number(liveEvents[0].data.volume_barrels)).toLocaleString() : 'Not available'} bbls`
                    : liveEvents[0].type === 'gantry_load'
                    ? `${liveEvents[0].data.distributor_name}: ${liveEvents[0].data.product_type}`
                    : `Production update: ${liveEvents[0].data.combined_output_litres ? Math.round(Number(liveEvents[0].data.combined_output_litres)).toLocaleString() : 'Not available'} L`}
                </span>
              )}
              {activityFeedCollapsed && liveEvents.length === 0 && (
                <span className="text-xs text-slate-500">Waiting for live data...</span>
              )}
              <svg
                className={`w-4 h-4 text-slate-400 transition-transform ${activityFeedCollapsed ? '' : 'rotate-180'}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </button>

          {!activityFeedCollapsed && (
            <div className="px-4 pb-4 space-y-2 max-h-80 overflow-y-auto">
              {liveEvents.length === 0 ? (
                <div className="text-slate-500 text-sm py-4 text-center">Waiting for live sensor activity...</div>
              ) : (
                liveEvents.map((event, index) => (
                  <div
                    key={`${event.type}-${event.timestamp}-${index}`}
                    className={`rounded-lg border p-3 text-sm ${
                      event.type === 'crude_intake'
                        ? 'bg-cyan-900/20 border-cyan-700/40'
                        : event.type === 'gantry_load'
                        ? 'bg-amber-900/20 border-amber-700/40'
                        : 'bg-slate-900 border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          event.type === 'crude_intake' ? 'bg-cyan-400' :
                          event.type === 'gantry_load' ? 'bg-amber-400' : 'bg-slate-400'
                        }`} />
                        <span className="font-medium text-slate-200">
                          {event.type === 'crude_intake'
                            ? `Tanker ${event.data.tanker_id} arrived: ${event.data.volume_barrels ? Math.round(Number(event.data.volume_barrels)).toLocaleString() : 'Not available'} bbls of ${event.data.crude_type} from ${event.data.source_country}`
                            : event.type === 'gantry_load'
                            ? `${event.data.distributor_name} loaded ${event.data.volume_litres ? Math.round(Number(event.data.volume_litres)).toLocaleString() : 'Not available'}L of ${event.data.product_type} at ${event.data.gantry_id}`
                            : `Production update: ${event.data.combined_output_litres ? Math.round(Number(event.data.combined_output_litres)).toLocaleString() : 'Not available'}L total output so far today`}
                        </span>
                      </div>
                      <span className="text-xs text-slate-500 flex-shrink-0">
                        {new Date(event.timestamp).toLocaleTimeString('en-NG', {
                          timeZone: 'Africa/Lagos',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                          hour12: true,
                        })}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 overview-kpis">
          <KPICard label="Crude Intake Today" value={dashboardData ? formatNumber(dashboardData.crude_intake_barrels) : 'Not available'} unit="barrels" colorVariant="blue" />
          <KPICard label="Actual Output Today" value={dashboardData ? formatNumber(dashboardData.actual_output_litres) : 'Not available'} unit="litres" />
          <KPICard label="Trucks Loaded Today" value={dashboardData ? String(dashboardData.trucks_loaded) : 'Not available'} unit="events" />
          <div className="fulfillment-kpi"><KPICard label="Fulfillment Rate" value={dashboardData ? `${dashboardData.fulfillment_percent.toFixed(1)}%` : 'Not available'} unit={dashboardData?.status.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()) || 'No data'} colorVariant={dashboardData?.status === 'FULFILLED' ? 'green' : dashboardData?.status === 'PARTIAL' ? 'amber' : 'wine'} />{dashboardData && <StatusPill status={dashboardData.status} />}</div>
        </div>

        {dashboardData?.alerts && dashboardData.alerts.length > 0 && (
          <div className="bg-red-900/30 border border-red-500/50 rounded-xl p-4 overview-alerts">
            <div className="flex items-center justify-between mb-3"><h2 className="text-lg font-semibold text-red-400">Active alerts</h2></div>
            <div className="space-y-2">
              {dashboardData.alerts.map((alert) => (
                <div key={alert.id} className="flex items-center justify-between bg-slate-800 rounded-lg p-3">
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${alert.severity === 'CRITICAL' ? 'bg-red-500' : alert.severity === 'WARNING' ? 'bg-amber-500' : 'bg-blue-500'}`}>{alert.severity.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())}</span>
                    <span className="text-slate-300">{alert.message}</span>
                  </div>
                  {(user?.role === 'operations_manager' || user?.role === 'executive') && (
                    <button onClick={() => acknowledgeAlert(alert.id)} className="text-sm bg-slate-700 hover:bg-slate-600 px-3 py-1 rounded transition-colors">Acknowledge</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 overview-chart">
          <h2 className="text-lg font-semibold mb-4">7-Day Fulfillment Trend</h2>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(138, 130, 144, 0.18)" />
                <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={12} />
                <YAxis domain={[0, 100]} stroke="var(--text-muted)" fontSize={12} />
                <Tooltip contentStyle={{ backgroundColor: 'var(--surface-2)', border: '1px solid var(--border-blue)' }} formatter={(value) => [`${Number(value).toFixed(1)}%`, 'Fulfillment']} />
                <Bar dataKey="fulfillment" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.status === 'FULFILLED' ? 'var(--green)' : entry.status === 'PARTIAL' ? 'var(--amber)' : 'var(--wine-bright)'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-slate-500">No reconciliation data available.</div>
          )}
        </div>

        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 overview-history">
          <h2 className="text-lg font-semibold mb-4">Reconciliation History</h2>
          {reconciliations.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-700">
                    <th className="text-left py-3 px-2">Date</th>
                    <th className="text-right py-3 px-2">Crude Intake</th>
                    <th className="text-right py-3 px-2">Expected Output</th>
                    <th className="text-right py-3 px-2">Actual Output</th>
                    <th className="text-right py-3 px-2">Trucks</th>
                    <th className="text-right py-3 px-2">Fulfillment</th>
                    <th className="text-center py-3 px-2">Status</th>
                    <th className="text-center py-3 px-2">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {reconciliations.map((rec) => {
                    const cleanDate = rec.reconciliation_date.slice(0, 10)
                    return (
                      <tr key={rec.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                        <td className="py-3 px-2">{formatDate(rec.reconciliation_date)}</td>
                        <td className="py-3 px-2 text-right font-mono">{formatNumber(rec.crude_intake_total_barrels)}</td>
                        <td className="py-3 px-2 text-right font-mono">{formatNumber(rec.expected_output_litres)}</td>
                        <td className="py-3 px-2 text-right font-mono">{formatNumber(rec.actual_output_litres)}</td>
                        <td className="py-3 px-2 text-right font-mono">{rec.trucks_loaded}</td>
                        <td className="py-3 px-2 text-right font-mono"><span className={getFulfillmentColor(rec.fulfillment_percentage)}>{rec.fulfillment_percentage.toFixed(1)}%</span></td>
                        <td className="py-3 px-2 text-center"><StatusPill status={rec.status} /></td>
                        <td className="py-3 px-2 text-center">
                          {(user?.role === 'operations_manager' || user?.role === 'executive') && (
                            <div className="space-y-2">
                              <button onClick={() => { setNoteOpen((prev) => ({ ...prev, [cleanDate]: !prev[cleanDate] })); if (!noteDrafts[cleanDate]) setNoteDrafts((prev) => ({ ...prev, [cleanDate]: rec.notes || '' })) }} className="bg-slate-700 hover:bg-slate-600 text-xs px-2 py-1 rounded">Add Note</button>
                              {noteOpen[cleanDate] && (
                                <div className="space-y-2 text-left">
                                  <textarea value={noteDrafts[cleanDate] ?? rec.notes ?? ''} onChange={(e) => setNoteDrafts((prev) => ({ ...prev, [cleanDate]: e.target.value }))} className="w-full rounded border border-slate-600 bg-slate-900 p-2 text-xs text-slate-200" rows={3} />
                                  <button onClick={() => saveNote(rec.reconciliation_date, noteDrafts[cleanDate] ?? '')} className="bg-cyan-600 hover:bg-cyan-500 px-2 py-1 rounded text-xs">Save</button>
                                </div>
                              )}
                              {rec.notes && !noteOpen[cleanDate] && <div className="text-left text-xs text-slate-300 bg-slate-900 rounded p-2">{rec.notes}</div>}
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : <div className="text-center py-8 text-slate-500">No reconciliation records found.</div>}
        </div>

        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden overview-ledger">
          <button onClick={() => setLedgerExpanded(!ledgerExpanded)} className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-700/50 transition-colors">
            <div className="flex items-center gap-3"><h2 className="text-lg font-semibold">Verified Output Ledger</h2><span className="text-xs text-slate-500">Records are immutable and hash-chained</span></div>
            <svg className={`w-5 h-5 text-slate-400 transition-transform ${ledgerExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>
          {ledgerExpanded && (
            <div className="px-6 pb-6">
              {ledgerEntries.length > 0 ? (
                <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-slate-400 border-b border-slate-700"><th className="text-left py-3 px-2">Date</th><th className="text-left py-3 px-2">Entry ID</th><th className="text-left py-3 px-2">Content Hash</th><th className="text-left py-3 px-2">Previous Hash</th><th className="text-left py-3 px-2">Written At</th></tr></thead><tbody>{ledgerEntries.map((entry) => (<tr key={entry.id} className="border-b border-slate-700/50"><td className="py-3 px-2">{formatDate(entry.entry_date)}</td><td className="py-3 px-2 font-mono text-xs">{formatHash(entry.id)}</td><td className="py-3 px-2 font-mono text-xs text-green-400">{formatHash(entry.content_hash)}</td><td className="py-3 px-2 font-mono text-xs text-slate-500">{entry.previous_hash === 'GENESIS' ? 'Genesis' : formatHash(entry.previous_hash)}</td><td className="py-3 px-2">{new Date(entry.created_at).toLocaleString()}</td></tr>))}</tbody></table></div>
              ) : <div className="text-center py-8 text-slate-500">No ledger entries found.</div>}
            </div>
          )}
        </div>
      </main>
    </>
  )

  const analyticsContent = (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <SummaryCard title="Total Days Recorded" value={analyticsSummary ? String(analyticsSummary.total_days_recorded) : 'Not available'} unit="records" />
        <SummaryCard title="Commitment Hit Rate" value={analyticsSummary ? `${analyticsSummary.commitment_hit_rate_percentage.toFixed(2)}%` : 'Not available'} unit="fulfilled days / total days" />
        <SummaryCard title="Average Fulfillment" value={analyticsSummary ? `${analyticsSummary.average_fulfillment_percentage.toFixed(2)}%` : 'Not available'} unit="average" />
        <SummaryCard title="Best Day" value={analyticsSummary ? `${analyticsSummary.best_day.fulfillment_percentage.toFixed(1)}%` : 'Not available'} unit={analyticsSummary ? formatDate(analyticsSummary.best_day.date) : 'n/a'} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <SummaryCard title="Worst Day" value={analyticsSummary ? `${analyticsSummary.worst_day.fulfillment_percentage.toFixed(1)}%` : 'Not available'} unit={analyticsSummary ? formatDate(analyticsSummary.worst_day.date) : 'n/a'} />
        <SummaryCard title="Total Crude Intake" value={analyticsSummary ? formatCompactNumber(analyticsSummary.total_crude_intake_barrels) : 'Not available'} unit="barrels" />
        <SummaryCard title="Total Output" value={analyticsSummary ? formatCompactNumber(analyticsSummary.total_actual_output_litres) : 'Not available'} unit="litres" />
        <SummaryCard title="Total Trucks Loaded" value={analyticsSummary ? formatNumber(analyticsSummary.total_trucks_loaded) : 'Not available'} unit="trucks" />
      </div>

      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
        <h2 className="text-lg font-semibold mb-4">30-Day Trend</h2>
        {trendData.length > 0 ? (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(138, 130, 144, 0.18)" />
              <XAxis dataKey="date" stroke="var(--text-muted)" tickFormatter={(value) => new Date(value).toLocaleDateString('en-NG', { month: 'short', day: 'numeric' })} />
              <YAxis stroke="var(--text-muted)" tickFormatter={(value) => `${Math.round(value / 1000000)}M`} />
              <Tooltip contentStyle={{ backgroundColor: 'var(--surface-2)', border: '1px solid var(--border-blue)' }} formatter={(value, name) => [`${formatNumber(Number(value))}`, name === 'actual_output_litres' ? 'Actual Output' : 'Expected Output']} />
              <ReferenceLine y={35000000} stroke="var(--blue-bright)" strokeDasharray="5 5" label={{ value: 'Daily Target', fill: 'var(--blue-bright)', position: 'insideTopRight' }} />
              <Line type="monotone" dataKey="actual_output_litres" stroke="var(--blue-mid)" strokeWidth={3} dot={false} />
              <Line type="monotone" dataKey="expected_output_litres" stroke="var(--text-muted)" strokeWidth={2} strokeDasharray="5 5" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : <div className="h-64 flex items-center justify-center text-slate-500">No trend data available.</div>}
      </div>

      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
        <h2 className="text-lg font-semibold mb-4">Alerts Summary</h2>
        {alertsSummary ? (
          <div className="space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
              <div className="bg-slate-900 rounded-lg p-3"><div className="text-slate-400">Total</div><div className="text-xl font-bold text-white">{alertsSummary.total_alerts}</div></div>
              <div className="bg-slate-900 rounded-lg p-3"><div className="text-slate-400">Critical</div><div className="text-xl font-bold text-red-400">{alertsSummary.critical_alerts}</div></div>
              <div className="bg-slate-900 rounded-lg p-3"><div className="text-slate-400">Warning</div><div className="text-xl font-bold text-amber-400">{alertsSummary.warning_alerts}</div></div>
              <div className="bg-slate-900 rounded-lg p-3"><div className="text-slate-400">Info</div><div className="text-xl font-bold text-cyan-400">{alertsSummary.info_alerts}</div></div>
              <div className="bg-slate-900 rounded-lg p-3"><div className="text-slate-400">Unacknowledged</div><div className="text-xl font-bold text-white">{alertsSummary.unacknowledged_alerts}</div></div>
            </div>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={alertsSummary.alerts_by_week || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(138, 130, 144, 0.18)" />
                  <XAxis dataKey="week_start" stroke="var(--text-muted)" tickFormatter={(value) => new Date(value).toLocaleDateString('en-NG', { month: 'short', day: 'numeric' })} />
                  <YAxis stroke="var(--text-muted)" allowDecimals={false} />
                  <Tooltip contentStyle={{ backgroundColor: 'var(--surface-2)', border: '1px solid var(--border-blue)' }} />
                  <Bar dataKey="count" fill="var(--blue-bright)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : <div className="text-slate-500">No alert summary available.</div>}
      </div>
    </div>
  )

  const distributionContent = (
    <div className="space-y-6">
      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
        <h2 className="text-lg font-semibold mb-4">Product Breakdown</h2>
        {productData ? (
          <div className="space-y-4">
            {[
              { key: 'Petrol', color: 'var(--blue-bright)' },
              { key: 'Diesel', color: 'var(--amber)' },
              { key: 'Kerosene', color: 'var(--wine-mid)' },
            ].map((entry) => {
              const product = productData[entry.key]
              const width = productData.grand_total_volume_litres > 0 ? (product.total_volume_litres / productData.grand_total_volume_litres) * 100 : 0
              return (
                <div key={entry.key}>
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="font-medium text-white">{entry.key}</span>
                    <span className="text-slate-300">{formatNumber(product.total_volume_litres)} L · {product.total_trucks} trucks · {product.percentage_of_total.toFixed(2)}%</span>
                  </div>
                  <div className="h-4 w-full rounded-full bg-slate-700 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${width}%`, background: entry.color }} />
                  </div>
                </div>
              )
            })}
          </div>
        ) : <div className="text-slate-500">No product data available.</div>}
      </div>

      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
        <h2 className="text-lg font-semibold mb-4">Crude Sources</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-slate-400 border-b border-slate-700"><th className="text-left py-3 px-2">Source Country</th><th className="text-right py-3 px-2">Total Barrels</th><th className="text-right py-3 px-2">Shipments</th><th className="text-right py-3 px-2">% of Total</th><th className="text-left py-3 px-2">Crude Types</th></tr></thead>
            <tbody>
              {(crudeSources || []).sort((a, b) => b.total_volume_barrels - a.total_volume_barrels).map((source) => (
                <tr key={source.source_country} className="border-b border-slate-700/50">
                  <td className="py-3 px-2">{source.source_country}</td>
                  <td className="py-3 px-2 text-right font-mono">{formatNumber(source.total_volume_barrels)}</td>
                  <td className="py-3 px-2 text-right font-mono">{source.shipment_count}</td>
                  <td className="py-3 px-2 text-right font-mono">{source.percentage_of_total.toFixed(2)}%</td>
                  <td className="py-3 px-2">{source.crude_types.map((c: any) => `${c.crude_type} (${c.shipment_count})`).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
        <h2 className="text-lg font-semibold mb-4">Top Distributors</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-slate-400 border-b border-slate-700"><th className="text-left py-3 px-2">Rank</th><th className="text-left py-3 px-2">Distributor</th><th className="text-right py-3 px-2">Total Volume</th><th className="text-right py-3 px-2">Trucks</th><th className="text-left py-3 px-2">Regions Served</th><th className="text-left py-3 px-2">Top Product</th></tr></thead>
            <tbody>
              {(distributors || []).map((dist, idx) => (
                <tr key={dist.distributor_id} className="border-b border-slate-700/50">
                  <td className="py-3 px-2">#{idx + 1}</td>
                  <td className="py-3 px-2">{dist.distributor_name}</td>
                  <td className="py-3 px-2 text-right font-mono">{formatNumber(dist.total_volume_litres)}</td>
                  <td className="py-3 px-2 text-right font-mono">{dist.total_trucks}</td>
                  <td className="py-3 px-2">{dist.regions_served.length} · {dist.regions_served.join(', ')}</td>
                  <td className="py-3 px-2">{dist.top_product}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )

  const reportsContent = (
    <PanelCard title="Operational Reports">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
        <div>
          <label className="block text-sm text-slate-300 mb-2">Report Type</label>
          <select value={reportType} onChange={(e) => setReportType(e.target.value as 'weekly' | 'monthly' | 'custom')} className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-white">
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="custom">Custom</option>
          </select>
        </div>
        <div>
          <label className="block text-sm text-slate-300 mb-2">Format</label>
          <select value={reportFormat} onChange={(e) => setReportFormat(e.target.value as 'json' | 'csv')} className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-white">
            <option value="csv">Comma-separated values</option>
            <option value="json">Structured JSON</option>
          </select>
        </div>

        {reportType === 'weekly' && (
          <div className="md:col-span-2">
            <label className="block text-sm text-slate-300 mb-2">Week</label>
            <input type="date" value={reportStart ? new Date(reportStart).toISOString().slice(0, 10) : ''} onChange={(e) => syncWeeklyRange(e.target.value)} className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-white" />
          </div>
        )}

        {reportType === 'monthly' && (
          <div className="md:col-span-2">
            <label className="block text-sm text-slate-300 mb-2">Month</label>
            <input type="month" onChange={(e) => syncMonthlyRange(`${e.target.value}-01`)} className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-white" />
          </div>
        )}

        {reportType === 'custom' && (
          <>
            <div>
              <label className="block text-sm text-slate-300 mb-2">Start Date</label>
              <input type="date" value={reportStart} onChange={(e) => setReportStart(e.target.value)} className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-white" />
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-2">End Date</label>
              <input type="date" value={reportEnd} onChange={(e) => setReportEnd(e.target.value)} className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-white" />
            </div>
          </>
        )}
      </div>

      <div className="mt-6">
        <button onClick={generateReport} disabled={reportGenerating || !reportStart || !reportEnd} className="rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 px-4 py-2 font-medium text-white">
          {reportGenerating ? 'Generating...' : 'Generate Report'}
        </button>
      </div>

      {reportMessage && (
        <div className={`mt-4 rounded-lg border px-3 py-2 text-sm ${reportMessage.type === 'success' ? 'border-green-500/50 bg-green-500/10 text-green-300' : 'border-red-500/50 bg-red-500/10 text-red-300'}`}>
          {reportMessage.text}
        </div>
      )}

      <div className="mt-6 rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-4 text-sm text-cyan-100">
        Generated reports include period summary statistics, daily reconciliation records, and a hash chain verification confirming ledger integrity for the selected date range.
      </div>
    </PanelCard>
  )

  const integrationContent = (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-white">Integration & Data Sources</h2>
        <div className="flex items-center gap-2 text-sm text-slate-300">
          <span className="font-mono text-slate-500">server/integration/interface.go</span>
          <span className="text-slate-400">DataSource interface</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          {
            title: 'Crude Terminal Sensor',
            status: simulationStatus?.running ? 'Simulated' : 'Offline',
            statusClass: simulationStatus?.running ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-red-500/20 text-red-300 border border-red-500/40',
            description: 'Monitors tanker arrivals and crude intake volumes at the Lekki terminal. In production, connects to the terminal\'s flow metering API.',
            simInterval: 'Every 40 seconds (dev) / 4 hours (production)',
            integration: 'Replace with terminal SCADA API endpoint. Implement DataSource interface in server/integration/.'
          },
          {
            title: 'Production Unit Monitors',
            status: simulationStatus?.running ? 'Simulated' : 'Offline',
            statusClass: simulationStatus?.running ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-red-500/20 text-red-300 border border-red-500/40',
            description: 'Reads throughput and yield from CDU-1, CDU-2, and CDU-3. In production, connects to distributed control system (DCS) OPC-UA feeds.',
            simInterval: 'Every 30 seconds (dev) / 30 minutes (production)',
            integration: 'Replace with OPC-UA or Modbus TCP adapter. Implement DataSource interface.'
          },
          {
            title: 'Gantry Loading System',
            status: simulationStatus?.running ? 'Simulated' : 'Offline',
            statusClass: simulationStatus?.running ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-red-500/20 text-red-300 border border-red-500/40',
            description: 'Captures truck loading events at all 4 gantries. In production, connects to the gantry automation controller\'s event webhook.',
            simInterval: 'Every 30 seconds (dev) / 30 minutes (production)',
            integration: 'Replace with gantry webhook receiver at POST /api/v1/ingest/gantry. Implement DataSource interface.'
          },
          {
            title: 'ERP / Allocation System',
            status: 'Not connected',
            statusClass: 'bg-red-500/20 text-red-300 border border-red-500/40',
            description: 'Crude allocation data from the trading desk ERP. Would provide real-time cargo allocation confirmations and purchase order references.',
            simInterval: 'N/A',
            integration: 'Connect via SAP RFC or REST API. Implement DataSource interface and register in main.go.'
          }
        ].map((card) => (
          <div key={card.title} className="rounded-xl border border-slate-700 bg-slate-800 p-6">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h3 className="text-base font-semibold text-white">{card.title}</h3>
              <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-medium tracking-wide ${card.statusClass}`}>{card.status}</span>
            </div>
            <p className="text-sm text-slate-400 mb-4">{card.description}</p>
            <div className="space-y-2 text-xs text-slate-500">
              <div className="flex justify-between gap-3">
                <span>Simulated interval</span>
                <span className="text-slate-300 text-right">{card.simInterval}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>Production integration</span>
                <span className="text-slate-300 text-right">{card.integration}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-900 p-5">
        <div className="text-xs tracking-wide text-slate-400 mb-2">Architecture note</div>
        <p className="text-sm text-slate-300">
          RSV uses a DataSource abstraction layer for all external integrations. Each data source implements a standard interface (server/integration/interface.go) and is registered at startup. To connect a live system, implement the interface and set SIM_MODE=off in the environment. No application code changes are required.
        </p>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-900 p-5">
        <div className="text-xs tracking-wide text-slate-400 mb-2">Production ingest endpoints</div>
        <p className="text-sm text-slate-300 mb-3">
          Live sensor data is accepted at /api/v1/ingest/* endpoints using X-RSV-API-Key header authentication. These endpoints are ready to receive data from production systems.
        </p>
        <div className="space-y-2 font-mono text-xs text-slate-500">
          <div className="flex items-center gap-2"><span className="text-slate-400">→</span><span>POST /api/v1/ingest/crude-intake: Crude terminal meter readings</span></div>
          <div className="flex items-center gap-2"><span className="text-slate-400">→</span><span>POST /api/v1/ingest/production-reading: Production unit DCS readings</span></div>
          <div className="flex items-center gap-2"><span className="text-slate-400">→</span><span>POST /api/v1/ingest/gantry-load: Gantry automation events</span></div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <div className="dashboard-sidebar-brand"><span className="dashboard-logo">RSV</span><LiveDot label={sseConnected ? 'Live' : 'Offline'} /></div>
        <div className="dashboard-sidebar-user"><strong>{user?.full_name}</strong><span>{user?.role?.replaceAll('_', ' ')}</span></div>
        <div className="dashboard-nav-scroll" ref={sectionNavRef}>
          <nav className="dashboard-nav-list" aria-label="Dashboard sections">
            {visibleSections.map((section) => <button
              key={section.id}
              ref={(element) => { if (element) sectionCardRefs.current.set(section.id, element); else sectionCardRefs.current.delete(section.id) }}
              data-section={section.id}
              onClick={() => { setActiveTab(section.id); sectionCardRefs.current.get(section.id)?.scrollIntoView({ block: 'center' }) }}
              className={`dashboard-nav-card ${activeTab === section.id ? 'is-active' : ''}`}
              aria-current={activeTab === section.id ? 'page' : undefined}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d={section.icon} /></svg>
              <span className="dashboard-nav-card__name">{section.label}</span>
              <span className="dashboard-nav-card__description">{section.description}</span>
            </button>)}
          </nav>
        </div>
      </aside>

      <div className="dashboard-main">
        <header className="dashboard-header">
          <span className="dashboard-header-logo">RSV</span>
          <div className="dashboard-header-tools">
            <LiveDot label={sseConnected ? 'Live' : 'Offline'} />
            <div className="dashboard-clock"><span>{formatNigeriaDate(nigeriaTime)}</span><strong>{formatNigeriaTime(nigeriaTime)} WAT</strong></div>
            <span className="dashboard-header-user">{user?.full_name}</span>
            <button onClick={logout} className="dashboard-logout">Log out</button>
          </div>
        </header>
        <div className="dashboard-content">
          <div key={activeTab} className={`dashboard-view ${contentVisible ? 'is-visible' : ''}`}>
            {activeTab === 'overview' && overviewContent}
            {activeTab === 'analytics' && analyticsContent}
            {activeTab === 'distribution' && distributionContent}
            {activeTab === 'reports' && reportsContent}
            {activeTab === 'integration' && integrationContent}
          </div>
        </div>
      </div>

      <nav className="mobile-bottom-nav" aria-label="Dashboard sections">
        {visibleSections.map((section) => <button key={section.id} className={activeTab === section.id ? 'is-active' : ''} onClick={() => setActiveTab(section.id)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d={section.icon} /></svg><span>{section.label === 'Crude & Distribution' ? 'Crude' : section.label}</span>
        </button>)}
      </nav>
    </div>
  )
}

function RegulatoryPage() {
  const { token, user, logout } = useAuth()
  const [nigeriaTime, setNigeriaTime] = useState(new Date())
  const [reconciliations, setReconciliations] = useState<Reconciliation[]>([])
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([])
  const [summary, setSummary] = useState<any>(null)

  useEffect(() => { const interval = setInterval(() => setNigeriaTime(new Date()), 1000); return () => clearInterval(interval) }, [])

  const fetchData = useCallback(async () => {
    if (!token) return
    const [recsRes, ledgerRes, summaryRes] = await Promise.all([
      fetch(`${API_BASE}/reconciliations`, { headers: getAuthHeaders(token) }),
      fetch(`${API_BASE}/ledger`, { headers: getAuthHeaders(token) }),
      fetch(`${API_BASE}/analytics/summary`, { headers: getAuthHeaders(token) }),
    ])
    if (recsRes.ok) setReconciliations((await recsRes.json()) || [])
    if (ledgerRes.ok) setLedgerEntries((await ledgerRes.json()) || [])
    if (summaryRes.ok) setSummary(await summaryRes.json())
  }, [token])

  useEffect(() => { fetchData() }, [fetchData])

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })
  const formatNumber = (num: number) => new Intl.NumberFormat('en-NG').format(Math.round(num))
  const formatHash = (hash: string) => hash.substring(0, 16) + '...'

  const today = reconciliations[0]
  const todayStatus = today?.status || 'SHORTFALL'
  const todayActual = today?.actual_output_litres || 0
  const todayFulfillment = today ? today.fulfillment_percentage : 0
  const exportCsv = () => {
    const rows = [
      ['Date', 'Crude Intake (barrels)', 'Expected Output (litres)', 'Actual Output (litres)', 'Trucks Loaded', 'Fulfillment %', 'Status'],
      ...reconciliations.map((rec) => [
        rec.reconciliation_date,
        rec.crude_intake_total_barrels,
        rec.expected_output_litres,
        rec.actual_output_litres,
        rec.trucks_loaded,
        rec.fulfillment_percentage,
        rec.status,
      ]),
    ]
    const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `rsv-reconciliation-export-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="regulatory-page min-h-screen bg-slate-950 text-white">
      <header className="regulatory-header bg-slate-900 border-b border-slate-700 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="regulatory-brand"><span className="regulatory-badge">NMDPRA</span><h1 className="text-xl font-semibold text-white">Regulatory Oversight Portal</h1></div>
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center rounded-full border border-cyan-500/50 bg-cyan-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-cyan-300">RSV Verified Data Feed</span>
            <div className="text-right">
              <div className="text-sm text-slate-400">{nigeriaTime.toLocaleDateString('en-NG', { timeZone: 'Africa/Lagos', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</div>
              <div className="text-lg font-mono text-white">{nigeriaTime.toLocaleString('en-NG', { timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}</div>
            </div>
            <div className="text-right border-l border-slate-600 pl-4">
              <div className="text-sm text-slate-300">{user?.full_name}</div>
              <div className="text-xs tracking-wide text-slate-400">{user?.role?.replaceAll('_', ' ')}</div>
            </div>
            <button onClick={logout} className="rounded-lg border border-slate-600 px-3 py-2 text-sm hover:bg-slate-700">Logout</button>
          </div>
        </div>
      </header>

      <div className="refinery-banner" aria-hidden="true">
        <svg viewBox="0 0 1440 120" preserveAspectRatio="xMidYMax slice">
          <path d="M0 105h1440v15H0zM90 104V73h42v31m18 0V53h52v51m18 0V78h32V42h12V26h11v16h12v62m22 0V62h62v42m22 0V78h48V48h17V31h13v17h13v56m30 0V67h54v37m26 0V55h68v49m22 0V75h45V38h12V20h12v18h13v37h38V53h42v51m22 0V66h52v38m30 0V44h39V24h14v20h17v60m23 0V73h56v31m32 0V60h59v44m20 0V78h47V47h15V28h13v19h15v31h45v26m24 0V63h58v41m33 0V73h43V51h19V36h15v15h17v53m24 0V64h68v40m23 0V77h42V55h18V39h13v16h16v49" />
          <path className="banner-lines" d="M154 68h45m158 3h48m235 0h68m151 3h45m209-4h59m78 4h44" />
        </svg>
        <div><span>Refinery output verification</span><LiveDot label="Verified data feed" /></div>
      </div>

      <main className="regulatory-content max-w-7xl mx-auto p-6 space-y-6">
        <div className="regulatory-summary">
          <div className="regulatory-summary-cell"><span>Today's date, WAT</span><strong>{new Date().toLocaleDateString('en-NG', { timeZone: 'Africa/Lagos', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</strong></div>
          <div className="regulatory-summary-cell"><span>Commitment target</span><strong>{formatNumber(35000000)} litres</strong></div>
          <div className="regulatory-summary-cell"><span>Today's actual output</span><strong>{formatNumber(todayActual)} litres</strong><StatusPill status={todayStatus} /></div>
          <div className="regulatory-summary-cell"><span>Today's fulfillment</span><strong>{todayFulfillment.toFixed(1)}%</strong></div>
        </div>

        <div className="regulatory-intelligence grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <SummaryCard title="Commitment Hit Rate" value={summary ? `${summary.commitment_hit_rate_percentage.toFixed(2)}%` : 'Not available'} unit="fulfilled / total" />
          <SummaryCard title="Average Fulfillment" value={summary ? `${summary.average_fulfillment_percentage.toFixed(2)}%` : 'Not available'} unit="average" />
          <SummaryCard title="Total Days Recorded" value={summary ? String(summary.total_days_recorded) : 'Not available'} unit="records" />
          <SummaryCard title="Shortfall Days" value={summary ? String(summary.shortfall_days) : 'Not available'} unit="days" />
        </div>

        <div className="regulatory-records bg-slate-900 rounded-xl p-6 border border-slate-700">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">Verified Reconciliation Records</h2>
            <button onClick={exportCsv} className="rounded-lg bg-cyan-600 px-3 py-2 text-sm font-medium hover:bg-cyan-500">Export</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-slate-400 border-b border-slate-700"><th className="text-left py-3 px-2">Date</th><th className="text-right py-3 px-2">Crude Intake</th><th className="text-right py-3 px-2">Expected Output</th><th className="text-right py-3 px-2">Actual Output</th><th className="text-right py-3 px-2">Trucks</th><th className="text-right py-3 px-2">Fulfillment</th><th className="text-center py-3 px-2">Status</th></tr></thead>
              <tbody>
                {reconciliations.map((rec) => (
                  <tr key={rec.id} className="border-b border-slate-700/50">
                    <td className="py-3 px-2">{formatDate(rec.reconciliation_date)}</td>
                    <td className="py-3 px-2 text-right font-mono">{formatNumber(rec.crude_intake_total_barrels)}</td>
                    <td className="py-3 px-2 text-right font-mono">{formatNumber(rec.expected_output_litres)}</td>
                    <td className="py-3 px-2 text-right font-mono">{formatNumber(rec.actual_output_litres)}</td>
                    <td className="py-3 px-2 text-right font-mono">{rec.trucks_loaded}</td>
                    <td className="py-3 px-2 text-right font-mono">{rec.fulfillment_percentage.toFixed(1)}%</td>
                    <td className="py-3 px-2 text-center"><StatusPill status={rec.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="regulatory-ledger bg-slate-900 rounded-xl border border-slate-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-700 text-sm text-slate-300">The following records are tamper-evident and hash-chained. Each entry's integrity can be independently verified.</div>
          <div className="px-6 pb-6 pt-4">
            {ledgerEntries.length > 0 ? (
              <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-slate-400 border-b border-slate-700"><th className="text-left py-3 px-2">Date</th><th className="text-left py-3 px-2">Entry ID</th><th className="text-left py-3 px-2">Content Hash</th><th className="text-left py-3 px-2">Previous Hash</th><th className="text-left py-3 px-2">Written At</th></tr></thead><tbody>{ledgerEntries.map((entry) => (<tr key={entry.id} className="border-b border-slate-700/50"><td className="py-3 px-2">{formatDate(entry.entry_date)}</td><td className="py-3 px-2 font-mono text-xs">{formatHash(entry.id)}</td><td className="py-3 px-2 font-mono text-xs text-green-400">{formatHash(entry.content_hash)}</td><td className="py-3 px-2 font-mono text-xs text-slate-500">{entry.previous_hash === 'GENESIS' ? 'Genesis block' : formatHash(entry.previous_hash)}</td><td className="py-3 px-2">{new Date(entry.created_at).toLocaleString()}</td></tr>))}</tbody></table></div>
            ) : <div className="text-center py-8 text-slate-500">No ledger entries found.</div>}
          </div>
        </div>
      </main>
    </div>
  )
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/landing" element={<LandingPage />} />
      <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/regulatory" element={<ProtectedRoute><RoleRoute allowedRoles={['regulatory']}><RegulatoryPage /></RoleRoute></ProtectedRoute>} />
      <Route path="/" element={<LandingPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}

function SummaryCard({ title, value, unit, accent = 'text-white' }: { title: string; value: string; unit: string; accent?: string }) {
  return (
    <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
      <div className="text-slate-400 text-sm mb-2">{title}</div>
      <div className={`text-3xl font-bold ${accent}`}>{value}</div>
      <div className="text-slate-500 text-sm mt-1">{unit}</div>
    </div>
  )
}

export default App
