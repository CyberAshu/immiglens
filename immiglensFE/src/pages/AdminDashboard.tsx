import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { admin as adminApi } from '../api'
import { useAuth } from '../context/AuthContext'
import { StatCard } from '../components/StatCard'
import type { AdminGlobalStats, AdminUserRecord } from '../types'

const PIE_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#22d3ee', '#a78bfa']

export default function AdminDashboard() {
  const { user } = useAuth()
  const [stats, setStats]           = useState<AdminGlobalStats | null>(null)
  const [users, setUsers]           = useState<AdminUserRecord[]>([])
  const [loading, setLoading]       = useState(true)
  const [togglingId, setTogglingId] = useState<number | null>(null)
  const [error, setError]           = useState<string | null>(null)
  const [search, setSearch]         = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'user'>('all')

  useEffect(() => {
    Promise.all([adminApi.stats(), adminApi.users()])
      .then(([s, u]) => { setStats(s); setUsers(u) })
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

  const filteredUsers = useMemo(() => users.filter(u => {
    const q = search.toLowerCase()
    const matchSearch = !q || u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    const matchRole   = roleFilter === 'all' || (roleFilter === 'admin' ? u.is_admin : !u.is_admin)
    return matchSearch && matchRole
  }), [users, search, roleFilter])

  if (!user?.is_admin) return <Navigate to="/dashboard" replace />
  if (loading) return <div className="loading">Loading admin data…</div>

  const adminCount  = users.filter(u => u.is_admin).length
  const successRate = stats && (stats.total_screenshots + stats.failed_screenshots) > 0
    ? Math.round(stats.total_screenshots / (stats.total_screenshots + stats.failed_screenshots) * 100)
    : null

  const kpiCards = stats ? [
    { label: 'Total Users',     value: stats.total_users,       accent: '#6366f1' },
    { label: 'Admin Users',     value: adminCount,              accent: '#a78bfa' },
    { label: 'Total Employers', value: stats.total_employers,   accent: '#22d3ee' },
    { label: 'Job Positions',   value: stats.total_positions,   accent: '#a78bfa' },
    { label: 'Job Board URLs',  value: stats.total_job_postings,accent: '#f59e0b' },
    { label: 'Capture Rounds',  value: `${stats.completed_rounds}/${stats.total_capture_rounds}`, accent: '#22c55e' },
    { label: 'Screenshots',     value: stats.total_screenshots, accent: '#38bdf8' },
    { label: 'Success Rate',    value: successRate !== null ? `${successRate}%` : '—',
      accent: successRate !== null && successRate < 80 ? '#ef4444' : '#22c55e',
      warn:   successRate !== null && successRate < 80 },
    { label: 'Failed Captures', value: stats.failed_screenshots,accent: '#ef4444', warn: stats.failed_screenshots > 0 },
  ] : []

  const capturePieData = stats ? [
    { name: 'Successful', value: stats.total_screenshots,  color: '#22c55e' },
    { name: 'Failed',     value: stats.failed_screenshots, color: '#ef4444' },
    { name: 'Pending',    value: Math.max(0, stats.total_capture_rounds * 2
        - stats.total_screenshots - stats.failed_screenshots), color: '#6366f1' },
  ].filter(d => d.value > 0) : []

  const userBarData = users.map(u => ({
    name: u.full_name.split(' ')[0],
    employers:    u.employers,
    positions:    u.positions,
    screenshots:  u.screenshots,
  }))

  const rolePieData = [
    { name: 'Admins',        value: adminCount,                 color: '#a78bfa' },
    { name: 'Regular Users', value: users.length - adminCount,  color: '#22d3ee' },
  ].filter(d => d.value > 0)

  return (
    <div className="page">

      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <h1>Admin Dashboard</h1>
          <p className="sub-text">System-wide overview · {users.length} user{users.length !== 1 ? 's' : ''} registered</p>
        </div>
        <span className="admin-badge">⚙ Admin</span>
      </div>

      {error && <p className="error-msg">{error}</p>}

      {/* ── KPI cards ── */}
      <p className="section-heading-sm">System Overview</p>
      <div className="stats-grid" style={{ marginBottom: '2rem' }}>
        {kpiCards.map(c => (
          <StatCard key={c.label} label={c.label} value={c.value} accent={c.accent} warn={c.warn} />
        ))}
      </div>

      {/* ── Charts ── */}
      {stats && (
        <>
          <p className="section-heading-sm" style={{ marginBottom: '1rem' }}>Analytics</p>
          <div className="charts-grid" style={{ marginBottom: '2rem' }}>

            {/* Capture status donut */}
            {capturePieData.length > 0 && (
              <div className="chart-card">
                <div className="chart-title">Capture Status</div>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={capturePieData} cx="50%" cy="46%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                      {capturePieData.map(entry => <Cell key={entry.name} fill={entry.color} />)}
                    </Pie>
                    <Tooltip formatter={(v: number, n: string) => [`${v}`, n]}
                      contentStyle={{ background: '#1a1a2e', border: '1px solid #2e2e44', borderRadius: 8, fontSize: 12 }}
                      itemStyle={{ color: '#e8e8f0' }} />
                    <Legend iconType="circle" iconSize={9}
                      formatter={(v, e: { payload?: { value: number } }) => `${v}: ${e.payload?.value ?? 0}`}
                      wrapperStyle={{ fontSize: 12, color: '#aaa', paddingTop: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Role distribution donut */}
            {rolePieData.length > 0 && (
              <div className="chart-card">
                <div className="chart-title">User Roles</div>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={rolePieData} cx="50%" cy="46%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                      {rolePieData.map(entry => <Cell key={entry.name} fill={entry.color} />)}
                    </Pie>
                    <Tooltip formatter={(v: number, n: string) => [`${v}`, n]}
                      contentStyle={{ background: '#1a1a2e', border: '1px solid #2e2e44', borderRadius: 8, fontSize: 12 }}
                      itemStyle={{ color: '#e8e8f0' }} />
                    <Legend iconType="circle" iconSize={9}
                      formatter={(v, e: { payload?: { value: number } }) => `${v}: ${e.payload?.value ?? 0}`}
                      wrapperStyle={{ fontSize: 12, color: '#aaa', paddingTop: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Per-user activity bar */}
            {userBarData.length > 0 && (
              <div className="chart-card chart-card--wide">
                <div className="chart-title">Activity per User</div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={userBarData} barCategoryGap="30%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                    <XAxis dataKey="name" tick={{ fill: '#888', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#888', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip cursor={{ fill: 'rgba(99,102,241,0.08)' }}
                      contentStyle={{ background: '#1a1a2e', border: '1px solid #2e2e44', borderRadius: 8, fontSize: 12 }}
                      itemStyle={{ color: '#e8e8f0' }} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: '#aaa' }} />
                    <Bar dataKey="employers"   name="Employers"   fill="#6366f1" radius={[4,4,0,0]} />
                    <Bar dataKey="positions"   name="Positions"   fill="#22d3ee" radius={[4,4,0,0]} />
                    <Bar dataKey="screenshots" name="Screenshots" fill="#22c55e" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Employers per user pie */}
            {users.some(u => u.employers > 0) && (
              <div className="chart-card chart-card--full">
                <div className="chart-title">Employers per User</div>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={users.filter(u => u.employers > 0).map(u => ({ name: u.full_name, value: u.employers }))}
                      cx="50%" cy="50%" outerRadius={70} dataKey="value"
                      label={({ name, value }) => `${name} (${value})`}
                    >
                      {users.filter(u => u.employers > 0).map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid #2e2e44', borderRadius: 8, fontSize: 12 }} itemStyle={{ color: '#e8e8f0' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Users table ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', gap: '1rem', flexWrap: 'wrap' }}>
        <p className="section-heading-sm" style={{ margin: 0 }}>All Users ({filteredUsers.length})</p>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="form-input"
            style={{ width: '220px', padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
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
            <option value="admin">Admins only</option>
            <option value="user">Regular only</option>
          </select>
        </div>
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
            {filteredUsers.length === 0 && (
              <tr>
                <td colSpan={8} className="empty-hint" style={{ textAlign: 'center', padding: '2rem' }}>
                  No users match the current filters.
                </td>
              </tr>
            )}
            {filteredUsers.map(u => (
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
                    ? <span className="role-badge role-badge--admin">Admin</span>
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
                          {togglingId === u.id ? '…' : u.is_admin ? 'Revoke Admin' : 'Make Admin'}
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
    </div>
  )
}
