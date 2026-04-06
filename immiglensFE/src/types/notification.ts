export type NotificationEvent =
  | 'capture_complete'
  | 'capture_failed'
  | 'posting_changed'
  | 'round_started'
  | 'position_limit_warning'

export type NotifStatus = 'pending' | 'sent' | 'failed'

export interface NotificationSettings {
  notification_email: string | null
}

export interface NotificationLog {
  id: number
  event_type: NotificationEvent | null
  trigger_id: number | null
  trigger_type: string | null
  context_json: string | null
  status: NotifStatus
  error_message: string | null
  is_read: boolean
  sent_at: string | null
  created_at: string
}
