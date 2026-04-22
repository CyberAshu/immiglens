import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { captures as capturesApi, positions as positionsApi, reports as reportsApi, subscriptions as subApi } from '../api'
import { setPendingPdf, setPendingWatermarked } from '../reportStore'
import { RoundRow } from '../components/RoundRow'
import Toast, { useToast } from '../components/Toast'
import type { CaptureRound, JobPosition, ReportDocument, UsageSummary } from '../types'

const HARD_MAX_URLS = 7  // absolute ceiling regardless of tier

export default function PositionDetail() {
  const { employerId, positionId } = useParams<{ employerId: string; positionId: string }>()
  const eId = Number(employerId)
  const pId = Number(positionId)

  const navigate = useNavigate()

  const [position, setPosition] = useState<JobPosition | null>(null)
  const [rounds, setRounds] = useState<CaptureRound[]>([])
  const [documents, setDocuments] = useState<ReportDocument[]>([])
  const [jobMatchDocs, setJobMatchDocs] = useState<ReportDocument[]>([])
  const [planData, setPlanData] = useState<UsageSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [urlForm, setUrlForm] = useState({ platform: '', url: '' })
  const [addingUrl, setAddingUrl] = useState(false)
  const [editingUrlId, setEditingUrlId] = useState<number | null>(null)
  const [editUrlForm, setEditUrlForm] = useState({ platform: '', url: '' })
  const [savingUrlId, setSavingUrlId] = useState<number | null>(null)
  const { toast, showToast, clearToast } = useToast()
  const [runningRound, setRunningRound] = useState<number | null>(null)
  const [recapturingResult, setRecapturingResult] = useState<Set<number>>(new Set())
  const [retryInfoByRound, setRetryInfoByRound] = useState<Record<number, { count: number; lastAt: string }>>({})
  const [uploadingDoc, setUploadingDoc] = useState(false)
  const [uploadingJobMatch, setUploadingJobMatch] = useState(false)
  const [generatingReport, setGeneratingReport] = useState(false)
  const [reportGenError, setReportGenError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [earlyReportModal, setEarlyReportModal] = useState<{
    daysActive: number
    daysRemaining: number
    minimumDays: number
  } | null>(null)
  const [earlyAcknowledged, setEarlyAcknowledged] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const jobMatchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    Promise.all([positionsApi.get(eId, pId), capturesApi.list(eId, pId), subApi.usage().catch(() => null)])
      .then(([pos, rds, plan]) => {
        setPosition(pos)
        setRounds(rds)
        if (plan) setPlanData(plan)
        const allDocs: ReportDocument[] = pos.report_documents ?? []
        setDocuments(allDocs.filter(d => d.doc_type !== 'job_match'))
        setJobMatchDocs(allDocs.filter(d => d.doc_type === 'job_match'))
      })
      .finally(() => setLoading(false))
  }, [eId, pId])

  async function handleAddUrl(e: React.FormEvent) {
    e.preventDefault()
    setAddingUrl(true)
    setError(null)
    try {
      const jobUrl = await positionsApi.addUrl(eId, pId, urlForm)
      setPosition(prev => prev ? { ...prev, job_urls: [...prev.job_urls, jobUrl] } : prev)
      setUrlForm({ platform: '', url: '' })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add URL.')
    } finally {
      setAddingUrl(false)
    }
  }

  async function handleUpdateUrl(e: React.FormEvent, urlId: number) {
    e.preventDefault()
    setSavingUrlId(urlId)
    setError(null)
    try {
      const updated = await positionsApi.updateUrl(eId, pId, urlId, editUrlForm)
      setPosition(prev => prev ? {
        ...prev,
        job_urls: prev.job_urls.map(p => p.id === urlId ? updated : p),
      } : prev)
      setEditingUrlId(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update URL.')
    } finally {
      setSavingUrlId(null)
    }
  }

  async function handleRemoveUrl(urlId: number) {
    await positionsApi.removeUrl(eId, pId, urlId)
    setPosition(prev => prev ? { ...prev, job_urls: prev.job_urls.filter(p => p.id !== urlId) } : prev)
  }

  async function handleRunRound(roundId: number) {
    setRunningRound(roundId)
    setError(null)
    try {
      await capturesApi.runNow(eId, pId, roundId)
      setRetryInfoByRound(prev => {
        const current = prev[roundId]
        return {
          ...prev,
          [roundId]: {
            count: (current?.count ?? 0) + 1,
            lastAt: new Date().toISOString(),
          },
        }
      })
      setRounds(prev => prev.map(r => (r.id === roundId ? { ...r, status: 'running' } : r)))
      setTimeout(async () => {
        try {
          const refreshed = await capturesApi.list(eId, pId)
          setRounds(refreshed)
        } catch {
        }
      }, 1500)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Capture failed.')
    } finally {
      setRunningRound(null)
    }
  }

  async function handleRecaptureResult(roundId: number, resultId: number) {
    setRecapturingResult(prev => new Set(prev).add(resultId))
    setError(null)
    try {
      await capturesApi.recaptureResult(eId, pId, roundId, resultId)
      setRetryInfoByRound(prev => {
        const current = prev[roundId]
        return {
          ...prev,
          [roundId]: {
            count: (current?.count ?? 0) + 1,
            lastAt: new Date().toISOString(),
          },
        }
      })
      setTimeout(async () => {
        try {
          const refreshed = await capturesApi.list(eId, pId)
          setRounds(refreshed)
        } catch {
        }
      }, 1500)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Recapture failed.')
    } finally {
      setRecapturingResult(prev => { const s = new Set(prev); s.delete(resultId); return s })
    }
  }

  async function handleUploadDoc(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingDoc(true)
    try {
      const doc = await reportsApi.uploadDocument(eId, pId, file, 'supporting')
      setDocuments(prev => [...prev, doc])
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed'
      showToast(msg, 'error')
    } finally {
      setUploadingDoc(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleRemoveDoc(docId: number) {
    await reportsApi.removeDocument(eId, pId, docId)
    setDocuments(prev => prev.filter(d => d.id !== docId))
  }

  async function handleUploadJobMatch(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingJobMatch(true)
    try {
      const doc = await reportsApi.uploadDocument(eId, pId, file, 'job_match')
      setJobMatchDocs(prev => [...prev, doc])
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed'
      showToast(msg, 'error')
    } finally {
      setUploadingJobMatch(false)
      if (jobMatchRef.current) jobMatchRef.current.value = ''
    }
  }

  async function handleRemoveJobMatch(docId: number) {
    await reportsApi.removeDocument(eId, pId, docId)
    setJobMatchDocs(prev => prev.filter(d => d.id !== docId))
  }

  if (loading) return <div className="loading">Loading…</div>
  if (!position) return <div className="page"><p>Position not found.</p></div>
  const activeUrlCount = position.job_urls.filter(u => u.is_active).length
  const maxUrls = planData
    ? (planData.tier.max_urls_per_position === -1 ? HARD_MAX_URLS : Math.min(planData.tier.max_urls_per_position, HARD_MAX_URLS))
    : HARD_MAX_URLS
  const urlLimitReached = activeUrlCount >= maxUrls
  const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999)
  const completedRounds = rounds.filter(r => r.status === 'completed').length
  const firstPendingId = rounds
    .filter(r => r.status === 'pending' && new Date(r.scheduled_at) <= todayEnd)
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())[0]?.id ?? null

  async function handleGenerateReport(acknowledgeEarly = false) {
    setGeneratingReport(true)
    setReportGenError(null)
    try {
      const { blob, watermarked } = await reportsApi.generate(eId, pId, acknowledgeEarly)
      const buffer = await blob.arrayBuffer()
      setPendingPdf(buffer)
      setPendingWatermarked(watermarked)
      navigate(`/employers/${eId}/positions/${pId}/report-preview`)
    } catch (err: unknown) {
      // Check if backend returned an EARLY_REPORT 422
      const detail = (err as { detail?: { code?: string; days_active?: number; days_remaining?: number; minimum_days?: number } }).detail
      if (detail && typeof detail === 'object' && detail.code === 'EARLY_REPORT') {
        setEarlyReportModal({ daysActive: detail.days_active!, daysRemaining: detail.days_remaining!, minimumDays: detail.minimum_days ?? 28 })
        setEarlyAcknowledged(false)
        setGeneratingReport(false)
        return
      }
      setReportGenError(err instanceof Error ? err.message : 'Failed to generate report.')
      setGeneratingReport(false)
    }
  }

  async function handleEarlyReportConfirm() {
    setEarlyReportModal(null)
    await handleGenerateReport(true)
  }

  return (
    <div className="page">
      <div className="breadcrumb">
        <Link to="/employers">Employers</Link> /
        <Link to={`/employers/${eId}`}> Employer</Link> /
        {position.job_title}
      </div>

      <div className="page-header">
        <div>
          <h1>
            {position.job_title}
            {!position.is_active && planData && position.capture_frequency_days < planData.tier.min_capture_frequency_days ? (
              <span style={{
                marginLeft: '0.75rem', fontSize: '0.75rem', fontWeight: 700,
                background: '#fef3c7', color: '#92400e',
                border: '1px solid #fde68a', borderRadius: 6,
                padding: '2px 8px', verticalAlign: 'middle',
              }}>Plan Mismatch</span>
            ) : !position.is_active ? (
              <span style={{
                marginLeft: '0.75rem', fontSize: '0.75rem', fontWeight: 700,
                background: '#fee2e2', color: '#b91c1c',
                border: '1px solid #fecaca', borderRadius: 6,
                padding: '2px 8px', verticalAlign: 'middle',
              }}>Deactivated</span>
            ) : null}
          </h1>
          <p className="sub-text">
            NOC {position.noc_code} · {position.num_positions} position(s) · Start: {position.start_date}
            {position.end_date
              ? <> · End: {position.end_date}</>
              : <> · End: {new Date(new Date(position.start_date).getTime() + 28 * 86400000).toISOString().split('T')[0]} (default)</>
            }
            {position.wage && <> · {position.wage}</>}
            {position.wage_stream && <> · {position.wage_stream}</>}
            {position.work_location && <> · {position.work_location}</>}
          </p>
        </div>
        <button
          className="btn-primary"
          onClick={() => handleGenerateReport()}
          disabled={completedRounds === 0 || generatingReport}
        >
          {generatingReport ? 'Generating…' : 'Preview & Download Report'}
        </button>
      </div>
      {!position.is_active && planData && position.capture_frequency_days < planData.tier.min_capture_frequency_days ? (
        <div style={{
          background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 10,
          padding: '0.85rem 1.1rem', marginBottom: '1.25rem',
          display: 'flex', alignItems: 'flex-start', gap: '0.6rem',
        }}>
          <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>⚠️</span>
          <span style={{ fontSize: '0.9rem', color: '#92400e', fontWeight: 500 }}>
            <strong>Plan Mismatch — cannot reactivate.</strong> This position captures every{' '}
            <strong>{position.capture_frequency_days} day(s)</strong>, but your current plan requires a
            minimum of <strong>{planData.tier.min_capture_frequency_days} day(s)</strong> between captures.
            Edit the position's capture frequency to ≥ {planData.tier.min_capture_frequency_days} days, then reactivate.
          </span>
        </div>
      ) : !position.is_active ? (
        <div style={{
          background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10,
          padding: '0.85rem 1.1rem', marginBottom: '1.25rem',
          display: 'flex', alignItems: 'center', gap: '0.6rem',
        }}>
          <span style={{ fontSize: '1.1rem' }}>⚠️</span>
          <span style={{ fontSize: '0.9rem', color: '#92400e', fontWeight: 500 }}>
            This position is <strong>deactivated</strong>. Use the ▶ toggle to re-activate it, or upgrade your plan if the limit has been reached.
          </span>
        </div>
      ) : null}

      {reportGenError && <p className="error-msg">{reportGenError}</p>}

      {error && <p className="error-msg">{error}</p>}

      <div className="two-col">
        <section className="card">
          <h2 className="card-title">
            Job Boards
            <span className="card-title-sub">
              {activeUrlCount} / {maxUrls} active URLs
            </span>
          </h2>
          {position.job_urls.length === 0 ? (
            <p className="empty-inline">No job boards linked yet.</p>
          ) : (
            <ul className="posting-list">
              {position.job_urls.map(p => (
                <li key={p.id}>
                  {editingUrlId === p.id ? (
                    <form
                      style={{ display: 'flex', gap: '0.5rem', flex: 1, flexWrap: 'wrap' }}
                      onSubmit={e => handleUpdateUrl(e, p.id)}
                    >
                      <input
                        placeholder="Platform"
                        value={editUrlForm.platform}
                        onChange={e => setEditUrlForm(f => ({ ...f, platform: e.target.value }))}
                        required
                        style={{ width: '120px', flex: '0 0 120px' }}
                      />
                      <input
                        placeholder="URL"
                        value={editUrlForm.url}
                        onChange={e => setEditUrlForm(f => ({ ...f, url: e.target.value }))}
                        required
                        style={{ flex: 1, minWidth: '160px' }}
                      />
                      <button className="btn-primary btn-sm" type="submit" disabled={savingUrlId === p.id}>
                        {savingUrlId === p.id ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        className="btn-ghost btn-sm"
                        type="button"
                        onClick={() => setEditingUrlId(null)}
                      >
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span className="posting-platform">{p.platform}</span>
                        <a href={p.url} target="_blank" rel="noreferrer" className="posting-url">{p.url}</a>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                        <span style={{
                          fontSize: '0.72rem', fontWeight: 700, color: '#16a34a',
                          background: '#f0fdf4', border: '1px solid #bbf7d0',
                          borderRadius: 10, padding: '2px 8px', whiteSpace: 'nowrap',
                        }}>✓ Submitted</span>
                        <button
                          className="btn-ghost btn-sm"
                          onClick={() => {
                            setEditingUrlId(p.id)
                            setEditUrlForm({ platform: p.platform, url: p.url })
                          }}
                        >
                          Edit
                        </button>
                        <button className="btn-remove" onClick={() => handleRemoveUrl(p.id)}>×</button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
          {urlLimitReached ? (
            <p style={{ margin: '0.75rem 0 0', fontSize: '0.82rem', color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '0.5rem 0.75rem' }}>
              Maximum of {maxUrls} active job board URLs reached for your plan. Deactivate or remove one to add another.
            </p>
          ) : !position.is_active ? (
            <p style={{ margin: '0.75rem 0 0', fontSize: '0.82rem', color: '#b91c1c', background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 8, padding: '0.5rem 0.75rem' }}>
              Position is deactivated — activate it to add job boards.
            </p>
          ) : (
            <form className="add-posting-form" onSubmit={handleAddUrl}>
              <p style={{ margin: '0.75rem 0 0.5rem', fontSize: '0.78rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Add Job Board</p>
              <input
                placeholder="Platform (e.g. Indeed)"
                value={urlForm.platform}
                onChange={e => setUrlForm(p => ({ ...p, platform: e.target.value }))}
                required
              />
              <input
                placeholder="https://..."
                value={urlForm.url}
                onChange={e => setUrlForm(p => ({ ...p, url: e.target.value }))}
                required
              />
              <button className="btn-primary" disabled={addingUrl} type="submit">
                {addingUrl ? '…' : 'Add'}
              </button>
            </form>
          )}
        </section>

        <section className="card">
          <h2 className="card-title">Supporting Documents</h2>
          {documents.length === 0 ? (
            <p className="empty-inline">No documents uploaded.</p>
          ) : (
            <ul className="doc-list">
              {documents.map(doc => (
                <li key={doc.id}>
                  <span>{doc.original_filename}</span>
                  <button className="btn-remove" onClick={() => handleRemoveDoc(doc.id)}>×</button>
                </li>
              ))}
            </ul>
          )}
          <div className="upload-area">
            <input type="file" ref={fileRef} onChange={handleUploadDoc} style={{ display: 'none' }} disabled={uploadingDoc} />
            <button className="btn-ghost" onClick={() => fileRef.current?.click()} disabled={uploadingDoc}>
              {uploadingDoc ? <span className="upload-spinner">⏳ Uploading…</span> : '+ Upload Document'}
            </button>
          </div>

          <div style={{ borderTop: '1px solid #f3f4f6', marginTop: '1.25rem', paddingTop: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#0B1F3B' }}>Job Match Activity</span>
              <span className="optional-badge">Optional</span>
            </div>
            <p className="card-subtitle" style={{ marginBottom: '0.65rem' }}>
              Upload the Job Match Activity document to include it in the LMIA report.
            </p>
            {jobMatchDocs.length === 0 ? (
              <p className="empty-inline">No Job Match Activity document uploaded yet.</p>
            ) : (
              <ul className="doc-list">
                {jobMatchDocs.map(doc => (
                  <li key={doc.id}>
                    <span>{doc.original_filename}</span>
                    <button className="btn-remove" onClick={() => handleRemoveJobMatch(doc.id)}>×</button>
                  </li>
                ))}
              </ul>
            )}
            <div className="upload-area">
              <input type="file" ref={jobMatchRef} onChange={handleUploadJobMatch} style={{ display: 'none' }} disabled={uploadingJobMatch} />
              <button
                className={`btn-ghost${uploadingJobMatch ? ' btn-ghost--uploading' : ''}`}
                onClick={() => jobMatchRef.current?.click()}
                disabled={uploadingJobMatch}
              >
                {uploadingJobMatch
                  ? <><span className="upload-dot-anim" />Uploading, please wait…</>
                  : '+ Upload Job Match Activity'}
              </button>
            </div>
          </div>
        </section>
      </div>

      <section className="card section-top">
        <h2 className="card-title">
          Capture Rounds
          <span className="card-title-sub">{completedRounds}/{rounds.length} completed</span>
        </h2>
        {rounds.length === 0 ? (
          <p className="empty-inline">Capture rounds will appear here after adding job board URLs.</p>
        ) : (
          <div className="rounds-list">
            {rounds.map(round => (
              <RoundRow
                key={round.id}
                round={round}
                urls={position.job_urls}
                onRun={() => handleRunRound(round.id)}
                running={runningRound === round.id}
                onRecapture={handleRecaptureResult}
                recapturing={recapturingResult}
                allowCapture={position.is_active && round.id === firstPendingId}
                retryInfo={retryInfoByRound[round.id]}
              />
            ))}
          </div>
        )}
      </section>
      <Toast toast={toast} onDismiss={clearToast} />

      {/* ── Early Report Acknowledgement Modal ───────────────────── */}
      {earlyReportModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            background: '#fff', borderRadius: 12, padding: '2rem',
            maxWidth: 480, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <span style={{ fontSize: '1.5rem' }}>⚠️</span>
              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#92400e' }}>
                {earlyReportModal.minimumDays === 56 ? '8-Week Minimum Not Met' : '28-Day Minimum Not Met'}
              </h2>
            </div>
            <p style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', color: '#374151', lineHeight: 1.6 }}>
              This position has only been active for{' '}
              <strong>{earlyReportModal.daysActive} day(s)</strong>.{' '}
              ESDC requires job postings to remain active for a minimum of{' '}
              <strong>{earlyReportModal.minimumDays === 56 ? '8 weeks (56 days)' : '28 days'}</strong> before a report is submitted.{' '}
              You are <strong>{earlyReportModal.daysRemaining} day(s)</strong> short of this requirement.
            </p>
            <p style={{ margin: '0 0 1.25rem', fontSize: '0.85rem', color: '#6b7280', lineHeight: 1.6 }}>
              Submitting a report early may result in a <strong>non-compliant LMIA application</strong>.
              If you proceed, this action will be permanently recorded in the audit log
              with a timestamp and your account details.
            </p>
            <label style={{
              display: 'flex', alignItems: 'flex-start', gap: '0.6rem',
              fontSize: '0.85rem', color: '#111827', cursor: 'pointer',
              background: '#fef3c7', border: '1px solid #fcd34d',
              borderRadius: 8, padding: '0.75rem', marginBottom: '1.5rem',
            }}>
              <input
                type="checkbox"
                checked={earlyAcknowledged}
                onChange={e => setEarlyAcknowledged(e.target.checked)}
                style={{ marginTop: 2, flexShrink: 0, width: 16, height: 16, cursor: 'pointer' }}
              />
              <span>
                I understand this position does not meet the {earlyReportModal.minimumDays === 56 ? '8-week' : '28-day'} ESDC requirement.
                I acknowledge that generating this report early may result in a non-compliant submission,
                and I accept full responsibility for this decision.
              </span>
            </label>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setEarlyReportModal(null); setEarlyAcknowledged(false) }}
                style={{
                  padding: '0.5rem 1.25rem', borderRadius: 8, border: '1px solid #d1d5db',
                  background: '#fff', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500,
                }}
              >
                Cancel — Wait Until {earlyReportModal.minimumDays === 56 ? 'Week 8' : 'Day 28'}
              </button>
              <button
                onClick={handleEarlyReportConfirm}
                disabled={!earlyAcknowledged || generatingReport}
                style={{
                  padding: '0.5rem 1.25rem', borderRadius: 8, border: 'none',
                  background: earlyAcknowledged ? '#dc2626' : '#fca5a5',
                  color: '#fff', cursor: earlyAcknowledged ? 'pointer' : 'not-allowed',
                  fontSize: '0.875rem', fontWeight: 600,
                }}
              >
                {generatingReport ? 'Generating…' : 'Proceed & Generate Report'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
