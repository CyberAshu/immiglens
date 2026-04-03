import { requestWithCount } from './client'
import type { AuditLog } from '../types'

export interface AuditLogPage {
  data: AuditLog[]
  total: number
}

export const auditLogs = {
  list: (params?: {
    entity_type?: string
    action?: string
    actor_id?: number
    actor_type?: string
    status?: string
    source?: string
    employer_id?: number
    position_id?: number
    date_from?: string
    date_to?: string
    limit?: number
    offset?: number
  }): Promise<AuditLogPage> => {
    const q = new URLSearchParams()
    if (params?.entity_type)         q.set('entity_type', params.entity_type)
    if (params?.action)              q.set('action', params.action)
    if (params?.actor_id != null)    q.set('actor_id', String(params.actor_id))
    if (params?.actor_type)          q.set('actor_type', params.actor_type)
    if (params?.status)              q.set('status', params.status)
    if (params?.source)              q.set('source', params.source)
    if (params?.employer_id != null) q.set('employer_id', String(params.employer_id))
    if (params?.position_id != null) q.set('position_id', String(params.position_id))
    if (params?.date_from)           q.set('date_from', params.date_from)
    if (params?.date_to)             q.set('date_to', params.date_to)
    if (params?.limit != null)       q.set('limit', String(params.limit))
    if (params?.offset != null)      q.set('offset', String(params.offset))
    const qs = q.toString()
    return requestWithCount<AuditLog[]>(`/api/audit-logs${qs ? `?${qs}` : ''}`)
  },
}
