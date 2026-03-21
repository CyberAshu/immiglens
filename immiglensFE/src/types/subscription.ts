export interface SubscriptionTier {
  id: number
  name: string
  display_name: string
  max_employers: number
  max_positions_per_employer: number
  max_postings_per_position: number
  max_captures_per_month: number
  min_capture_frequency_days: number
  price_per_month: number | null
  is_active: boolean
  created_at: string
}

export interface UsageSummary {
  tier: SubscriptionTier
  employers_used: number
  positions_used: number
  captures_this_month: number
}
