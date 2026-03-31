import { useEffect, useState } from 'react'
import { Copy, Tag, Globe, ToggleLeft, ToggleRight, Pencil, Trash2 } from 'lucide-react'
import { promotions as promoApi } from '../../api/promotions'
import type { PromotionOut, PromotionCreate, PromotionUpdate } from '../../api/promotions'
import { useConfirm } from '../../components/ConfirmModal'

const EMPTY_FORM: PromotionCreate = {
  name: '',
  description: '',
  code: '',
  discount_type: 'percent',
  discount_value: 20,
  duration: 'forever',
  duration_in_months: null,
  max_redemptions: null,
  valid_from: null,
  valid_until: null,
  show_on_pricing_page: false,
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-CA')
}

function CopyableCode({ code, iconOnly }: { code: string; iconOnly?: boolean }) {
  const [copied, setCopied] = useState(false)
  function handleCopy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  if (iconOnly) {
    return (
      <button className="promo-card2-copy-icon" onClick={handleCopy} title="Copy code">
        {copied ? <span style={{ fontSize: '0.7rem', color: '#16a34a', fontWeight: 700 }}>✓</span> : <Copy size={13} strokeWidth={2} />}
      </button>
    )
  }
  return (
    <button className="promo-code-copy-btn" onClick={handleCopy} title="Copy code">
      <span className="promo-code-text">{code}</span>
      <Copy size={13} strokeWidth={2} />
      {copied && <span className="promo-code-copied">Copied!</span>}
    </button>
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

  // Warn when multiple promos have show_on_pricing_page = true
  const multipleOnPage = list.filter(p => p.is_active && p.show_on_pricing_page).length > 1

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
      code: p.code,
      discount_type: p.discount_type,
      discount_value: p.discount_value,
      duration: p.duration as PromotionCreate['duration'],
      duration_in_months: p.duration_in_months,
      max_redemptions: p.max_redemptions,
      valid_from: p.valid_from ? p.valid_from.slice(0, 10) : null,
      valid_until: p.valid_until ? p.valid_until.slice(0, 10) : null,
      show_on_pricing_page: p.show_on_pricing_page,
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
        code: form.code?.trim().toUpperCase() || null,
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
          show_on_pricing_page: payload.show_on_pricing_page,
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
        message: `Deactivate "${promo.name}"? Users will no longer be able to redeem this code and its Stripe coupon will be archived.`,
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

  async function handleTogglePricingPage(promo: PromotionOut) {
    try {
      const updated = await promoApi.update(promo.id, { show_on_pricing_page: !promo.show_on_pricing_page })
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
          <p className="sub-text">Create promo codes to share with users or show on the pricing page.</p>
        </div>
        <button className="admin-btn admin-btn-primary" onClick={openCreate}>
          <Tag size={14} strokeWidth={2.5} /> New Promotion
        </button>
      </div>

      {error && <div className="error-msg" style={{ marginBottom: '1.25rem' }}>{error}</div>}

      {multipleOnPage && (
        <div className="banner banner-warn" style={{ marginBottom: '1.25rem' }}>
          ⚠️ Multiple active promotions are set to <strong>Show on Pricing Page</strong>. Only the first one (by ID) will be shown. Disable the others to avoid confusion.
        </div>
      )}

      {/* ── Cards grid ───────────────────────── */}
      {list.length === 0 ? (
        <div className="admin-empty">
          No promotions yet. Click <strong>New Promotion</strong> to create one.
        </div>
      ) : (
        <div className="tier-grid">
          {list.map(p => {
            const synced = !!p.stripe_coupon_id
            const isPercent = p.discount_type === 'percent'
            const heroGradient = !p.is_active
              ? 'linear-gradient(135deg, #374151 0%, #6b7280 100%)'
              : isPercent
              ? 'linear-gradient(135deg, #064e3b 0%, #059669 100%)'
              : 'linear-gradient(135deg, #0B1F3B 0%, #1d4ed8 100%)'

            const redemptionPct = p.max_redemptions
              ? Math.min(100, Math.round((p.redemptions_count / p.max_redemptions) * 100))
              : 0

            return (
            <div key={p.id} className={`promo-card2 ${!p.is_active ? 'promo-card2--inactive' : ''}`}>

              {/* ── Hero discount band ── */}
              <div className="promo-card2-hero" style={{ background: heroGradient }}>
                <div className="promo-card2-hero-value">
                  {isPercent ? `${p.discount_value}%` : `$${p.discount_value}`}
                  <span className="promo-card2-hero-off">OFF</span>
                </div>
                <div className="promo-card2-hero-sub">
                  {p.duration === 'forever' ? 'forever'
                    : p.duration === 'once' ? 'first month only'
                    : `for ${p.duration_in_months ?? '?'} months`}
                </div>
                {/* Status pill overlaid top-right */}
                <span className={`promo-card2-status ${p.is_active ? 'promo-card2-status--on' : 'promo-card2-status--off'}`}>
                  {p.is_active ? '● Active' : '○ Inactive'}
                </span>
              </div>

              {/* ── Body ── */}
              <div className="promo-card2-body">

                {/* Name + description */}
                <div className="promo-card2-name">{p.name}</div>
                {p.description && <div className="promo-card2-desc">{p.description}</div>}

                {/* Promo code block */}
                <div className="promo-card2-code-block">
                  <span className="promo-card2-code-label">PROMO CODE</span>
                  <div className="promo-card2-code-row">
                    <span className="promo-card2-code">{p.code}</span>
                    <CopyableCode code={p.code} iconOnly />
                  </div>
                </div>

                {/* Pricing page badge */}
                {p.show_on_pricing_page && (
                  <div className="promo-card2-page-badge">
                    <Globe size={11} strokeWidth={2.5} />
                    Shown on pricing page
                  </div>
                )}

                {/* Stats row */}
                <div className="promo-card2-stats">
                  <div className="promo-card2-stat">
                    <span className="promo-card2-stat-label">Redeemed</span>
                    <span className="promo-card2-stat-value">
                      {p.redemptions_count}
                      <span className="promo-card2-stat-max"> / {p.max_redemptions ?? '∞'}</span>
                    </span>
                    {p.max_redemptions && (
                      <div className="promo-card2-progress-track">
                        <div
                          className="promo-card2-progress-fill"
                          style={{
                            width: `${redemptionPct}%`,
                            background: redemptionPct >= 100 ? '#ef4444' : redemptionPct >= 80 ? '#f59e0b' : '#16a34a'
                          }}
                        />
                      </div>
                    )}
                  </div>
                  <div className="promo-card2-stat">
                    <span className="promo-card2-stat-label">Valid From</span>
                    <span className="promo-card2-stat-value">{fmtDate(p.valid_from)}</span>
                  </div>
                  <div className="promo-card2-stat">
                    <span className="promo-card2-stat-label">Expires</span>
                    <span className="promo-card2-stat-value">{fmtDate(p.valid_until)}</span>
                  </div>
                </div>

                {/* Remaining warning */}
                {p.remaining === 0 && (
                  <div className="promo-card2-alert promo-card2-alert--red">Redemption limit reached — no spots left</div>
                )}
                {p.remaining !== null && p.remaining > 0 && p.remaining <= 5 && (
                  <div className="promo-card2-alert promo-card2-alert--amber">Only {p.remaining} redemption{p.remaining > 1 ? 's' : ''} remaining</div>
                )}
              </div>

              {/* ── Footer ── */}
              <div className="promo-card2-footer">
                {/* Stripe sync indicator */}
                <div className={`promo-card2-stripe ${synced ? 'promo-card2-stripe--synced' : 'promo-card2-stripe--unsynced'}`}>
                  <span className="promo-card2-stripe-dot" />
                  {synced ? 'Stripe synced' : 'Not synced'}
                </div>

                {/* Toggles */}
                <div className="promo-card2-toggles">
                  <button
                    className="promo-card2-toggle-btn"
                    onClick={() => handleTogglePricingPage(p)}
                    disabled={!p.is_active}
                    title={p.show_on_pricing_page ? 'Hide from pricing page' : 'Show on pricing page'}
                  >
                    <Globe size={13} strokeWidth={2} />
                    {p.show_on_pricing_page
                      ? <ToggleRight size={18} strokeWidth={2} style={{ color: '#6d28d9' }} />
                      : <ToggleLeft size={18} strokeWidth={2} style={{ color: '#9ca3af' }} />
                    }
                  </button>
                  <button
                    className="promo-card2-toggle-btn"
                    onClick={() => handleToggleActive(p)}
                    title={p.is_active ? 'Deactivate' : 'Activate'}
                  >
                    {p.is_active
                      ? <ToggleRight size={18} strokeWidth={2} style={{ color: '#16a34a' }} />
                      : <ToggleLeft size={18} strokeWidth={2} style={{ color: '#9ca3af' }} />
                    }
                    <span style={{ fontSize: '0.72rem', color: '#6b7280' }}>
                      {p.is_active ? 'On' : 'Off'}
                    </span>
                  </button>
                </div>
              </div>

              {/* ── Actions ── */}
              <div className="promo-card2-actions">
                <button className="promo-card2-action-btn promo-card2-action-btn--edit" onClick={() => openEdit(p)}>
                  <Pencil size={13} strokeWidth={2.5} /> Edit
                </button>
                <button className="promo-card2-action-btn promo-card2-action-btn--delete" onClick={() => handleDelete(p)}>
                  <Trash2 size={13} strokeWidth={2.5} /> Delete
                </button>
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
              {/* Name */}
              <label className="admin-form-label" style={{ gridColumn: 'span 2' }}>
                Name *
                <input
                  className="admin-input"
                  value={form.name}
                  onChange={e => setField('name', e.target.value)}
                  placeholder="e.g. Founding Member Discount"
                />
              </label>

              {/* Description */}
              <label className="admin-form-label" style={{ gridColumn: 'span 2' }}>
                Description
                <input
                  className="admin-input"
                  value={form.description ?? ''}
                  onChange={e => setField('description', e.target.value)}
                  placeholder="Optional short description"
                />
              </label>

              {/* Promo code */}
              <label className="admin-form-label" style={{ gridColumn: 'span 2' }}>
                Promo Code{editing && <span style={{ color: '#9ca3af', fontWeight: 400 }}> (locked)</span>}
                <input
                  className="admin-input"
                  value={form.code ?? ''}
                  onChange={e => setField('code', e.target.value.toUpperCase())}
                  placeholder="e.g. LAUNCH30 (auto-generated if blank)"
                  disabled={!!editing}
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

              {/* Show on pricing page */}
              <label className="admin-form-label" style={{ gridColumn: 'span 2', flexDirection: 'row', alignItems: 'center', gap: '0.75rem' }}>
                <input
                  type="checkbox"
                  checked={form.show_on_pricing_page ?? false}
                  onChange={e => setField('show_on_pricing_page', e.target.checked)}
                  style={{ width: 'auto', accentColor: '#0B1F3B' }}
                />
                Show this promo as a banner on the public pricing page
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
                  ⚠️ Promo code, discount type, value, and duration are locked after creation (Stripe coupon is immutable).
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

