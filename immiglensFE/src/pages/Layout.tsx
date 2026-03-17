import { useEffect, useRef } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { BackToTop } from '../components/BackToTop'
import {
  Bell,
  Building2,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  User,
  Users,
} from 'lucide-react'
import '../App.css'

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const mainRef = useRef<HTMLElement>(null)
  const location = useLocation()

  // Scroll page-main to top on every route change
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [location.pathname])

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
          <div className="nav-brand-icon">
            <ShieldCheck size={18} color="#fff" strokeWidth={2.5} />
          </div>
          ImmigLens
        </NavLink>
        <div className="nav-right">
          <span className="nav-user">
            <span className="nav-user-avatar"><User size={13} strokeWidth={2.5} /></span>
            {user?.full_name}
          </span>
          <div className="nav-divider" />
          <button className="nav-logout" onClick={handleLogout}>
            <LogOut size={13} strokeWidth={2} />
            Logout
          </button>
        </div>
      </nav>

      <div className="app-body">
        {/* ── Sidebar ─────────────────────────────────── */}
        <aside className="sidebar">
          <span className="sidebar-section-label">Navigation</span>
          <nav className="sidebar-nav">
            <NavLink to="/dashboard" className={navCls} end>
              <LayoutDashboard size={15} strokeWidth={2} />Dashboard
            </NavLink>
            <NavLink to="/employers" className={navCls}>
              <Building2 size={15} strokeWidth={2} />Employers
            </NavLink>
            <NavLink to="/organizations" className={navCls}>
              <Users size={15} strokeWidth={2} />Organizations
            </NavLink>
            <NavLink to="/notifications" className={navCls}>
              <Bell size={15} strokeWidth={2} />Notifications
            </NavLink>
            <NavLink to="/audit-logs" className={navCls}>
              <ClipboardList size={15} strokeWidth={2} />Audit Logs
            </NavLink>
          </nav>
          <div className="sidebar-separator" />
          <span className="sidebar-section-label">Account</span>
          <nav className="sidebar-nav">
            <NavLink to="/subscriptions" className={navCls}>
              <CreditCard size={15} strokeWidth={2} />My Plan
            </NavLink>
          </nav>
        </aside>

        {/* ── Main content ────────────────────────────── */}
        <main className="page-main" ref={mainRef}>
          <Outlet />
        </main>
        <BackToTop scrollRef={mainRef} />
      </div>
    </div>
  )
}
