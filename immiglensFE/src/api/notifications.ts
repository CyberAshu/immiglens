import { request } from './client'
import type { NotificationLog, NotificationPreference } from '../types'
import type { NotificationChannel, NotificationEvent } from '../types'

export const notifications = {
  listPreferences:   ()                                              => request<NotificationPreference[]>('/api/notifications/preferences'),
  createPreference:  (data: { event_type: NotificationEvent; channel: NotificationChannel; destination: string }) =>
    request<NotificationPreference>('/api/notifications/preferences', { method: 'POST', body: JSON.stringify(data) }),
  togglePreference:  (id: number, is_active: boolean)               =>
    request<NotificationPreference>(`/api/notifications/preferences/${id}`, { method: 'PATCH', body: JSON.stringify({ is_active }) }),
  deletePreference:  (id: number)                                    =>
    request<void>(`/api/notifications/preferences/${id}`, { method: 'DELETE' }),
  listLogs:          ()                                              => request<NotificationLog[]>('/api/notifications/logs'),
}
