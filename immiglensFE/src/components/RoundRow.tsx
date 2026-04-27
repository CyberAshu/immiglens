import { useRef, useState } from 'react'
import type { CaptureRound, JobUrl } from '../types'

interface RoundRowProps {
  round: CaptureRound
  urls: JobUrl[]
  onRun: () => void
  running: boolean
  onRecapture: (roundId: number, resultId: number) => void
  recapturing: Set<number>
  allowCapture: boolean
  retryInfo?: { count: number; lastAt: string }
  onManualUpload: (roundId: number, jobUrlId: number, file: File) => void
  uploading: Set<number>  // keyed by job_url_id
}

export function RoundRow({
  round,
  urls,
  onRun,
  running,
  onRecapture,
  recapturing,
  allowCapture,
  retryInfo,
  onManualUpload,
  uploading,
}: RoundRowProps) {
  const [expanded, setExpanded] = useState(false)
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({})

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })
  }
  function fmtDateTime(iso: string) {
    return new Date(iso).toLocaleString('en-CA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  function handleFileChange(jobUrlId: number, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    onManualUpload(round.id, jobUrlId, file)
    // Reset so same file can be re-selected if needed
    e.target.value = ''
  }

  const activeUrlCount = urls.filter(u => u.is_active).length
  const canRun = !running && activeUrlCount > 0
  const noUrlTitle = activeUrlCount === 0
    ? (urls.length === 0 ? 'Add job board URLs first' : 'All job board URLs are deactivated — activate at least one first')
    : undefined

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
          {retryInfo && (
            <span className="round-captured" title={`Last retry: ${fmtDateTime(retryInfo.lastAt)}`}>
              retries {retryInfo.count} · last {fmtDateTime(retryInfo.lastAt)}
            </span>
          )}
        </div>
        <div className="round-row-right">
          {round.status === 'pending' && allowCapture && (
            <button
              className="btn-ghost btn-sm"
              onClick={e => { e.stopPropagation(); onRun() }}
              disabled={!canRun}
              title={noUrlTitle}
            >
              {running ? 'Running…' : 'Capture Now'}
            </button>
          )}
          {round.status === 'failed' && (
            <button
              className="btn-ghost btn-sm"
              onClick={e => { e.stopPropagation(); onRun() }}
              disabled={!canRun}
              title={noUrlTitle ?? 'Re-run this failed capture'}
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
            round.status === 'failed' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <p className="empty-inline" style={{ color: '#ef4444' }}>
                  ⚠️ Capture failed — no screenshots were taken. Check that at least one job board URL is active.
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                  <button
                    className="btn-ghost btn-sm"
                    onClick={() => onRun()}
                    disabled={!canRun}
                    title={noUrlTitle ?? 'Re-run this capture'}
                  >
                    {running ? 'Running…' : 'Re-run Capture'}
                  </button>
                  {urls.filter(u => u.is_active).map(u => (
                    <label key={u.id} style={{ display: 'inline-flex', alignItems: 'center', cursor: uploading.has(u.id) ? 'not-allowed' : 'pointer' }}>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        style={{ display: 'none' }}
                        ref={el => { fileInputRefs.current[u.id] = el }}
                        onChange={e => handleFileChange(u.id, e)}
                        disabled={uploading.has(u.id)}
                      />
                      <span className="btn-ghost btn-sm" style={{ pointerEvents: uploading.has(u.id) ? 'none' : 'auto', opacity: uploading.has(u.id) ? 0.6 : 1 }}>
                        {uploading.has(u.id) ? 'Uploading…' : `Upload Screenshot (${u.platform})`}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ) : (
              <p className="empty-inline">No results yet.</p>
            )
          ) : (
            round.results.map(result => {
              const jobUrl = urls.find(p => p.id === result.job_url_id)
              return (
                <div key={result.id} className="result-row">
                  <div className="result-row-info">
                    <span className="posting-platform">{jobUrl?.platform ?? 'Unknown'}</span>
                    <a
                      href={result.url}
                      target="_blank"
                      rel="noreferrer"
                      className="posting-url"
                    >
                      {result.url}
                    </a>
                    <span className={`badge badge--${result.status}`}>{result.status}</span>
                    {result.is_manual && (
                      <span className="badge" style={{ background: '#e0f2fe', color: '#0369a1', fontSize: '0.68rem' }} title="Manually uploaded screenshot">
                        Manual Upload
                      </span>
                    )}
                    {result.duration_ms && (
                      <span className="result-duration">
                        {(result.duration_ms / 1000).toFixed(1)}s
                      </span>
                    )}
                    {result.error && (
                      <span className="result-error-inline">{result.error}</span>
                    )}
                    {result.status === 'failed' && (
                      <>
                        <button
                          className="btn-ghost btn-sm"
                          disabled={recapturing.has(result.id)}
                          onClick={() => onRecapture(round.id, result.id)}
                        >
                          {recapturing.has(result.id) ? 'Retrying…' : 'Retry'}
                        </button>
                        <label style={{ display: 'inline-flex', alignItems: 'center', cursor: uploading.has(result.job_url_id) ? 'not-allowed' : 'pointer' }}>
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            style={{ display: 'none' }}
                            ref={el => { fileInputRefs.current[result.job_url_id] = el }}
                            onChange={e => handleFileChange(result.job_url_id, e)}
                            disabled={uploading.has(result.job_url_id)}
                          />
                          <span className="btn-ghost btn-sm" style={{ pointerEvents: uploading.has(result.job_url_id) ? 'none' : 'auto', opacity: uploading.has(result.job_url_id) ? 0.6 : 1 }}>
                            {uploading.has(result.job_url_id) ? 'Uploading…' : 'Upload Screenshot'}
                          </span>
                        </label>
                      </>
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
