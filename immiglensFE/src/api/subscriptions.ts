import { request } from './client'
import type { UsageSummary, SubscriptionTier } from '../types'

export const subscriptions = {
  tiers: ()       => request<SubscriptionTier[]>('/api/subscriptions/tiers'),
  usage: ()       => request<UsageSummary>('/api/subscriptions/usage'),
}
