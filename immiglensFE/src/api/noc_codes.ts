import { authHeaders, BASE, request } from './client'

export interface NocCodeOut {
  id: number
  code: string
  title: string
  teer: number
  major_group: number
  version_year: number
  is_active: boolean
  created_at: string
}

export interface NocUploadResult {
  inserted: number
  updated: number
  skipped: number
  errors: string[]
}

export const nocCodes = {
  search: (q: string, limit = 20): Promise<NocCodeOut[]> =>
    request(`/api/noc-codes?q=${encodeURIComponent(q)}&limit=${limit}`),

  // Admin
  adminList: (params?: { q?: string; active_only?: boolean; skip?: number; limit?: number }): Promise<NocCodeOut[]> => {
    const qs = new URLSearchParams()
    if (params?.q) qs.set('q', params.q)
    if (params?.active_only) qs.set('active_only', 'true')
    if (params?.skip != null) qs.set('skip', String(params.skip))
    if (params?.limit != null) qs.set('limit', String(params.limit))
    return request(`/api/admin/noc-codes?${qs}`)
  },

  adminCount: (): Promise<{ total: number; active: number }> =>
    request('/api/admin/noc-codes/count'),

  adminCreate: (data: { code: string; title: string; version_year?: number }): Promise<NocCodeOut> =>
    request('/api/admin/noc-codes', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  adminUpdate: (id: number, data: { title?: string; is_active?: boolean; version_year?: number }): Promise<NocCodeOut> =>
    request(`/api/admin/noc-codes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  adminDelete: (id: number): Promise<void> =>
    request(`/api/admin/noc-codes/${id}`, { method: 'DELETE' }),

  adminUpload: async (file: File, versionYear = 2021): Promise<NocUploadResult> => {
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch(`${BASE}/api/admin/noc-codes/upload?version_year=${versionYear}`, {
      method: 'POST',
      headers: authHeaders(),
      body: fd,
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body?.detail ?? `Upload failed: ${res.status}`)
    }
    return res.json()
  },
}
