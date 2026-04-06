import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Bell, Camera, CheckCircle2, Edit2, PlayCircle, RefreshCw, TriangleAlert, X, XCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { notifications as notifApi } from '../api'
import { useAuth } from '../context/AuthContext'
import type { NotificationEvent, NotificationLog, NotificationSettings } from '../types'

// ── Event metadata ─────────────────────────────────────────────────────────────

const EVENT_META: Record<
  NotificationEvent,
  { label: string; icon: LucideIcon; color: string; bg: string }
> = {
  capture_complete:       { label: 'Capture Complete',         icon: CheckCircle2,  color: '#16a34a', bg: '#f0fdf4' },
  capture_failed:         { label: 'Capture Failed',           icon: XCircle,       color: '#dc2626', bg: '#fef2f2' },
  posting_changed:        { label: 'Posting Changed',          icon: RefreshCw,     color: '#2563eb', bg: '#eff6ff' },
  round_started:          { label: 'Round Started',            icon: PlayCircle,    color: '#d97706', bg: '#fffbeb' },
  position_limit_warning: { label: 'Position Limit Warning',   icon: TriangleAlert, color: '#b45309', bg: '#fef9c3' },
}

const STATUS_STYLE: Record<string, { color: string; bg: string; label: string }> = {
  sent:    { color: '#16a34a', bg: '#f0fdf4', label: 'Sent' },
  failed:  { color: '#dc2626', bg: '#fef2f2', label: 'Failed' },
  pending: { color: '#d97706', bg: '#fffbeb', label: 'Pending' },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseCtx(json: string | null): Record<string, string> {
  if (!json) return {}
  try { return JSON.parse(json) } catch { return {} }
}

function EventBadge({ e }: { e: NotificationEvent }) {
  const m = EVENT_META[e]
  if (!m) return <span style={{ color: '#6b7280' }}>Unknown</span>
  const Icon = m.icon
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 20, height: 20, borderRadius: 5, background: m.bg, color: m.color, flexShrink: 0,
      }}>
        <Icon size={12} strokeWidth={2.2} />
      </span>
      <span style={{ fontSize: '0.8125rem', color: '#374151' }}>{m.label}</span>
    </span>
  )
}

