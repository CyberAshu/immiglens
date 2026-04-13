import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Tag, X, CheckCircle2, AlertCircle, Check, CreditCard, Loader2 } from 'lucide-react'
import { subscriptions as subApi, billing } from '../api'
import { promotions } from '../api/promotions'
import type { ActivePromotion, PromoCodeValidation } from '../api/promotions'
import type { UsageSummary, SubscriptionTier } from '../types'
import { useConfirm } from '../components/ConfirmModal'

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(val: number) { return val === -1 ? '∞' : String(val) }

// ── Usage bar ─────────────────────────────────────────────────────────────────
function UsageBar({ label, used, max, color }: { label: string; used: number; max: number; color: string }) {
  const pct  = max === -1 ? 100 : Math.min(100, Math.round((used / max) * 100))
  const warn = max !== -1 && pct >= 80
  return (
    <div className="sp-usage-row">
      <div className="sp-usage-meta">
        <span className="sp-usage-label">{label}</span>
        <span className="sp-usage-count">
          <strong>{used}</strong>{max === -1 ? ' / ∞' : ` / ${max}`}
          {max !== -1 && <span className="sp-usage-pct"> ({pct}%)</span>}
        </span>
      </div>
      <div className="sp-usage-track">
        <div className="sp-usage-fill" style={{ width: `${pct}%`, background: warn ? '#ef4444' : color }} />
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Subscriptions() {
  const [data, setData]           = useState<UsageSummary | null>(null)
  const [allTiers, setAllTiers]   = useState<SubscriptionTier[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [checkoutLoading, setCheckoutLoading] = useState<number | null>(null)
  const [portalLoading, setPortalLoading]     = useState(false)
  const [isAnnual, setIsAnnual]   = useState(false)
  const [bannerPromo, setBannerPromo] = useState<ActivePromotion | null>(null)

  // Promo code
  const [promoOpen, setPromoOpen]               = useState(false)
  const [promoCode, setPromoCode]               = useState('')
  const [validatedPromo, setValidatedPromo]     = useState<PromoCodeValidation | null>(null)
  const [promoError, setPromoError]             = useState('')
  const [promoChecking, setPromoChecking]       = useState(false)
  const codeInputRef = useRef<HTMLInputElement>(null)

  const { confirmModal, askConfirm } = useConfirm()

  const [searchParams, setSearchParams] = useSearchParams()
  const checkoutStatus = searchParams.get('checkout')
  const sessionId      = searchParams.get('session_id')

  function loadData() {
    setLoading(true)
    Promise.all([subApi.usage(), subApi.tiers(), promotions.pricingBanner().catch(() => null)])
      .then(([usage, tiers, banner]) => {
        setData(usage)
        setBannerPromo(banner)
        const sorted = [...tiers]
          .filter(t => t.is_active)
          .sort((a, b) => {
            if (a.price_per_month == null) return 1
            if (b.price_per_month == null) return -1
            return a.price_per_month - b.price_per_month
          })
        setAllTiers(sorted)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadData() }, [])

  useEffect(() => {
    if (checkoutStatus !== 'success') return
    const doSync = async () => {
      if (sessionId) { try { await billing.syncCheckout(sessionId) } catch { /* non-fatal */ } }
      loadData()
    }
    doSync()
    const t = setTimeout(() => setSearchParams(p => { p.delete('checkout'); p.delete('session_id'); return p }), 5000)
    return () => clearTimeout(t)
  }, [checkoutStatus])

  async function handleApplyCode() {
    const code = promoCode.trim().toUpperCase()
    if (!code) return
    setPromoChecking(true); setPromoError(''); setValidatedPromo(null)
    try { setValidatedPromo(await promotions.validateCode(code)) }
    catch { setPromoError('This promo code is invalid or has expired.') }
    finally { setPromoChecking(false) }
  }

  async function handleUpgrade(tierId: number, isDowngrade: boolean) {
    if (isDowngrade) {
      const newTier = allTiers.find(t => t.id === tierId)
      const confirmed = await askConfirm({
        title: 'Downgrade plan?',
        message: `Switching to ${newTier?.display_name ?? 'this plan'} will immediately deactivate all of your active job positions. Your employers and URLs will not be affected. You can re-activate positions manually after downgrading.`,
        confirmLabel: 'Yes, downgrade',
        cancelLabel: 'Keep current plan',
        variant: 'danger',
      })
      if (!confirmed) return
    }
    setCheckoutLoading(tierId)
    try {
      if (data?.has_billing_account) {
        // Existing subscriber: update the Stripe subscription directly.
        // Creating a new checkout session would produce a duplicate subscription.
        await billing.changePlan(tierId, isAnnual)
        loadData()
      } else {
        const { url } = await billing.createCheckout(tierId, false, isAnnual, validatedPromo?.code ?? undefined)
        window.location.href = url
      }
    } catch (e) { alert((e as Error).message) }
    finally { setCheckoutLoading(null) }
  }

  async function handlePortal() {
    setPortalLoading(true)
    try { const { url } = await billing.createPortal(); window.location.href = url }
    catch (e) { alert((e as Error).message) }
    finally { setPortalLoading(false) }
  }

  // ── Loading / error ──────────────────────────────────────────────────────
  if (loading) return (
    <div className="sp-loading">
      <Loader2 size={28} className="sp-loading-spin" />
      <span>Loading your plan…</span>
    </div>
  )
  if (error)  return <div className="error-msg">{error}</div>
  if (!data)  return null

  const { tier: currentTier } = data
  const activeDiscount = validatedPromo ?? bannerPromo
  const paidTiers      = allTiers.filter(t => t.stripe_price_id)

  // Middle-ish paid tier is "most popular", only when there are 2+ paid tiers
  const popularTier = paidTiers.length > 1
    ? paidTiers[Math.floor((paidTiers.length - 1) / 2)]
    : null

  const colCount = Math.min(Math.max(allTiers.length, 1), 4)

  return (
    <div className="page">
      {confirmModal}

      {/* ── Status banners ──────────────────────── */}
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

      {/* ── Page header ─────────────────────────── */}
      <div className="sp-page-header">
        <div className="sp-page-header-left">
          <h1 className="sp-page-title">Subscription & Plans</h1>
          <p className="sp-page-sub">
            You're on the <strong>{currentTier.display_name}</strong> plan
            {data.has_billing_account ? ' · Billed via Stripe' : ' · Free access'}
          </p>
        </div>
        {data.has_billing_account && (
          <button className="sp-portal-btn" onClick={handlePortal} disabled={portalLoading}>
            <CreditCard size={15} strokeWidth={2} />
            {portalLoading ? 'Opening…' : 'Manage Billing'}
          </button>
        )}
      </div>

      {/* ── Billing toggle ──────────────────────── */}
      {paidTiers.length > 0 && (
        <div className="sp-toggle-bar">
          <span className={`sp-toggle-label${!isAnnual ? ' sp-toggle-label--on' : ''}`}>Monthly</span>
          <button
            type="button"
            className={`sp-toggle-switch${isAnnual ? ' sp-toggle-switch--annual' : ''}`}
            onClick={() => setIsAnnual(a => !a)}
            aria-label="Toggle billing period"
          >
            <div className="sp-toggle-knob" />
          </button>
          <span className={`sp-toggle-label${isAnnual ? ' sp-toggle-label--on' : ''}`}>
            Annual
            <span className="sp-save-chip">Save 20%</span>
          </span>
        </div>
      )}

      {/* ── Active promotion banner ─────────────── */}
      {bannerPromo && bannerPromo.remaining !== 0 && (
        <div className="sp-promo-banner">
          🌟 <strong>{bannerPromo.name}</strong>
          {bannerPromo.remaining != null && (
            <> · <strong>{bannerPromo.remaining}</strong> of {bannerPromo.max_redemptions} spots left</>
          )}
          {' · '}
          {bannerPromo.discount_type === 'percent' ? `${bannerPromo.discount_value}% off` : `$${bannerPromo.discount_value} off`}
          {bannerPromo.duration === 'forever' ? ' forever' : bannerPromo.duration === 'once' ? ' first month' : ''}
          {' — use code '}
          <span className="sp-promo-banner-code">{bannerPromo.code}</span>
        </div>
      )}

      {/* ── Plans grid ──────────────────────────── */}
      {allTiers.length > 0 && (
        <div
          className="sp-plans-grid"
          style={{ '--sp-col-count': colCount } as React.CSSProperties}
        >
          {allTiers.map(tier => {
            const isCurrent = tier.id === currentTier.id
            const isPopular = !isCurrent && popularTier?.id === tier.id
            const rawPrice  = tier.price_per_month
            const dispPrice = rawPrice != null && isAnnual ? Math.floor(rawPrice * 0.8) : rawPrice
            const showDisc  = !!(activeDiscount && dispPrice != null && !isCurrent && tier.stripe_price_id)
            const finalPrice = showDisc && activeDiscount && dispPrice != null
              ? activeDiscount.discount_type === 'percent'
                ? +(dispPrice * (1 - activeDiscount.discount_value / 100)).toFixed(2)
                : +Math.max(0, dispPrice - activeDiscount.discount_value).toFixed(2)
              : null
            const isLoading = checkoutLoading === tier.id
            const isDowngrade = !isCurrent && rawPrice != null &&
              (currentTier.price_per_month != null ? rawPrice < currentTier.price_per_month : false)

            const features = [
              `${fmt(tier.max_active_positions)} active position${tier.max_active_positions === 1 ? '' : 's'}`,
              `${fmt(tier.max_urls_per_position)} URL${tier.max_urls_per_position === 1 ? '' : 's'} per position`,
              `${fmt(tier.max_captures_per_month)} capture${tier.max_captures_per_month === 1 ? '' : 's'} / month`,
              `Capture every ${tier.min_capture_frequency_days} day${tier.min_capture_frequency_days === 1 ? '' : 's'}`,
            ]

            return (
              <div
                key={tier.id}
                className={[
                  'sp-plan-card',
                  isCurrent  ? 'sp-plan-card--current'  : '',
                  isPopular  ? 'sp-plan-card--popular'  : '',
                  showDisc   ? 'sp-plan-card--discounted' : '',
                ].filter(Boolean).join(' ')}
              >
                {/* Discount ribbon */}
                {showDisc && activeDiscount && (
                  <div className="sp-discount-ribbon">
                    {activeDiscount.discount_type === 'percent'
                      ? `${activeDiscount.discount_value}% OFF`
                      : `$${activeDiscount.discount_value} OFF`}
                  </div>
                )}

                {/* Status chip */}
                <div className="sp-plan-chip-row">
                  {isCurrent
                    ? <span className="sp-chip sp-chip--current">✓ Current Plan</span>
                    : isPopular
                      ? <span className="sp-chip sp-chip--popular">Most Popular</span>
                      : <span className="sp-chip-spacer" />
                  }
                </div>

                {/* Plan name */}
                <div className="sp-plan-name">{tier.display_name}</div>

                {/* Pricing block */}
                <div className="sp-plan-price-block">
                  {dispPrice != null ? (
                    <>
                      <div className="sp-plan-price-row">
                        {showDisc && finalPrice != null ? (
                          <>
                            <span className="sp-plan-price-orig">${dispPrice}</span>
                            <span className={`sp-plan-price-main${showDisc ? ' sp-plan-price-main--promo' : ''}`}>
                              ${finalPrice}
                            </span>
                          </>
                        ) : (
                          <span className="sp-plan-price-main">${dispPrice}</span>
                        )}
                        <span className="sp-plan-price-period">/mo</span>
                      </div>

                      {isAnnual && rawPrice != null && rawPrice > 0 && dispPrice != null ? (
                        <div className="sp-plan-billing-note">
                          ${dispPrice * 12} billed annually
                          <span className="sp-plan-save-pill">Save ${rawPrice * 12 - dispPrice * 12}</span>
                        </div>
                      ) : rawPrice != null && rawPrice > 0 ? (
                        <div className="sp-plan-billing-note">billed monthly</div>
                      ) : null}

                      {showDisc && activeDiscount && (
                        <div className="sp-plan-promo-note">
                          {activeDiscount.duration === 'forever'
                            ? '🏷 Discount applied forever'
                            : activeDiscount.duration === 'once'
                              ? '🏷 Applied to first month only'
                              : `🏷 Applied for ${activeDiscount.duration_in_months} months`}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="sp-plan-price-custom">Contact Sales</div>
                  )}
                </div>

                {/* Features list */}
                <ul className="sp-plan-features">
                  {features.map(f => (
                    <li key={f} className="sp-plan-feature-item">
                      <Check size={14} strokeWidth={2.5} className="sp-plan-feature-check" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                {isCurrent ? (
                  <button
                    className="sp-plan-cta sp-plan-cta--current"
                    onClick={data.has_billing_account ? handlePortal : undefined}
                    disabled={!data.has_billing_account || portalLoading}
                  >
                    {data.has_billing_account
                      ? (portalLoading ? 'Opening…' : 'Manage Billing →')
                      : '✓ Active Plan'}
                  </button>
                ) : tier.stripe_price_id ? (
                  <button
                    className={[
                      'sp-plan-cta',
                      isPopular  ? 'sp-plan-cta--primary' : 'sp-plan-cta--secondary',
                      showDisc   ? 'sp-plan-cta--promo'   : '',
                      isDowngrade ? 'sp-plan-cta--downgrade' : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => handleUpgrade(tier.id, isDowngrade)}
                    disabled={isLoading}
                  >
                    {isLoading
                      ? 'Redirecting…'
                      : !data.has_billing_account
                        ? 'Subscribe Now'
                        : isDowngrade
                          ? 'Downgrade'
                          : 'Upgrade Now'}
                  </button>
                ) : null}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Promo code ──────────────────────────── */}
      <div className="sp-promo-wrap">
        {!validatedPromo ? (
          <div className={`sp-promo-box${promoOpen ? ' sp-promo-box--open' : ''}`}>
            <button
              className="sp-promo-toggle"
              onClick={() => { setPromoOpen(o => !o); if (!promoOpen) setTimeout(() => codeInputRef.current?.focus(), 60) }}
            >
              <Tag size={14} strokeWidth={2.5} style={{ color: '#6b7280', flexShrink: 0 }} />
              <span>Have a promo code?</span>
              {bannerPromo && !promoOpen && (
                <span className="sp-promo-hint-pill">{bannerPromo.code}</span>
              )}
              <span className={`sp-promo-chevron${promoOpen ? ' sp-promo-chevron--open' : ''}`}>▾</span>
            </button>

            {promoOpen && (
              <div className="sp-promo-body">
                {bannerPromo && (
                  <button
                    className="promo-apply-hint"
                    style={{ marginBottom: '0.6rem' }}
                    onClick={() => { setPromoCode(bannerPromo.code); setPromoError('') }}
                  >
                    Use <strong>{bannerPromo.code}</strong> for{' '}
                    {bannerPromo.discount_type === 'percent'
                      ? `${bannerPromo.discount_value}% off`
                      : `$${bannerPromo.discount_value} off`}
                  </button>
                )}
                <div className="promo-apply-input-row">
                  <div className={`promo-apply-input-wrap${promoError ? ' promo-apply-input-wrap--error' : ''}`}>
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
                    {promoChecking ? <span className="promo-apply-spinner" /> : 'Apply'}
                  </button>
                </div>
                {promoError && (
                  <div className="promo-apply-error">
                    <AlertCircle size={13} strokeWidth={2.5} />{promoError}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="promo-apply-box">
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
                onClick={() => { setValidatedPromo(null); setPromoCode(''); setPromoError(''); setPromoOpen(false) }}
                title="Remove promo code"
              >
                <X size={14} strokeWidth={2.5} />Remove
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Usage section ───────────────────────── */}
      <div className="sp-usage-card">
        <div className="sp-usage-header">
          <span className="sp-usage-title">Current Usage</span>
          <span className="sp-usage-period">This billing period</span>
        </div>
        <div className="sp-usage-list">
          <UsageBar label="Active Positions"    used={data.active_positions_used} max={currentTier.max_active_positions}   color="#C8A24A" />
          <UsageBar label="Captures This Month" used={data.captures_this_month}   max={currentTier.max_captures_per_month} color="#22c55e" />
        </div>
      </div>

    </div>
  )
}
