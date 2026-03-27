import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, ShieldAlert, RotateCcw } from 'lucide-react'
import { admin } from '../../api/admin'
import { useConfirm } from '../../components/ConfirmModal'
import type { AdminCaptureRound } from '../../types'

// A round is "stuck" if it has been running for more than 30 minutes with 0/0 results
function isStuck(r: AdminCaptureRound): boolean {
  if (r.status !== 'running') return false
  const diffMs = Date.now() - new Date(r.scheduled_at).getTime()
  return r.total_results === 0 && diffMs > 30 * 60 * 1000
}

function statusBadge(r: AdminCaptureRound) {
  if (isStuck(r)) return <span className="badge badge--danger">Stuck</span>
  if (r.status === 'running') return <span className="badge badge--warning">Running</span>
  if (r.status === 'failed')  return <span className="badge badge--danger">Failed</span>
  return <span className="badge badge--info">Overdue</span>
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function AdminCaptures() {
  const [rounds, setRounds] = useState<AdminCaptureRound[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState<Set<number>>(new Set())
  const [recovering, setRecovering] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { confirmModal, askConfirm } = useConfirm()

  const showToast = (msg: string, ok: boolean) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ msg, ok })
    toastTimer.current = setTimeout(() => setToast(null), 4000)
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await admin.problematicCaptures()
      setRounds(data.rounds)
      setTotal(data.total)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load capture rounds')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const interval = setInterval(load, 30_000)
    return () => clearInterval(interval)
  }, [load])

  async function handleRetry(roundId: number) {
    setRetrying(prev => new Set(prev).add(roundId))
    try {
      await admin.retryCapture(roundId)
      showToast(`Round #${roundId} queued for retry`, true)
      setTimeout(load, 1500)
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Retry failed', false)
    } finally {
      setRetrying(prev => {
        const next = new Set(prev)
        next.delete(roundId)
        return next
      })
    }
  }

  async function handleRecoverAll() {
    const ok = await askConfirm({
      title: 'Recover All Rounds',
      message: `Reset and re-run all ${total} problematic rounds (stuck, failed, overdue)? Each capture will be re-triggered.`,
      confirmLabel: 'Recover All',
      cancelLabel: 'Cancel',
      variant: 'danger',
    })
    if (!ok) return
    setRecovering(true)
    try {
      const res = await admin.recoverAll()
      showToast(`${res.queued} rounds queued for recovery`, true)
      setTimeout(load, 2000)
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Recovery failed', false)
    } finally {
      setRecovering(false)
    }
  }

  const failedCount  = rounds.filter(r => r.status === 'failed').length
  const stuckCount   = rounds.filter(r => isStuck(r)).length
  const runningCount = rounds.filter(r => r.status === 'running' && !isStuck(r)).length
  const pendingCount = rounds.filter(r => r.status === 'pending').length

  return (
    <div className="page-content">
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
            onClick={load}
            disabled={loading}
            title="Refresh"
          >
            <RefreshCw size={14} strokeWidth={2} className={loading ? 'spin' : ''} />
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

      {/* Summary badges */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        {stuckCount > 0 && (
          <span className="badge badge--danger">
            <AlertTriangle size={12} /> {stuckCount} Stuck
          </span>
        )}
        <span className="badge badge--danger">
          <AlertTriangle size={12} /> {failedCount} Failed
        </span>
        {runningCount > 0 && (
          <span className="badge badge--warning">
            <Loader2 size={12} /> {runningCount} Running
          </span>
        )}
        {pendingCount > 0 && (
          <span className="badge badge--info">
            {pendingCount} Overdue
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: 'var(--text-muted)', alignSelf: 'center' }}>
          Auto-refreshes every 30s · Total: {total}
        </span>
      </div>

      {stuckCount > 0 && (
        <div className="alert alert--warning" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <AlertTriangle size={15} />
          <span>
            <strong>{stuckCount} round{stuckCount > 1 ? 's are' : ' is'} stuck</strong> — running for over 30 minutes with no results.
            Click <strong>Recover All</strong> to reset and re-run them, or retry individually below.
          </span>
        </div>
      )}

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

      {error && (
        <div className="alert alert--danger" style={{ marginBottom: '1rem' }}>
          <AlertTriangle size={15} /> {error}
        </div>
      )}

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
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Status</th>
                <th>User</th>
                <th>Employer</th>
                <th>Position</th>
                <th>Scheduled</th>
                <th>Results</th>
                <th>Error</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {rounds.map(r => {
                const isRetrying = retrying.has(r.round_id)
                return (
                  <tr key={r.round_id} style={isStuck(r) ? { background: 'rgba(220, 38, 38, 0.04)' } : undefined}>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>#{r.round_id}</td>
                    <td>{statusBadge(r)}</td>
                    <td style={{ fontSize: '0.82rem' }}>{r.user_email}</td>
                    <td style={{ fontSize: '0.82rem' }}>{r.employer_name}</td>
                    <td style={{ fontSize: '0.82rem', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.position_title}
                    </td>
                    <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{fmtDate(r.scheduled_at)}</td>
                    <td style={{ fontSize: '0.82rem', textAlign: 'center' }}>
                      {r.failed_results > 0
                        ? <span style={{ color: 'var(--color-danger)', fontWeight: 600 }}>{r.failed_results}</span>
                        : r.failed_results
                      } / {r.total_results}
                    </td>
                    <td
                      style={{
                        fontSize: '0.76rem',
                        color: (isStuck(r) || (r.status === 'failed' && r.total_results === 0)) ? 'var(--color-danger)' : 'var(--text-muted)',
                        maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}
                      title={r.error_sample
                        ?? (isStuck(r) ? 'Round stuck in RUNNING state — no captures were executed'
                          : r.status === 'failed' && r.total_results === 0 ? 'Round failed before any captures ran (server crash or restart)'
                          : r.status === 'pending' ? 'Round never started'
                          : '')}
                    >
                      {r.error_sample
                        ?? (isStuck(r) ? 'Stuck — never executed'
                          : r.status === 'failed' && r.total_results === 0 ? 'Never executed (server crash)'
                          : r.status === 'pending' ? 'Never started'
                          : '—')}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => handleRetry(r.round_id)}
                        disabled={isRetrying}
                        title={`Retry round #${r.round_id}`}
                      >
                        {isRetrying
                          ? <Loader2 size={12} strokeWidth={2} className="spin" />
                          : <RotateCcw size={12} strokeWidth={2} />}
                        Retry
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {confirmModal}
    </div>
  )
}
