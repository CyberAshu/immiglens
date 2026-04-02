import { useEffect, useState } from 'react'
import {
  Layers, Eye, EyeOff, Link2, Plus, Pencil, Trash2, X,
  Briefcase, Globe, Camera, Clock, DollarSign,
} from 'lucide-react'
import { admin } from '../../api/admin'
import type { TierCreate, TierUpdate, SubscriptionTier } from '../../types'
import { useConfirm } from '../../components/ConfirmModal'

const EMPTY_FORM: TierCreate = {
  name: '',
  display_name: '',
  max_active_positions: 5,
  max_urls_per_position: 7,
  max_captures_per_month: 50,
  min_capture_frequency_days: 28,
  price_per_month: null,
}

const TIER_COLORS = ['#0B1F3B', '#16a34a', '#2563eb', '#7c3aed', '#ea580c', '#0891b2', '#c026d3', '#dc2626']

/* ── Stat Card ────────────────────────────────────────────── */
function StatCard({ label, value, icon, accent, iconBg }: {
  label: string; value: number; icon: React.ReactNode; accent: string; iconBg: string
}) {
  return (
    <div className="ov2-kpi-card" style={{ borderBottomColor: accent }}>
      <div className="ov2-kpi-top">
        <div className="ov2-kpi-icon" style={{ background: iconBg, color: accent }}>{icon}</div>
      </div>
      <div className="ov2-kpi-value" style={{ color: accent }}>{value}</div>
      <div className="ov2-kpi-label">{label}</div>
    </div>
  )
}

/* ── Limit Feature Row ────────────────────────────────────── */
function LimitRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="st-limit-row">
      <div className="st-limit-icon">{icon}</div>
      <span className="st-limit-label">{label}</span>
      <span className="st-limit-value">{value}</span>
    </div>
  )
}

