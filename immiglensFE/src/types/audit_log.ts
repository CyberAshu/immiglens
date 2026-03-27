export interface AuditLog {
  id: number
  user_id: number | null
  user_email: string | null
  user_name: string | null
  action: string
  resource_type: string
  resource_id: number | null
  employer_id: number | null
  position_id: number | null
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  ip_address: string | null
  created_at: string
}
