export interface AuditLog {
  id: number
  // New fields (v2)
  actor_id: number | null
  actor_type: string | null
  actor_email: string | null
  actor_name: string | null
  entity_type: string
  entity_id: string | null
  entity_label: string | null
  status: string | null
  description: string | null
  metadata: Record<string, unknown> | null
  user_agent: string | null
  source: string | null
  // Retained fields
  action: string
  employer_id: number | null
  position_id: number | null
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  ip_address: string | null
  created_at: string
  // Deprecated — kept for backward compat during migration
  /** @deprecated use actor_id */
  user_id?: number | null
  /** @deprecated use actor_email */
  user_email?: string | null
  /** @deprecated use actor_name */
  user_name?: string | null
  /** @deprecated use entity_type */
  resource_type?: string
  /** @deprecated use entity_id */
  resource_id?: number | null
}
