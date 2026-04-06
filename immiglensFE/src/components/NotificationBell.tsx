import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bell,
  CheckCircle2,
  PlayCircle,
  RefreshCw,
  TriangleAlert,
  XCircle,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { notifications as notifApi } from '../api'
import type { NotificationEvent, NotificationLog } from '../types'

// ── Event metadata ────────────────────────────────────────────────────────────

const EVENT_META: Record<
  NotificationEvent,
  { icon: LucideIcon; color: string; bg: string; title: string }
> = {
  capture_complete:       { icon: CheckCircle2,  color: '#16a34a', bg: '#f0fdf4', title: 'Capture completed' },
  capture_failed:         { icon: XCircle,       color: '#dc2626', bg: '#fef2f2', title: 'Capture failed' },
  posting_changed:        { icon: RefreshCw,     color: '#2563eb', bg: '#eff6ff', title: 'Posting changed' },
  round_started:          { icon: PlayCircle,    color: '#d97706', bg: '#fffbeb', title: 'Round started' },
  position_limit_warning: { icon: TriangleAlert, color: '#b45309', bg: '#fef9c3', title: 'Position limit' },
}

function parseCtx(json: string | null): Record<string, string> {
  if (!json) return {}
  try { return JSON.parse(json) } catch { return {} }
}

