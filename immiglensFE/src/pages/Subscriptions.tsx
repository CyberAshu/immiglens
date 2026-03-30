import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { subscriptions as subApi, billing } from '../api'
import { promotions } from '../api/promotions'
import type { ActivePromotion } from '../api/promotions'
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
  const [activePromos, setActivePromos]       = useState<ActivePromotion[]>([])
  const [searchParams, setSearchParams] = useSearchParams()
  const checkoutStatus = searchParams.get('checkout')

  function loadData() {
    setLoading(true)
    Promise.all([subApi.usage(), subApi.tiers(), promotions.active().catch(() => [])])
      .then(([usage, tiers, promos]) => {
        setData(usage)
        setActivePromos(promos)
        setOtherTiers(tiers.filter(t => t.id !== usage.tier.id && t.is_active && t.stripe_price_id))
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadData() }, [])

  // On checkout=success: reload data so new tier shows immediately,
  // then auto-clear the banner after 5 seconds
  useEffect(() => {
    if (checkoutStatus === 'success') {
      loadData()
      const t = setTimeout(() => setSearchParams({}), 5000)
      return () => clearTimeout(t)
    }
  }, [checkoutStatus])

  async function handleUpgrade(tierId: number) {
    setCheckoutLoading(tierId)
    // Only offer 14-day trial if user has never subscribed before
    const trialDays = !data?.has_billing_account ? 14 : 0
    try {
      const { url } = await billing.createCheckout(tierId, trialDays)
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
        <p className="sub-admin-note">ℹ️ Your plan is managed by the platform administrator.
          Contact support to request an upgrade.
        </p>
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

        {/* Applied discount badge */}
        {data.applied_promotion_name && data.applied_discount_value != null && data.applied_discount_type && (
          <div className="sub-discount-badge">
            <span className="sub-discount-icon">🏷️</span>
            <div className="sub-discount-text">
              <strong>
                {data.applied_discount_type === 'percent'
                  ? `${data.applied_discount_value}% off`
                  : `$${data.applied_discount_value} off`}
                {data.applied_discount_duration === 'forever' ? ' forever'
                  : data.applied_discount_duration === 'once' ? ' — first billing cycle'
                  : ''}
              </strong>
              &nbsp;· {data.applied_promotion_name} discount applied to your subscription
            </div>
          </div>
        )}
      </div>

      {/* ── Upgrade options ───────────────────── */}
      {otherTiers.length > 0 && (
        <div className="card section-top">
          <div className="card-title">Available Plans</div>

          {/* Active promotion banner */}
          {activePromos[0] && activePromos[0].remaining !== 0 && (
            <div className="banner banner-success" style={{ marginBottom: '1rem' }}>
              🌟 <strong>{activePromos[0].name}</strong>
              {activePromos[0].remaining != null && ` — ${activePromos[0].remaining} of ${activePromos[0].max_redemptions} spots left.`}
              {' '}Get {activePromos[0].discount_type === 'percent'
                ? `${activePromos[0].discount_value}% off`
                : `$${activePromos[0].discount_value} off`} when you subscribe now.
            </div>
          )}

          <div className="sub-upgrade-grid">
            {otherTiers.map(t => {
              const bestPromo = activePromos[0] ?? null
              const hasDiscount = !!(bestPromo && bestPromo.remaining !== 0)
              const discountedPrice = hasDiscount && bestPromo && t.price_per_month != null
                ? bestPromo.discount_type === 'percent'
                  ? Math.floor(t.price_per_month * (1 - bestPromo.discount_value / 100))
                  : Math.max(0, t.price_per_month - bestPromo.discount_value)
                : null
              return (
              <div key={t.id} className="sub-upgrade-card">
                <div className="sub-upgrade-name">{t.display_name}</div>
                {t.price_per_month != null && (
                  <div className="sub-upgrade-price">
                    {hasDiscount && discountedPrice != null ? (
                      <>
                        <span style={{ textDecoration: 'line-through', color: '#9ca3af', fontSize: '1rem', fontWeight: 500 }}>${t.price_per_month}</span>
                        {' '}${discountedPrice}
                      </>
                    ) : (
                      <>${t.price_per_month}</>
                    )}
                    <span>/mo</span>
                    {hasDiscount && bestPromo && (
                      <div style={{ fontSize: '0.72rem', color: '#15803d', fontWeight: 700, marginTop: '0.1rem' }}>
                        {bestPromo.discount_type === 'percent' ? `${bestPromo.discount_value}% off` : `$${bestPromo.discount_value} off`}
                        {bestPromo.duration === 'forever' ? ' forever' : bestPromo.duration === 'once' ? ' first month' : ` for ${bestPromo.duration_in_months} months`}
                      </div>
                    )}
                  </div>
                )}
                <ul className="sub-upgrade-limits">
                  <li>{t.max_active_positions === -1 ? '∞' : t.max_active_positions} active positions</li>
                  <li>{t.max_urls_per_position === -1 ? '∞' : t.max_urls_per_position} URLs / position</li>
                  <li>{t.max_captures_per_month === -1 ? '∞' : t.max_captures_per_month} captures / month</li>
                </ul>
                <button
                  className="sub-upgrade-btn"
                  onClick={() => handleUpgrade(t.id)}
                  disabled={checkoutLoading === t.id}
                >
                  {checkoutLoading === t.id
                    ? 'Redirecting…'
                    : !data.has_billing_account
                      ? 'Start 14-Day Free Trial'
                      : 'Upgrade'
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
