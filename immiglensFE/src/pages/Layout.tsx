import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { BackToTop } from '../components/BackToTop'
import { NotificationBell } from '../components/NotificationBell'
import {
  Building2,
  ChevronDown,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Settings,
  ShieldCheck,
} from 'lucide-react'
import '../App.css'

// ─── component ────────────────────────────────────────────────────────────────

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const mainRef = useRef<HTMLElement>(null)
  const location = useLocation()

  const [profileOpen, setProfileOpen] = useState(false)

  const profileRef = useRef<HTMLDivElement>(null)

  // Scroll page-main to top on every route change
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    setProfileOpen(false)
  }, [location.pathname])

  // Close profile dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleLogout() {
    logout()
    navigate('/login')
  }

  const navCls = ({ isActive }: { isActive: boolean }) =>
    `sidebar-link${isActive ? ' sidebar-link--active' : ''}`

  const initials = user?.full_name
    ? user.full_name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : 'U'

  return (
    <div className="app">
      {/* ── Top bar ─────────────────────────────────── */}
      <nav className="navbar admin-navbar">
        <NavLink to="/dashboard" className="nav-brand">
          <div className="nav-brand-icon">
            <ShieldCheck size={18} color="#fff" strokeWidth={2.5} />
          </div>
          ImmigLens
        </NavLink>

        <div className="nav-right">
          {/* Bell */}
          <NotificationBell />

          <div className="nav-divider" />

          {/* Profile */}
          <div className="nav-dropdown-wrap" ref={profileRef}>
            <button
              className="nav-profile-btn"
              onClick={() => setProfileOpen(o => !o)}
            >
              <span className="nav-user-avatar nav-user-avatar--initials">{initials}</span>
              <span className="nav-profile-name">{user?.full_name}</span>
              <ChevronDown size={13} strokeWidth={2.5} className={`nav-chevron${profileOpen ? ' nav-chevron--open' : ''}`} />
            </button>

            {profileOpen && (
              <div className="nav-dropdown nav-dropdown--profile">
                <div className="nav-dropdown-user-info">
                  <span className="nav-dropdown-user-name">{user?.full_name}</span>
                  <span className="nav-dropdown-user-email">{user?.email}</span>
                </div>
                <div className="nav-dropdown-divider" />
                <button className="nav-dropdown-item" onClick={() => navigate('/account')}>
                  <Settings size={14} strokeWidth={2} /> My Account
                </button>
                <button className="nav-dropdown-item" onClick={() => navigate('/plan')}>
                  <CreditCard size={14} strokeWidth={2} /> My Plan
                </button>
                <div className="nav-dropdown-divider" />
                <button className="nav-dropdown-item nav-dropdown-item--logout" onClick={handleLogout}>
                  <LogOut size={14} strokeWidth={2} /> Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      <div className="app-body">
        {/* ── Sidebar ─────────────────────────────────── */}
        <aside className="sidebar admin-sidebar">
          <span className="sidebar-section-label">Navigation</span>
          <nav className="sidebar-nav">
            <NavLink to="/dashboard" className={navCls} end>
              <LayoutDashboard size={15} strokeWidth={2} />Dashboard
            </NavLink>
            <NavLink to="/employers" className={navCls}>
              <Building2 size={15} strokeWidth={2} />Employers
            </NavLink>
            <NavLink to="/activity" className={navCls}>
              <ClipboardList size={15} strokeWidth={2} />Activity Log
            </NavLink>
          </nav>

          {user?.is_admin && (
            <>
              <div className="sidebar-separator" />
              <span className="sidebar-section-label">Quick Link</span>
              <nav className="sidebar-nav">
                <NavLink to="/admin" className="sidebar-link sidebar-link--admin">
                  <ShieldCheck size={15} strokeWidth={2} />Back to Admin Panel
                </NavLink>
              </nav>
            </>
          )}
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

