import { request } from './client'
import type { DashboardStats } from '../types'

export const stats = {
  get: () => request<DashboardStats>('/api/stats'),
}
