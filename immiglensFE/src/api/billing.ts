import { request } from './client'

export const billing = {
  publishableKey: () =>
    request<{ key: string }>('/api/billing/publishable-key'),

  createCheckout: (tierId: number, trialDays = 0) =>
    request<{ url: string }>('/api/billing/checkout', {
      method: 'POST',
      body: JSON.stringify({ tier_id: tierId, trial_days: trialDays }),
    }),

  createPortal: () =>
    request<{ url: string }>('/api/billing/portal', { method: 'POST' }),
}
