import { useEffect, useState } from 'react'
import { Tag } from 'lucide-react'
import { promotions as promoApi } from '../../api/promotions'
import type { PromotionOut, PromotionCreate, PromotionUpdate } from '../../api/promotions'
import { useConfirm } from '../../components/ConfirmModal'

const EMPTY_FORM: PromotionCreate = {
  name: '',
  description: '',
  discount_type: 'percent',
  discount_value: 20,
  duration: 'forever',
  duration_in_months: null,
  max_redemptions: null,
  valid_from: null,
  valid_until: null,
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-CA')
}

function DiscountBadge({ type, value }: { type: string; value: number }) {
  const isPercent = type === 'percent'
  return (
    <span className={isPercent ? 'promo-badge promo-badge--green' : 'promo-badge promo-badge--blue'}>
      {isPercent ? `${value}% off` : `$${value} off`}
    </span>
  )
}

function DurationBadge({ duration, months }: { duration: string; months: number | null }) {
  const label = duration === 'forever'
    ? '∞ Forever'
    : duration === 'once'
    ? 'Once'
    : `${months ?? '?'} months`
  return (
    <span className="promo-badge promo-badge--slate">{label}</span>
  )
}

export default function AdminPromotions() {
  const [list, setList]       = useState<PromotionOut[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  const [showForm, setShowForm]   = useState(false)
  const [editing, setEditing]     = useState<PromotionOut | null>(null)
  const [form, setForm]           = useState<PromotionCreate>({ ...EMPTY_FORM })
  const [saving, setSaving]       = useState(false)
  const [formError, setFormError] = useState('')

  const { confirmModal, askConfirm } = useConfirm()

  useEffect(() => {
    promoApi.all()
      .then(setList)
      .catch(() => setError('Failed to load promotions.'))
      .finally(() => setLoading(false))
  }, [])

  function openCreate() {
    setEditing(null)
    setForm({ ...EMPTY_FORM })
    setFormError('')
    setShowForm(true)
  }

  function openEdit(p: PromotionOut) {
    setEditing(p)
    setForm({
      name: p.name,
      description: p.description ?? '',
      discount_type: p.discount_type,
      discount_value: p.discount_value,
      duration: p.duration as PromotionCreate['duration'],
      duration_in_months: p.duration_in_months,
      max_redemptions: p.max_redemptions,
      valid_from: p.valid_from ? p.valid_from.slice(0, 10) : null,
      valid_until: p.valid_until ? p.valid_until.slice(0, 10) : null,
    })
    setFormError('')
    setShowForm(true)
  }

  function setField<K extends keyof PromotionCreate>(key: K, value: PromotionCreate[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    if (!form.name.trim()) { setFormError('Name is required.'); return }
    if (form.discount_value <= 0) { setFormError('Discount value must be greater than 0.'); return }
    if (form.discount_type === 'percent' && form.discount_value > 100) {
      setFormError('Percent discount cannot exceed 100.')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      const payload = {
        ...form,
        description: form.description || null,
        valid_from: form.valid_from || null,
        valid_until: form.valid_until || null,
      }
      if (editing) {
        const update: PromotionUpdate = {
          name: payload.name,
          description: payload.description,
          max_redemptions: payload.max_redemptions,
          valid_from: payload.valid_from,
          valid_until: payload.valid_until,
        }
        const updated = await promoApi.update(editing.id, update)
        setList(prev => prev.map(p => p.id === editing.id ? updated : p))
      } else {
        const created = await promoApi.create(payload)
        setList(prev => [created, ...prev])
      }
      setShowForm(false)
    } catch (e) {
      setFormError((e as Error).message || 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleActive(promo: PromotionOut) {
    const turningOff = promo.is_active
    if (turningOff) {
      if (!await askConfirm({
        title: 'Deactivate Promotion',
        message: `Deactivate "${promo.name}"? It will no longer be offered at checkout and its Stripe coupon will be archived.`,
        confirmLabel: 'Deactivate',
        variant: 'danger',
      })) return
    }
    try {
      const updated = await promoApi.update(promo.id, { is_active: !promo.is_active })
      setList(prev => prev.map(p => p.id === promo.id ? updated : p))
    } catch {
      setError('Failed to update promotion.')
    }
  }

  async function handleDelete(promo: PromotionOut) {
    if (!await askConfirm({
      title: 'Delete Promotion',
      message: `Permanently delete "${promo.name}"? This archives the Stripe coupon and cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    })) return
    try {
      await promoApi.deactivate(promo.id)
      setList(prev => prev.filter(p => p.id !== promo.id))
    } catch {
      setError('Failed to delete promotion.')
    }
  }

  if (loading) return <div className="admin-loading">Loading promotions…</div>

  return (
    <div className="page">
      {confirmModal}

      {/* ── Header ───────────────────────────── */}
      <div className="page-header">
        <div>
          <h1>Promotions</h1>
          <p className="sub-text">Manage discount promotions — auto-applied at Stripe checkout for eligible users.</p>
        </div>
        <button className="admin-btn admin-btn-primary" onClick={openCreate}>
          <Tag size={14} strokeWidth={2.5} /> New Promotion
        </button>
      </div>

      {error && <div className="error-msg" style={{ marginBottom: '1.25rem' }}>{error}</div>}

      {/* ── Cards grid ───────────────────────── */}
      {list.length === 0 ? (
        <div className="admin-empty">
          No promotions yet. Click <strong>New Promotion</strong> to create one.
        </div>
      ) : (
        <div className="tier-grid">
          {list.map(p => {
            const synced = !!p.stripe_coupon_id
            return (
            <div key={p.id} className={`promo-card ${!p.is_active ? 'promo-card--inactive' : ''}`}>

              {/* ── Header ── */}
              <div className="promo-card-header">
                <div className="promo-card-title-block">
                  <div className="promo-card-name">{p.name}</div>
                  {p.description && (
                    <div className="promo-card-desc">{p.description}</div>
                  )}
                </div>
                {/* Active / Inactive pill */}
                <span className={p.is_active ? 'promo-status promo-status--active' : 'promo-status promo-status--inactive'}>
                  {p.is_active ? '● Active' : '○ Inactive'}
                </span>
              </div>

              {/* ── Discount highlight ── */}
              <div className="promo-discount-row">
                <DiscountBadge type={p.discount_type} value={p.discount_value} />
                <DurationBadge duration={p.duration} months={p.duration_in_months} />
              </div>

              {/* ── Stats ── */}
              <div className="tier-limits">
                <div className="tier-limit-row">
                  <span>Redeemed</span>
                  <strong>
                    {p.redemptions_count} / {p.max_redemptions ?? '∞'}
                    {p.remaining === 0 && (
                      <span className="promo-tag promo-tag--red">Full</span>
                    )}
                    {p.remaining !== null && p.remaining > 0 && p.remaining <= 5 && (
                      <span className="promo-tag promo-tag--amber">{p.remaining} left</span>
                    )}
                  </strong>
                </div>
                <div className="tier-limit-row">
                  <span>Valid From</span>
                  <strong>{fmtDate(p.valid_from)}</strong>
                </div>
                <div className="tier-limit-row">
                  <span>Valid Until</span>
                  <strong>{fmtDate(p.valid_until)}</strong>
                </div>
              </div>

              {/* ── Stripe sync footer ── */}
              <div className={`promo-stripe-row ${synced ? 'promo-stripe-row--synced' : 'promo-stripe-row--unsynced'}`}>
                <span className="promo-stripe-dot" />
                {synced
                  ? <span>Stripe coupon synced</span>
                  : <span>Not synced — save to connect Stripe</span>
                }
              </div>

              {/* ── Actions ── */}
              <div className="tier-card-actions">
                <button className="admin-btn admin-btn-secondary" onClick={() => openEdit(p)}>Edit</button>
                <button className="admin-btn admin-btn-danger" onClick={() => handleDelete(p)}>Delete</button>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginLeft: 'auto' }}>
                  <button
                    className={`toggle-switch ${p.is_active ? 'toggle-switch--on' : 'toggle-switch--off'}`}
                    onClick={() => handleToggleActive(p)}
                    title={p.is_active ? 'Active — click to deactivate' : 'Inactive — click to activate'}
                  >
                    <span className="toggle-switch-thumb" />
                  </button>
                </div>
              </div>
            </div>
            )
          })}
        </div>
      )}

      {/* ── Modal ────────────────────────────── */}
      {showForm && (
        <div className="admin-modal-overlay" onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <div className="admin-modal">
            <h2 className="admin-modal-title">{editing ? 'Edit Promotion' : 'New Promotion'}</h2>

            <div className="admin-form-grid">
              {/* Name — spans full width */}
              <label className="admin-form-label" style={{ gridColumn: 'span 2' }}>
                Name *
                <input
                  className="admin-input"
                  value={form.name}
                  onChange={e => setField('name', e.target.value)}
                  placeholder="e.g. Founding Member Discount"
                />
              </label>

              {/* Description — spans full width */}
              <label className="admin-form-label" style={{ gridColumn: 'span 2' }}>
                Description
                <input
                  className="admin-input"
                  value={form.description ?? ''}
                  onChange={e => setField('description', e.target.value)}
                  placeholder="Optional short description"
                />
              </label>

              {/* Discount type */}
              <label className="admin-form-label">
                Discount Type{editing && <span style={{ color: '#9ca3af', fontWeight: 400 }}> (locked)</span>}
                <select
                  className="admin-select"
                  style={{ width: '100%', padding: '0.45rem 0.7rem' }}
                  value={form.discount_type}
                  onChange={e => setField('discount_type', e.target.value as 'percent' | 'fixed')}
                  disabled={!!editing}
                >
                  <option value="percent">Percent (%)</option>
                  <option value="fixed">Fixed ($)</option>
                </select>
              </label>

              {/* Discount value */}
              <label className="admin-form-label">
                Value{editing && <span style={{ color: '#9ca3af', fontWeight: 400 }}> (locked)</span>}
                <input
                  className="admin-input"
                  type="number"
                  min={0.01}
                  max={form.discount_type === 'percent' ? 100 : undefined}
                  step={form.discount_type === 'percent' ? 1 : 0.01}
                  value={form.discount_value}
                  onChange={e => setField('discount_value', parseFloat(e.target.value) || 0)}
                  disabled={!!editing}
                />
              </label>

              {/* Duration */}
              <label className="admin-form-label">
                Duration{editing && <span style={{ color: '#9ca3af', fontWeight: 400 }}> (locked)</span>}
                <select
                  className="admin-select"
                  style={{ width: '100%', padding: '0.45rem 0.7rem' }}
                  value={form.duration}
                  onChange={e => setField('duration', e.target.value as PromotionCreate['duration'])}
                  disabled={!!editing}
                >
                  <option value="forever">Forever</option>
                  <option value="once">Once</option>
                  <option value="repeating">Repeating</option>
                </select>
              </label>

              {/* Months (only for repeating) */}
              {form.duration === 'repeating' ? (
                <label className="admin-form-label">
                  Months{editing && <span style={{ color: '#9ca3af', fontWeight: 400 }}> (locked)</span>}
                  <input
                    className="admin-input"
                    type="number"
                    min={1}
                    value={form.duration_in_months ?? ''}
                    onChange={e => setField('duration_in_months', parseInt(e.target.value) || null)}
                    disabled={!!editing}
                    placeholder="e.g. 3"
                  />
                </label>
              ) : (
                /* Max redemptions in this slot when not repeating */
                <label className="admin-form-label">
                  Max Redemptions
                  <input
                    className="admin-input"
                    type="number"
                    min={1}
                    value={form.max_redemptions ?? ''}
                    onChange={e => setField('max_redemptions', parseInt(e.target.value) || null)}
                    placeholder="Unlimited"
                  />
                </label>
              )}

              {/* Show max redemptions on its own row when duration=repeating */}
              {form.duration === 'repeating' && (
                <label className="admin-form-label">
                  Max Redemptions
                  <input
                    className="admin-input"
                    type="number"
                    min={1}
                    value={form.max_redemptions ?? ''}
                    onChange={e => setField('max_redemptions', parseInt(e.target.value) || null)}
                    placeholder="Unlimited"
                  />
                </label>
              )}

              {/* Valid From */}
              <label className="admin-form-label">
                Valid From <span style={{ color: '#9ca3af', fontWeight: 400 }}>(blank = now)</span>
                <input
                  className="admin-input"
                  type="date"
                  value={form.valid_from ?? ''}
                  onChange={e => setField('valid_from', e.target.value || null)}
                />
              </label>

              {/* Valid Until */}
              <label className="admin-form-label">
                Valid Until <span style={{ color: '#9ca3af', fontWeight: 400 }}>(blank = no expiry)</span>
                <input
                  className="admin-input"
                  type="date"
                  value={form.valid_until ?? ''}
                  onChange={e => setField('valid_until', e.target.value || null)}
                />
              </label>

              {/* Lock notice for edits */}
              {editing && (
                <p style={{
                  gridColumn: 'span 2',
                  margin: 0,
                  fontSize: '0.8rem',
                  color: '#6b7280',
                  background: '#f8fafc',
                  padding: '0.6rem 0.8rem',
                  borderRadius: 8,
                  border: '1px solid #e5e7eb',
                }}>
                  ⚠️ Discount type, value, and duration are locked after creation (Stripe coupon is immutable).
                  Delete and re-create to change these fields.
                </p>
              )}
            </div>

            {formError && <div className="error-msg" style={{ marginBottom: '1rem' }}>{formError}</div>}

            <div className="admin-modal-actions">
              <button className="admin-btn admin-btn-secondary" onClick={() => setShowForm(false)}>
                Cancel
              </button>
              <button className="admin-btn admin-btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Promotion'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}