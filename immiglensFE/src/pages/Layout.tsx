import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  Bell,
  Building2,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  LogOut,
  User,
  Users,
} from 'lucide-react'
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
          <span className="nav-user"><User size={14} strokeWidth={2} style={{ marginRight: 5, verticalAlign: 'middle' }} />{user?.full_name}</span>
          <button className="btn-ghost btn-sm" onClick={handleLogout}>
            <LogOut size={14} strokeWidth={2} style={{ marginRight: 5, verticalAlign: 'middle' }} />Logout
          </button>
        </div>
      </nav>

      <div className="app-body">
        {/* ── Sidebar ─────────────────────────────────── */}
        <aside className="sidebar">
          <nav className="sidebar-nav">
            <NavLink to="/dashboard" className={navCls} end>
              <LayoutDashboard size={16} strokeWidth={2} />Dashboard
            </NavLink>
            <NavLink to="/employers" className={navCls}>
              <Building2 size={16} strokeWidth={2} />Employers
            </NavLink>
            <NavLink to="/organizations" className={navCls}>
              <Users size={16} strokeWidth={2} />Organizations
            </NavLink>
            <NavLink to="/notifications" className={navCls}>
              <Bell size={16} strokeWidth={2} />Notifications
            </NavLink>
            <NavLink to="/audit-logs" className={navCls}>
              <ClipboardList size={16} strokeWidth={2} />Audit Logs
            </NavLink>
            <NavLink to="/subscriptions" className={navCls}>
              <CreditCard size={16} strokeWidth={2} />My Plan
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