function getDetail(log: NotificationLog): {
  Icon: LucideIcon; color: string; bg: string; title: string; subtitle: string
} {
  const meta = log.event_type ? EVENT_META[log.event_type] : null
  const ctx  = parseCtx(log.context_json)

  let subtitle = ''
  if (
    log.event_type === 'capture_complete' ||
    log.event_type === 'capture_failed' ||
    log.event_type === 'round_started'
  ) {
    subtitle = ctx.position ?? ''
    if (ctx.round_id) subtitle += subtitle ? ` · #${ctx.round_id}` : `#${ctx.round_id}`
  } else if (log.event_type === 'posting_changed') {
    try { subtitle = new URL(ctx.posting_url ?? '').hostname } catch { subtitle = ctx.posting_url ?? '' }
  } else if (log.event_type === 'position_limit_warning') {
    subtitle = ctx.active_count && ctx.position_limit
      ? `${ctx.active_count} of ${ctx.position_limit} positions used`
      : 'Approaching position limit'
  }

  return {
    Icon:     meta?.icon  ?? Bell,
    color:    meta?.color ?? '#6b7280',
    bg:       meta?.bg    ?? '#f3f4f6',
    title:    meta?.title ?? 'Notification',
    subtitle: subtitle.length > 55 ? subtitle.slice(0, 52) + '…' : subtitle,
  }
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ── Component ─────────────────────────────────────────────────────────────────

export function NotificationBell() {
  const navigate = useNavigate()
  const wrapRef  = useRef<HTMLDivElement>(null)

  const [open,       setOpen]       = useState(false)
  const [logs,       setLogs]       = useState<NotificationLog[]>([])
  const [unread,     setUnread]     = useState(0)
  const [loading,    setLoading]    = useState(false)
  const [markingAll, setMarkingAll] = useState(false)

  // ── Badge: poll unread count every 30 s (lightweight single-integer query) ──
  const refreshUnread = useCallback(() => {
    notifApi.unreadCount().then(r => setUnread(r.count)).catch(() => {})
  }, [])

  useEffect(() => {
    refreshUnread()
    const t = setInterval(refreshUnread, 30_000)
    return () => clearInterval(t)
  }, [refreshUnread])

  // ── Close on outside click or Escape ─────────────────────────────────────
  useEffect(() => {
    if (!open) return
    function onMouseDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  // ── Open dropdown: lazy-fetch recent logs ─────────────────────────────────
  async function handleBellClick() {
    if (open) { setOpen(false); return }
    setOpen(true)
    setLoading(true)
    try {
      const recent = await notifApi.listRecent(8)
      setLogs(recent)
    } finally {
      setLoading(false)
    }
  }

  // ── Mark single as read on click ──────────────────────────────────────────
  async function handleItemClick(log: NotificationLog) {
    if (log.status !== 'sent' || log.is_read) return
    // Optimistic update
    setLogs(prev => prev.map(l => l.id === log.id ? { ...l, is_read: true } : l))
    setUnread(n => Math.max(0, n - 1))
    notifApi.markRead(log.id).catch(() => {
      // Revert on failure
      setLogs(prev => prev.map(l => l.id === log.id ? { ...l, is_read: false } : l))
      setUnread(n => n + 1)
    })
  }

  // ── Mark all as read ──────────────────────────────────────────────────────
  async function handleMarkAll() {
    setMarkingAll(true)
    try {
      await notifApi.markAllRead()
      setLogs(prev => prev.map(l => ({ ...l, is_read: true })))
      setUnread(0)
    } finally {
      setMarkingAll(false)
    }
  }

  const hasUnread = logs.some(l => !l.is_read && l.status === 'sent')

  return (
    <div className="nav-dropdown-wrap" ref={wrapRef}>

      {/* ── Bell button ──────────────────────────────────────────────── */}
      <button
        className="nav-icon-btn"
        onClick={handleBellClick}
        aria-label="Notifications"
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Bell size={17} strokeWidth={2} />
        {unread > 0 && (
          <span className="nav-bell-badge" aria-label={`${unread} unread notifications`}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* ── Dropdown panel ───────────────────────────────────────────── */}
      {open && (
        <div
          className="nav-dropdown nav-dropdown--bell"
          role="dialog"
          aria-label="Notifications"
        >
          {/* Header */}
          <div className="nav-dropdown-header-row">
            <span className="nav-dropdown-header-title">Notifications</span>
            {hasUnread && (
              <button
                className="nav-dropdown-mark-all"
                onClick={handleMarkAll}
                disabled={markingAll}
              >
                {markingAll ? '…' : 'Mark all read'}
              </button>
            )}
          </div>

          {/* Body */}
          {loading ? (
            // Skeleton loading state
            <div className="nav-notif-loading">
              {[1, 2, 3].map(i => (
                <div key={i} className="nav-notif-skeleton">
                  <div className="nav-notif-skeleton-icon" />
                  <div className="nav-notif-skeleton-body">
                    <div className="nav-notif-skeleton-line nav-notif-skeleton-line--title" />
                    <div className="nav-notif-skeleton-line nav-notif-skeleton-line--sub" />
                  </div>
                </div>
              ))}
            </div>
          ) : logs.length === 0 ? (
            // Empty state
            <div className="nav-dropdown-empty">
              <Bell size={24} strokeWidth={1.4} style={{ opacity: 0.3, marginBottom: 6 }} />
              <div>No notifications yet</div>
            </div>
          ) : (
            // Notification list
            logs.map(log => {
              const { Icon, color, bg, title, subtitle } = getDetail(log)
              const isUnread = !log.is_read && log.status === 'sent'
              return (
                <div
                  key={log.id}
                  className={`nav-notif-item nav-notif-item--clickable${isUnread ? ' nav-notif-item--unread' : ''}`}
                  onClick={() => handleItemClick(log)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && handleItemClick(log)}
                  aria-label={`${title}${subtitle ? ': ' + subtitle : ''}`}
                >
                  <div className="nav-notif-row">
                    <span className="nav-notif-icon" aria-hidden="true" style={{ background: bg, color }}>
                      <Icon size={14} strokeWidth={2} />
                    </span>
                    <div className="nav-notif-body">
                      <span className="nav-notif-title">{title}</span>
                      {subtitle && <span className="nav-notif-subtitle">{subtitle}</span>}
                    </div>
                    <div className="nav-notif-aside">
                      {isUnread && <span className="nav-notif-unread-dot" aria-hidden="true" />}
                      <span className="nav-notif-time">{timeAgo(log.created_at)}</span>
                    </div>
                  </div>
                </div>
              )
            })
          )}

          {/* Footer */}
          <div className="nav-dropdown-footer">
            <button
              className="nav-dropdown-view-all"
              onClick={() => { setOpen(false); navigate('/notifications') }}
            >
              View all notifications
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
