import { request } from './client'

export interface ActivePromotion {
  id: number
  name: string
  description: string | null
  code: string
  discount_type: 'percent' | 'fixed'
  discount_value: number
  duration: string
  duration_in_months: number | null
  max_redemptions: number | null
  redemptions_count: number
  remaining: number | null   // null = unlimited
  valid_until: string | null
}

export interface PromoCodeValidation {
  id: number
  name: string
  description: string | null
  code: string
  discount_type: 'percent' | 'fixed'
  discount_value: number
  duration: string
  duration_in_months: number | null
  remaining: number | null
  valid_until: string | null
}

export interface PromotionOut extends ActivePromotion {
  stripe_coupon_id: string | null
  is_active: boolean
  show_on_pricing_page: boolean
  created_at: string
  valid_from: string | null
}

export interface PromotionCreate {
  name: string
  description?: string | null
  code?: string | null        // auto-generated if omitted
  discount_type: 'percent' | 'fixed'
  discount_value: number
  duration: 'forever' | 'once' | 'repeating'
  duration_in_months?: number | null
  max_redemptions?: number | null
  valid_from?: string | null
  valid_until?: string | null
  show_on_pricing_page?: boolean
}

export interface PromotionUpdate {
  name?: string
  description?: string | null
  max_redemptions?: number | null
  valid_from?: string | null
  valid_until?: string | null
  is_active?: boolean
  show_on_pricing_page?: boolean
}

export const promotions = {
  /** Returns the single promo flagged show_on_pricing_page, or null. */
  pricingBanner: () =>
    request<ActivePromotion | null>('/api/promotions/pricing-banner'),

  /** Validate a promo code before checkout. Throws on invalid/expired. */
  validateCode: (code: string) =>
    request<PromoCodeValidation>(`/api/promotions/validate?code=${encodeURIComponent(code)}`),

  all: () =>
    request<PromotionOut[]>('/api/promotions'),

  create: (body: PromotionCreate) =>
    request<PromotionOut>('/api/promotions', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  update: (id: number, body: PromotionUpdate) =>
    request<PromotionOut>(`/api/promotions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  deactivate: (id: number) =>
    request<void>(`/api/promotions/${id}`, { method: 'DELETE' }),
}