function LogSummary({ log }: { log: NotificationLog }) {
  const ctx = parseCtx(log.context_json)
  if (!log.event_type) return <span style={{ color: '#9ca3af' }}>—</span>

  if (log.event_type === 'capture_complete' || log.event_type === 'round_started') {
    return (
      <span style={{ fontSize: '0.8125rem', color: '#374151' }}>
        {ctx.position && <strong>{ctx.position}</strong>}
        {ctx.round_id  && <span style={{ color: '#9ca3af' }}> · Round #{ctx.round_id}</span>}
      </span>
    )
  }
  if (log.event_type === 'capture_failed') {
    return (
      <span style={{ fontSize: '0.8125rem', color: '#374151' }}>
        {ctx.position && <strong>{ctx.position}</strong>}
        {ctx.error    && (
          <span style={{ color: '#ef4444', marginLeft: 4 }}>
            — {ctx.error.length > 70 ? ctx.error.slice(0, 67) + '…' : ctx.error}
          </span>
        )}
      </span>
    )
  }
  if (log.event_type === 'posting_changed') {
    let host = ctx.posting_url ?? '—'
    try { host = new URL(ctx.posting_url ?? '').hostname } catch { /* keep raw */ }
    return (
      <span style={{ fontSize: '0.8125rem', color: '#374151' }}>
        <strong>{host}</strong>
        {ctx.change_summary && (
          <span style={{ color: '#9ca3af', marginLeft: 4 }}>
            — {ctx.change_summary.length > 60 ? ctx.change_summary.slice(0, 57) + '…' : ctx.change_summary}
          </span>
        )}
      </span>
    )
  }
  if (log.event_type === 'position_limit_warning') {
    return (
      <span style={{ fontSize: '0.8125rem', color: '#374151' }}>
        {ctx.active_count && ctx.position_limit
          ? <span>{ctx.active_count} of {ctx.position_limit} positions used ({ctx.percent_used}%)</span>
          : <span>Approaching position limit</span>
        }
      </span>
    )
  }
  return <span style={{ color: '#9ca3af' }}>—</span>
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60)    return 'just now'
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Notifications() {
  const { user } = useAuth()

  const [settings, setSettings]         = useState<NotificationSettings | null>(null)
  const [logs, setLogs]                 = useState<NotificationLog[]>([])
  const [loading, setLoading]           = useState(true)

  // Email edit state
  const [editingEmail, setEditingEmail] = useState(false)
  const [emailInput, setEmailInput]     = useState('')
  const [emailSaving, setEmailSaving]   = useState(false)
  const [emailError, setEmailError]     = useState<string | null>(null)
  const emailRef = useRef<HTMLInputElement>(null)

  // Mark-read state
  const [marking, setMarking]           = useState(false)

  useEffect(() => {
    Promise.all([notifApi.getSettings(), notifApi.listLogs()])
      .then(([s, l]) => { setSettings(s); setLogs(l) })
      .finally(() => setLoading(false))
  }, [])

  // Auto-focus email input when edit mode opens
  useEffect(() => {
    if (editingEmail) {
      setEmailInput(settings?.notification_email ?? user?.email ?? '')
      setTimeout(() => emailRef.current?.focus(), 50)
    }
  }, [editingEmail])

  async function handleSaveEmail(e: React.FormEvent) {
    e.preventDefault()
    if (!emailInput.trim()) return
    setEmailSaving(true); setEmailError(null)
    try {
      const updated = await notifApi.updateSettings(emailInput.trim() || null)
      setSettings(updated)
      setEditingEmail(false)
    } catch (err: unknown) {
      setEmailError(err instanceof Error ? err.message : 'Failed to update.')
    } finally { setEmailSaving(false) }
  }

  function handleCancelEdit() {
    setEditingEmail(false)
    setEmailError(null)
  }

  async function handleResetEmail() {
    setEmailSaving(true); setEmailError(null)
    try {
      const updated = await notifApi.updateSettings(null)
      setSettings(updated)
    } finally { setEmailSaving(false) }
  }

  async function handleMarkAllRead() {
    setMarking(true)
    try {
      await notifApi.markAllRead()
      setLogs(prev => prev.map(l => ({ ...l, is_read: true })))
    } finally { setMarking(false) }
  }

  const unreadCount = logs.filter(l => !l.is_read && l.status === 'sent').length
  const effectiveEmail = settings?.notification_email ?? user?.email ?? '—'
  const isOverridden   = !!settings?.notification_email

  if (loading) return <div className="loading">Loading…</div>

  return (
    <div className="page">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1>Notifications</h1>
          <p className="sub-text">Email delivery settings and recent activity</p>
        </div>
      </div>

      {/* ── Email settings card ───────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.875rem' }}>
          {/* Icon */}
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 38, height: 38, borderRadius: 9, background: '#f0f9ff',
            color: '#0284c7', flexShrink: 0, marginTop: 2,
          }}>
            <Bell size={18} strokeWidth={1.8} />
          </span>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: '0.9375rem', color: '#111827', marginBottom: 2 }}>
              Notification Email
            </div>
            <div style={{ fontSize: '0.8125rem', color: '#6b7280', marginBottom: '0.875rem' }}>
              All platform notifications are delivered to this address automatically.
              {isOverridden && (
                <span style={{ color: '#0284c7', marginLeft: 6 }}>
                  Using a custom address — differs from your account email.
                </span>
              )}
            </div>

            {editingEmail ? (
              <form onSubmit={handleSaveEmail} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <input
                  ref={emailRef}
                  type="email"
                  required
                  className="form-input"
                  style={{ width: 280, marginBottom: 0 }}
                  value={emailInput}
                  placeholder="you@example.com"
                  onChange={e => setEmailInput(e.target.value)}
                />
                <button className="btn-primary" type="submit" disabled={emailSaving} style={{ height: 38 }}>
                  {emailSaving ? 'Saving…' : 'Save'}
                </button>
                <button className="btn-ghost" type="button" onClick={handleCancelEdit} style={{ height: 38 }}>
                  Cancel
                </button>
                {emailError && (
                  <div style={{ width: '100%', marginTop: 4, fontSize: '0.8rem', color: '#dc2626', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <AlertCircle size={13} /> {emailError}
                  </div>
                )}
              </form>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <span style={{
                  fontFamily: 'monospace', fontSize: '0.875rem', color: '#111827',
                  background: '#f9fafb', border: '1px solid #e5e7eb',
                  borderRadius: 6, padding: '0.3rem 0.6rem',
                }}>
                  {effectiveEmail}
                </span>
                <button
                  className="btn-ghost btn-sm"
                  onClick={() => setEditingEmail(true)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                >
                  <Edit2 size={13} /> Edit
                </button>
                {isOverridden && (
                  <button
                    className="btn-ghost btn-sm"
                    onClick={handleResetEmail}
                    disabled={emailSaving}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#6b7280' }}
                  >
                    <X size={13} /> Reset to account email
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* What triggers notifications */}
        <div style={{
          marginTop: '1.25rem',
          paddingTop: '1.125rem',
          borderTop: '1px solid #f3f4f6',
        }}>
          <div style={{ fontSize: '0.8125rem', fontWeight: 500, color: '#374151', marginBottom: '0.625rem' }}>
            You'll be notified for
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {(['capture_complete', 'capture_failed', 'posting_changed', 'position_limit_warning'] as NotificationEvent[]).map(ev => {
              const m = EVENT_META[ev]
              const Icon = m.icon
              return (
                <span key={ev} style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                  background: m.bg, color: m.color,
                  borderRadius: 20, padding: '0.25rem 0.65rem',
                  fontSize: '0.775rem', fontWeight: 500,
                }}>
                  <Icon size={11} strokeWidth={2.2} /> {m.label}
                </span>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Activity feed ────────────────────────────────────────────────────── */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <div>
            <span style={{ fontWeight: 600, fontSize: '0.9375rem', color: '#111827' }}>Recent Activity</span>
            <span style={{ fontSize: '0.8125rem', color: '#9ca3af', marginLeft: 6 }}>last 100</span>
            {unreadCount > 0 && (
              <span style={{
                marginLeft: 8, background: '#2563eb', color: '#fff',
                borderRadius: 20, padding: '0.1rem 0.5rem', fontSize: '0.75rem', fontWeight: 600,
              }}>
                {unreadCount} new
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <button className="btn-ghost btn-sm" onClick={handleMarkAllRead} disabled={marking}>
              {marking ? 'Marking…' : 'Mark all read'}
            </button>
          )}
        </div>

        {logs.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem',
            padding: '2.5rem 1rem', color: '#9ca3af',
          }}>
            <Camera size={32} strokeWidth={1.4} style={{ opacity: 0.4 }} />
            <p style={{ fontSize: '0.875rem', margin: 0 }}>No notifications yet. They'll appear here once captures run.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {logs.map((log, idx) => {
              const st = STATUS_STYLE[log.status] ?? { color: '#6b7280', bg: '#f9fafb', label: log.status }
              const isUnread = !log.is_read && log.status === 'sent'
              return (
                <div
                  key={log.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto',
                    gap: '0.5rem',
                    padding: '0.75rem 0',
                    borderTop: idx === 0 ? 'none' : '1px solid #f3f4f6',
                    background: isUnread ? '#fafeff' : 'transparent',
                    borderRadius: isUnread ? 6 : 0,
                    paddingLeft: isUnread ? '0.5rem' : 0,
                    paddingRight: isUnread ? '0.5rem' : 0,
                  }}
                >
                  {/* Left: event + summary */}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: 3 }}>
                      {log.event_type
                        ? <EventBadge e={log.event_type} />
                        : <span style={{ fontSize: '0.8125rem', color: '#9ca3af' }}>Unknown event</span>
                      }
                      {isUnread && (
                        <span style={{
                          width: 7, height: 7, borderRadius: '50%', background: '#2563eb', flexShrink: 0
                        }} />
                      )}
                    </div>
                    <LogSummary log={log} />
                    {log.error_message && (
                      <div style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: 3 }}>
                        {log.error_message.length > 100 ? log.error_message.slice(0, 97) + '…' : log.error_message}
                      </div>
                    )}
                  </div>

                  {/* Right: status + time */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                    <span style={{
                      background: st.bg, color: st.color,
                      borderRadius: 12, padding: '0.15rem 0.5rem',
                      fontSize: '0.75rem', fontWeight: 500,
                    }}>
                      {st.label}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                      {timeAgo(log.created_at)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

    </div>
  )
}

