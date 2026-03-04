import { request } from './client'
import type { Employer } from '../types'

export const employers = {
  list: () => request<Employer[]>('/api/employers'),
  create: (data: Omit<Employer, 'id' | 'created_at'>) =>
    request<Employer>('/api/employers', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Partial<Employer>) =>
    request<Employer>(`/api/employers/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  remove: (id: number) =>
    request<void>(`/api/employers/${id}`, { method: 'DELETE' }),
}
