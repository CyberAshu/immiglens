import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Tag, X, CheckCircle2, AlertCircle } from 'lucide-react'
import { subscriptions as subApi, billing } from '../api'
import { promotions } from '../api/promotions'
import type { ActivePromotion, PromoCodeValidation } from '../api/promotions'
import type { UsageSummary, SubscriptionTier } from '../types'

function tierColor(name: string) {
  if (name === 'enterprise') return '#f59e0b'
  if (name === 'pro')        return '#0B1F3B'
  return '#64748b'
}

function UsageBar({ used, max, color }: { used: number; max: number; color: string }) {
  const pct = max === -1 ? 0 : Math.min(100, Math.round((used / max) * 100))
  const warn = max !== -1 && pct >= 80
  return (
    <div className="usage-bar-wrap">
      <div className="usage-bar-track">
        <div
          className="usage-bar-fill"
          style={{ width: `${max === -1 ? 100 : pct}%`, background: warn ? '#ef4444' : color }}
        />
      </div>
      <span className="usage-bar-label">
        {used} / {max === -1 ? '∞' : max}
        {max !== -1 && <span className="usage-bar-pct"> ({pct}%)</span>}
      </span>
    </div>
  )
}

export default function Subscriptions() {
  const [data, setData]           = useState<UsageSummary | null>(null)
  const [otherTiers, setOtherTiers] = useState<SubscriptionTier[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [checkoutLoading, setCheckoutLoading] = useState<number | null>(null)
  const [portalLoading, setPortalLoading]     = useState(false)

  // Pricing-page banner promotion (show_on_pricing_page = true)
  const [bannerPromo, setBannerPromo] = useState<ActivePromotion | null>(null)

  // Promo code input
  const [promoCode, setPromoCode]         = useState('')
  const [validatedPromo, setValidatedPromo] = useState<PromoCodeValidation | null>(null)
  const [promoError, setPromoError]       = useState('')
  const [promoChecking, setPromoChecking] = useState(false)
  const codeInputRef = useRef<HTMLInputElement>(null)

  const [searchParams, setSearchParams] = useSearchParams()
  const checkoutStatus = searchParams.get('checkout')
  const sessionId      = searchParams.get('session_id')

  function loadData() {
    setLoading(true)
    Promise.all([subApi.usage(), subApi.tiers(), promotions.pricingBanner().catch(() => null)])
      .then(([usage, tiers, banner]) => {
        setData(usage)
        setBannerPromo(banner)
        setOtherTiers(tiers.filter(t => t.id !== usage.tier.id && t.is_active && t.stripe_price_id))
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadData() }, [])

  // On checkout=success: sync subscription state proactively (race-condition fix),
  // then reload usage data so the new tier shows immediately.
  // Auto-clear the banner after 5 seconds.
  useEffect(() => {
    if (checkoutStatus !== 'success') return

    const doSync = async () => {
      if (sessionId) {
        // Wait for the sync so DB is up to date before we load usage
        try { await billing.syncCheckout(sessionId) } catch { /* non-fatal */ }
      }
      loadData()
    }
    doSync()

    const t = setTimeout(() => setSearchParams(p => {
      p.delete('checkout'); p.delete('session_id'); return p
    }), 5000)
    return () => clearTimeout(t)
  }, [checkoutStatus])

  async function handleApplyCode() {
    const code = promoCode.trim().toUpperCase()
    if (!code) return
    setPromoChecking(true)
    setPromoError('')
    setValidatedPromo(null)
    try {
      const result = await promotions.validateCode(code)
      setValidatedPromo(result)
    } catch {
      setPromoError('This promo code is invalid or has expired.')
    } finally {
      setPromoChecking(false)
    }
  }

  async function handleUpgrade(tierId: number) {
    setCheckoutLoading(tierId)
    try {
      const { url } = await billing.createCheckout(
        tierId,
        false,
        false,
        validatedPromo?.code ?? undefined,
      )
      window.location.href = url
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setCheckoutLoading(null)
    }
  }

  async function handlePortal() {
    setPortalLoading(true)
    try {
      const { url } = await billing.createPortal()
      window.location.href = url
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setPortalLoading(false)
    }
  }

  if (loading) return <div className="loading">Loading…</div>
  if (error)   return <div className="error-msg">{error}</div>
  if (!data)   return null

  const { tier } = data

  const metrics = [
    { label: 'Active Positions',     used: data.active_positions_used, max: tier.max_active_positions,   color: '#C8A24A' },
    { label: 'Captures This Month',  used: data.captures_this_month,   max: tier.max_captures_per_month, color: '#22c55e' },
  ]

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Subscription</h1>
          <p className="sub-text">Your current plan and resource usage</p>
        </div>
      </div>

      {checkoutStatus === 'success' && (
        <div className="banner banner-success">
          🎉 Payment successful! Your plan has been updated.
          <button className="banner-close" onClick={() => setSearchParams({})}>✕</button>
        </div>
      )}
      {checkoutStatus === 'cancelled' && (
        <div className="banner banner-info">
          Checkout was cancelled. Your plan has not changed.
          <button className="banner-close" onClick={() => setSearchParams({})}>✕</button>
        </div>
      )}

      {/* ── Plan card ─────────────────────────── */}
      <div className="card sub-plan-card" style={{ borderColor: tierColor(tier.name) + '44' }}>
        <div className="sub-plan-header">
          <div>
            <div className="sub-plan-name" style={{ color: tierColor(tier.name) }}>{tier.display_name}</div>
            <div className="sub-plan-slug">{tier.name} plan</div>
          </div>
          <div className="sub-plan-badge" style={{ background: tierColor(tier.name) + '22', color: tierColor(tier.name), borderColor: tierColor(tier.name) + '55' }}>
            {tier.name.toUpperCase()}
          </div>
        </div>
        <div className="sub-limits-grid">
          {[
            { label: 'Max Active Positions',  val: tier.max_active_positions },
            { label: 'URLs / Position',       val: tier.max_urls_per_position },
            { label: 'Captures / Month',      val: tier.max_captures_per_month },
          ].map(({ label, val }) => (
            <div key={label} className="sub-limit-item">
              <div className="sub-limit-val">{val === -1 ? '∞' : val}</div>
              <div className="sub-limit-label">{label}</div>
            </div>
          ))}
        </div>

        {/* Portal link for users with an active Stripe subscription */}
        {data.has_billing_account && (
          <div className="sub-portal-row">
            <button
              className="sub-portal-btn"
              onClick={handlePortal}
              disabled={portalLoading}
            >
              {portalLoading ? 'Opening…' : 'Manage Billing →'}
            </button>
          </div>
        )}
      </div>

      {/* ── Upgrade options ───────────────────── */}
      {otherTiers.length > 0 && (
        <div className="card section-top">
          <div className="card-title">Upgrade Your Plan</div>

          {/* ── Promo code section ── */}
          <div className="promo-apply-box">
            {!validatedPromo ? (
              <>
                <div className="promo-apply-header">
                  <Tag size={15} strokeWidth={2.5} style={{ color: '#6b7280' }} />
                  <span className="promo-apply-label">Have a promo code?</span>
                  {bannerPromo && (
                    <button
                      className="promo-apply-hint"
                      onClick={() => {
                        setPromoCode(bannerPromo.code)
                        setPromoError('')
                        setTimeout(() => codeInputRef.current?.focus(), 0)
                      }}
                    >
                      Use <strong>{bannerPromo.code}</strong> for {bannerPromo.discount_type === 'percent'
                        ? `${bannerPromo.discount_value}% off`
                        : `$${bannerPromo.discount_value} off`}
                    </button>
                  )}
                </div>
                <div className="promo-apply-input-row">
                  <div className={`promo-apply-input-wrap ${promoError ? 'promo-apply-input-wrap--error' : ''}`}>
                    <input
                      ref={codeInputRef}
                      className="promo-apply-input"
                      placeholder="e.g. LAUNCH30"
                      value={promoCode}
                      onChange={e => { setPromoCode(e.target.value.toUpperCase()); setPromoError('') }}
                      onKeyDown={e => e.key === 'Enter' && handleApplyCode()}
                      maxLength={30}
                      spellCheck={false}
                      autoComplete="off"
                    />
                    {promoCode && (
                      <button className="promo-apply-clear" onClick={() => { setPromoCode(''); setPromoError('') }}>
                        <X size={13} strokeWidth={2.5} />
                      </button>
                    )}
                  </div>
                  <button
                    className="promo-apply-btn"
                    onClick={handleApplyCode}
                    disabled={promoChecking || !promoCode.trim()}
                  >
                    {promoChecking ? (
                      <span className="promo-apply-spinner" />
                    ) : 'Apply'}
                  </button>
                </div>
                {promoError && (
                  <div className="promo-apply-error">
                    <AlertCircle size={13} strokeWidth={2.5} />
                    {promoError}
                  </div>
                )}
              </>
            ) : (
              /* ── Applied state ── */
              <div className="promo-applied">
                <div className="promo-applied-left">
                  <CheckCircle2 size={18} strokeWidth={2.5} style={{ color: '#16a34a', flexShrink: 0 }} />
                  <div>
                    <div className="promo-applied-title">
                      {validatedPromo.discount_type === 'percent'
                        ? `${validatedPromo.discount_value}% off`
                        : `$${validatedPromo.discount_value} off`}
                      {validatedPromo.duration === 'forever' ? ' forever'
                        : validatedPromo.duration === 'once' ? ' — first month'
                        : ` for ${validatedPromo.duration_in_months} months`}
                    </div>
                    <div className="promo-applied-sub">
                      Code <strong>{validatedPromo.code}</strong> · {validatedPromo.name}
                      {validatedPromo.remaining != null && ` · ${validatedPromo.remaining} uses left`}
                    </div>
                  </div>
                </div>
                <button
                  className="promo-applied-remove"
                  onClick={() => { setValidatedPromo(null); setPromoCode(''); setPromoError('') }}
                  title="Remove promo code"
                >
                  <X size={14} strokeWidth={2.5} />
                  Remove
                </button>
              </div>
            )}
          </div>

          {/* ── Plan cards ── */}
          <div className="sub-upgrade-grid">
            {otherTiers.map(t => {
              const activeDiscount = validatedPromo ?? bannerPromo
              const hasDiscount = !!(activeDiscount && (validatedPromo || bannerPromo))
              const showDiscount = hasDiscount && activeDiscount && t.price_per_month != null
              const discountedPrice = showDiscount && activeDiscount && t.price_per_month != null
                ? activeDiscount.discount_type === 'percent'
                  ? +(t.price_per_month * (1 - activeDiscount.discount_value / 100)).toFixed(2)
                  : +Math.max(0, t.price_per_month - activeDiscount.discount_value).toFixed(2)
                : null

              return (
                <div key={t.id} className={`sub-upgrade-card ${showDiscount ? 'sub-upgrade-card--discounted' : ''}`}>
                  {showDiscount && activeDiscount && (
                    <div className="sub-upgrade-discount-ribbon">
                      {activeDiscount.discount_type === 'percent'
                        ? `${activeDiscount.discount_value}% OFF`
                        : `$${activeDiscount.discount_value} OFF`}
                    </div>
                  )}
                  <div className="sub-upgrade-name">{t.display_name}</div>
                  {t.price_per_month != null && (
                    <div className="sub-upgrade-price">
                      {showDiscount && discountedPrice != null ? (
                        <>
                          <span className="sub-upgrade-price-orig">${t.price_per_month}</span>
                          <span className="sub-upgrade-price-new">${discountedPrice}</span>
                        </>
                      ) : (
                        <span className="sub-upgrade-price-new">${t.price_per_month}</span>
                      )}
                      <span className="sub-upgrade-price-period">/mo</span>
                    </div>
                  )}
                  {showDiscount && activeDiscount && (
                    <div className="sub-upgrade-saving">
                      {activeDiscount.duration === 'forever' ? 'Discount applied forever'
                        : activeDiscount.duration === 'once' ? 'Applied to first month only'
                        : `Applied for ${activeDiscount.duration_in_months} months`}
                    </div>
                  )}
                  <ul className="sub-upgrade-limits">
                    <li>{t.max_active_positions === -1 ? '∞' : t.max_active_positions} active positions</li>
                    <li>{t.max_urls_per_position === -1 ? '∞' : t.max_urls_per_position} URLs / position</li>
                    <li>{t.max_captures_per_month === -1 ? '∞' : t.max_captures_per_month} captures / month</li>
                  </ul>
                  <button
                    className={`sub-upgrade-btn ${showDiscount ? 'sub-upgrade-btn--promo' : ''}`}
                    onClick={() => handleUpgrade(t.id)}
                    disabled={checkoutLoading === t.id}
                  >
                    {checkoutLoading === t.id
                      ? 'Redirecting…'
                      : !data.has_billing_account
                        ? 'Start 14-Day Free Trial'
                        : 'Upgrade Now'
                    }
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Usage ─────────────────────────────── */}
      <div className="card section-top">
        <div className="card-title">Current Usage</div>
        <div className="usage-list">
          {metrics.map(m => (
            <div key={m.label} className="usage-item">
              <div className="usage-item-label">{m.label}</div>
              <UsageBar used={m.used} max={m.max} color={m.color} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
