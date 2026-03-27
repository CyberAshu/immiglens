import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { changes as changesApi } from '../api'
import type { ChangeHistoryItem } from '../types'
import { BASE } from '../api/client'

const PAGE_SIZE = 20

function ChangeIndicator({ changed }: { changed: boolean | null }) {
  if (changed === null) return <span className="change-badge change-badge--first">FIRST</span>
  if (changed)          return <span className="change-badge change-badge--changed">CHANGED</span>
  return                       <span className="change-badge change-badge--same">NO CHANGE</span>
}

export default function ChangeHistory() {
  const { postingId } = useParams<{ postingId: string }>()
  const [history, setHistory] = useState<ChangeHistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [page, setPage]       = useState(1)

  useEffect(() => {
    if (!postingId) return
    changesApi.history(Number(postingId))
      .then(setHistory)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [postingId])

  const changed    = history.filter(h => h.has_changed === true).length
  const same        = history.filter(h => h.has_changed === false).length
  const totalPages  = Math.max(1, Math.ceil(history.length / PAGE_SIZE))
  const pageOffset  = (page - 1) * PAGE_SIZE
  const paginated   = history.slice(pageOffset, pageOffset + PAGE_SIZE)

  return (
    <div className="page">
      <div className="breadcrumb">
        <Link to="/dashboard">Dashboard</Link> › Change History
      </div>

      <div className="page-header">
        <div>
          <h1>Change History</h1>
          <p className="sub-text">Visual diff timeline for posting #{postingId}</p>
        </div>
      </div>

      {loading && <div className="loading">Loading…</div>}
      {error   && <div className="error-msg">{error}</div>}

      {!loading && !error && (
        <>
          {/* ── Summary ──────────────────────────── */}
          {history.length > 0 && (
            <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
              {[
                { label: 'Total Snapshots', value: history.length,   accent: '#6366f1' },
                { label: 'Changes Detected',value: changed,           accent: '#ef4444' },
                { label: 'No Change',       value: same,             accent: '#22c55e' },
              ].map(c => (
                <div key={c.label} className="stat-card">
                  <div className="stat-value" style={{ color: c.accent }}>{c.value}</div>
                  <div className="stat-label">{c.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* ── Timeline ─────────────────────────── */}
          {history.length === 0
            ? <div className="card"><p className="empty-hint">No snapshots yet for this posting.</p></div>
            : (
              <div className="change-timeline">
                {paginated.map((item, idx) => (
                  <div key={item.snapshot_id} className={`change-item ${item.has_changed ? 'change-item--changed' : ''}`}>
                    <div className="change-dot" />
                    <div className="change-content">
                      <div className="change-meta">
                        <span className="change-seq">#{history.length - pageOffset - idx}</span>
                        <span className="change-time">{new Date(item.captured_at).toLocaleString()}</span>
                        <ChangeIndicator changed={item.has_changed} />
                      </div>
                      {item.change_summary && (
                        <div className="change-summary">{item.change_summary}</div>
                      )}
                      {item.screenshot_url && (
                        <button
                          className="btn-ghost btn-xs"
                          onClick={() => setPreview(preview === item.screenshot_url ? null : item.screenshot_url)}
                        >
                          {preview === item.screenshot_url ? '▲ Hide screenshot' : '▼ View screenshot'}
                        </button>
                      )}
                      {preview === item.screenshot_url && item.screenshot_url && (
                        <div className="change-screenshot">
                          <img
                            src={item.screenshot_url.startsWith('http') ? item.screenshot_url : `${BASE}${item.screenshot_url.startsWith('/') ? '' : '/'}${item.screenshot_url}`}
                            alt="Screenshot"
                            className="change-screenshot-img"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', justifyContent: 'center', marginTop: '1.5rem' }}>
              <button className="btn-ghost btn-sm" onClick={() => setPage(p => p - 1)} disabled={page === 1}>
                ← Prev
              </button>
              <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>Page {page} / {totalPages}</span>
              <button className="btn-ghost btn-sm" onClick={() => setPage(p => p + 1)} disabled={page === totalPages}>
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
