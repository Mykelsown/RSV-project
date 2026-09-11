import { useState, useEffect, useCallback, type ReactNode, type FormEvent } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import './App.css'
import { AuthProvider, useAuth } from './auth/AuthContext'

const API_BASE = 'http://localhost:8080/api/v1'

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

const getAuthHeaders = (token: string | null): Record<string, string> => {
  if (!token) return {}
  return { Authorization: `Bearer ${token}` }
}

function LoginPage() {
  const { login, user } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('ops@dangote-rsv.com')
  const [password, setPassword] = useState('Ops2026!')
  const [error, setError] = useState('')

  useEffect(() => {
    if (user) {
      navigate(user.role === 'regulatory' ? '/regulatory' : '/dashboard', { replace: true })
    }
  }, [user, navigate])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    try {
      await login(email, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl p-8">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-extrabold tracking-tight">RSV</h1>
          <p className="text-slate-400 mt-2">Real-Time Refinery Output and Crude Supply Verification</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-300 mb-1">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-white" required />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-white" required />
          </div>

          {error && <div className="text-sm text-red-400">{error}</div>}

          <button type="submit" className="w-full rounded-lg bg-cyan-600 hover:bg-cyan-500 px-4 py-2.5 font-semibold text-white">
            Login
          </button>
        </form>

        <div className="mt-6 border-t border-slate-700 pt-4 text-center text-xs text-slate-400">
          Internal system — authorized personnel only
        </div>
      </div>
    </div>
  )
}

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

  useEffect(() => { const interval = setInterval(() => setNigeriaTime(new Date()), 1000); return () => clearInterval(interval) }, [])

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

  useEffect(() => {
    fetchDashboard(); fetchReconciliations(); fetchLedger()
    const interval = setInterval(() => { fetchDashboard(); fetchReconciliations(); fetchLedger() }, 30000)
    return () => clearInterval(interval)
  }, [fetchDashboard, fetchReconciliations, fetchLedger])

  useEffect(() => {
    if (!token) return
    const eventSource = new EventSource(`${API_BASE}/events?token=${encodeURIComponent(token)}`)
    eventSource.onopen = () => setSseConnected(true)
    eventSource.addEventListener('dashboard_update', (event) => {
      const data = JSON.parse(event.data)
      setDashboardData(data)
    })
    eventSource.onerror = () => setSseConnected(false)
    return () => eventSource.close()
  }, [token])

  const acknowledgeAlert = async (id: string) => {
    if (!token) return
    await fetch(`${API_BASE}/alerts/${id}/acknowledge`, { method: 'PATCH', headers: getAuthHeaders(token) })
    fetchDashboard(); fetchReconciliations(); fetchLedger()
  }

  const seedData = async () => {
    if (!token) return
    await fetch(`${API_BASE}/seed`, { method: 'POST', headers: getAuthHeaders(token) })
    fetchReconciliations(); fetchLedger(); fetchDashboard()
  }

  const runReconciliation = async () => {
    if (!token) return
    await fetch(`${API_BASE}/reconcile/run`, { method: 'POST', headers: getAuthHeaders(token) })
    fetchReconciliations(); fetchLedger(); fetchDashboard()
  }

  const saveNote = async (date: string, notes: string) => {
    if (!token) return
    await fetch(`${API_BASE}/reconciliations/${date}/notes`, {
      method: 'PATCH',
      headers: { ...getAuthHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes }),
    })
    setNoteOpen((prev) => ({ ...prev, [date]: false }))
    fetchReconciliations()
  }

  const formatNigeriaTime = (date: Date) => date.toLocaleString('en-NG', { timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
  const formatNigeriaDate = (date: Date) => date.toLocaleString('en-NG', { timeZone: 'Africa/Lagos', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
  const formatNumber = (num: number) => new Intl.NumberFormat('en-NG').format(Math.round(num))
  const formatHash = (hash: string) => hash.substring(0, 16) + '...'
  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })

  const getStatusColor = (status: string) => {
    switch (status) { case 'FULFILLED': return 'bg-green-500'; case 'PARTIAL': return 'bg-amber-500'; case 'SHORTFALL': return 'bg-red-500'; default: return 'bg-gray-500' }
  }

  const getFulfillmentColor = (pct: number) => { if (pct >= 95) return 'text-green-400'; if (pct >= 75) return 'text-amber-400'; return 'text-red-400' }

  const chartData = reconciliations.slice(0, 7).reverse().map((r) => ({ date: formatDate(r.reconciliation_date), fulfillment: r.fulfillment_percentage, status: r.status }))

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <header className="bg-slate-800 border-b border-slate-700 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold text-white">RSV — Real-Time Refinery Output and Crude Supply Verification</h1>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${sseConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
              <span className={`text-sm font-medium ${sseConnected ? 'text-green-400' : 'text-red-400'}`}>{sseConnected ? 'LIVE' : 'OFFLINE'}</span>
            </div>
            <div className="text-right">
              <div className="text-sm text-slate-400">{formatNigeriaDate(nigeriaTime)}</div>
              <div className="text-lg font-mono text-white">{formatNigeriaTime(nigeriaTime)}</div>
            </div>
            <div className="text-right border-l border-slate-600 pl-4">
              <div className="text-sm text-slate-300">{user?.full_name}</div>
              <div className="text-xs uppercase tracking-wide text-slate-400">{user?.role}</div>
            </div>
            <button onClick={logout} className="rounded-lg border border-slate-600 px-3 py-2 text-sm hover:bg-slate-700">Logout</button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        {user?.role === 'operations_manager' && (
          <div className="flex gap-4">
            <button onClick={seedData} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors">Seed 7 Days Data</button>
            <button onClick={runReconciliation} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-medium transition-colors">Run Today's Reconciliation</button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard title="Crude Intake Today" value={dashboardData ? formatNumber(dashboardData.crude_intake_barrels) : '—'} unit="barrels" />
          <SummaryCard title="Actual Output Today" value={dashboardData ? formatNumber(dashboardData.actual_output_litres) : '—'} unit="litres" />
          <SummaryCard title="Trucks Loaded Today" value={dashboardData ? String(dashboardData.trucks_loaded) : '—'} unit="events" />
          <SummaryCard title="Fulfillment Rate" value={dashboardData ? `${dashboardData.fulfillment_percent.toFixed(1)}%` : '—'} unit={dashboardData?.status || 'No data'} accent={dashboardData ? getFulfillmentColor(dashboardData.fulfillment_percent) : 'text-white'} />
        </div>

        {dashboardData?.alerts && dashboardData.alerts.length > 0 && (
          <div className="bg-red-900/30 border border-red-500/50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3"><h2 className="text-lg font-semibold text-red-400">⚠️ Active Alerts</h2></div>
            <div className="space-y-2">
              {dashboardData.alerts.map((alert) => (
                <div key={alert.id} className="flex items-center justify-between bg-slate-800 rounded-lg p-3">
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${alert.severity === 'CRITICAL' ? 'bg-red-500' : alert.severity === 'WARNING' ? 'bg-amber-500' : 'bg-blue-500'}`}>{alert.severity}</span>
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

        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
          <h2 className="text-lg font-semibold mb-4">7-Day Fulfillment Trend</h2>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} />
                <YAxis domain={[0, 100]} stroke="#94a3b8" fontSize={12} />
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569' }} formatter={(value) => [`${Number(value).toFixed(1)}%`, 'Fulfillment']} />
                <Bar dataKey="fulfillment" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.status === 'FULFILLED' ? '#22c55e' : entry.status === 'PARTIAL' ? '#f59e0b' : '#ef4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-slate-500">No reconciliation data available.</div>
          )}
        </div>

        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
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
                  {reconciliations.map((rec) => (
                    <tr key={rec.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                      <td className="py-3 px-2">{formatDate(rec.reconciliation_date)}</td>
                      <td className="py-3 px-2 text-right font-mono">{formatNumber(rec.crude_intake_total_barrels)}</td>
                      <td className="py-3 px-2 text-right font-mono">{formatNumber(rec.expected_output_litres)}</td>
                      <td className="py-3 px-2 text-right font-mono">{formatNumber(rec.actual_output_litres)}</td>
                      <td className="py-3 px-2 text-right font-mono">{rec.trucks_loaded}</td>
                      <td className="py-3 px-2 text-right font-mono"><span className={getFulfillmentColor(rec.fulfillment_percentage)}>{rec.fulfillment_percentage.toFixed(1)}%</span></td>
                      <td className="py-3 px-2 text-center"><span className={`px-2 py-1 rounded text-xs font-bold text-white ${getStatusColor(rec.status)}`}>{rec.status}</span></td>
                      <td className="py-3 px-2 text-center">
                        {(user?.role === 'operations_manager' || user?.role === 'executive') && (
                          <div className="space-y-2">
                            <button onClick={() => { setNoteOpen((prev) => ({ ...prev, [rec.reconciliation_date]: !prev[rec.reconciliation_date] })); if (!noteDrafts[rec.reconciliation_date]) setNoteDrafts((prev) => ({ ...prev, [rec.reconciliation_date]: rec.notes || '' })) }} className="bg-slate-700 hover:bg-slate-600 text-xs px-2 py-1 rounded">Add Note</button>
                            {noteOpen[rec.reconciliation_date] && (
                              <div className="space-y-2 text-left">
                                <textarea value={noteDrafts[rec.reconciliation_date] ?? rec.notes ?? ''} onChange={(e) => setNoteDrafts((prev) => ({ ...prev, [rec.reconciliation_date]: e.target.value }))} className="w-full rounded border border-slate-600 bg-slate-900 p-2 text-xs text-slate-200" rows={3} />
                                <button onClick={() => saveNote(rec.reconciliation_date, noteDrafts[rec.reconciliation_date] ?? '')} className="bg-cyan-600 hover:bg-cyan-500 px-2 py-1 rounded text-xs">Save</button>
                              </div>
                            )}
                            {rec.notes && !noteOpen[rec.reconciliation_date] && <div className="text-left text-xs text-slate-300 bg-slate-900 rounded p-2">{rec.notes}</div>}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="text-center py-8 text-slate-500">No reconciliation records found.</div>}
        </div>

        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <button onClick={() => setLedgerExpanded(!ledgerExpanded)} className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-700/50 transition-colors">
            <div className="flex items-center gap-3"><h2 className="text-lg font-semibold">Verified Output Ledger</h2><span className="text-xs text-slate-500">Records are immutable and hash-chained</span></div>
            <svg className={`w-5 h-5 text-slate-400 transition-transform ${ledgerExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>
          {ledgerExpanded && (
            <div className="px-6 pb-6">
              {ledgerEntries.length > 0 ? (
                <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-slate-400 border-b border-slate-700"><th className="text-left py-3 px-2">Date</th><th className="text-left py-3 px-2">Entry ID</th><th className="text-left py-3 px-2">Content Hash</th><th className="text-left py-3 px-2">Previous Hash</th><th className="text-left py-3 px-2">Written At</th></tr></thead><tbody>{ledgerEntries.map((entry) => (<tr key={entry.id} className="border-b border-slate-700/50"><td className="py-3 px-2">{formatDate(entry.entry_date)}</td><td className="py-3 px-2 font-mono text-xs">{formatHash(entry.id)}</td><td className="py-3 px-2 font-mono text-xs text-green-400">{formatHash(entry.content_hash)}</td><td className="py-3 px-2 font-mono text-xs text-slate-500">{entry.previous_hash === 'GENESIS' ? 'GENESIS' : formatHash(entry.previous_hash)}</td><td className="py-3 px-2">{new Date(entry.created_at).toLocaleString()}</td></tr>))}</tbody></table></div>
              ) : <div className="text-center py-8 text-slate-500">No ledger entries found.</div>}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

function RegulatoryPage() {
  const { token, user, logout } = useAuth()
  const [nigeriaTime, setNigeriaTime] = useState(new Date())
  const [reconciliations, setReconciliations] = useState<Reconciliation[]>([])
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([])

  useEffect(() => { const interval = setInterval(() => setNigeriaTime(new Date()), 1000); return () => clearInterval(interval) }, [])

  const fetchData = useCallback(async () => {
    if (!token) return
    const [recsRes, ledgerRes] = await Promise.all([
      fetch(`${API_BASE}/reconciliations`, { headers: getAuthHeaders(token) }),
      fetch(`${API_BASE}/ledger`, { headers: getAuthHeaders(token) }),
    ])
    if (recsRes.ok) setReconciliations((await recsRes.json()) || [])
    if (ledgerRes.ok) setLedgerEntries((await ledgerRes.json()) || [])
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
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="bg-slate-900 border-b border-slate-700 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div><h1 className="text-2xl font-bold text-white">NMDPRA — Regulatory Oversight Portal</h1></div>
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center rounded-full border border-cyan-500/50 bg-cyan-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-cyan-300">RSV Verified Data Feed</span>
            <div className="text-right">
              <div className="text-sm text-slate-400">{nigeriaTime.toLocaleDateString('en-NG', { timeZone: 'Africa/Lagos', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</div>
              <div className="text-lg font-mono text-white">{nigeriaTime.toLocaleString('en-NG', { timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}</div>
            </div>
            <div className="text-right border-l border-slate-600 pl-4">
              <div className="text-sm text-slate-300">{user?.full_name}</div>
              <div className="text-xs uppercase tracking-wide text-slate-400">{user?.role}</div>
            </div>
            <button onClick={logout} className="rounded-lg border border-slate-600 px-3 py-2 text-sm hover:bg-slate-700">Logout</button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-900 px-5 py-4">
          <div className="flex items-center gap-6 text-sm text-slate-300">
            <div><span className="text-slate-400">Today's Date (WAT)</span><div className="text-xl font-semibold text-white">{new Date().toLocaleDateString('en-NG', { timeZone: 'Africa/Lagos', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</div></div>
            <div><span className="text-slate-400">Commitment Target</span><div className="text-xl font-semibold text-white">{formatNumber(35000000)}</div></div>
            <div><span className="text-slate-400">Today's Actual Output</span><div className="text-xl font-semibold text-white">{formatNumber(todayActual)}</div></div>
            <div><span className="text-slate-400">Today's Fulfillment %</span><div className="text-xl font-semibold text-white">{todayFulfillment.toFixed(1)}%</div></div>
            <div><span className="text-slate-400">Status</span><div className={`mt-1 inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase ${todayStatus === 'FULFILLED' ? 'bg-green-500/20 text-green-300' : todayStatus === 'PARTIAL' ? 'bg-amber-500/20 text-amber-300' : 'bg-red-500/20 text-red-300'}`}>{todayStatus}</div></div>
          </div>
        </div>

        <div className="bg-slate-900 rounded-xl p-6 border border-slate-700">
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
                    <td className="py-3 px-2 text-center"><span className={`px-2 py-1 rounded text-xs font-bold text-white ${rec.status === 'FULFILLED' ? 'bg-green-500' : rec.status === 'PARTIAL' ? 'bg-amber-500' : 'bg-red-500'}`}>{rec.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-slate-900 rounded-xl border border-slate-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-700 text-sm text-slate-300">The following records are tamper-evident and hash-chained. Each entry's integrity can be independently verified.</div>
          <div className="px-6 pb-6 pt-4">
            {ledgerEntries.length > 0 ? (
              <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-slate-400 border-b border-slate-700"><th className="text-left py-3 px-2">Date</th><th className="text-left py-3 px-2">Entry ID</th><th className="text-left py-3 px-2">Content Hash</th><th className="text-left py-3 px-2">Previous Hash</th><th className="text-left py-3 px-2">Written At</th></tr></thead><tbody>{ledgerEntries.map((entry) => (<tr key={entry.id} className="border-b border-slate-700/50"><td className="py-3 px-2">{formatDate(entry.entry_date)}</td><td className="py-3 px-2 font-mono text-xs">{formatHash(entry.id)}</td><td className="py-3 px-2 font-mono text-xs text-green-400">{formatHash(entry.content_hash)}</td><td className="py-3 px-2 font-mono text-xs text-slate-500">{entry.previous_hash === 'GENESIS' ? 'GENESIS BLOCK' : formatHash(entry.previous_hash)}</td><td className="py-3 px-2">{new Date(entry.created_at).toLocaleString()}</td></tr>))}</tbody></table></div>
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
      <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/regulatory" element={<ProtectedRoute><RoleRoute allowedRoles={['regulatory']}><RegulatoryPage /></RoleRoute></ProtectedRoute>} />
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
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
