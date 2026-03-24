import { useEffect, useState } from 'react'
import { CheckCircle2, PlayCircle, RefreshCw, XCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { notifications as notifApi } from '../api'
import { useAuth } from '../context/AuthContext'
import type { NotificationChannel, NotificationEvent, NotificationLog, NotificationPreference } from '../types'

const EVENTS: NotificationEvent[]    = ['capture_complete', 'capture_failed', 'posting_changed', 'round_started']
const CHANNELS: NotificationChannel[] = ['email', 'webhook']

// Plain text labels used inside <option> elements (no JSX allowed there)
const EVENT_LABEL: Record<NotificationEvent, string> = {
  capture_complete: 'Capture Complete',
  capture_failed:   'Capture Failed',
  posting_changed:  'Posting Changed',
  round_started:    'Round Started',
}

// Lucide icon + color used in table cells
const EVENT_ICON: Record<NotificationEvent, { icon: LucideIcon; color: string; bg: string }> = {
  capture_complete: { icon: CheckCircle2, color: '#16a34a', bg: '#f0fdf4' },
  capture_failed:   { icon: XCircle,      color: '#dc2626', bg: '#fef2f2' },
  posting_changed:  { icon: RefreshCw,    color: '#2563eb', bg: '#eff6ff' },
  round_started:    { icon: PlayCircle,   color: '#d97706', bg: '#fffbeb' },
}

const STATUS_COLOR: Record<string, string> = { sent: '#16a34a', failed: '#ef4444', pending: '#f59e0b' }
const STATUS_BG:    Record<string, string> = { sent: '#f0fdf4', failed: '#fef2f2', pending: '#fffbeb' }

function EventLabel({ e }: { e: NotificationEvent }) {
  const { icon: Icon, color, bg } = EVENT_ICON[e]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 22, height: 22, borderRadius: 6, background: bg, color, flexShrink: 0,
      }}>
        <Icon size={13} strokeWidth={2} />
      </span>
      {EVENT_LABEL[e]}
    </span>
  )
}

function parseCtx(json: string | null): Record<string, string> {
  if (!json) return {}
  try { return JSON.parse(json) } catch { return {} }
}

