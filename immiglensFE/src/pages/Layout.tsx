import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import '../App.css'

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  const navCls = ({ isActive }: { isActive: boolean }) =>
    `sidebar-link${isActive ? ' sidebar-link--active' : ''}`

  return (
    <div className="app">
      {/* ── Top bar ─────────────────────────────────── */}
      <nav className="navbar">
        <NavLink to="/dashboard" className="nav-brand">
          <img src="/immiglens.svg" alt="ImmigLens" style={{ height: '28px', width: '28px', marginRight: '8px', verticalAlign: 'middle' }} />
          ImmigLens
        </NavLink>
        <div className="nav-right">
          <span className="nav-user">👤 {user?.full_name}</span>
          <button className="btn-ghost btn-sm" onClick={handleLogout}>Logout</button>
        </div>
      </nav>

      <div className="app-body">
        {/* ── Sidebar ─────────────────────────────────── */}
        <aside className="sidebar">
          <nav className="sidebar-nav">
            <NavLink to="/dashboard" className={navCls} end>
              <span className="sidebar-icon">🏠</span>Dashboard
            </NavLink>
            <NavLink to="/organizations" className={navCls}>
              <span className="sidebar-icon">🏢</span>Organizations
            </NavLink>
            <NavLink to="/notifications" className={navCls}>
              <span className="sidebar-icon">🔔</span>Notifications
            </NavLink>
            <NavLink to="/audit-logs" className={navCls}>
              <span className="sidebar-icon">📋</span>Audit Logs
            </NavLink>
            <NavLink to="/subscriptions" className={navCls}>
              <span className="sidebar-icon">💳</span>My Plan
            </NavLink>
          </nav>
        </aside>

        {/* ── Main content ────────────────────────────── */}
        <main className="page-main">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
