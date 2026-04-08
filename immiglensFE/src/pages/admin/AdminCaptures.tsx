import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronRight,
  Clock, Loader2, RefreshCw, RotateCcw, ShieldAlert,
} from 'lucide-react'
import { admin } from '../../api/admin'
import { useConfirm } from '../../components/ConfirmModal'
import type { AdminCaptureRound } from '../../types'

// Match the backend STUCK_ROUND_TIMEOUT_MINUTES setting (60 min).
// Uses updated_at (actual RUNNING start time), not scheduled_at.
const STUCK_THRESHOLD_MS = 60 * 60 * 1000
const AUTO_REFRESH_MS = 30_000

function isStuck(r: AdminCaptureRound): boolean {
  if (r.status !== 'running') return false
  const diffMs = Date.now() - new Date(r.updated_at).getTime()
  return r.total_results === 0 && diffMs > STUCK_THRESHOLD_MS
}

function classify(r: AdminCaptureRound): 'stuck' | 'failed' | 'partial' | 'ghost' | 'running' | 'overdue' {
  if (isStuck(r)) return 'stuck'
  if (r.status === 'failed') return 'failed'
  if (r.status === 'running') return 'running'
  if (r.status === 'completed' && r.total_results === 0) return 'ghost'
  if (r.status === 'completed' && r.failed_results > 0) return 'partial'
  return 'overdue'
}

const STATUS_CONFIG = {
  stuck:   { label: 'Stuck',   cls: 'badge--danger',   icon: <AlertTriangle size={10} /> },
  failed:  { label: 'Failed',  cls: 'badge--danger',   icon: <AlertTriangle size={10} /> },
  partial: { label: 'Partial', cls: 'badge--warning',  icon: <AlertTriangle size={10} /> },
  ghost:   { label: 'Empty',   cls: 'badge--warning',  icon: <AlertTriangle size={10} /> },
  running: { label: 'Running', cls: 'badge--warning',  icon: <Loader2 size={10} className="spin" /> },
  overdue: { label: 'Overdue', cls: 'badge--info',     icon: <Clock size={10} /> },
} as const

