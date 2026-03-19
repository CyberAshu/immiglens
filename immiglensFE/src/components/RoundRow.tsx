import { useState } from 'react'
import type { CaptureRound, JobPosting } from '../types'

interface RoundRowProps {
  round: CaptureRound
  postings: JobPosting[]
  onRun: () => void
  running: boolean
  onRecapture: (roundId: number, resultId: number) => void
  recapturing: Set<number>
  allowCapture: boolean
}

export function RoundRow({
  round,
  postings,
  onRun,
  running,
  onRecapture,
  recapturing,
  allowCapture,
}: RoundRowProps) {
  const [expanded, setExpanded] = useState(false)

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })
  }
  function fmtDateTime(iso: string) {
    return new Date(iso).toLocaleString('en-CA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const date = fmtDate(round.scheduled_at)

  return (
    <div className={`round-row round-row--${round.status}`}>
      <div className="round-row-header" onClick={() => setExpanded(v => !v)}>
        <div className="round-row-left">
          <span className={`badge badge--${round.status}`}>{round.status}</span>
          <span className="round-date">{date}</span>
          {round.captured_at && (
            <span className="round-captured">
              captured {fmtDateTime(round.captured_at)}
            </span>
          )}
        </div>
        <div className="round-row-right">
          {round.status === 'pending' && allowCapture && (
            <button
              className="btn-ghost btn-sm"
              onClick={e => { e.stopPropagation(); onRun() }}
              disabled={running || postings.length === 0}
              title={postings.length === 0 ? 'Add job posting URLs first' : undefined}
            >
              {running ? 'Running…' : 'Capture Now'}
            </button>
          )}
          {round.status === 'failed' && (
            <button
              className="btn-ghost btn-sm"
              onClick={e => { e.stopPropagation(); onRun() }}
              disabled={running || postings.length === 0}
              title={postings.length === 0 ? 'Add job posting URLs first' : 'Re-run this failed capture'}
            >
              {running ? 'Running…' : 'Re-run Capture'}
            </button>
          )}
          <span className="round-toggle">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded && (
        <div className="round-results">
          {round.results.length === 0 ? (
            round.status === 'completed' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <p className="empty-inline" style={{ color: '#f59e0b' }}>
                  ⚠️ Capture ran but no job board URLs were linked at the time — no screenshots were taken.
                </p>
                <button
                  className="btn-ghost btn-sm"
                  style={{ alignSelf: 'flex-start' }}
                  onClick={() => onRun()}
                  disabled={running || postings.length === 0}
                  title={postings.length === 0 ? 'Add job posting URLs first' : 'Re-run this capture'}
                >
                  {running ? 'Running…' : 'Re-run Capture'}
                </button>
              </div>
            ) : (
              <p className="empty-inline">No results yet.</p>
            )
          ) : (
            round.results.map(result => {
              const posting = postings.find(p => p.id === result.job_posting_id)
              return (
                <div key={result.id} className="result-row">
                  <div className="result-row-info">
                    <span className="posting-platform">{posting?.platform ?? 'Unknown'}</span>
                    <a
                      href={result.url}
                      target="_blank"
                      rel="noreferrer"
                      className="posting-url"
                    >
                      {result.url}
                    </a>
                    <span className={`badge badge--${result.status}`}>{result.status}</span>
                    {result.duration_ms && (
                      <span className="result-duration">
                        {(result.duration_ms / 1000).toFixed(1)}s
                      </span>
                    )}
                    {result.error && (
                      <span className="result-error-inline">{result.error}</span>
                    )}
                    {result.status === 'failed' && (
                      <button
                        className="btn-ghost btn-sm"
                        disabled={recapturing.has(result.id)}
                        onClick={() => onRecapture(round.id, result.id)}
                      >
                        {recapturing.has(result.id) ? 'Retrying…' : 'Retry'}
                      </button>
                    )}
                  </div>
                  {result.screenshot_url && (
                    <a
                      href={result.screenshot_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <img
                        src={result.screenshot_url}
                        alt={result.url}
                        className="result-thumb"
                      />
                    </a>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
