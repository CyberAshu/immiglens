export type NotificationEvent = 'capture_complete' | 'capture_failed' | 'posting_changed' | 'round_started'
export type NotificationChannel = 'email' | 'webhook'
export type NotifStatus = 'pending' | 'sent' | 'failed'

export interface NotificationPreference {
  id: number
  user_id: number
  event_type: NotificationEvent
  channel: NotificationChannel
  destination: string
  is_active: boolean
  created_at: string
}

export interface NotificationLog {
  id: number
  preference_id: number
  trigger_id: number | null
  trigger_type: string | null
  status: NotifStatus
  error_message: string | null
  sent_at: string | null
  created_at: string
}
