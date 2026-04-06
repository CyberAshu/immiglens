import { request } from './client'
import type { NotificationLog, NotificationSettings } from '../types'

export const notifications = {
  getSettings:   () =>
    request<NotificationSettings>('/api/notifications/settings'),
  updateSettings: (notification_email: string | null) =>
    request<NotificationSettings>('/api/notifications/settings', {
      method: 'PATCH',
      body: JSON.stringify({ notification_email }),
    }),
  listRecent:    (limit = 8) =>
    request<NotificationLog[]>(`/api/notifications/logs/recent?limit=${limit}`),
  listLogs:      () => request<NotificationLog[]>('/api/notifications/logs'),
  unreadCount:   () => request<{ count: number }>('/api/notifications/logs/unread-count'),
  markRead:      (id: number) =>
    request<void>(`/api/notifications/logs/${id}/read`, { method: 'PATCH' }),
  markAllRead:   () => request<void>('/api/notifications/logs/mark-all-read', { method: 'POST' }),
}
