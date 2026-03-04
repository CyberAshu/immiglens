import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Navigate } from 'react-router-dom'
import '../../App.css'

export default function AdminLayout() {
  const { user, logout, loading } = useAuth()
  const navigate = useNavigate()

  if (loading) return <div className="loading full-loading">Loading…</div>
  if (!user) return <Navigate to="/login" replace />
  if (!user.is_admin) return <Navigate to="/dashboard" replace />

  function handleLogout() {
    logout()
    navigate('/login')
  }

  const navCls = ({ isActive }: { isActive: boolean }) =>
    `sidebar-link${isActive ? ' sidebar-link--active' : ''}`

  return (
    <div className="app">
      {/* ── Top bar ─────────────────────────────── */}
      <nav className="navbar admin-navbar">
        <div className="nav-brand">
          <span style={{ color: '#a78bfa', marginRight: 8 }}>⚙</span>
          ImmigLens <span className="admin-panel-tag">Admin Panel</span>
        </div>
        <div className="nav-right">
          <span className="nav-user">👤 {user.full_name}</span>
          <button className="btn-ghost btn-sm" onClick={handleLogout}>Logout</button>
        </div>
      </nav>

      <div className="app-body">
        {/* ── Admin Sidebar ───────────────────────── */}
        <aside className="sidebar admin-sidebar">
          <nav className="sidebar-nav">
            <NavLink to="/admin" className={navCls} end>
              <span className="sidebar-icon">📊</span>Overview
            </NavLink>
            <NavLink to="/admin/users" className={navCls}>
              <span className="sidebar-icon">👥</span>Users
            </NavLink>
            <NavLink to="/admin/organizations" className={navCls}>
              <span className="sidebar-icon">🏢</span>Organizations
            </NavLink>
            <NavLink to="/admin/tiers" className={navCls}>
              <span className="sidebar-icon">💎</span>Subscription Tiers
            </NavLink>
            <NavLink to="/admin/audit-logs" className={navCls}>
              <span className="sidebar-icon">📋</span>Audit Logs
            </NavLink>
          </nav>
        </aside>

        {/* ── Content ─────────────────────────────── */}
        <main className="page-main">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
