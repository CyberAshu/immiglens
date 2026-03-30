import { useEffect, useRef } from 'react'
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useUpload } from '../../context/UploadContext'
import { BackToTop } from '../../components/BackToTop'
import {
  BarChart2,
  BookOpen,
  Camera,
  ClipboardList,
  CreditCard,
  Building2,
  LogOut,
  Paintbrush,
  Settings2,
  ShieldCheck,
  Tag,
  Users,
} from 'lucide-react'
import '../../App.css'

export default function AdminLayout() {
  const { user, logout, loading } = useAuth()
  const { uploading, progress } = useUpload()
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
          <div className="nav-brand-icon">
            <ShieldCheck size={18} color="#fff" strokeWidth={2.5} />
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
            <NavLink to="/admin/noc-codes" className={navCls}>
              <BookOpen size={15} strokeWidth={2} />NOC Codes
            </NavLink>
            <NavLink to="/admin/captures" className={navCls}>
              <Camera size={15} strokeWidth={2} />Capture Monitor
            </NavLink>
            <NavLink to="/admin/promotions" className={navCls}>
              <Tag size={15} strokeWidth={2} />Promotions
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

      {/* ── Floating upload progress ─────────────── */}
      {uploading && progress && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 99999,
          background: '#1a3352', color: '#fff', borderRadius: 12,
          padding: '0.9rem 1.2rem', minWidth: 280, boxShadow: '0 8px 32px rgba(0,0,0,0.28)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '0.5rem' }}>
            <span style={{ fontWeight: 600 }}>Uploading NOC Codes…</span>
            <span style={{ opacity: 0.8 }}>{progress.done} / {progress.total} ({Math.round(progress.done / progress.total * 100)}%)</span>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 99, height: 6, overflow: 'hidden' }}>
            <div style={{
              background: 'linear-gradient(90deg, #C8A24A, #f0c060)',
              height: '100%',
              width: `${Math.round(progress.done / progress.total * 100)}%`,
              transition: 'width 0.3s ease',
              borderRadius: 99,
            }} />
          </div>
          <div style={{ fontSize: '0.72rem', opacity: 0.6, marginTop: '0.4rem' }}>Safe to navigate — upload continues in background</div>
        </div>
      )}
    </div>
  )
}
