import { request } from './client'

export interface ActivePromotion {
  id: number
  name: string
  description: string | null
  discount_type: 'percent' | 'fixed'
  discount_value: number
  duration: string
  duration_in_months: number | null
  max_redemptions: number | null
  redemptions_count: number
  remaining: number | null   // null = unlimited
  valid_until: string | null
}

export interface PromotionOut extends ActivePromotion {
  stripe_coupon_id: string | null
  is_active: boolean
  created_at: string
  duration_in_months: number | null
  valid_from: string | null
}

export interface PromotionCreate {
  name: string
  description?: string | null
  discount_type: 'percent' | 'fixed'
  discount_value: number
  duration: 'forever' | 'once' | 'repeating'
  duration_in_months?: number | null
  max_redemptions?: number | null
  valid_from?: string | null
  valid_until?: string | null
}

export interface PromotionUpdate {
  name?: string
  description?: string | null
  max_redemptions?: number | null
  valid_from?: string | null
  valid_until?: string | null
  is_active?: boolean
}

export const promotions = {
  active: () =>
    request<ActivePromotion[]>('/api/promotions/active'),

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
