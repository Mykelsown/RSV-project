import { useCallback, useEffect, useState } from 'react'
import { Download, Fuel, Landmark, ShieldCheck } from 'lucide-react'
import '../App.css'
import GlassWidget from '../components/GlassWidget'
import RippleButton from '../components/RippleButton'
import KPITile from '../components/KPITile'
import StatusPill from '../components/StatusPill'
import LiveDot from '../components/LiveDot'
import { useAuth } from '../auth/AuthContext'
import { API_BASE } from '../App'
import { SLOW_REFRESH_MS, REFRESH_AFTER_HIDDEN_MS } from '../config/refresh'
import { formatNumber, formatCompact, formatPercent, formatLagosStamp } from '../components/format'

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

const formatDateLocal = (dateStr: string) => new Date(dateStr).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })
const lagosDate = (date: Date) => date.toLocaleDateString('en-NG', { timeZone: 'Africa/Lagos', day: '2-digit', month: 'short', year: 'numeric' })
const lagosClock = (date: Date) => date.toLocaleTimeString('en-NG', { timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit', hour12: true })

export default function RegulatoryPage() {
  const { token, user, logout } = useAuth()
  const [nigeriaTime, setNigeriaTime] = useState(() => new Date())
  const [reconciliations, setReconciliations] = useState<Reconciliation[]>([])
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([])
  const [summary, setSummary] = useState<any>(null)

  useEffect(() => {
    const interval = setInterval(() => setNigeriaTime(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

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

  /* Slow data only changes when a day closes: one 30 minute interval,
     paused while hidden, with an immediate catch-up after long hides. */
  useEffect(() => {
    if (!token) return
    fetchData()
    let timer = 0
    const start = () => {
      window.clearInterval(timer)
      timer = window.setInterval(() => {
        if (document.visibilityState === 'visible') fetchData()
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
        if (hiddenFor > REFRESH_AFTER_HIDDEN_MS) fetchData()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [token, fetchData])

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
    <div className="dash reg">
      <div className="dash__bg" aria-hidden="true">
        <img src="/images/refinery-hero.jpg" alt="" onError={(event) => { event.currentTarget.style.display = 'none' }} />
        <div className="dash__vignette" />
      </div>

      <header className="dash-header glass-surface reg-header">
        <div className="dash-header__brand">
          <span className="dash-side-badge"><Landmark size={17} strokeWidth={1.75} /></span>
          <div className="dash-header__greeting">
            <strong>NMDPRA Regulatory Oversight Portal</strong>
            <span>{lagosDate(nigeriaTime)}, {lagosClock(nigeriaTime)} WAT</span>
          </div>
        </div>
        <div className="dash-header__tools">
          <span className="dash-side-badge dash-side-badge--wide"><LiveDot label="Verified data feed" /></span>
          <div className="glass-tile reg-user">
            <strong>{user?.full_name}</strong>
            <span>{user?.role?.replaceAll('_', ' ')}, read-only</span>
          </div>
          <RippleButton type="button" className="dash-menu__logout" onClick={logout}>
            Logout
          </RippleButton>
        </div>
      </header>

      <section className="reg-banner" aria-hidden="true">
        <img src="/images/control-room.jpg" alt="" onError={(event) => { event.currentTarget.style.display = 'none' }} />
        <div className="reg-banner__scrim" />
      </section>

      <main className="dash-main">
        <div className="board board--in">
          <div className="board__grid">
            {/* Summary strip */}
            <GlassWidget icon={Fuel} title="Today at the refinery" className="w-wide reg-summary" >
              <div className="mini-tiles-4 reg-summary__cells">
                <div className="stat-chip stat-chip--big">Today, WAT <strong>{lagosDate(nigeriaTime)}</strong></div>
                <div className="stat-chip stat-chip--big" title={`${formatNumber(35000000)} litres`}>Commitment <strong>35M litres</strong></div>
                <div className="stat-chip stat-chip--big" title={`${formatNumber(todayActual)} litres`}>Actual output <strong>{formatCompact(todayActual)} litres</strong></div>
                <div className="stat-chip stat-chip--big">Fulfillment <strong>{formatPercent(todayFulfillment)}</strong></div>
              </div>
              {today && <StatusPill status={todayStatus} />}
            </GlassWidget>

            {/* Period intelligence */}
            <GlassWidget icon={ShieldCheck} title="Period intelligence" className="w-wide">
              <div className="mini-tiles-4">
                <KPITile label="Hit rate" value={summary ? Number(summary.commitment_hit_rate_percentage) : null} unit="days fulfilled" tone="blue" size="sm" />
                <KPITile label="Average fulfillment" value={summary ? Number(summary.average_fulfillment_percentage) : null} unit="average" tone="white" size="sm" />
                <KPITile label="Days recorded" value={summary ? Number(summary.total_days_recorded) : null} unit="records" tone="white" size="sm" />
                <KPITile label="Shortfall days" value={summary ? Number(summary.shortfall_days) : null} unit="days" tone="red" size="sm" />
              </div>
            </GlassWidget>

            {/* Reconciliation records */}
            <GlassWidget
              icon={Landmark}
              title="Verified reconciliation records"
              badge={reconciliations.length || null}
              className="w-wide w-body"
              action="open"
              actionLabel="Export as CSV"
              onAction={exportCsv}
            >
              {reconciliations.length === 0 && <p className="widget-empty">No reconciliation records available.</p>}
              {reconciliations.length > 0 && (
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
                      </tr>
                    </thead>
                    <tbody>
                      {reconciliations.map((rec) => (
                        <tr key={rec.id} className="is-open">
                          <td data-label="Date">{formatDateLocal(rec.reconciliation_date)}</td>
                          <td data-label="Crude intake" className="num" title={formatNumber(rec.crude_intake_total_barrels)}>{formatCompact(rec.crude_intake_total_barrels)}</td>
                          <td data-label="Expected" className="num" title={formatNumber(rec.expected_output_litres)}>{formatCompact(rec.expected_output_litres)}</td>
                          <td data-label="Actual" className="num" title={formatNumber(rec.actual_output_litres)}>{formatCompact(rec.actual_output_litres)}</td>
                          <td data-label="Trucks" className="num">{rec.trucks_loaded}</td>
                          <td data-label="Fulfillment" className="num">{formatPercent(rec.fulfillment_percentage)}</td>
                          <td data-label="Status"><StatusPill status={rec.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          <RippleButton type="button" className="pill-btn reg-export" aria-label="Download the reconciliation records as a CSV file" onClick={exportCsv}>
            <Download size={15} strokeWidth={1.75} /> Export CSV
          </RippleButton>
            </GlassWidget>

            {/* Ledger, always expanded */}
            <GlassWidget icon={ShieldCheck} title="Output ledger" badge={`${ledgerEntries.length} entries`} className="w-wide w-body">
              <span className="trust-line"><ShieldCheck size={14} strokeWidth={1.75} /> The records below are tamper-evident and hash-chained. Each entry's integrity can be independently verified.</span>
              {ledgerEntries.length === 0 && <p className="widget-empty">No ledger entries found.</p>}
              {ledgerEntries.length > 0 && (
                <div className="table-scroll">
                  <table className="stack-table">
                    <thead>
                      <tr><th>Date</th><th>Entry</th><th>Content hash</th><th>Previous hash</th><th>Written</th></tr>
                    </thead>
                    <tbody>
                      {ledgerEntries.map((entry) => (
                        <tr key={entry.id} className="is-open">
                          <td data-label="Date">{formatDateLocal(entry.entry_date)}</td>
                          <td data-label="Entry"><span className="hash-chip" title={entry.id}>{entry.id.slice(0, 12)}</span>{entry.previous_hash === 'GENESIS' && <span className="genesis-chip">Genesis block</span>}</td>
                          <td data-label="Content hash"><span className="hash-chip" title={entry.content_hash}>{entry.content_hash.slice(0, 12)}</span></td>
                          <td data-label="Previous hash"><span className="hash-chip" title={entry.previous_hash}>{(entry.previous_hash === 'GENESIS' ? '' : entry.previous_hash).slice(0, 12) || 'GENESIS'}</span></td>
                          <td data-label="Written" className="stack-extra" title={new Date(entry.created_at).toLocaleString('en-NG', { timeZone: 'Africa/Lagos' })}>{formatLagosStamp(entry.created_at)} WAT</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </GlassWidget>
          </div>
        </div>
      </main>
    </div>
  )
}
