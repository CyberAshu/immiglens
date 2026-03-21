import { useEffect, useState } from 'react'
import { notifications as notifApi } from '../api'
import { useAuth } from '../context/AuthContext'
import type { NotificationChannel, NotificationEvent, NotificationLog, NotificationPreference } from '../types'

const EVENTS: NotificationEvent[]    = ['capture_complete', 'capture_failed', 'posting_changed', 'round_started']
const CHANNELS: NotificationChannel[] = ['email', 'webhook']

const STATUS_COLOR: Record<string, string> = { sent: '#22c55e', failed: '#ef4444', pending: '#f59e0b' }

function EventLabel({ e }: { e: NotificationEvent }) {
  const map: Record<NotificationEvent, string> = {
    capture_complete: '✅ Capture Complete',
    capture_failed:   '❌ Capture Failed',
    posting_changed:  '🔄 Posting Changed',
    round_started:    '▶ Round Started',
  }
  return <>{map[e]}</>
}

export default function Notifications() {
  const { user } = useAuth()
  const [prefs, setPrefs]     = useState<NotificationPreference[]>([])
  const [logs, setLogs]       = useState<NotificationLog[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [form, setForm]       = useState<{ event_type: NotificationEvent; channel: NotificationChannel; destination: string }>({
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
                {EVENTS.map(ev => <option key={ev} value={ev}>{ev.replace(/_/g, ' ')}</option>)}
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
                      <td><span className="channel-badge channel-badge--{p.channel}">{p.channel}</span></td>
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
        <div className="card-title">Recent Deliveries <span className="card-title-sub">(last 100)</span></div>
        {logs.length === 0
          ? <p className="empty-hint">No deliveries recorded yet.</p>
          : (
            <div className="table-wrap" style={{ border: 'none' }}>
              <table className="data-table">
                <thead>
                  <tr><th>When</th><th>Status</th><th>Trigger</th><th>Error</th></tr>
                </thead>
                <tbody>
                  {logs.map(l => (
                    <tr key={l.id}>
                      <td className="text-dim mono">{new Date(l.created_at).toLocaleString()}</td>
                      <td>
                        <span className="status-dot" style={{ color: STATUS_COLOR[l.status] ?? '#6b7280' }}>
                          ● {l.status}
                        </span>
                      </td>
                      <td className="text-dim">{l.trigger_type ?? '—'} {l.trigger_id ?? ''}</td>
                      <td className="text-dim mono" style={{ color: '#ef4444', fontSize: '0.8rem' }}>{l.error_message ?? ''}</td>
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
