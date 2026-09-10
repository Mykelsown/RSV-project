import { useState, useEffect, useCallback } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import './App.css'

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

function App() {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null)
  const [reconciliations, setReconciliations] = useState<Reconciliation[]>([])
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([])
  const [sseConnected, setSseConnected] = useState(false)
  const [nigeriaTime, setNigeriaTime] = useState(new Date())
  const [ledgerExpanded, setLedgerExpanded] = useState(false)

  // Update Nigeria time every second
  useEffect(() => {
    const interval = setInterval(() => {
      setNigeriaTime(new Date())
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const formatNigeriaTime = (date: Date) => {
    return date.toLocaleString('en-NG', {
      timeZone: 'Africa/Lagos',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    })
  }

  const formatNigeriaDate = (date: Date) => {
    return date.toLocaleString('en-NG', {
      timeZone: 'Africa/Lagos',
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  }

  // SSE connection
  useEffect(() => {
    const eventSource = new EventSource(`${API_BASE}/events`)

    eventSource.onopen = () => {
      setSseConnected(true)
    }

    eventSource.addEventListener('dashboard_update', (event) => {
      const data = JSON.parse(event.data)
      setDashboardData(data)
    })

    eventSource.onerror = () => {
      setSseConnected(false)
    }

    return () => {
      eventSource.close()
    }
  }, [])

  // Fetch reconciliation history
  const fetchReconciliations = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/reconciliations`)
      if (res.ok) {
        const data = await res.json()
        setReconciliations(data || [])
      }
    } catch (err) {
      console.error('Failed to fetch reconciliations:', err)
    }
  }, [])

  // Fetch ledger entries
  const fetchLedger = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/ledger`)
      if (res.ok) {
        const data = await res.json()
        setLedgerEntries(data || [])
      }
    } catch (err) {
      console.error('Failed to fetch ledger:', err)
    }
  }, [])

  // Initial data fetch
  useEffect(() => {
    fetchReconciliations()
    fetchLedger()
    const interval = setInterval(() => {
      fetchReconciliations()
      fetchLedger()
    }, 30000)
    return () => clearInterval(interval)
  }, [fetchReconciliations, fetchLedger])

  // Acknowledge alert
  const acknowledgeAlert = async (id: string) => {
    try {
      await fetch(`${API_BASE}/alerts/${id}/acknowledge`, { method: 'PATCH' })
      fetchReconciliations()
      fetchLedger()
    } catch (err) {
      console.error('Failed to acknowledge alert:', err)
    }
  }

  // Seed data
  const seedData = async () => {
    try {
      await fetch(`${API_BASE}/seed`, { method: 'POST' })
      fetchReconciliations()
      fetchLedger()
    } catch (err) {
      console.error('Failed to seed data:', err)
    }
  }

  // Run reconciliation
  const runReconciliation = async () => {
    try {
      await fetch(`${API_BASE}/reconcile/run`, { method: 'POST' })
      fetchReconciliations()
      fetchLedger()
    } catch (err) {
      console.error('Failed to run reconciliation:', err)
    }
  }

  // Format numbers
  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-NG').format(Math.round(num))
  }

  const formatHash = (hash: string) => {
    return hash.substring(0, 16) + '...'
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-NG', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  }

  // Status badge color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'FULFILLED': return 'bg-green-500'
      case 'PARTIAL': return 'bg-amber-500'
      case 'SHORTFALL': return 'bg-red-500'
      default: return 'bg-gray-500'
    }
  }

  // Fulfillment color
  const getFulfillmentColor = (pct: number) => {
    if (pct >= 95) return 'text-green-400'
    if (pct >= 75) return 'text-amber-400'
    return 'text-red-400'
  }

  // Prepare chart data
  const chartData = reconciliations.slice(0, 7).reverse().map(r => ({
    date: formatDate(r.reconciliation_date),
    fulfillment: r.fulfillment_percentage,
    status: r.status,
  }))

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold text-white">
            RSV — Real-Time Refinery Output and Crude Supply Verification
          </h1>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${sseConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
              <span className={`text-sm font-medium ${sseConnected ? 'text-green-400' : 'text-red-400'}`}>
                {sseConnected ? 'LIVE' : 'OFFLINE'}
              </span>
            </div>
            <div className="text-right">
              <div className="text-sm text-slate-400">{formatNigeriaDate(nigeriaTime)}</div>
              <div className="text-lg font-mono text-white">{formatNigeriaTime(nigeriaTime)}</div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Action Buttons */}
        <div className="flex gap-4">
          <button
            onClick={seedData}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            Seed 7 Days Data
          </button>
          <button
            onClick={runReconciliation}
            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            Run Today's Reconciliation
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
            <div className="text-slate-400 text-sm mb-2">Crude Intake Today</div>
            <div className="text-3xl font-bold text-white">
              {dashboardData ? formatNumber(dashboardData.crude_intake_barrels) : '—'}
            </div>
            <div className="text-slate-500 text-sm mt-1">barrels</div>
          </div>

          <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
            <div className="text-slate-400 text-sm mb-2">Actual Output Today</div>
            <div className="text-3xl font-bold text-white">
              {dashboardData ? formatNumber(dashboardData.actual_output_litres) : '—'}
            </div>
            <div className="text-slate-500 text-sm mt-1">litres</div>
          </div>

          <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
            <div className="text-slate-400 text-sm mb-2">Trucks Loaded Today</div>
            <div className="text-3xl font-bold text-white">
              {dashboardData ? dashboardData.trucks_loaded : '—'}
            </div>
            <div className="text-slate-500 text-sm mt-1">events</div>
          </div>

          <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
            <div className="text-slate-400 text-sm mb-2">Fulfillment Rate</div>
            <div className={`text-3xl font-bold ${dashboardData ? getFulfillmentColor(dashboardData.fulfillment_percent) : 'text-white'}`}>
              {dashboardData ? `${dashboardData.fulfillment_percent.toFixed(1)}%` : '—'}
            </div>
            <div className="text-slate-500 text-sm mt-1">
              {dashboardData?.status || 'No data'}
            </div>
          </div>
        </div>

        {/* Active Alerts Banner */}
        {dashboardData?.alerts && dashboardData.alerts.length > 0 && (
          <div className="bg-red-900/30 border border-red-500/50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-red-400">⚠️ Active Alerts</h2>
            </div>
            <div className="space-y-2">
              {dashboardData.alerts.map((alert) => (
                <div key={alert.id} className="flex items-center justify-between bg-slate-800 rounded-lg p-3">
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${
                      alert.severity === 'CRITICAL' ? 'bg-red-500' : 
                      alert.severity === 'WARNING' ? 'bg-amber-500' : 'bg-blue-500'
                    }`}>
                      {alert.severity}
                    </span>
                    <span className="text-slate-300">{alert.message}</span>
                  </div>
                  <button
                    onClick={() => acknowledgeAlert(alert.id)}
                    className="text-sm bg-slate-700 hover:bg-slate-600 px-3 py-1 rounded transition-colors"
                  >
                    Acknowledge
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 7-Day Fulfillment Trend Chart */}
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
          <h2 className="text-lg font-semibold mb-4">7-Day Fulfillment Trend</h2>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} />
                <YAxis domain={[0, 100]} stroke="#94a3b8" fontSize={12} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569' }}
                  formatter={(value) => [`${Number(value).toFixed(1)}%`, 'Fulfillment']}
                />
                <Bar dataKey="fulfillment" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.status === 'FULFILLED' ? '#22c55e' : 
                            entry.status === 'PARTIAL' ? '#f59e0b' : '#ef4444'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-slate-500">
              No reconciliation data available. Click "Seed 7 Days Data" to generate sample data.
            </div>
          )}
        </div>

        {/* Reconciliation History Table */}
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
                      <td className="py-3 px-2 text-right font-mono">
                        <span className={getFulfillmentColor(rec.fulfillment_percentage)}>
                          {rec.fulfillment_percentage.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-3 px-2 text-center">
                        <span className={`px-2 py-1 rounded text-xs font-bold text-white ${getStatusColor(rec.status)}`}>
                          {rec.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500">
              No reconciliation records found. Click "Seed 7 Days Data" to generate sample data.
            </div>
          )}
        </div>

        {/* Ledger Panel */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <button
            onClick={() => setLedgerExpanded(!ledgerExpanded)}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-700/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold">Verified Output Ledger</h2>
              <span className="text-xs text-slate-500">Records are immutable and hash-chained</span>
            </div>
            <svg
              className={`w-5 h-5 text-slate-400 transition-transform ${ledgerExpanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {ledgerExpanded && (
            <div className="px-6 pb-6">
              {ledgerEntries.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-slate-400 border-b border-slate-700">
                        <th className="text-left py-3 px-2">Date</th>
                        <th className="text-left py-3 px-2">Entry ID</th>
                        <th className="text-left py-3 px-2">Content Hash</th>
                        <th className="text-left py-3 px-2">Previous Hash</th>
                        <th className="text-left py-3 px-2">Written At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledgerEntries.map((entry) => (
                        <tr key={entry.id} className="border-b border-slate-700/50">
                          <td className="py-3 px-2">{formatDate(entry.entry_date)}</td>
                          <td className="py-3 px-2 font-mono text-xs">{formatHash(entry.id)}</td>
                          <td className="py-3 px-2 font-mono text-xs text-green-400">{formatHash(entry.content_hash)}</td>
                          <td className="py-3 px-2 font-mono text-xs text-slate-500">
                            {entry.previous_hash === 'GENESIS' ? 'GENESIS' : formatHash(entry.previous_hash)}
                          </td>
                          <td className="py-3 px-2">{new Date(entry.created_at).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-slate-500">
                  No ledger entries found.
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default App
