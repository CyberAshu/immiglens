import { request } from './client'

export const billing = {
  publishableKey: () =>
    request<{ key: string }>('/api/billing/publishable-key'),

  createCheckout: (tierId: number, trialDays = 0, onboarding = false, isAnnual = false) =>
    request<{ url: string }>('/api/billing/checkout', {
      method: 'POST',
      body: JSON.stringify({ tier_id: tierId, trial_days: trialDays, onboarding, is_annual: isAnnual }),
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
}
