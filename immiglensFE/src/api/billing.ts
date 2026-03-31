import { request } from './client'

export const billing = {
  publishableKey: () =>
    request<{ key: string }>('/api/billing/publishable-key'),

  createCheckout: (tierId: number, onboarding = false, isAnnual = false, promoCode?: string) =>
    request<{ url: string }>('/api/billing/checkout', {
      method: 'POST',
      body: JSON.stringify({
        tier_id: tierId,
        onboarding,
        is_annual: isAnnual,
        promo_code: promoCode ?? null,
      }),
    }),

  createPortal: () =>
    request<{ url: string }>('/api/billing/portal', { method: 'POST' }),

  /**
   * Proactively sync subscription state from Stripe immediately after checkout.
   * Call this before refreshing usage data whenever the URL contains
   * `checkout=success&session_id=cs_...`.  Idempotent and safe to call any time.
   */
  syncCheckout: (sessionId: string) =>
    request<{ tier_id: number | null; tier_expires_at: string | null; synced: boolean }>(
      '/api/billing/sync-checkout',
      { method: 'POST', body: JSON.stringify({ session_id: sessionId }) },
    ),

  /**
   * Upgrade or downgrade an existing subscriber to a different plan.
   * Updates the Stripe subscription in place — no new checkout session is created,
   * so no duplicate subscriptions.  Use this when `has_billing_account` is true.
   */
  changePlan: (tierId: number, isAnnual = false) =>
    request<{ tier_id: number | null; tier_expires_at: string | null; synced: boolean }>(
      '/api/billing/change-plan',
      { method: 'POST', body: JSON.stringify({ tier_id: tierId, is_annual: isAnnual }) },
    ),
}
