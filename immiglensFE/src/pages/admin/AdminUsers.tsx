import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { admin as adminApi } from '../../api'
import type { AdminUserRecord } from '../../types'

const PAGE_SIZE = 25

export default function AdminUsers() {
  const { user } = useAuth()
  const [users, setUsers]           = useState<AdminUserRecord[]>([])
  const [loading, setLoading]       = useState(true)
  const [togglingId, setTogglingId] = useState<number | null>(null)
  const [error, setError]           = useState<string | null>(null)
  const [search, setSearch]         = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'user'>('all')
  const [page, setPage]             = useState(1)

  useEffect(() => {
    adminApi.users()
      .then(setUsers)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  async function handleToggleAdmin(userId: number) {
    setTogglingId(userId)
    try {
      const updated = await adminApi.toggleAdmin(userId)
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_admin: updated.is_admin } : u))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed.')
    } finally { setTogglingId(null) }
  }

  async function handleDeleteUser(userId: number, name: string) {
    if (!confirm(`Delete user "${name}" and all their data? This cannot be undone.`)) return
    try {
      await adminApi.deleteUser(userId)
      setUsers(prev => prev.filter(u => u.id !== userId))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed.')
    }
  }

  const filtered = useMemo(() => users.filter(u => {
    const q = search.toLowerCase()
    const matchSearch = !q || u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    const matchRole   = roleFilter === 'all' || (roleFilter === 'admin' ? u.is_admin : !u.is_admin)
    return matchSearch && matchRole
  }), [users, search, roleFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  useMemo(() => { setPage(1) }, [search, roleFilter])

  if (loading) return <div className="loading">Loading users…</div>

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Users</h1>
          <p className="sub-text">{users.length} registered · {users.filter(u => u.is_admin).length} superadmin{users.filter(u => u.is_admin).length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {error && <p className="error-msg">{error}</p>}

      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <input
          className="form-input"
          style={{ width: '240px', padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
          placeholder="Search name or email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="form-input"
          style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value as 'all' | 'admin' | 'user')}
        >
          <option value="all">All roles</option>
          <option value="admin">Superadmins only</option>
          <option value="user">Regular users only</option>
        </select>
        <span className="filter-count">{filtered.length} result{filtered.length !== 1 ? 's' : ''}{totalPages > 1 ? ` · page ${page}/${totalPages}` : ''}</span>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th style={{ textAlign: 'center' }}>Employers</th>
              <th style={{ textAlign: 'center' }}>Positions</th>
              <th style={{ textAlign: 'center' }}>Screenshots</th>
              <th>Registered</th>
              <th style={{ textAlign: 'center' }}>Role</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="empty-hint" style={{ textAlign: 'center', padding: '2rem' }}>
                  No users match the current filters.
                </td>
              </tr>
            )}
            {paginated.map(u => (
              <tr key={u.id}>
                <td style={{ fontWeight: 500 }}>{u.full_name}</td>
                <td style={{ color: '#888', fontSize: '0.88rem' }}>{u.email}</td>
                <td style={{ textAlign: 'center' }}>{u.employers}</td>
                <td style={{ textAlign: 'center' }}>{u.positions}</td>
                <td style={{ textAlign: 'center' }}>{u.screenshots}</td>
                <td style={{ color: '#888', fontSize: '0.82rem' }}>
                  {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                </td>
                <td style={{ textAlign: 'center' }}>
                  {u.is_admin
                    ? <span className="role-badge role-badge--admin">Superadmin</span>
                    : <span className="role-badge role-badge--user">User</span>}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                    {u.id !== user?.id ? (
                      <>
                        <button
                          className="btn-ghost btn-sm"
                          onClick={() => handleToggleAdmin(u.id)}
                          disabled={togglingId === u.id}
                        >
                          {togglingId === u.id ? '…' : u.is_admin ? 'Revoke Superadmin' : 'Make Superadmin'}
                        </button>
                        <button className="btn-danger-sm" onClick={() => handleDeleteUser(u.id, u.full_name)}>
                          Delete
                        </button>
                      </>
                    ) : (
                      <span style={{ color: '#555', fontSize: '0.8rem' }}>You</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
