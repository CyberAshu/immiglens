import { useEffect, useRef, useState } from 'react'
import { Pencil, Plus, Trash2, Upload, X } from 'lucide-react'
import { nocCodes } from '../../api/noc_codes'
import type { NocCodeOut } from '../../api/noc_codes'
import { useUpload } from '../../context/UploadContext'

const PAGE_SIZE = 50

const TEER_COLORS: Record<number, { bg: string; color: string; border: string }> = {
  0: { bg: '#faf5ff', color: '#7c3aed', border: '#e9d5ff' },
  1: { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
  2: { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
  3: { bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' },
  4: { bg: '#fefce8', color: '#a16207', border: '#fef08a' },
  5: { bg: '#f9fafb', color: '#374151', border: '#e5e7eb' },
}

export default function AdminNocCodes() {
  const [codes, setCodes] = useState<NocCodeOut[]>([])
  const [counts, setCounts] = useState<{ total: number; active: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)

  // Add/edit modal
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<NocCodeOut | null>(null)
  const [formCode, setFormCode] = useState('')
  const [formTitle, setFormTitle] = useState('')
  const [formYear, setFormYear] = useState(2021)
  const [saving, setSaving] = useState(false)
  const [modalError, setModalError] = useState('')

  // Upload
  const fileRef = useRef<HTMLInputElement>(null)
  const { uploading, progress: uploadProgress, result: uploadResult, uploadError, startNocUpload, clearResult } = useUpload()

  async function load() {
    setLoading(true)
    try {
      const [data, cnt] = await Promise.all([
        nocCodes.adminList({ q: search, skip: page * PAGE_SIZE, limit: PAGE_SIZE }),
        nocCodes.adminCount(),
      ])
      setCodes(data)
      setCounts(cnt)
    } catch {
      setError('Failed to load NOC codes.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [search, page])  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (uploadResult) load() }, [uploadResult])  // eslint-disable-line react-hooks/exhaustive-deps

  function openCreate() {
    setEditing(null); setFormCode(''); setFormTitle(''); setFormYear(2021); setModalError(''); setShowModal(true)
  }
  function openEdit(noc: NocCodeOut) {
    setEditing(noc); setFormCode(noc.code); setFormTitle(noc.title); setFormYear(noc.version_year); setModalError(''); setShowModal(true)
  }

  async function handleSave() {
    setSaving(true); setModalError('')
    try {
      if (editing) await nocCodes.adminUpdate(editing.id, { title: formTitle, version_year: formYear })
      else await nocCodes.adminCreate({ code: formCode, title: formTitle, version_year: formYear })
      setShowModal(false); load()
    } catch (e: unknown) {
      setModalError(e instanceof Error ? e.message : 'Save failed.')
    } finally { setSaving(false) }
  }

  async function handleToggleActive(noc: NocCodeOut) {
    try { await nocCodes.adminUpdate(noc.id, { is_active: !noc.is_active }); load() }
    catch { setError('Failed to update.') }
  }

  async function handleDelete(noc: NocCodeOut) {
    if (!confirm(`Delete NOC ${noc.code} — ${noc.title}?\nThis cannot be undone.`)) return
    try { await nocCodes.adminDelete(noc.id); load() }
    catch { setError('Delete failed.') }
  }

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    e.target.value = ''; startNocUpload(file)
  }

  const totalPages = counts ? Math.ceil(counts.total / PAGE_SIZE) : 1

  return (
    <div className="page">
      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <h1>NOC Codes</h1>
          {counts && (
            <p className="sub-text">
              {counts.active} active codes &mdash; NOC 2021 V1.0
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <input
            className="form-input"
            style={{ width: 220 }}
            placeholder="Search code or title…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0) }}
          />
          <button
            className="btn-ghost btn-sm"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <Upload size={13} strokeWidth={2} />
            {uploading
              ? (uploadProgress ? `${uploadProgress.done} / ${uploadProgress.total}` : 'Reading…')
              : 'Upload CSV'}
          </button>
          <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleUpload} />
          <button
            className="btn-primary btn-sm"
            onClick={openCreate}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <Plus size={13} strokeWidth={2.5} /> Add Code
          </button>
        </div>
      </div>

      {/* ── Upload progress ── */}
      {uploadProgress && (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: '#374151', marginBottom: '0.4rem' }}>
            <span style={{ fontWeight: 500 }}>Uploading NOC codes…</span>
            <span className="filter-count">{uploadProgress.done} / {uploadProgress.total} rows &nbsp;·&nbsp; {Math.round(uploadProgress.done / uploadProgress.total * 100)}%</span>
          </div>
          <div style={{ background: '#e5e7eb', borderRadius: 99, height: 6, overflow: 'hidden' }}>
            <div style={{
              background: 'linear-gradient(90deg, #1a3352, #2563eb)',
              height: '100%',
              width: `${Math.round(uploadProgress.done / uploadProgress.total * 100)}%`,
              transition: 'width 0.3s ease',
              borderRadius: 99,
            }} />
          </div>
          <p className="sub-text" style={{ marginTop: '0.3rem', fontSize: '0.72rem' }}>You can navigate away — upload continues in the background.</p>
        </div>
      )}

      {/* ── Upload result banner ── */}
      {uploadResult && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ fontSize: '0.85rem' }}>
            <span style={{ fontWeight: 600, color: '#15803d' }}>Upload complete — </span>
            <span style={{ color: '#374151' }}>
              {uploadResult.inserted} inserted &nbsp;·&nbsp; {uploadResult.updated} updated &nbsp;·&nbsp; {uploadResult.skipped} skipped
            </span>
            {uploadResult.errors.length > 0 && (
              <div style={{ marginTop: '0.35rem', color: '#b45309', fontSize: '0.78rem' }}>
                {uploadResult.errors.slice(0, 5).map((e, i) => <div key={i}>{e}</div>)}
                {uploadResult.errors.length > 5 && <div>…and {uploadResult.errors.length - 5} more</div>}
              </div>
            )}
          </div>
          <button onClick={clearResult} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: '2px', lineHeight: 1 }}>
            <X size={15} />
          </button>
        </div>
      )}

      {uploadError && <p className="error-msg" style={{ marginBottom: '1.25rem' }}>{uploadError}</p>}
      {error && <p className="error-msg">{error}</p>}

      {/* ── Table ── */}
      {loading ? (
        <div className="loading">Loading…</div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <span className="filter-count">
              {counts?.total ?? 0} codes &nbsp;·&nbsp; page {page + 1} / {totalPages}
            </span>
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Title</th>
                  <th>TEER Level</th>
                  <th style={{ textAlign: 'center' }}>Version</th>
                  <th style={{ textAlign: 'center' }}>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {codes.length === 0 && (
                  <tr>
                    <td colSpan={6} className="empty-hint" style={{ textAlign: 'center', padding: '2.5rem' }}>
                      {search ? `No codes matching "${search}"` : 'No NOC codes yet. Upload a CSV to get started.'}
                    </td>
                  </tr>
                )}
                {codes.map(noc => {
                  const tc = TEER_COLORS[noc.teer] ?? TEER_COLORS[5]
                  return (
                    <tr key={noc.id}>
                      <td>
                        <span className="mono" style={{ fontWeight: 700, color: '#0B1F3B', letterSpacing: '0.04em' }}>{noc.code}</span>
                      </td>
                      <td style={{ maxWidth: 340 }}>{noc.title}</td>
                      <td>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                          fontSize: '0.775rem', fontWeight: 600, padding: '2px 8px', borderRadius: 99,
                          background: tc.bg, color: tc.color, border: `1px solid ${tc.border}`,
                        }}>
                          TEER {noc.teer}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center', color: '#6b7280', fontSize: '0.85rem' }}>{noc.version_year}</td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          onClick={() => handleToggleActive(noc)}
                          className={`role-badge role-badge--${noc.is_active ? 'user' : 'admin'}`}
                          style={{ cursor: 'pointer', border: 'none', font: 'inherit', fontSize: '0.775rem' }}
                          title={noc.is_active ? 'Click to deactivate' : 'Click to activate'}
                        >
                          {noc.is_active ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                          <button
                            className="btn-ghost btn-sm"
                            title="Edit"
                            onClick={() => openEdit(noc)}
                            style={{ padding: '0.25rem 0.5rem' }}
                          >
                            <Pencil size={13} strokeWidth={2} />
                          </button>
                          <button
                            className="btn-ghost btn-sm btn-danger"
                            title="Delete"
                            onClick={() => handleDelete(noc)}
                            style={{ padding: '0.25rem 0.5rem' }}
                          >
                            <Trash2 size={13} strokeWidth={2} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button className="btn-ghost btn-sm" onClick={() => setPage(p => p - 1)} disabled={page === 0}>← Prev</button>
              <span className="filter-count">Page {page + 1} / {totalPages}</span>
              <button className="btn-ghost btn-sm" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1}>Next →</button>
            </div>
          )}
        </>
      )}

      {/* ── Add / Edit Modal ── */}
      {showModal && (
        <div className="admin-modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="admin-modal" style={{ width: 440, maxWidth: '95vw' }}>
            <h2 className="admin-modal-title">{editing ? 'Edit NOC Code' : 'Add NOC Code'}</h2>
            <div className="admin-form-grid" style={{ gridTemplateColumns: '1fr' }}>
              <label className="admin-form-label">
                NOC Code *
                <input
                  className="admin-input"
                  value={formCode}
                  onChange={e => setFormCode(e.target.value)}
                  disabled={!!editing}
                  placeholder="e.g. 13100"
                  required
                />
                {!editing && <span style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.2rem', display: 'block' }}>Will be zero-padded to 5 digits automatically.</span>}
              </label>
              <label className="admin-form-label">
                Title *
                <input
                  className="admin-input"
                  value={formTitle}
                  onChange={e => setFormTitle(e.target.value)}
                  placeholder="e.g. Administrative officers"
                  required
                />
              </label>
              <label className="admin-form-label">
                Version Year
                <input
                  className="admin-input"
                  type="number"
                  value={formYear}
                  onChange={e => setFormYear(Number(e.target.value))}
                  min={2000}
                  max={2099}
                />
              </label>
            </div>
            {modalError && <p className="error-msg" style={{ marginTop: '0.75rem' }}>{modalError}</p>}
            <div className="admin-modal-actions">
              <button className="admin-btn admin-btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="admin-btn admin-btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Code'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
