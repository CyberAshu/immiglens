import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2, Mail, Phone, Plus, Search, Trash2, User } from 'lucide-react'
import { employers as employersApi } from '../api'
import type { Employer } from '../types'
import AddressAutocomplete from '../components/AddressAutocomplete'

export default function Employers() {
  const [list, setList]       = useState<Employer[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [query, setQuery]     = useState('')
  const [form, setForm]       = useState({
    business_name: '', address: '', contact_person: '',
    contact_email: '', contact_phone: '', business_number: '',
  })
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    employersApi.list()
      .then(setList)
      .finally(() => setLoading(false))
  }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError(null)
    try {
      const created = await employersApi.create({
        business_name:  form.business_name,
        address:        form.address,
        contact_person: form.contact_person,
        contact_email:  form.contact_email  || null,
        contact_phone:  form.contact_phone  || null,
        business_number: form.business_number || null,
      })
      setList(prev => [created, ...prev])
      setShowForm(false)
      setForm({ business_name: '', address: '', contact_person: '', contact_email: '', contact_phone: '', business_number: '' })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create employer.')
    } finally { setSaving(false) }
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this employer and all associated data?')) return
    await employersApi.remove(id)
    setList(prev => prev.filter(e => e.id !== id))
  }

  const filtered = list.filter(e =>
    e.business_name.toLowerCase().includes(query.toLowerCase()) ||
    e.contact_person.toLowerCase().includes(query.toLowerCase()) ||
    (e.contact_email ?? '').toLowerCase().includes(query.toLowerCase())
  )

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Employers</h1>
          <p className="page-subtitle">{list.length} employer{list.length !== 1 ? 's' : ''} tracked</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(true)}>
          <Plus size={15} strokeWidth={2.5} />
          New Employer
        </button>
      </div>

      {/* search bar */}
      {list.length > 0 && (
        <div className="emp-search-wrap">
          <Search size={15} className="emp-search-icon" />
          <input
            className="emp-search-input"
            placeholder="Search by name, contact or email..."
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
      )}

      {/* table */}
      {loading ? (
        <div className="loading">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          {list.length === 0
            ? 'No employers yet. Click "New Employer" to add one.'
            : 'No employers match your search.'}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Business Name</th>
                <th>Contact Person</th>
                <th>Email</th>
                <th>Phone</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(emp => (
                <tr key={emp.id}>
                  <td>
                    <div className="emp-name-cell">
                      <span className="emp-avatar">
                        <Building2 size={14} strokeWidth={2} />
                      </span>
                      <Link to={`/employers/${emp.id}`} className="table-link">{emp.business_name}</Link>
                    </div>
                  </td>
                  <td>
                    <div className="emp-cell-icon">
                      <User size={12} strokeWidth={2} style={{ color: '#64748b', flexShrink: 0 }} />
                      {emp.contact_person}
                    </div>
                  </td>
                  <td>
                    {emp.contact_email
                      ? <div className="emp-cell-icon">
                          <Mail size={12} strokeWidth={2} style={{ color: '#64748b', flexShrink: 0 }} />
                          {emp.contact_email}
                        </div>
                      : <span className="emp-empty">—</span>}
                  </td>
                  <td>
                    {emp.contact_phone
                      ? <div className="emp-cell-icon">
                          <Phone size={12} strokeWidth={2} style={{ color: '#64748b', flexShrink: 0 }} />
                          {emp.contact_phone}
                        </div>
                      : <span className="emp-empty">—</span>}
                  </td>
                  <td>
                    <button
                      className="btn-icon-danger"
                      onClick={() => handleDelete(emp.id)}
                      title="Delete employer"
                    >
                      <Trash2 size={14} strokeWidth={2} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* create modal */}
      {showForm && (
        <div className="admin-modal-overlay" onClick={() => setShowForm(false)}>
          <form className="admin-modal" style={{ maxWidth: 620 }} onSubmit={handleCreate} onClick={e => e.stopPropagation()}>
            <h2 className="admin-modal-title">New Employer</h2>
            <div className="admin-form-grid">
              <label className="admin-form-label" style={{ gridColumn: 'span 2' }}>
                Business Name *
                <input className="admin-input" value={form.business_name}
                  onChange={e => setForm(p => ({ ...p, business_name: e.target.value }))} required />
              </label>
              <label className="admin-form-label" style={{ gridColumn: 'span 2' }}>
                Address *
                <AddressAutocomplete
                  className="admin-input"
                  value={form.address}
                  onChange={val => setForm(p => ({ ...p, address: val }))}
                  placeholder="Start typing an address…"
                  required
                />
              </label>
              <label className="admin-form-label">
                Contact Person *
                <input className="admin-input" value={form.contact_person}
                  onChange={e => setForm(p => ({ ...p, contact_person: e.target.value }))} required />
              </label>
              <label className="admin-form-label">
                Contact Email
                <input className="admin-input" type="email" value={form.contact_email}
                  onChange={e => setForm(p => ({ ...p, contact_email: e.target.value }))} />
              </label>
              <label className="admin-form-label">
                Contact Phone <span style={{ fontWeight: 400 }}>(optional)</span>
                <input className="admin-input" value={form.contact_phone}
                  onChange={e => setForm(p => ({ ...p, contact_phone: e.target.value }))} />
              </label>
              <label className="admin-form-label">
                Business Number (BN) <span style={{ fontWeight: 400 }}>(optional)</span>
                <input className="admin-input" value={form.business_number}
                  onChange={e => setForm(p => ({ ...p, business_number: e.target.value }))}
                  placeholder="e.g. 123456789" />
              </label>
            </div>
            {error && <p className="error-msg">{error}</p>}
            <div className="admin-modal-actions">
              <button type="button" className="btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Saving...' : 'Create Employer'}
              </button>
            </div>
          </form>
        </div>
      )}

      <style>{`
        .emp-search-wrap {
          position: relative; margin-bottom: 16px;
        }
        .emp-search-icon {
          position: absolute; left: 11px; top: 50%; transform: translateY(-50%);
          color: #64748b; pointer-events: none;
        }
        .emp-search-input {
          width: 100%; max-width: 360px; padding: 8px 12px 8px 34px;
          background: #ffffff; border: 1px solid #d1d5db; border-radius: 7px;
          color: #1e293b; font-size: 0.875rem; transition: border-color .15s;
        }
        .emp-search-input:focus { outline: none; border-color: #0B1F3B; box-shadow: 0 0 0 3px rgba(11,31,59,0.08); }
        .emp-search-input::placeholder { color: #9ca3af; }

        .emp-name-cell { display: flex; align-items: center; gap: 8px; }
        .emp-avatar {
          width: 28px; height: 28px; border-radius: 7px; background: #f1f5f9;
          border: 1px solid #e2e8f0; display: flex; align-items: center;
          justify-content: center; color: #475569; flex-shrink: 0;
        }
        .emp-cell-icon { display: flex; align-items: center; gap: 6px; color: #374151; }
        .emp-empty { color: #9ca3af; }

        .btn-icon-danger {
          display: flex; align-items: center; justify-content: center;
          background: none; border: 1px solid transparent; padding: 5px; border-radius: 5px;
          cursor: pointer; color: #9ca3af; transition: all .15s;
        }
        .btn-icon-danger:hover { background: #fef2f2; border-color: #fecaca; color: #dc2626; }

        .page-subtitle { font-size: 0.82rem; color: #6b7280; margin: 2px 0 0; }
      `}</style>
    </div>
  )
}
