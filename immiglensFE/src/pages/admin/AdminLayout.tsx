import { useEffect, useRef } from 'react'
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { BackToTop } from '../../components/BackToTop'
import {
  BarChart2,
  ClipboardList,
  CreditCard,
  Building2,
  LogOut,
  Paintbrush,
  Settings2,
  ShieldCheck,
  Users,
} from 'lucide-react'
import '../../App.css'

export default function AdminLayout() {
  const { user, logout, loading } = useAuth()
  const navigate = useNavigate()
  const mainRef = useRef<HTMLElement>(null)
  const location = useLocation()

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [location.pathname])

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
          <div className="nav-brand-icon" style={{ background: 'linear-gradient(135deg, #1a3352 0%, #0B1F3B 100%)', border: '1px solid rgba(200,162,74,0.4)' }}>
            <ShieldCheck size={18} color="#C8A24A" strokeWidth={2.5} />
          </div>
          ImmigLens
          <span className="admin-panel-tag">Admin</span>
        </div>
        <div className="nav-right">
          <span className="nav-user">
            <span className="nav-user-avatar"><Settings2 size={13} strokeWidth={2.5} /></span>
            {user.full_name}
          </span>
          <div className="nav-divider" />
          <button className="nav-logout" onClick={handleLogout}>
            <LogOut size={13} strokeWidth={2} />
            Logout
          </button>
        </div>
      </nav>

      <div className="app-body">
        {/* ── Admin Sidebar ───────────────────────── */}
        <aside className="sidebar admin-sidebar">
          <span className="sidebar-section-label">Admin Panel</span>
          <nav className="sidebar-nav">
            <NavLink to="/admin" className={navCls} end>
              <BarChart2 size={15} strokeWidth={2} />Overview
            </NavLink>
            <NavLink to="/admin/users" className={navCls}>
              <Users size={15} strokeWidth={2} />Users
            </NavLink>
            <NavLink to="/admin/organizations" className={navCls}>
              <Building2 size={15} strokeWidth={2} />Organizations
            </NavLink>
            <NavLink to="/admin/tiers" className={navCls}>
              <CreditCard size={15} strokeWidth={2} />Subscription Tiers
            </NavLink>
            <NavLink to="/admin/audit-logs" className={navCls}>
              <ClipboardList size={15} strokeWidth={2} />Audit Logs
            </NavLink>
            <NavLink to="/admin/report-designer" className={navCls}>
              <Paintbrush size={15} strokeWidth={2} />Report Designer
            </NavLink>
          </nav>
          <div className="sidebar-separator" />
          <span className="sidebar-section-label">Quick Link</span>
          <nav className="sidebar-nav">
            <NavLink to="/dashboard" className="sidebar-link sidebar-link--admin">
              <ShieldCheck size={15} strokeWidth={2} />Back to App
            </NavLink>
          </nav>
        </aside>

        {/* ── Content ─────────────────────────────── */}
        <main className="page-main" ref={mainRef}>
          <Outlet />
        </main>
        <BackToTop scrollRef={mainRef} />
      </div>
    </div>
  )
}
