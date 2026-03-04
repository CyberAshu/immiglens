import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { employers as employersApi, positions as positionsApi } from '../api'
import type { Employer, JobPosition } from '../types'

export default function EmployerDetail() {
  const { employerId } = useParams<{ employerId: string }>()
  const id = Number(employerId)

  const [employer, setEmployer] = useState<Employer | null>(null)
  const [positionList, setPositionList] = useState<JobPosition[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    job_title: '', noc_code: '', num_positions: 1, start_date: '',
    capture_frequency_days: 7, wage: '', wage_stream: '', work_location: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([employersApi.list(), positionsApi.list(id)])
      .then(([emps, pos]) => {
        setEmployer(emps.find(e => e.id === id) ?? null)
        setPositionList(pos)
      })
      .finally(() => setLoading(false))
  }, [id])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const created = await positionsApi.create(id, {
        job_title: form.job_title,
        noc_code: form.noc_code,
        num_positions: Number(form.num_positions),
        start_date: form.start_date,
        capture_frequency_days: Number(form.capture_frequency_days),
        wage: form.wage || null,
        wage_stream: form.wage_stream || null,
        work_location: form.work_location || null,
      })
      setPositionList(prev => [created, ...prev])
      setShowForm(false)
      setForm({ job_title: '', noc_code: '', num_positions: 1, start_date: '', capture_frequency_days: 7, wage: '', wage_stream: '', work_location: '' })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create position.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(posId: number) {
    if (!confirm('Delete this job position and all captures?')) return
    await positionsApi.remove(id, posId)
    setPositionList(prev => prev.filter(p => p.id !== posId))
  }

  if (loading) return <div className="loading">Loading…</div>
  if (!employer) return <div className="page"><p>Employer not found.</p></div>

  return (
    <div className="page">
      <div className="breadcrumb">
        <Link to="/dashboard">Employers</Link> / {employer.business_name}
      </div>

      <div className="page-header">
        <div>
          <h1>{employer.business_name}</h1>
          <p className="sub-text">{employer.address} · {employer.contact_person}</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(v => !v)}>
          {showForm ? 'Cancel' : '+ New Position'}
        </button>
      </div>

      {showForm && (
        <form className="card form-card" onSubmit={handleCreate}>
          <h2 className="form-title">New Job Position</h2>
          <div className="form-grid">
            <div className="field">
              <label>Job Title *</label>
              <input value={form.job_title} onChange={e => setForm(p => ({ ...p, job_title: e.target.value }))} required />
            </div>
            <div className="field">
              <label>NOC Code *</label>
              <input value={form.noc_code} onChange={e => setForm(p => ({ ...p, noc_code: e.target.value }))} required placeholder="e.g. 13100" />
            </div>
            <div className="field">
              <label>Number of Positions *</label>
              <input type="number" min={1} value={form.num_positions} onChange={e => setForm(p => ({ ...p, num_positions: Number(e.target.value) }))} required />
            </div>
            <div className="field">
              <label>Start Date *</label>
              <input type="date" value={form.start_date} onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))} required />
            </div>
            <div className="field">
              <label>Capture Frequency (days)</label>
              <select value={form.capture_frequency_days} onChange={e => setForm(p => ({ ...p, capture_frequency_days: Number(e.target.value) }))}>
                <option value={7}>Every 7 days</option>
                <option value={14}>Every 14 days</option>
                <option value={28}>Every 28 days</option>
              </select>
            </div>
            <div className="field">
              <label>Wage / Salary <span style={{fontWeight:400, color:'#888'}}>(optional)</span></label>
              <input value={form.wage} onChange={e => setForm(p => ({ ...p, wage: e.target.value }))} placeholder="e.g. $25.00/hr" />
            </div>
            <div className="field">
              <label>Wage Stream <span style={{fontWeight:400, color:'#888'}}>(optional)</span></label>
              <select value={form.wage_stream} onChange={e => setForm(p => ({ ...p, wage_stream: e.target.value }))}>
                <option value="">— Select —</option>
                <option value="high-wage">High-Wage</option>
                <option value="low-wage">Low-Wage</option>
                <option value="global-talent">Global Talent Stream</option>
                <option value="agricultural">Agricultural Stream</option>
                <option value="seasonal">Seasonal Agricultural Worker Program</option>
              </select>
            </div>
            <div className="field">
              <label>Work Location <span style={{fontWeight:400, color:'#888'}}>(optional)</span></label>
              <input value={form.work_location} onChange={e => setForm(p => ({ ...p, work_location: e.target.value }))} placeholder="City, Province" />
            </div>
          </div>
          {error && <p className="error-msg">{error}</p>}
          <div className="form-actions">
            <button className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Create Position'}</button>
          </div>
        </form>
      )}

      {positionList.length === 0 ? (
        <div className="empty-state">No job positions yet. Add one above.</div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Job Title</th>
                <th>NOC Code</th>
                <th>Positions</th>
                <th>Start Date</th>
                <th>Job Boards</th>
                <th>Capture Freq.</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {positionList.map(pos => (
                <tr key={pos.id}>
                  <td><Link to={`/employers/${id}/positions/${pos.id}`} className="table-link">{pos.job_title}</Link></td>
                  <td>{pos.noc_code}</td>
                  <td>{pos.num_positions}</td>
                  <td>{pos.start_date}</td>
                  <td>{pos.job_postings.length}</td>
                  <td>Every {pos.capture_frequency_days} days</td>
                  <td>
                    <button className="btn-danger-sm" onClick={() => handleDelete(pos.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
