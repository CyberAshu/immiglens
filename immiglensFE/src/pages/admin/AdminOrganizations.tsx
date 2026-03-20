import { Fragment, useEffect, useState } from 'react'
import { admin } from '../../api/admin'
import type { AdminOrgOut } from '../../types'

const PAGE_SIZE = 20

export default function AdminOrganizations() {
  const [orgs, setOrgs] = useState<AdminOrgOut[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<number | null>(null)
  const [page, setPage] = useState(1)

  useEffect(() => {
    admin.allOrgs()
      .then(setOrgs)
      .catch(() => setError('Failed to load organizations.'))
      .finally(() => setLoading(false))
  }, [])

  async function handleDelete(orgId: number, orgName: string) {
    if (!confirm(`Permanently delete organization "${orgName}" and all its data?`)) return
    try {
      await admin.deleteOrg(orgId)
      setOrgs(prev => prev.filter(o => o.id !== orgId))
    } catch {
      alert('Failed to delete organization.')
    }
  }

  const filtered = orgs.filter(o =>
    o.name.toLowerCase().includes(search.toLowerCase()) ||
    o.owner_name.toLowerCase().includes(search.toLowerCase()) ||
    o.owner_email.toLowerCase().includes(search.toLowerCase())
  )

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  if (loading) return <div className="admin-loading">Loading organizations…</div>
  if (error)   return <div className="admin-error">{error}</div>

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Organizations</h1>
          <p className="admin-page-sub">Manage all organizations across the platform</p>
        </div>
        <div className="admin-stat-pill">{orgs.length} total</div>
      </div>

      <div className="admin-toolbar">
        <input
          className="admin-search"
          placeholder="Search by name or owner…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="admin-empty">No organizations found.</div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Organization</th>
                <th>Owner</th>
                <th>Members</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map(org => (
                <Fragment key={org.id}>
                  <tr className={expanded === org.id ? 'admin-row-expanded' : ''}>
                    <td>
                      <button
                        className="admin-link-btn"
                        onClick={() => setExpanded(expanded === org.id ? null : org.id)}
                      >
                        {org.name}
                      </button>
                    </td>
                    <td>
                      <div className="admin-cell-primary">{org.owner_name}</div>
                      <div className="admin-cell-secondary">{org.owner_email}</div>
                    </td>
                    <td>
                      <span className="admin-badge">{org.member_count}</span>
                    </td>
                    <td className="admin-cell-muted">
                      {new Date(org.created_at).toLocaleDateString()}
                    </td>
                    <td>
                      <button
                        className="admin-btn admin-btn-danger"
                        onClick={() => handleDelete(org.id, org.name)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                  {expanded === org.id && (
                    <tr className="admin-row-detail">
                      <td colSpan={5}>
                        <div className="admin-members-panel">
                          <strong>Members ({org.members.length})</strong>
                          {org.members.length === 0 ? (
                            <p className="admin-cell-muted">No members.</p>
                          ) : (
                            <table className="admin-table admin-table-inner">
                              <thead>
                                <tr>
                                  <th>Name</th>
                                  <th>Email</th>
                                  <th>Role</th>
                                  <th>Joined</th>
                                </tr>
                              </thead>
                              <tbody>
                                {org.members.map(m => (
                                  <tr key={m.user_id}>
                                    <td>{m.user_name || '—'}</td>
                                    <td>{m.user_email}</td>
                                    <td>
                                      <span className={`admin-role-badge admin-role-${m.role}`}>
                                        {m.role === 'admin' ? 'Org Admin' : m.role}
                                      </span>
                                    </td>
                                    <td className="admin-cell-muted">
                                      {new Date(m.joined_at).toLocaleDateString()}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button className="btn-ghost btn-sm" onClick={() => setPage(p => p - 1)} disabled={page === 1}>
            ← Prev
          </button>
          <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>Page {page} / {totalPages}</span>
          <button className="btn-ghost btn-sm" onClick={() => setPage(p => p + 1)} disabled={page === totalPages}>
            Next →
          </button>
        </div>
      )}
    </div>
  )
}
