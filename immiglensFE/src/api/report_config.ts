import { BASE, authHeaders, request } from './client'
import type { ReportConfigData, ReportConfigPayload } from '../types/report_config'

export const reportConfigApi = {
  get: () => request<ReportConfigData>('/api/admin/report-config'),

  update: (config: ReportConfigPayload) =>
    request<ReportConfigData>('/api/admin/report-config', {
      method: 'PATCH',
      body: JSON.stringify({ config }),
    }),

  reset: () =>
    request<ReportConfigData>('/api/admin/report-config/reset', { method: 'POST' }),

  preview: async (config: ReportConfigPayload): Promise<string> => {
    const res = await fetch(`${BASE}/api/admin/report-config/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ config }),
    })
    if (!res.ok) throw new Error(`Preview failed: ${res.status}`)
    return res.text()
  },
}
