import { useEffect, useState } from 'react'
import { X, Mail, Calendar, Shield, Building2, Briefcase, Camera } from 'lucide-react'
import { admin as adminApi } from '../api'
import type { AdminUserRecord, SubscriptionTier } from '../types'

interface UserDrawerProps {
  user: AdminUserRecord
  tiers: SubscriptionTier[]
  currentUserId: number | undefined
  onClose: () => void
  onUserUpdated: (user: AdminUserRecord) => void
  onUserDeleted: (userId: number) => void
  onToggleAdmin: (userId: number) => Promise<void>
  askConfirm: (opts: { title: string; message: string; confirmLabel: string; variant?: 'danger' | 'primary' }) => Promise<boolean>
}

export default function UserDrawer({
  user, tiers, currentUserId, onClose, onUserUpdated, onUserDeleted, onToggleAdmin, askConfirm,
}: UserDrawerProps) {
  const [visible, setVisible] = useState(false)
  const [tierId, setTierId] = useState<string>(user.tier_id != null ? String(user.tier_id) : '')
  const [expiresAt, setExpiresAt] = useState(user.tier_expires_at ? user.tier_expires_at.slice(0, 10) : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const isSelf = user.id === currentUserId

  // Animate in
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
  }, [])

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') handleClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleClose() {
    setVisible(false)
    setTimeout(onClose, 250) // wait for slide-out animation
  }

  async function handleSaveTier() {
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const newTierId = tierId === '' ? null : Number(tierId)
      const newExpiry = expiresAt ? new Date(expiresAt).toISOString() : null
      await adminApi.assignTier(user.id, { tier_id: newTierId, tier_expires_at: newExpiry })
      const tierObj = tiers.find(t => t.id === newTierId)
      onUserUpdated({
        ...user,
        tier_id: newTierId,
        tier_name: tierObj?.display_name ?? null,
        tier_expires_at: newExpiry,
      })
      setSuccess('Subscription updated.')
      setTimeout(() => setSuccess(''), 3000)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to update subscription.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!await askConfirm({
      title: 'Delete User',
      message: `Delete "${user.full_name}" and all their data? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    })) return
    try {
      await adminApi.deleteUser(user.id)
      onUserDeleted(user.id)
      handleClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to delete user.')
    }
  }

  const activeTiers = tiers.filter(t => t.is_active)
  const currentTier = tiers.find(t => t.id === user.tier_id)

  return (
    <>
      {/* Backdrop */}
      <div
        className={`drawer-backdrop ${visible ? 'drawer-backdrop--visible' : ''}`}
        onClick={handleClose}
      />

      {/* Drawer panel */}
      <div className={`drawer-panel ${visible ? 'drawer-panel--open' : ''}`}>
        {/* Header */}
        <div className="drawer-header">
          <div>
            <h2 className="drawer-title">{user.full_name}</h2>
            <p className="drawer-subtitle">{user.email}</p>
          </div>
          <button className="drawer-close" onClick={handleClose} title="Close">
            <X size={18} />
          </button>
        </div>

        {/* Feedback */}
        {error && <div className="drawer-alert drawer-alert--error">{error}</div>}
        {success && <div className="drawer-alert drawer-alert--success">{success}</div>}

        <div className="drawer-body">
          {/* ── User Info ─────────────────────────── */}
          <section className="drawer-section">
            <h3 className="drawer-section-title">User Details</h3>
            <div className="drawer-info-grid">
              <div className="drawer-info-row">
                <Mail size={14} />
                <span className="drawer-info-label">Email</span>
                <span className="drawer-info-value">{user.email}</span>
              </div>
              <div className="drawer-info-row">
                <Calendar size={14} />
                <span className="drawer-info-label">Registered</span>
                <span className="drawer-info-value">
                  {user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}
                </span>
              </div>
              <div className="drawer-info-row">
                <Shield size={14} />
                <span className="drawer-info-label">Role</span>
                <span className="drawer-info-value">
                  {user.is_admin
                    ? <span className="role-badge role-badge--admin">Superadmin</span>
                    : <span className="role-badge role-badge--user">User</span>
                  }
                </span>
              </div>
            </div>
          </section>

          {/* ── Activity Stats ────────────────────── */}
          <section className="drawer-section">
            <h3 className="drawer-section-title">Activity</h3>
            <div className="drawer-stats-grid">
              <div className="drawer-stat">
                <Building2 size={16} />
                <div>
                  <span className="drawer-stat-value">{user.employers}</span>
                  <span className="drawer-stat-label">Employers</span>
                </div>
              </div>
              <div className="drawer-stat">
                <Briefcase size={16} />
                <div>
                  <span className="drawer-stat-value">{user.positions}</span>
                  <span className="drawer-stat-label">Positions</span>
                </div>
              </div>
              <div className="drawer-stat">
                <Camera size={16} />
                <div>
                  <span className="drawer-stat-value">{user.screenshots}</span>
                  <span className="drawer-stat-label">Screenshots</span>
                </div>
              </div>
            </div>
          </section>

          {/* ── Subscription ──────────────────────── */}
          <section className="drawer-section">
            <h3 className="drawer-section-title">Subscription</h3>

            <div className="drawer-current-plan">
              <span className="drawer-plan-label">Current Plan</span>
              <span className={`drawer-plan-badge ${currentTier ? 'drawer-plan-badge--paid' : ''}`}>
                {currentTier?.display_name ?? 'Free'}
              </span>
              {user.tier_expires_at && (
                <span className="drawer-plan-expiry">
                  Expires {new Date(user.tier_expires_at).toLocaleDateString()}
                </span>
              )}
            </div>

            <div className="drawer-form-group">
              <label className="drawer-form-label">Assign Plan</label>
              <select
                className="admin-select"
                value={tierId}
                onChange={e => setTierId(e.target.value)}
              >
                <option value="">Free (no paid plan)</option>
                {activeTiers.map(t => (
                  <option key={t.id} value={String(t.id)}>
                    {t.display_name}{t.price_per_month ? ` — $${t.price_per_month}/mo` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="drawer-form-group">
              <label className="drawer-form-label">Expiry Date (optional)</label>
              <input
                type="date"
                className="admin-input"
                value={expiresAt}
                onChange={e => setExpiresAt(e.target.value)}
                min={new Date().toISOString().slice(0, 10)}
              />
            </div>

            <button
              className="admin-btn admin-btn-primary"
              style={{ width: '100%', marginTop: '0.5rem' }}
              onClick={handleSaveTier}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Update Subscription'}
            </button>
          </section>

          {/* ── Actions ───────────────────────────── */}
          {!isSelf && (
            <section className="drawer-section">
              <h3 className="drawer-section-title">Actions</h3>
              <div className="drawer-actions">
                <button
                  className="admin-btn admin-btn-secondary"
                  style={{ flex: 1 }}
                  onClick={() => onToggleAdmin(user.id)}
                >
                  {user.is_admin ? 'Revoke Superadmin' : 'Make Superadmin'}
                </button>
                <button
                  className="admin-btn admin-btn-danger"
                  style={{ flex: 1 }}
                  onClick={handleDelete}
                >
                  Delete User
                </button>
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  )
}
