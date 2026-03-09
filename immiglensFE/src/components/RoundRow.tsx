import { useState } from 'react'
import type { CaptureRound, JobPosting } from '../types'

interface RoundRowProps {
  round: CaptureRound
  postings: JobPosting[]
  onRun: () => void
  running: boolean
  onRecapture: (roundId: number, resultId: number) => void
  recapturing: Set<number>
}

export function RoundRow({
  round,
  postings,
  onRun,
  running,
  onRecapture,
  recapturing,
}: RoundRowProps) {
  const [expanded, setExpanded] = useState(false)
  const date = new Date(round.scheduled_at).toLocaleDateString('en-CA')

  return (
    <div className={`round-row round-row--${round.status}`}>
      <div className="round-row-header" onClick={() => setExpanded(v => !v)}>
        <div className="round-row-left">
          <span className={`badge badge--${round.status}`}>{round.status}</span>
          <span className="round-date">{date}</span>
          {round.captured_at && (
            <span className="round-captured">
              captured {new Date(round.captured_at).toLocaleString()}
            </span>
          )}
        </div>
        <div className="round-row-right">
          {round.status === 'pending' && (
            <button
              className="btn-ghost btn-sm"
              onClick={e => { e.stopPropagation(); onRun() }}
              disabled={running || postings.length === 0}
              title={postings.length === 0 ? 'Add job posting URLs first' : undefined}
            >
              {running ? 'Running…' : 'Capture Now'}
            </button>
          )}
          <span className="round-toggle">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded && (
        <div className="round-results">
          {round.results.length === 0 ? (
            <p className="empty-inline">No results yet.</p>
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
