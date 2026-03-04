import { request } from './client'
import type { AuditLog } from '../types'

export const auditLogs = {
  list: (params?: { resource_type?: string; action?: string; limit?: number; offset?: number }) => {
    const q = new URLSearchParams()
    if (params?.resource_type) q.set('resource_type', params.resource_type)
    if (params?.action)        q.set('action', params.action)
    if (params?.limit != null) q.set('limit', String(params.limit))
    if (params?.offset != null) q.set('offset', String(params.offset))
    const qs = q.toString()
    return request<AuditLog[]>(`/api/audit-logs${qs ? `?${qs}` : ''}`)
  },
}
