import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { captures as capturesApi, positions as positionsApi, reports as reportsApi } from '../api'
import { RoundRow } from '../components/RoundRow'
import type { CaptureRound, JobPosting, JobPosition, ReportDocument } from '../types'

export default function PositionDetail() {
  const { employerId, positionId } = useParams<{ employerId: string; positionId: string }>()
  const eId = Number(employerId)
  const pId = Number(positionId)

  const [position, setPosition] = useState<JobPosition | null>(null)
  const [rounds, setRounds] = useState<CaptureRound[]>([])
  const [documents, setDocuments] = useState<ReportDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [postingForm, setPostingForm] = useState({ platform: '', url: '' })
  const [addingPosting, setAddingPosting] = useState(false)
  const [runningRound, setRunningRound] = useState<number | null>(null)
  const [recapturingResult, setRecapturingResult] = useState<Set<number>>(new Set())
  const [generatingReport, setGeneratingReport] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    Promise.all([positionsApi.get(eId, pId), capturesApi.list(eId, pId)])
      .then(([pos, rds]) => {
        setPosition(pos)
        setRounds(rds)
      })
      .finally(() => setLoading(false))
  }, [eId, pId])

  async function handleAddPosting(e: React.FormEvent) {
    e.preventDefault()
    setAddingPosting(true)
    setError(null)
    try {
      const posting = await positionsApi.addPosting(eId, pId, postingForm)
      setPosition(prev => prev ? { ...prev, job_postings: [...prev.job_postings, posting] } : prev)
      setPostingForm({ platform: '', url: '' })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add posting.')
    } finally {
      setAddingPosting(false)
    }
  }

  async function handleRemovePosting(postingId: number) {
    await positionsApi.removePosting(eId, pId, postingId)
    setPosition(prev => prev ? { ...prev, job_postings: prev.job_postings.filter(p => p.id !== postingId) } : prev)
  }

  async function handleRunRound(roundId: number) {
    setRunningRound(roundId)
    setError(null)
    try {
      const updated = await capturesApi.runNow(eId, pId, roundId)
      setRounds(prev => prev.map(r => r.id === roundId ? updated : r))
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
      const updated = await capturesApi.recaptureResult(eId, pId, roundId, resultId)
      setRounds(prev => prev.map(r => r.id === roundId ? updated : r))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Recapture failed.')
    } finally {
      setRecapturingResult(prev => { const s = new Set(prev); s.delete(resultId); return s })
    }
  }

  async function handleUploadDoc(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const doc = await reportsApi.uploadDocument(eId, pId, file)
    setDocuments(prev => [...prev, doc])
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleRemoveDoc(docId: number) {
    await reportsApi.removeDocument(eId, pId, docId)
    setDocuments(prev => prev.filter(d => d.id !== docId))
  }

  async function handleGenerateReport() {
    setGeneratingReport(true)
    setError(null)
    const token = localStorage.getItem('token')
    const url = reportsApi.generateUrl(eId, pId)
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.detail ?? `Server error: ${res.status}`)
      }
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = `LMIA_Report_${position?.job_title ?? 'report'}.pdf`
      a.click()
      setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to generate report.')
    } finally {
      setGeneratingReport(false)
    }
  }

  if (loading) return <div className="loading">Loading…</div>
  if (!position) return <div className="page"><p>Position not found.</p></div>

  const completedRounds = rounds.filter(r => r.status === 'completed').length

  return (
    <div className="page">
      <div className="breadcrumb">
        <Link to="/dashboard">Employers</Link> /
        <Link to={`/employers/${eId}`}> Employer</Link> /
        {position.job_title}
      </div>

      <div className="page-header">
        <div>
          <h1>{position.job_title}</h1>
          <p className="sub-text">
            NOC {position.noc_code} · {position.num_positions} position(s) · Start: {position.start_date}
            {position.wage && <> · {position.wage}</>}
            {position.wage_stream && <> · {position.wage_stream}</>}
            {position.work_location && <> · {position.work_location}</>}
          </p>
        </div>
        <button
          className="btn-primary"
          onClick={handleGenerateReport}
          disabled={generatingReport || completedRounds === 0}
        >
          {generatingReport ? 'Generating…' : '⬇ Download Report'}
        </button>
      </div>

      {error && <p className="error-msg">{error}</p>}

      <div className="two-col">
        <section className="card">
          <h2 className="card-title">Job Boards</h2>
          {position.job_postings.length === 0 ? (
            <p className="empty-inline">No job boards linked yet.</p>
          ) : (
            <ul className="posting-list">
              {position.job_postings.map(p => (
                <li key={p.id}>
                  <div>
                    <span className="posting-platform">{p.platform}</span>
                    <a href={p.url} target="_blank" rel="noreferrer" className="posting-url">{p.url}</a>
                  </div>
                  <button className="btn-remove" onClick={() => handleRemovePosting(p.id)}>×</button>
                </li>
              ))}
            </ul>
          )}
          <form className="add-posting-form" onSubmit={handleAddPosting}>
            <input
              placeholder="Platform (e.g. Indeed)"
              value={postingForm.platform}
              onChange={e => setPostingForm(p => ({ ...p, platform: e.target.value }))}
              required
            />
            <input
              placeholder="URL"
              value={postingForm.url}
              onChange={e => setPostingForm(p => ({ ...p, url: e.target.value }))}
              required
            />
            <button className="btn-primary" disabled={addingPosting} type="submit">
              {addingPosting ? '…' : 'Add'}
            </button>
          </form>
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
            <input type="file" ref={fileRef} onChange={handleUploadDoc} style={{ display: 'none' }} />
            <button className="btn-ghost" onClick={() => fileRef.current?.click()}>+ Upload Document</button>
          </div>
        </section>
      </div>

      <section className="card section-top">
        <h2 className="card-title">
          Capture Rounds
          <span className="card-title-sub">{completedRounds}/{rounds.length} completed</span>
        </h2>
        {rounds.length === 0 ? (
          <p className="empty-inline">Capture rounds will appear here after creating job postings.</p>
        ) : (
          <div className="rounds-list">
            {rounds.map(round => (
              <RoundRow
                key={round.id}
                round={round}
                postings={position.job_postings}
                onRun={() => handleRunRound(round.id)}
                running={runningRound === round.id}
                onRecapture={handleRecaptureResult}
                recapturing={recapturingResult}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