function LogDetail({ log }: { log: NotificationLog }) {
  const ctx = parseCtx(log.context_json)
  if (!log.event_type) return <span className="text-dim">—</span>

  if (log.event_type === 'capture_complete' || log.event_type === 'round_started') {
    return (
      <span>
        {ctx.position && <strong>{ctx.position}</strong>}
        {ctx.round_id  && <span className="text-dim"> · Round #{ctx.round_id}</span>}
      </span>
    )
  }
  if (log.event_type === 'capture_failed') {
    return (
      <span>
        {ctx.position && <strong>{ctx.position}</strong>}
        {ctx.round_id && <span className="text-dim"> · Round #{ctx.round_id}</span>}
        {ctx.error    && <span className="log-detail-error"> — {ctx.error.length > 80 ? ctx.error.slice(0, 77) + '…' : ctx.error}</span>}
      </span>
    )
  }
  if (log.event_type === 'posting_changed') {
    let host = ctx.posting_url ?? '—'
    try { host = new URL(ctx.posting_url ?? '').hostname } catch { /* keep raw */ }
    return (
      <span>
        <strong>{host}</strong>
        {ctx.change_summary && <span className="text-dim"> — {ctx.change_summary.length > 80 ? ctx.change_summary.slice(0, 77) + '…' : ctx.change_summary}</span>}
      </span>
    )
  }
  return <span className="text-dim">—</span>
}

export default function Notifications() {
  const { user } = useAuth()
  const [prefs, setPrefs]         = useState<NotificationPreference[]>([])
  const [logs, setLogs]           = useState<NotificationLog[]>([])
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [saving, setSaving]       = useState(false)
  const [marking, setMarking]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [form, setForm]           = useState<{ event_type: NotificationEvent; channel: NotificationChannel; destination: string }>({
    event_type: 'capture_complete', channel: 'email', destination: '',
  })

  // Pre-fill destination with the user's signup email once known
  useEffect(() => {
    if (user?.email) setForm(f => ({ ...f, destination: f.destination || user.email }))
  }, [user?.email])

  useEffect(() => {
    Promise.all([notifApi.listPreferences(), notifApi.listLogs()])
      .then(([p, l]) => { setPrefs(p); setLogs(l) })
      .finally(() => setLoading(false))
  }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError(null)
    try {
      const created = await notifApi.createPreference(form)
      setPrefs(prev => [...prev, created])
      setShowForm(false)
      setForm({ event_type: 'capture_complete', channel: 'email', destination: user?.email ?? '' })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save.')
    } finally { setSaving(false) }
  }

  async function handleToggle(id: number, current: boolean) {
    const updated = await notifApi.togglePreference(id, !current)
    setPrefs(prev => prev.map(p => p.id === id ? updated : p))
  }

  async function handleMarkAllRead() {
    setMarking(true)
    try {
      await notifApi.markAllRead()
      setLogs(prev => prev.map(l => ({ ...l, is_read: true })))
    } finally { setMarking(false) }
  }

  const unreadLogs = logs.filter(l => !l.is_read && l.status === 'sent').length

  if (loading) return <div className="loading">Loading…</div>

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Notifications</h1>
          <p className="sub-text">Configure email and webhook alerts</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(v => !v)}>
          {showForm ? 'Cancel' : '+ Add Rule'}
        </button>
      </div>

      {/* ── Add rule form ──────────────────────── */}
      {showForm && (
        <form className="card form-card" onSubmit={handleCreate}>
          <div className="card-title">New Notification Rule</div>
          {error && <div className="error-msg">{error}</div>}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Event</label>
              <select className="form-input" value={form.event_type}
                onChange={e => setForm(f => ({ ...f, event_type: e.target.value as NotificationEvent }))}>
                {EVENTS.map(ev => <option key={ev} value={ev}>{EVENT_LABEL[ev]}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Channel</label>
              <select className="form-input" value={form.channel}
                onChange={e => {
                  const ch = e.target.value as NotificationChannel
                  setForm(f => ({ ...f, channel: ch, destination: ch === 'email' ? (user?.email ?? '') : '' }))
                }}>
                {CHANNELS.map(ch => <option key={ch} value={ch}>{ch}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">
              {form.channel === 'email' ? 'Email address' : 'Webhook URL'}
            </label>
            <input required className="form-input" value={form.destination}
              placeholder={form.channel === 'email' ? 'you@example.com' : 'https://hooks.example.com/…'}
              onChange={e => setForm(f => ({ ...f, destination: e.target.value }))} />
          </div>
          <div className="form-actions">
            <button className="btn-primary" type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save Rule'}
            </button>
          </div>
        </form>
      )}

      {/* ── Preferences list ───────────────────── */}
      <div className="card">
        <div className="card-title">Rules <span className="card-title-sub">({prefs.length})</span></div>
        {prefs.length === 0
          ? <p className="empty-hint">No notification rules yet. Add one above.</p>
          : (
            <div className="table-wrap" style={{ border: 'none' }}>
              <table className="data-table">
                <thead>
                  <tr><th>Event</th><th>Channel</th><th>Destination</th><th>Active</th></tr>
                </thead>
                <tbody>
                  {prefs.map(p => (
                    <tr key={p.id}>
                      <td><EventLabel e={p.event_type} /></td>
                      <td><span className="channel-badge">{p.channel}</span></td>
                      <td className="mono text-dim">{p.destination}</td>
                      <td>
                        <button
                          className={`toggle-switch ${p.is_active ? 'toggle-switch--on' : 'toggle-switch--off'}`}
                          onClick={() => handleToggle(p.id, p.is_active)}
                          aria-label={p.is_active ? 'Disable notification' : 'Enable notification'}
                          title={p.is_active ? 'Click to disable' : 'Click to enable'}
                        >
                          <span className="toggle-switch-thumb" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>

      {/* ── Delivery log ───────────────────────── */}
      <div className="card section-top">
        <div className="card-title-row">
          <div className="card-title">
            Recent Deliveries
            <span className="card-title-sub"> (last 100)</span>
            {unreadLogs > 0 && <span className="notif-unread-pill">{unreadLogs} new</span>}
          </div>
          {unreadLogs > 0 && (
            <button className="btn-ghost btn-sm" onClick={handleMarkAllRead} disabled={marking}>
              {marking ? 'Marking…' : 'Mark all read'}
            </button>
          )}
        </div>

        {logs.length === 0
          ? <p className="empty-hint">No deliveries recorded yet.</p>
          : (
            <div className="table-wrap" style={{ border: 'none' }}>
              <table className="data-table">
                <thead>
                  <tr><th>When</th><th>Event</th><th>Details</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {logs.map(l => (
                    <tr key={l.id} className={!l.is_read && l.status === 'sent' ? 'notif-log-row--unread' : ''}>
                      <td className="text-dim mono" style={{ whiteSpace: 'nowrap' }}>
                        {new Date(l.created_at).toLocaleString()}
                      </td>
                      <td>
                        {l.event_type
                          ? <EventLabel e={l.event_type} />
                          : <span className="text-dim">—</span>}
                      </td>
                      <td style={{ maxWidth: 340 }}><LogDetail log={l} /></td>
                      <td>
                        <span
                          className="notif-status-pill"
                          style={{ color: STATUS_COLOR[l.status] ?? '#6b7280', background: STATUS_BG[l.status] ?? '#f9fafb' }}
                        >
                          {l.status === 'sent' ? '✓ Sent' : l.status === 'failed' ? '✗ Failed' : '⏳ Pending'}
                        </span>
                        {l.error_message && (
                          <div className="log-detail-error" style={{ fontSize: '0.75rem', marginTop: 2 }}>
                            {l.error_message.length > 100 ? l.error_message.slice(0, 97) + '…' : l.error_message}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>
    </div>
  )
}