/* ── Tier Card v2 ─────────────────────────────────────────── */
function TierCardV2({ tier, color, onEdit, onToggle, onDelete }: {
  tier: SubscriptionTier
  color: string
  onEdit: () => void
  onToggle: () => void
  onDelete: () => void
}) {
  const fmt = (n: number) => n < 0 ? 'Unlimited' : String(n)

  return (
    <div className={`st-card ${!tier.is_active ? 'st-card--inactive' : ''}`}>
      {/* Color accent bar */}
      <div className="st-card-accent" style={{ background: color }} />

      {/* Header */}
      <div className="st-card-header">
        <div>
          <h3 className="st-card-name">{tier.display_name}</h3>
          <code className="st-card-slug">{tier.name}</code>
        </div>
        <div className="st-card-badges">
          {!tier.is_active && <span className="st-badge st-badge--inactive">Hidden</span>}
          {tier.stripe_product_id
            ? <span className="st-badge st-badge--stripe">Stripe ✓</span>
            : <span className="st-badge st-badge--no-stripe">No Stripe</span>
          }
        </div>
      </div>

      {/* Price hero */}
      <div className="st-price-hero">
        {tier.price_per_month != null ? (
          <>
            <span className="st-price-currency">$</span>
            <span className="st-price-amount">{tier.price_per_month}</span>
            <span className="st-price-period">/mo</span>
          </>
        ) : (
          <span className="st-price-free">Free</span>
        )}
      </div>

      {/* Features */}
      <div className="st-limits">
        <LimitRow icon={<Briefcase size={13} />} label="Active Positions" value={fmt(tier.max_active_positions)} />
        <LimitRow icon={<Globe size={13} />} label="URLs / Position" value={fmt(tier.max_urls_per_position)} />
        <LimitRow icon={<Camera size={13} />} label="Captures / Month" value={fmt(tier.max_captures_per_month)} />
        <LimitRow icon={<Clock size={13} />} label="Min Interval" value={tier.min_capture_frequency_days < 0 ? 'No limit' : `${tier.min_capture_frequency_days}d`} />
      </div>

      {/* Actions */}
      <div className="st-card-actions">
        <button className="st-action-btn" onClick={onEdit} title="Edit">
          <Pencil size={14} /> Edit
        </button>
        <button
          className={`st-action-btn st-action-btn--toggle ${tier.is_active ? '' : 'st-action-btn--hidden'}`}
          onClick={onToggle}
          title={tier.is_active ? 'Hide from website' : 'Show on website'}
        >
          {tier.is_active ? <><EyeOff size={14} /> Hide</> : <><Eye size={14} /> Show</>}
        </button>
        <button className="st-action-btn st-action-btn--danger" onClick={onDelete} title="Delete">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}

/* ── Tier Form Drawer ─────────────────────────────────────── */
function TierFormDrawer({ editing, form, setForm, saving, onSave, onClose }: {
  editing: SubscriptionTier | null
  form: TierCreate
  setForm: React.Dispatch<React.SetStateAction<TierCreate>>
  saving: boolean
  onSave: () => void
  onClose: () => void
}) {
  const [visible, setVisible] = useState(false)

  useEffect(() => { requestAnimationFrame(() => setVisible(true)) }, [])
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') handleClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleClose() {
    setVisible(false)
    setTimeout(onClose, 250)
  }

  return (
    <>
      <div className={`drawer-backdrop ${visible ? 'drawer-backdrop--visible' : ''}`} onClick={handleClose} />
      <div className={`drawer-panel ${visible ? 'drawer-panel--open' : ''}`}>
        <div className="drawer-header">
          <div>
            <h2 className="drawer-title">{editing ? 'Edit Tier' : 'New Tier'}</h2>
            <p className="drawer-subtitle">{editing ? `Editing "${editing.display_name}"` : 'Create a new subscription plan'}</p>
          </div>
          <button className="drawer-close" onClick={handleClose}><X size={18} /></button>
        </div>

        <div className="drawer-body">
          <section className="drawer-section">
            <h3 className="drawer-section-title">Identity</h3>
            <div className="st-form-group">
              <label className="st-form-label">Slug (unique ID)</label>
              <input
                className="st-form-input"
                placeholder="e.g. pro"
                value={form.name}
                disabled={!!editing}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="st-form-group">
              <label className="st-form-label">Display Name</label>
              <input
                className="st-form-input"
                placeholder="e.g. Pro Plan"
                value={form.display_name}
                onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))}
              />
            </div>
          </section>

          <section className="drawer-section">
            <h3 className="drawer-section-title">Pricing</h3>
            <div className="st-form-group">
              <label className="st-form-label">Price per Month (USD)</label>
              <div className="st-input-with-icon">
                <DollarSign size={14} className="st-input-icon" />
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  className="st-form-input st-form-input--with-icon"
                  placeholder="0 = free"
                  value={form.price_per_month ?? ''}
                  onChange={e => setForm(f => ({ ...f, price_per_month: e.target.value === '' ? null : Number(e.target.value) }))}
                />
              </div>
            </div>
          </section>

          <section className="drawer-section">
            <h3 className="drawer-section-title">Limits</h3>
            <div className="st-form-grid">
              <div className="st-form-group">
                <label className="st-form-label">Max Positions</label>
                <input type="number" className="st-form-input" value={form.max_active_positions}
                  onChange={e => setForm(f => ({ ...f, max_active_positions: Number(e.target.value) }))} />
                <span className="st-form-hint">-1 = unlimited</span>
              </div>
              <div className="st-form-group">
                <label className="st-form-label">URLs / Position</label>
                <input type="number" className="st-form-input" value={form.max_urls_per_position}
                  onChange={e => setForm(f => ({ ...f, max_urls_per_position: Number(e.target.value) }))} />
                <span className="st-form-hint">-1 = unlimited, max 7</span>
              </div>
              <div className="st-form-group">
                <label className="st-form-label">Captures / Month</label>
                <input type="number" className="st-form-input" value={form.max_captures_per_month}
                  onChange={e => setForm(f => ({ ...f, max_captures_per_month: Number(e.target.value) }))} />
                <span className="st-form-hint">-1 = unlimited</span>
              </div>
              <div className="st-form-group">
                <label className="st-form-label">Min Interval (days)</label>
                <input type="number" min={1} className="st-form-input" value={form.min_capture_frequency_days}
                  onChange={e => setForm(f => ({ ...f, min_capture_frequency_days: Number(e.target.value) }))} />
                <span className="st-form-hint">Lower = more frequent</span>
              </div>
            </div>
          </section>

          <button
            className="admin-btn admin-btn-primary"
            style={{ width: '100%', padding: '0.65rem', fontSize: '0.88rem', marginTop: '0.5rem' }}
            onClick={onSave}
            disabled={saving || !form.name || !form.display_name}
          >
            {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Tier'}
          </button>
        </div>
      </div>
    </>
  )
}

