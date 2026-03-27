import { request } from './client'
import type { AuditLog } from '../types'

export const auditLogs = {
  list: (params?: {
    resource_type?: string
    action?: string
    employer_id?: number
    position_id?: number
    date_from?: string
    date_to?: string
    limit?: number
    offset?: number
  }) => {
    const q = new URLSearchParams()
    if (params?.resource_type)    q.set('resource_type', params.resource_type)
    if (params?.action)           q.set('action', params.action)
    if (params?.employer_id != null) q.set('employer_id', String(params.employer_id))
    if (params?.position_id != null) q.set('position_id', String(params.position_id))
    if (params?.date_from)        q.set('date_from', params.date_from)
    if (params?.date_to)          q.set('date_to', params.date_to)
    if (params?.limit != null)    q.set('limit', String(params.limit))
    if (params?.offset != null)   q.set('offset', String(params.offset))
    const qs = q.toString()
    return request<AuditLog[]>(`/api/audit-logs${qs ? `?${qs}` : ''}`)
  },
}