function StatusBadge({ r }: { r: AdminCaptureRound }) {
  const kind = classify(r)
  const { label, cls, icon } = STATUS_CONFIG[kind]
  return (
    <span className={`badge ${cls}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
      {icon} {label}
    </span>
  )
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function fmtAgo(iso: string | null | undefined) {
  if (!iso) return '—'
  const diffMs = Date.now() - new Date(iso).getTime()
  if (diffMs < 60_000) return 'just now'
  const m = Math.floor(diffMs / 60_000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m ago`
}

function errorText(r: AdminCaptureRound): string {
  if (r.error_sample) return r.error_sample
  if (isStuck(r)) return 'Stuck in RUNNING — no captures executed'
  if (r.status === 'failed' && r.total_results === 0) return 'Failed before any URL was captured (server crash / restart)'
  if (r.status === 'completed' && r.total_results === 0) return 'Completed with no results — no active job board URLs at capture time (historical)'
  if (r.status === 'completed' && r.failed_results > 0) return `${r.failed_results} of ${r.total_results} URL(s) failed`
  if (r.status === 'pending') return 'Never started — APScheduler job missing'
  return ''
}

// ── Section table ────────────────────────────────────────────────────────────

interface SectionProps {
  title: string
  count: number
  accent: string
  rounds: AdminCaptureRound[]
  retrying: Set<number>
  expandedErrors: Set<number>
  onRetry: (id: number) => void
  onToggleError: (id: number) => void
}

function CaptureSection({
  title, count, accent, rounds, retrying, expandedErrors, onRetry, onToggleError,
}: SectionProps) {
  const [collapsed, setCollapsed] = useState(false)
  if (count === 0) return null

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      {/* Section header */}
      <button
        onClick={() => setCollapsed(c => !c)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          display: 'flex', alignItems: 'center', gap: '0.4rem',
          fontSize: '0.82rem', fontWeight: 600, color: accent,
          marginBottom: collapsed ? 0 : '0.5rem',
          userSelect: 'none',
        }}
      >
        {collapsed
          ? <ChevronRight size={14} strokeWidth={2} />
          : <ChevronDown size={14} strokeWidth={2} />}
        {title}
        <span style={{
          marginLeft: '0.25rem', fontSize: '0.72rem', fontWeight: 500,
          background: accent + '20', color: accent,
          padding: '1px 6px', borderRadius: '9999px',
        }}>
          {count}
        </span>
      </button>

      {!collapsed && (
        <div className="table-wrapper" style={{ marginTop: 0 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 60 }}>ID</th>
                <th style={{ width: 90 }}>Status</th>
                <th>User</th>
                <th>Position</th>
                <th style={{ width: 130 }}>Last Updated</th>
                <th style={{ width: 80, textAlign: 'center' }}>URLs</th>
                <th>Error</th>
                <th style={{ width: 80, textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {rounds.map(r => {
                const isRetrying = retrying.has(r.round_id)
                const errMsg = errorText(r)
                const errExpanded = expandedErrors.has(r.round_id)
                const rowBg = classify(r) === 'stuck' ? 'rgba(220,38,38,0.04)' : undefined

                return (
                  <tr key={r.round_id} style={{ background: rowBg }}>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      #{r.round_id}
                    </td>
                    <td><StatusBadge r={r} /></td>
                    <td style={{ fontSize: '0.8rem' }}>
                      <div style={{ fontWeight: 500, lineHeight: 1.3 }}>{r.user_email}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{r.employer_name}</div>
                    </td>
                    <td style={{ fontSize: '0.8rem', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.position_title}
                    </td>
                    <td style={{ fontSize: '0.78rem', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
                      <span title={`Updated: ${fmtDate(r.updated_at)}`}>{fmtAgo(r.updated_at)}</span>
                    </td>
                    <td style={{ textAlign: 'center', fontSize: '0.82rem' }}>
                      {r.failed_results > 0
                        ? <><span style={{ color: 'var(--color-danger)', fontWeight: 600 }}>{r.failed_results}</span><span style={{ color: 'var(--text-muted)' }}>/{r.total_results}</span></>
                        : <span style={{ color: 'var(--text-muted)' }}>{r.total_results}</span>
                      }
                    </td>
                    <td style={{ fontSize: '0.75rem', maxWidth: 240 }}>
                      {errMsg ? (
                        <div>
                          <div
                            style={{
                              color: 'var(--color-danger)',
                              overflow: 'hidden',
                              textOverflow: errExpanded ? 'unset' : 'ellipsis',
                              whiteSpace: errExpanded ? 'normal' : 'nowrap',
                              maxWidth: 240,
                              wordBreak: 'break-word',
                            }}
                            title={errExpanded ? undefined : errMsg}
                          >
                            {errMsg}
                          </div>
                          {errMsg.length > 60 && (
                            <button
                              onClick={() => onToggleError(r.round_id)}
                              style={{
                                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                                fontSize: '0.7rem', color: 'var(--color-primary)', marginTop: 2,
                              }}
                            >
                              {errExpanded ? 'collapse' : 'expand'}
                            </button>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => onRetry(r.round_id)}
                        disabled={isRetrying || r.status === 'running'}
                        title={r.status === 'running' ? 'Already running' : `Retry round #${r.round_id}`}
                      >
                        {isRetrying
                          ? <Loader2 size={11} strokeWidth={2} className="spin" />
                          : <RotateCcw size={11} strokeWidth={2} />}
                        {isRetrying ? 'Retrying…' : 'Retry'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

export default function AdminCaptures() {
  const [rounds, setRounds] = useState<AdminCaptureRound[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [silentLoading, setSilentLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState<Set<number>>(new Set())
  const [recovering, setRecovering] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [expandedErrors, setExpandedErrors] = useState<Set<number>>(new Set())
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date())
  const [secondsSince, setSecondsSince] = useState(0)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { confirmModal, askConfirm } = useConfirm()

  const showToast = (msg: string, ok: boolean) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ msg, ok })
    toastTimer.current = setTimeout(() => setToast(null), 5000)
  }

  // Initial load shows full spinner; subsequent auto-refreshes are silent
  const load = useCallback(async (silent = false) => {
    if (silent) setSilentLoading(true)
    else setLoading(true)
    setError(null)
    try {
      const data = await admin.problematicCaptures()
      setRounds(data.rounds)
      setTotal(data.total)
      setLastRefreshed(new Date())
      setSecondsSince(0)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load capture rounds')
    } finally {
      if (silent) setSilentLoading(false)
      else setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(false)
    const interval = setInterval(() => load(true), AUTO_REFRESH_MS)
    return () => clearInterval(interval)
  }, [load])

  // "Last refreshed N s ago" ticker
  useEffect(() => {
    const ticker = setInterval(() => {
      setSecondsSince(Math.floor((Date.now() - lastRefreshed.getTime()) / 1000))
    }, 5000)
    return () => clearInterval(ticker)
  }, [lastRefreshed])

  function toggleError(id: number) {
    setExpandedErrors(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleRetry(roundId: number) {
    setRetrying(prev => new Set(prev).add(roundId))
    try {
      await admin.retryCapture(roundId)
      showToast(`Round #${roundId} queued for retry`, true)
      setTimeout(() => load(true), 1500)
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Retry failed', false)
    } finally {
      setRetrying(prev => { const s = new Set(prev); s.delete(roundId); return s })
    }
  }

  async function handleRecoverAll() {
    const ok = await askConfirm({
      title: 'Recover All Rounds',
      message: `Reset and re-run all ${total} problematic rounds (failed, stuck, and overdue)? Each capture will be individually re-triggered. Active captures that haven't exceeded the 60-minute timeout are not affected.`,
      confirmLabel: 'Recover All',
      cancelLabel: 'Cancel',
      variant: 'danger',
    })
    if (!ok) return
    setRecovering(true)
    try {
      const res = await admin.recoverAll()
      showToast(
        res.queued > 0
          ? `${res.queued} round${res.queued !== 1 ? 's' : ''} queued for recovery`
          : 'No problematic rounds found — all healthy.',
        true,
      )
      setTimeout(() => load(true), 2000)
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Recovery failed', false)
    } finally {
      setRecovering(false)
    }
  }

  // Partition rounds by category
  const stuckRounds   = rounds.filter(r => classify(r) === 'stuck')
  const failedRounds  = rounds.filter(r => classify(r) === 'failed')
  const partialRounds = rounds.filter(r => classify(r) === 'partial')
  const ghostRounds   = rounds.filter(r => classify(r) === 'ghost')
  const runningRounds = rounds.filter(r => classify(r) === 'running')
  const overdueRounds = rounds.filter(r => classify(r) === 'overdue')

  const stuckCount   = stuckRounds.length
  const failedCount  = failedRounds.length
  const partialCount = partialRounds.length
  const ghostCount   = ghostRounds.length
  const runningCount = runningRounds.length
  const overdueCount = overdueRounds.length

  return (
    <div className="page-content">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Capture Monitor</h1>
          <p className="page-subtitle">
            Failed, stuck, and overdue capture rounds across all users
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            className="btn btn-secondary"
            onClick={() => load(false)}
            disabled={loading || silentLoading}
            title="Refresh now"
          >
            <RefreshCw size={14} strokeWidth={2} className={(loading || silentLoading) ? 'spin' : ''} />
            Refresh
          </button>
          <button
            className="btn btn-primary"
            onClick={handleRecoverAll}
            disabled={recovering || total === 0}
          >
            {recovering
              ? <Loader2 size={14} strokeWidth={2} className="spin" />
              : <ShieldAlert size={14} strokeWidth={2} />}
            Recover All ({total})
          </button>
        </div>
      </div>

      {/* ── Summary strip ──────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {stuckCount > 0 && (
          <span className="badge badge--danger" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
            <AlertTriangle size={11} /> {stuckCount} Stuck
          </span>
        )}
        {failedCount > 0 && (
          <span className="badge badge--danger" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
            <AlertTriangle size={11} /> {failedCount} Failed
          </span>
        )}
        {partialCount > 0 && (
          <span className="badge badge--warning" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
            <AlertTriangle size={11} /> {partialCount} Partial
          </span>
        )}
        {ghostCount > 0 && (
          <span className="badge badge--warning" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
            <AlertTriangle size={11} /> {ghostCount} Empty
          </span>
        )}
        {runningCount > 0 && (
          <span className="badge badge--warning" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
            <Loader2 size={11} className="spin" /> {runningCount} Running
          </span>
        )}
        {overdueCount > 0 && (
          <span className="badge badge--info" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
            <Clock size={11} /> {overdueCount} Overdue
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          {silentLoading
            ? 'Refreshing…'
            : secondsSince < 10
              ? 'Refreshed just now'
              : `Refreshed ${secondsSince}s ago`
          }
          {' · '}Auto every 30s{' · '}Total: {total}
        </span>
      </div>

      {/* ── Stuck alert banner ─────────────────────────────────────────── */}
      {stuckCount > 0 && (
        <div className="alert alert--warning" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
          <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>
            <strong>{stuckCount} round{stuckCount > 1 ? 's are' : ' is'} stuck</strong> — running over 60 minutes with no captured URLs.
            Use <strong>Recover All</strong> to reset and re-queue, or retry individually.
          </span>
        </div>
      )}

      {/* ── Toast ──────────────────────────────────────────────────────── */}
      {toast && (
        <div
          className={`alert ${toast.ok ? 'alert--success' : 'alert--danger'}`}
          style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          {toast.ok
            ? <CheckCircle2 size={15} />
            : <AlertTriangle size={15} />}
          {toast.msg}
        </div>
      )}

      {/* ── Load error ─────────────────────────────────────────────────── */}
      {error && (
        <div className="alert alert--danger" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <AlertTriangle size={15} /> {error}
        </div>
      )}

      {/* ── Content ────────────────────────────────────────────────────── */}
      {loading && rounds.length === 0 ? (
        <div className="loading-block">
          <Loader2 size={20} className="spin" /> Loading capture rounds…
        </div>
      ) : rounds.length === 0 ? (
        <div className="empty-state">
          <CheckCircle2 size={36} strokeWidth={1.5} style={{ color: 'var(--color-success)' }} />
          <p>All capture rounds are healthy — no issues found.</p>
        </div>
      ) : (
        <>
          <CaptureSection
            title="Stuck Rounds"
            count={stuckCount}
            accent="var(--color-danger)"
            rounds={stuckRounds}
            retrying={retrying}
            expandedErrors={expandedErrors}
            onRetry={handleRetry}
            onToggleError={toggleError}
          />
          <CaptureSection
            title="Failed Rounds"
            count={failedCount}
            accent="var(--color-danger)"
            rounds={failedRounds}
            retrying={retrying}
            expandedErrors={expandedErrors}
            onRetry={handleRetry}
            onToggleError={toggleError}
          />
          <CaptureSection
            title="Partially Failed Rounds"
            count={partialCount}
            accent="var(--color-warning, #f59e0b)"
            rounds={partialRounds}
            retrying={retrying}
            expandedErrors={expandedErrors}
            onRetry={handleRetry}
            onToggleError={toggleError}
          />
          <CaptureSection
            title="Empty Completions (historical)"
            count={ghostCount}
            accent="var(--color-warning, #f59e0b)"
            rounds={ghostRounds}
            retrying={retrying}
            expandedErrors={expandedErrors}
            onRetry={handleRetry}
            onToggleError={toggleError}
          />
          <CaptureSection
            title="Overdue Rounds"
            count={overdueCount}
            accent="var(--color-info, #3b82f6)"
            rounds={overdueRounds}
            retrying={retrying}
            expandedErrors={expandedErrors}
            onRetry={handleRetry}
            onToggleError={toggleError}
          />
          <CaptureSection
            title="Running (monitoring only)"
            count={runningCount}
            accent="var(--color-warning, #f59e0b)"
            rounds={runningRounds}
            retrying={retrying}
            expandedErrors={expandedErrors}
            onRetry={handleRetry}
            onToggleError={toggleError}
          />
        </>
      )}

      {confirmModal}
    </div>
  )
}