/* ── Main Page ────────────────────────────────────────────── */
export default function AdminTiers() {
  const [tiers, setTiers] = useState<SubscriptionTier[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<SubscriptionTier | null>(null)
  const [form, setForm] = useState<TierCreate>({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)

  const { confirmModal, askConfirm } = useConfirm()

  useEffect(() => {
    admin.allTiers()
      .then(setTiers)
      .catch(() => setError('Failed to load tiers.'))
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
    if (tier.is_active) {
      if (!await askConfirm({
        title: 'Hide Tier from Website',
        message: `Hide "${tier.display_name}"? Existing users keep access, but it won't be available for new assignments.`,
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
    const stripeNote = tier.stripe_product_id ? ' Stripe product and price will be archived.' : ''
    if (!await askConfirm({
      title: 'Delete Tier',
      message: `Delete "${tier.display_name}"? Existing subscribers keep access until their period ends.${stripeNote}`,
      confirmLabel: 'Delete',
      variant: 'danger',
    })) return
    try {
      const res = await admin.deactivateTier(tier.id)
      setTiers(prev => prev.filter(t => t.id !== tier.id))
      setError('')
      setSuccess(res?.detail || `Tier "${tier.display_name}" deleted.`)
      setTimeout(() => setSuccess(''), 5000)
    } catch (err: any) {
      const msg = err?.detail || err?.message || 'Failed to delete tier.'
      setSuccess('')
      setError(msg)
    }
  }

  if (loading) return <div className="admin-loading">Loading subscription data…</div>

  const activeCount = tiers.filter(t => t.is_active).length
  const inactiveCount = tiers.length - activeCount
  const stripeSynced = tiers.filter(t => t.stripe_product_id).length

  return (
    <div className="admin-page">
      {confirmModal}

      {/* ── Header ────────────────────────────────── */}
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Subscription Tiers</h1>
          <p className="admin-page-sub">Define and manage pricing plans</p>
        </div>
        <button className="st-create-btn" onClick={openCreate}>
          <Plus size={16} /> New Tier
        </button>
      </div>

      {/* Alerts */}
      {error && <div className="admin-error" style={{ margin: '0 0 1rem' }}>{error}</div>}
      {success && <div className="drawer-alert drawer-alert--success" style={{ marginBottom: '1rem' }}>{success}</div>}

      {/* ── KPI Cards ─────────────────────────────── */}
      <div className="ov2-kpi-grid" style={{ marginBottom: '1.75rem' }}>
        <StatCard label="Total Plans" value={tiers.length}
          icon={<Layers size={18} />} accent="#0B1F3B" iconBg="rgba(11,31,59,0.08)" />
        <StatCard label="Active" value={activeCount}
          icon={<Eye size={18} />} accent="#16a34a" iconBg="rgba(22,163,74,0.08)" />
        <StatCard label="Hidden" value={inactiveCount}
          icon={<EyeOff size={18} />} accent="#6b7280" iconBg="rgba(107,114,128,0.08)" />
        <StatCard label="Stripe Synced" value={stripeSynced}
          icon={<Link2 size={18} />} accent="#7c3aed" iconBg="rgba(124,58,237,0.08)" />
      </div>

      {/* ── Tier Cards ────────────────────────────── */}
      {tiers.length === 0 ? (
        <div className="au-empty">
          No subscription tiers yet. Create your first plan to get started.
        </div>
      ) : (
        <div className="st-grid">
          {tiers.map((tier, i) => (
            <TierCardV2
              key={tier.id}
              tier={tier}
              color={TIER_COLORS[i % TIER_COLORS.length]}
              onEdit={() => openEdit(tier)}
              onToggle={() => handleToggleActive(tier)}
              onDelete={() => handleDelete(tier)}
            />
          ))}
        </div>
      )}

      {/* ── Form Drawer ───────────────────────────── */}
      {showForm && (
        <TierFormDrawer
          editing={editing}
          form={form}
          setForm={setForm}
          saving={saving}
          onSave={handleSave}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  )
}
