export interface SubscriptionTier {
  id: number
  name: string
  display_name: string
  max_active_positions: number
  max_urls_per_position: number
  max_captures_per_month: number
  min_capture_frequency_days: number
  price_per_month: number | null
  stripe_product_id: string | null
  stripe_price_id: string | null
  is_active: boolean
  created_at: string
}

export interface UsageSummary {
  tier: SubscriptionTier
  active_positions_used: number
  captures_this_month: number
}
