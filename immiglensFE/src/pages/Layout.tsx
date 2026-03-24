import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { BackToTop } from '../components/BackToTop'
import { notifications as notifApi } from '../api'
import type { NotificationEvent, NotificationLog } from '../types'
import {
  Bell,
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

// ─── helpers ──────────────────────────────────────────────────────────────────

const EVENT_META: Record<NotificationEvent, { icon: string; title: string }> = {
  capture_complete: { icon: '✅', title: 'Capture completed' },
  capture_failed:   { icon: '❌', title: 'Capture failed' },
  posting_changed:  { icon: '🔄', title: 'Job posting changed' },
  round_started:    { icon: '▶️', title: 'Capture round started' },
}

function parseContext(json: string | null): Record<string, string> {
  if (!json) return {}
  try { return JSON.parse(json) } catch { return {} }
}

function notifDetail(log: NotificationLog): { icon: string; title: string; subtitle: string } {
  const meta = log.event_type ? EVENT_META[log.event_type] : null
  const ctx  = parseContext(log.context_json)

  let subtitle = ''
  if (log.event_type === 'capture_complete' || log.event_type === 'capture_failed' || log.event_type === 'round_started') {
    subtitle = ctx.position ?? ''
    if (ctx.round_id) subtitle += subtitle ? ` · Round #${ctx.round_id}` : `Round #${ctx.round_id}`
  } else if (log.event_type === 'posting_changed') {
    try { subtitle = new URL(ctx.posting_url ?? '').hostname } catch { subtitle = ctx.posting_url ?? '' }
    if (ctx.change_summary) subtitle += subtitle ? ` — ${ctx.change_summary}` : ctx.change_summary
  }

  return {
    icon:     meta?.icon ?? '🔔',
    title:    meta?.title ?? 'Notification',
    subtitle: subtitle.length > 60 ? subtitle.slice(0, 57) + '…' : subtitle,
  }
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ─── component ────────────────────────────────────────────────────────────────

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const mainRef = useRef<HTMLElement>(null)
  const location = useLocation()

  const [profileOpen, setProfileOpen] = useState(false)
  const [bellOpen, setBellOpen] = useState(false)
  const [notifLogs, setNotifLogs] = useState<NotificationLog[]>([])

  const profileRef = useRef<HTMLDivElement>(null)
  const bellRef = useRef<HTMLDivElement>(null)

  // Scroll page-main to top on every route change
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    setProfileOpen(false)
    setBellOpen(false)
  }, [location.pathname])

  // Initial fetch + background polling every 60 s
  useEffect(() => {
    const fetchLogs = () => notifApi.listLogs().then(setNotifLogs).catch(() => {})
    fetchLogs()
    const interval = setInterval(fetchLogs, 60_000)
    return () => clearInterval(interval)
  }, [])

  // Auto-create default notification rules for new users (first login)
  useEffect(() => {
    if (!user) return
    notifApi.listPreferences().then(prefs => {
      if (prefs.length === 0) {
        const events: NotificationEvent[] = ['capture_complete', 'capture_failed', 'posting_changed', 'round_started']
        events.forEach(event_type =>
          notifApi.createPreference({ event_type, channel: 'email', destination: user.email }).catch(() => {})
        )
      }
    }).catch(() => {})
  }, [user?.id])

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false)
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false)
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

  const recentNotifs = notifLogs.slice(0, 5)
  const unreadCount  = notifLogs.filter(n => !n.is_read && n.status === 'sent').length

  function openBell() {
    const wasOpen = bellOpen
    setBellOpen(o => !o)
    setProfileOpen(false)
    // Mark all as read optimistically when opening
    if (!wasOpen && unreadCount > 0) {
      notifApi.markAllRead().catch(() => {})
      setNotifLogs(logs => logs.map(l => ({ ...l, is_read: true })))
    }
  }

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
          <div className="nav-dropdown-wrap" ref={bellRef}>
            <button
              className="nav-icon-btn"
              onClick={openBell}
              aria-label="Notifications"
            >
              <Bell size={17} strokeWidth={2} />
              {unreadCount > 0 && <span className="nav-bell-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
            </button>

            {bellOpen && (
              <div className="nav-dropdown nav-dropdown--bell">
                <div className="nav-dropdown-header">Notifications</div>
                {recentNotifs.length === 0 ? (
                  <div className="nav-dropdown-empty">No notifications yet</div>
                ) : (
                  recentNotifs.map(log => {
                    const { icon, title, subtitle } = notifDetail(log)
                    return (
                      <div key={log.id} className={`nav-notif-item${!log.is_read ? ' nav-notif-item--unread' : ''}`}>
                        <div className="nav-notif-row">
                          <span className="nav-notif-icon" aria-hidden="true">{icon}</span>
                          <div className="nav-notif-body">
                            <span className="nav-notif-title">{title}</span>
                            {subtitle && <span className="nav-notif-subtitle">{subtitle}</span>}
                          </div>
                          <div className="nav-notif-aside">
                            <span className={`nav-notif-status-dot nav-notif-status-dot--${log.status}`} title={log.status} />
                            <span className="nav-notif-time">{timeAgo(log.created_at)}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
                <div className="nav-dropdown-footer">
                  <button className="nav-dropdown-view-all" onClick={() => { setBellOpen(false); navigate('/notifications') }}>
                    View All
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="nav-divider" />

          {/* Profile */}
          <div className="nav-dropdown-wrap" ref={profileRef}>
            <button
              className="nav-profile-btn"
              onClick={() => { setProfileOpen(o => !o); setBellOpen(false) }}
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
                <button className="nav-dropdown-item" onClick={() => navigate('/activity')}>
                  <ClipboardList size={14} strokeWidth={2} /> Activity Log
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

