import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Pencil, Trash2 } from 'lucide-react'
import { employers as employersApi, positions as positionsApi, subscriptions as subscriptionsApi } from '../api'
import { useConfirm } from '../components/ConfirmModal'
import type { Employer, JobPosition } from '../types'
import AddressAutocomplete from '../components/AddressAutocomplete'
import { NocSearch } from '../components/NocSearch'
import Toast, { useToast } from '../components/Toast'

export default function EmployerDetail() {
  const { employerId } = useParams<{ employerId: string }>()
  const id = Number(employerId)

  const [employer, setEmployer] = useState<Employer | null>(null)
  const [positionList, setPositionList] = useState<JobPosition[]>([])
  const [loading, setLoading] = useState(true)
  const [minFreq, setMinFreq] = useState(7)
  const [isCustomFreq, setIsCustomFreq] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingPosition, setEditingPosition] = useState<JobPosition | null>(null)
  const [form, setForm] = useState({
    job_title: '', noc_code: '', num_positions: 1, start_date: '', end_date: '',
    capture_frequency_days: 7, wage: '', wage_period: 'hr', wage_stream: '', work_location: '',
  })
  const [saving, setSaving] = useState(false)
  const [togglingPositionId, setTogglingPositionId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { toast, showToast, clearToast } = useToast()
  const { confirmModal, askConfirm }      = useConfirm()

  useEffect(() => {
    Promise.all([employersApi.list(), positionsApi.list(id), subscriptionsApi.usage()])
      .then(([emps, pos, usage]) => {
        setEmployer(emps.find(e => e.id === id) ?? null)
        setPositionList(pos)
        const freq = usage.tier.min_capture_frequency_days ?? 7
        setMinFreq(freq)
        setIsCustomFreq(false)
        setForm(f => ({ ...f, capture_frequency_days: freq }))
      })
      .finally(() => setLoading(false))
  }, [id])

  const EMPTY_FORM = { job_title: '', noc_code: '', num_positions: 1, start_date: '', end_date: '', capture_frequency_days: minFreq, wage: '', wage_period: 'hr', wage_stream: '', work_location: '' }

  function parseWage(wageFull: string | null): { wage: string; wage_period: string } {
    if (!wageFull) return { wage: '', wage_period: 'hr' }
    const match = wageFull.match(/CAD \$([0-9.]+)\/(\w+)/)
    if (match) return { wage: match[1], wage_period: match[2] }
    return { wage: '', wage_period: 'hr' }
  }

  function openEdit(pos: JobPosition) {
    const { wage, wage_period } = parseWage(pos.wage)
    const freq = pos.capture_frequency_days
    const isCustom = ![7, 14, 28, minFreq].includes(freq)
    setIsCustomFreq(isCustom)
    setForm({
      job_title: pos.job_title,
      noc_code: pos.noc_code,
      num_positions: pos.num_positions,
      start_date: pos.start_date,
      end_date: pos.end_date ?? '',
      capture_frequency_days: freq,
      wage,
      wage_period,
      wage_stream: pos.wage_stream ?? '',
      work_location: pos.work_location ?? '',
    })
    setEditingPosition(pos)
    setShowForm(true)
    setError(null)
  }

  function closeModal() {
    setShowForm(false)
    setEditingPosition(null)
    setIsCustomFreq(false)
    setError(null)
  }

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
        end_date: form.end_date || null,
        capture_frequency_days: Number(form.capture_frequency_days),
        wage: form.wage ? `CAD $${form.wage}/${form.wage_period}` : null,
        wage_stream: form.wage_stream || null,
        work_location: form.work_location,
      })
      setPositionList(prev => [created, ...prev])
      setShowForm(false)
      setIsCustomFreq(false)
      setForm({ job_title: '', noc_code: '', num_positions: 1, start_date: '', end_date: '', capture_frequency_days: minFreq, wage: '', wage_period: 'hr', wage_stream: '', work_location: '' })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create position.')
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault()
    if (!editingPosition) return
    setSaving(true)
    setError(null)
    try {
      const updated = await positionsApi.update(id, editingPosition.id, {
        job_title: form.job_title,
        noc_code: form.noc_code,
        num_positions: Number(form.num_positions),
        start_date: form.start_date,
        end_date: form.end_date || null,
        capture_frequency_days: Number(form.capture_frequency_days),
        wage: form.wage ? `CAD $${form.wage}/${form.wage_period}` : null,
        wage_stream: form.wage_stream || null,
        work_location: form.work_location,
      })
      setPositionList(prev => prev.map(p => p.id === updated.id ? updated : p))
      closeModal()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update position.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(posId: number) {
    if (!await askConfirm({ title: 'Delete Position', message: 'Delete this job position and all associated captures? This cannot be undone.', confirmLabel: 'Delete' })) return
    await positionsApi.remove(id, posId)
    setPositionList(prev => prev.filter(p => p.id !== posId))
  }

  async function handleTogglePosition(pos: JobPosition) {
    setTogglingPositionId(pos.id)
    try {
      const updated = await positionsApi.togglePosition(id, pos.id)
      setPositionList(prev => prev.map(p => p.id === updated.id ? updated : p))
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to toggle position.', 'warning')
    } finally {
      setTogglingPositionId(null)
    }
  }

  if (loading) return <div className="loading">Loading…</div>
  if (!employer) return <div className="page"><p>Employer not found.</p></div>

  return (
    <div className="page">
      <div className="breadcrumb">
        <Link to="/employers">Employers</Link> / {employer.business_name}
      </div>

      <div className="page-header">
        <div>
          <h1>{employer.business_name}</h1>
          <p className="sub-text">{employer.address} · {employer.contact_person}</p>
        </div>
        <button
          className="btn-primary"
          onClick={() => { setForm(EMPTY_FORM); setEditingPosition(null); setIsCustomFreq(false); setError(null); setShowForm(true) }}
          disabled={!employer.is_active}
          title={!employer.is_active ? 'Activate this employer to add positions' : undefined}
        >
          + New Position
        </button>
      </div>

      {!employer.is_active && (
        <div style={{
          background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10,
          padding: '0.85rem 1.1rem', marginBottom: '1.25rem',
          display: 'flex', alignItems: 'center', gap: '0.6rem',
        }}>
          <span style={{ fontSize: '1.1rem' }}>⚠️</span>
          <span style={{ fontSize: '0.9rem', color: '#92400e', fontWeight: 500 }}>
            This employer is <strong>deactivated</strong>. Use the ▶ toggle on the
            {' '}<a href="/employers" style={{ color: '#92400e' }}>Employers page</a>{' '}
            to re-activate it.
          </span>
        </div>
      )}

      {showForm && (
        <div className="admin-modal-overlay">
          <form className="admin-modal" style={{ maxWidth: 660 }} onSubmit={editingPosition ? handleUpdate : handleCreate}>
            <h2 className="admin-modal-title">{editingPosition ? 'Edit Job Position' : 'New Job Position'}</h2>
            <div className="admin-form-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
              <label className="admin-form-label" style={{ gridColumn: '1 / -1' }}>
                NOC Code *
                <NocSearch
                  value={form.noc_code}
                  onSelect={(code, title) => setForm(p => ({ ...p, noc_code: code, job_title: title }))}
                  required
                />
                {form.noc_code && (
                  <span style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.2rem', display: 'block' }}>
                    Selected: <strong>{form.noc_code}</strong>
                  </span>
                )}
              </label>
              <label className="admin-form-label">
                Job Title *
                <input className="admin-input" value={form.job_title} onChange={e => setForm(p => ({ ...p, job_title: e.target.value }))} required placeholder="Auto-filled from NOC, or type manually" />
              </label>
              <label className="admin-form-label">
                Number of Positions *
                <input className="admin-input" type="number" min={1} value={form.num_positions} onChange={e => setForm(p => ({ ...p, num_positions: Number(e.target.value) }))} required />
              </label>
              <label className="admin-form-label">
                Start Date *
                <input
                  className="admin-input"
                  type="date"
                  value={form.start_date}
                  min={
                    editingPosition
                      ? editingPosition.start_date          // can't go earlier than existing saved date
                      : new Date().toISOString().split('T')[0]  // new: can't be in the past
                  }
                  onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))}
                  required
                />
              </label>
              <label className="admin-form-label">
                End Date <span style={{ fontWeight: 400 }}>(optional)</span>
                <input
                  className="admin-input"
                  type="date"
                  value={form.end_date}
                  min={form.start_date
                    ? new Date(new Date(form.start_date).getTime() + 28 * 86400000).toISOString().split('T')[0]
                    : undefined}
                  onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))}
                />
                <span style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.2rem', display: 'block' }}>
                  Minimum 28 days from start. Leave blank to use default (28 days).
                </span>
              </label>
              <label className="admin-form-label">
                Capture Frequency
                <select
                  className="admin-input"
                  value={isCustomFreq ? 'custom' : String(form.capture_frequency_days)}
                  onChange={e => {
                    if (e.target.value === 'custom') { setIsCustomFreq(true) }
                    else { setIsCustomFreq(false); setForm(p => ({ ...p, capture_frequency_days: Number(e.target.value) })) }
                  }}
                >
                  {[...new Set([minFreq, ...[7, 14, 28].filter(f => f >= minFreq)])].sort((a, b) => a - b).map(f => (
                    <option key={f} value={f}>Every {f} day{f !== 1 ? 's' : ''}</option>
                  ))}
                  <option value="custom">Custom...</option>
                </select>
                {isCustomFreq && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.4rem' }}>
                    <input className="admin-input" type="number" min={minFreq} value={form.capture_frequency_days}
                      onChange={e => setForm(p => ({ ...p, capture_frequency_days: Math.max(minFreq, Number(e.target.value)) }))}
                      style={{ width: 80 }} required />
                    <span style={{ fontSize: '0.82rem', color: '#6b7280' }}>days (min {minFreq})</span>
                  </div>
                )}
                {minFreq > 7 && (
                  <span style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.2rem', display: 'block' }}>
                    Your plan minimum is {minFreq} days.
                  </span>
                )}
              </label>
              <label className="admin-form-label">
                Rate (CAD $) <span style={{ fontWeight: 400 }}>(optional)</span>
                <input
                  className="admin-input"
                  type="number" min={0} step={0.01}
                  value={form.wage}
                  onChange={e => setForm(p => ({ ...p, wage: e.target.value }))}
                  placeholder="e.g. 25.00"
                />
              </label>
              <label className="admin-form-label">
                Pay Period <span style={{ fontWeight: 400 }}>(optional)</span>
                <select className="admin-input" value={form.wage_period} onChange={e => setForm(p => ({ ...p, wage_period: e.target.value }))}>
                  <option value="hr">Per hour</option>
                  <option value="yr">Per year</option>
                  <option value="month">Per month</option>
                  <option value="week">Per week</option>
                </select>
              </label>
              <label className="admin-form-label">
                Wage Stream <span style={{ fontWeight: 400 }}>(optional)</span>
                <select className="admin-input" value={form.wage_stream} onChange={e => setForm(p => ({ ...p, wage_stream: e.target.value }))}>
                  <option value="">— Select —</option>
                  <option value="high-wage">High-Wage</option>
                  <option value="low-wage">Low-Wage</option>
                  <option value="global-talent">Global Talent Stream</option>
                  <option value="agricultural">Agricultural Stream</option>
                  <option value="seasonal">Seasonal Agricultural Worker Program</option>
                </select>
              </label>
              <label className="admin-form-label" style={{ gridColumn: 'span 2' }}>
                Work Location *
                <AddressAutocomplete
                  className="admin-input"
                  value={form.work_location}
                  onChange={val => setForm(p => ({ ...p, work_location: val }))}
                  placeholder="Start typing an address…"
                  format="address"
                  required
                />
              </label>
            </div>
            {error && <p className="error-msg" style={{ margin: '0 0 1rem' }}>{error}</p>}
            <div className="admin-modal-actions">
              <button type="button" className="btn-ghost" onClick={closeModal}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Saving…' : editingPosition ? 'Save Changes' : 'Create Position'}
              </button>
            </div>
          </form>
        </div>
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
                <th>End Date</th>
                <th>Job Boards</th>
                <th>Capture Freq.</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {positionList.map(pos => (
                <tr key={pos.id} style={!pos.is_active ? { opacity: 0.55 } : undefined}>
                  <td>
                    <Link to={`/employers/${id}/positions/${pos.id}`} className="table-link">{pos.job_title}</Link>
                    {!pos.is_active && (
                      <span style={{
                        marginLeft: '0.5rem', fontSize: '0.7rem', fontWeight: 700,
                        background: '#fee2e2', color: '#b91c1c',
                        border: '1px solid #fecaca', borderRadius: 6,
                        padding: '1px 6px', verticalAlign: 'middle',
                      }}>Deactivated</span>
                    )}
                  </td>
                  <td>{pos.noc_code}</td>
                  <td>{pos.num_positions}</td>
                  <td>{pos.start_date}</td>
                  <td>{pos.end_date ?? <span style={{ color: '#9ca3af' }}>+28 days</span>}</td>
                  <td>{pos.job_postings.length}</td>
                  <td>Every {pos.capture_frequency_days} days</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button
                        className={pos.is_active ? 'btn-icon-warning' : 'btn-icon-success'}
                        onClick={() => handleTogglePosition(pos)}
                        disabled={togglingPositionId === pos.id}
                        title={pos.is_active ? 'Deactivate position' : 'Activate position'}
                      >
                        {togglingPositionId === pos.id ? '…' : pos.is_active ? '⏸' : '▶'}
                      </button>
                      <button
                        className="btn-icon"
                        onClick={() => openEdit(pos)}
                        title="Edit position"
                      >
                        <Pencil size={14} strokeWidth={2} />
                      </button>
                      <button
                        className="btn-icon-danger"
                        onClick={() => handleDelete(pos.id)}
                        title="Delete position"
                      >
                        <Trash2 size={14} strokeWidth={2} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Toast toast={toast} onDismiss={clearToast} />
      {confirmModal}
    </div>
  )
}