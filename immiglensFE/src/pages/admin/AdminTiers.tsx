import { useEffect, useState } from 'react'
import { admin } from '../../api/admin'
import type { AdminUserRecord, TierCreate, TierUpdate } from '../../types'
import { useConfirm } from '../../components/ConfirmModal'
import type { SubscriptionTier } from '../../types'

const EMPTY_FORM: TierCreate = {
  name: '',
  display_name: '',
  max_active_positions: 5,
  max_urls_per_position: 7,
  max_captures_per_month: 50,
  min_capture_frequency_days: 28,
  price_per_month: null,
}

export default function AdminTiers() {
  const [tiers, setTiers] = useState<SubscriptionTier[]>([])
  const [users, setUsers] = useState<AdminUserRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'tiers' | 'assign'>('tiers')

  // Tier form state
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<SubscriptionTier | null>(null)
  const [form, setForm] = useState<TierCreate>({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)

  // Assign tier
  const [assignSearch, setAssignSearch] = useState('')
  const [assigning, setAssigning] = useState<number | null>(null)
  // per-user expiry date input (keyed by user id)
  const [expiryMap, setExpiryMap]   = useState<Record<number, string>>({})
  const { confirmModal, askConfirm } = useConfirm()

  useEffect(() => {
    Promise.all([admin.allTiers(), admin.users()])
      .then(([t, u]) => { setTiers(t); setUsers(u) })
      .catch(() => setError('Failed to load data.'))
      .finally(() => setLoading(false))
  }, [])

  function openCreate() {
    setEditing(null)
    setForm({ ...EMPTY_FORM })
    setShowForm(true)
  }

  function openEdit(tier: SubscriptionTier) {
    setEditing(tier)
    setForm({
      name: tier.name,
      display_name: tier.display_name,
      max_active_positions: tier.max_active_positions,
      max_urls_per_position: tier.max_urls_per_position,
      max_captures_per_month: tier.max_captures_per_month,
      min_capture_frequency_days: tier.min_capture_frequency_days,
      price_per_month: tier.price_per_month ?? null,
    })
    setShowForm(true)
  }

  async function handleSave() {
    setSaving(true)
    try {
      if (editing) {
        const updated = await admin.updateTier(editing.id, form as TierUpdate)
        setTiers(prev => prev.map(t => t.id === editing.id ? updated : t))
      } else {
        const created = await admin.createTier(form)
        setTiers(prev => [...prev, created])
      }
      setShowForm(false)
    } catch {
      setError('Failed to save tier.')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleActive(tier: SubscriptionTier) {
    const turningOff = tier.is_active
    if (turningOff) {
      if (!await askConfirm({
        title: 'Hide Tier from Website',
        message: `Hide "${tier.display_name}" from the website? Existing users keep access, but it won't be available for new assignments.`,
        confirmLabel: 'Hide',
        variant: 'primary',
      })) return
    }
    try {
      const updated = await admin.updateTier(tier.id, { is_active: !tier.is_active })
      setTiers(prev => prev.map(t => t.id === tier.id ? updated : t))
    } catch {
      setError('Failed to update tier visibility.')
    }
  }

  async function handleDelete(tier: SubscriptionTier) {
    const stripeNote = tier.stripe_product_id
      ? ' The Stripe product and price will be archived immediately.'
      : ''
    if (!await askConfirm({
      title: 'Delete Tier',
      message: `Delete "${tier.display_name}"? It will be removed from the list and no longer assignable to users. Existing subscribers keep their access until their period ends.${stripeNote}`,
      confirmLabel: 'Delete',
      variant: 'danger',
    })) return
    try {
      await admin.deactivateTier(tier.id)
      setTiers(prev => prev.filter(t => t.id !== tier.id))
    } catch {
      setError('Failed to delete tier.')
    }
  }

  async function handleAssignTier(userId: number, tierId: number | null) {
    setAssigning(userId)
    const expiryStr = expiryMap[userId] || null
    const tier_expires_at = expiryStr ? new Date(expiryStr).toISOString() : null
    try {
      await admin.assignTier(userId, { tier_id: tierId, tier_expires_at })
      const tierObj = tiers.find(t => t.id === tierId) ?? null
      setUsers(prev => prev.map(u =>
        u.id === userId
          ? { ...u, tier_id: tierId, tier_name: tierObj?.display_name ?? null, tier_expires_at: tier_expires_at ?? null }
          : u
      ))
    } catch {
      setError('Failed to assign tier.')
    } finally {
      setAssigning(null)
    }
  }

  const filteredUsers = users.filter(u =>
    !u.is_admin &&
    (u.full_name.toLowerCase().includes(assignSearch.toLowerCase()) ||
     u.email.toLowerCase().includes(assignSearch.toLowerCase()))
  )

  if (loading) return <div className="admin-loading">Loading subscription data…</div>
  if (error)   return <div className="admin-error">{error}</div>

  return (
    <div className="admin-page">
      {confirmModal}
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Subscription Tiers</h1>
          <p className="admin-page-sub">Define pricing plans and assign them to users</p>
        </div>
        <div className="admin-tab-group">
          <button
            className={`admin-tab ${activeTab === 'tiers' ? 'admin-tab-active' : ''}`}
            onClick={() => setActiveTab('tiers')}
          >
            Manage Tiers
          </button>
          <button
            className={`admin-tab ${activeTab === 'assign' ? 'admin-tab-active' : ''}`}
            onClick={() => setActiveTab('assign')}
          >
            Assign to Users
          </button>
        </div>
      </div>

      {/* ── TIERS TAB ──────────────────────────────────────── */}
      {activeTab === 'tiers' && (
        <>
          <div className="admin-toolbar">
            <button className="admin-btn admin-btn-primary" onClick={openCreate}>
              + New Tier
            </button>
          </div>

          <div className="tier-grid">
            {tiers.map(tier => (
              <div key={tier.id} className={`tier-card ${!tier.is_active ? 'tier-card-inactive' : ''}`}>
                <div className="tier-card-header">
                  <div>
                    <div className="tier-card-name">{tier.display_name}</div>
                    <code className="tier-card-slug">{tier.name}</code>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.3rem' }}>
                    {!tier.is_active && <span className="tier-badge-inactive">Inactive</span>}
                    {tier.stripe_product_id
                      ? <span className="tier-badge-stripe-synced" title={`Product: ${tier.stripe_product_id}`}>Stripe ✓</span>
                      : <span className="tier-badge-stripe-unsynced">Stripe —</span>
                    }
                  </div>
                </div>
                <div className="tier-limits">
                  <div className="tier-limit-row">
                    <span>Active Positions</span>
                    <strong>{tier.max_active_positions < 0 ? '∞' : tier.max_active_positions}</strong>
                  </div>
                  <div className="tier-limit-row">
                    <span>URLs / position</span>
                    <strong>{tier.max_urls_per_position < 0 ? '∞' : tier.max_urls_per_position}</strong>
                  </div>
                  <div className="tier-limit-row">
                    <span>Captures / month</span>
                    <strong>{tier.max_captures_per_month < 0 ? '∞' : tier.max_captures_per_month}</strong>
                  </div>                  <div className="tier-limit-row">
                    <span>Min capture interval</span>
                    <strong>Every {tier.min_capture_frequency_days} day(s)</strong>
                  </div>
                  <div className="tier-limit-row">
                    <span>Price / month</span>
                    <strong>{tier.price_per_month != null ? `$${tier.price_per_month}` : '—'}</strong>
                  </div>                </div>
                <div className="tier-card-actions">
                  <button
                    className="admin-btn admin-btn-secondary"
                    onClick={() => openEdit(tier)}
                  >
                    Edit
                  </button>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <button
                      className={`toggle-switch ${tier.is_active ? 'toggle-switch--on' : 'toggle-switch--off'}`}
                      onClick={() => handleToggleActive(tier)}
                      title={tier.is_active ? 'Visible on website — click to hide' : 'Hidden from website — click to show'}
                    >
                      <span className="toggle-switch-thumb" />
                    </button>
                    <span className="status-dot" style={{ color: tier.is_active ? '#16a34a' : '#9ca3af', fontSize: '0.75rem', fontWeight: 600 }}>
                      {tier.is_active ? 'Visible' : 'Hidden'}
                    </span>
                  </div>
                  <button
                    className="admin-btn admin-btn-danger"
                    onClick={() => handleDelete(tier)}
                    title={tier.stripe_product_id ? 'Delete tier and archive in Stripe' : 'Delete tier'}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── ASSIGN TAB ─────────────────────────────────────── */}
      {activeTab === 'assign' && (
        <>
          <div className="admin-toolbar">
            <input
              className="admin-search"
              placeholder="Search users…"
              value={assignSearch}
              onChange={e => setAssignSearch(e.target.value)}
            />
          </div>

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Email</th>
                  <th>Current Tier</th>
                  <th>Expires</th>
                  <th>Assign Tier</th>
                  <th>Expiry Date</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(user => (
                  <tr key={user.id}>
                    <td className="admin-cell-primary">{user.full_name}</td>
                    <td className="admin-cell-muted">{user.email}</td>
                    <td>
                      {user.tier_name
                        ? <span className="tier-badge-active">{user.tier_name}</span>
                        : <span className="admin-cell-muted">None (free)</span>
                      }
                    </td>
                    <td className="admin-cell-muted" style={{ fontSize: '0.8rem' }}>
                      {user.tier_expires_at
                        ? new Date(user.tier_expires_at).toLocaleDateString()
                        : <span style={{ color: '#9ca3af' }}>—</span>}
                    </td>
                    <td>
                      <select
                        className="admin-select"
                        value={user.tier_id ?? ''}
                        disabled={assigning === user.id}
                        onChange={e => {
                          const val = e.target.value === '' ? null : Number(e.target.value)
                          handleAssignTier(user.id, val)
                        }}
                      >
                        <option value="">— Free (no tier) —</option>
                        {tiers.filter(t => t.is_active).map(t => (
                          <option key={t.id} value={t.id}>{t.display_name}</option>
                        ))}
                      </select>
                      {assigning === user.id && <span className="admin-spinner"> ⏳</span>}
                    </td>
                    <td>
                      <input
                        type="date"
                        className="admin-input"
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.82rem', width: '140px' }}
                        value={expiryMap[user.id] ?? (user.tier_expires_at ? user.tier_expires_at.slice(0, 10) : '')}
                        onChange={e => setExpiryMap(m => ({ ...m, [user.id]: e.target.value }))}
                        min={new Date().toISOString().slice(0, 10)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── TIER FORM MODAL ────────────────────────────────── */}
      {showForm && (
        <div className="admin-modal-overlay" onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <div className="admin-modal">
            <h2 className="admin-modal-title">{editing ? 'Edit Tier' : 'New Subscription Tier'}</h2>

            <div className="admin-form-grid">
              <label className="admin-form-label">
                Slug (unique identifier)
                <input
                  className="admin-input"
                  placeholder="e.g. pro"
                  value={form.name}
                  disabled={!!editing}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                />
              </label>
              <label className="admin-form-label">
                Display Name
                <input
                  className="admin-input"
                  placeholder="e.g. Pro Plan"
                  value={form.display_name}
                  onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))}
                />
              </label>
              <label className="admin-form-label">
                Max Active Positions (-1 = unlimited)
                <input
                  type="number"
                  className="admin-input"
                  value={form.max_active_positions}
                  onChange={e => setForm(f => ({ ...f, max_active_positions: Number(e.target.value) }))}
                />
              </label>
              <label className="admin-form-label">
                Max URLs per Position (-1 = unlimited, ceiling 7)
                <input
                  type="number"
                  className="admin-input"
                  value={form.max_urls_per_position}
                  onChange={e => setForm(f => ({ ...f, max_urls_per_position: Number(e.target.value) }))}
                />
              </label>
              <label className="admin-form-label">
                Max Captures per Month
                <input
                  type="number"
                  className="admin-input"
                  value={form.max_captures_per_month}
                  onChange={e => setForm(f => ({ ...f, max_captures_per_month: Number(e.target.value) }))}
                />
              </label>
              <label className="admin-form-label">
                Min Capture Interval (days)
                <span className="admin-form-hint">Minimum days between captures. Lower = more frequent. -1 = no restriction.</span>
                <input
                  type="number"
                  min={1}
                  className="admin-input"
                  value={form.min_capture_frequency_days}
                  onChange={e => setForm(f => ({ ...f, min_capture_frequency_days: Number(e.target.value) }))}
                />
              </label>
              <label className="admin-form-label">
                Price per Month (USD, optional)
                <span className="admin-form-hint">Leave blank to hide price on the public pricing page.</span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  className="admin-input"
                  placeholder="e.g. 79"
                  value={form.price_per_month ?? ''}
                  onChange={e => setForm(f => ({ ...f, price_per_month: e.target.value === '' ? null : Number(e.target.value) }))}
                />
              </label>
            </div>

            <div className="admin-modal-actions">
              <button className="admin-btn admin-btn-secondary" onClick={() => setShowForm(false)}>
                Cancel
              </button>
              <button
                className="admin-btn admin-btn-primary"
                onClick={handleSave}
                disabled={saving || !form.name || !form.display_name}
              >
                {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Tier'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
