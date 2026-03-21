import { BASE, authHeaders, request } from './client'
import type { ReportDocument } from '../types'

export const reports = {
  uploadDocument: async (
    employerId: number,
    positionId: number,
    file: File,
    docType: 'supporting' | 'job_match' = 'supporting',
  ): Promise<ReportDocument> => {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(
      `${BASE}/api/employers/${employerId}/positions/${positionId}/reports/documents?doc_type=${docType}`,
      { method: 'POST', headers: authHeaders(), body: form },
    )
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
    return res.json()
  },

  removeDocument: (employerId: number, positionId: number, docId: number) =>
    request<void>(
      `/api/employers/${employerId}/positions/${positionId}/reports/documents/${docId}`,
      { method: 'DELETE' },
    ),

  generate: async (employerId: number, positionId: number): Promise<Blob> => {
    const res = await fetch(
      `${BASE}/api/employers/${employerId}/positions/${positionId}/reports/generate`,
      { method: 'POST', headers: authHeaders() },
    )
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error((body as { detail?: string })?.detail ?? `Server error: ${res.status}`)
    }
    return res.blob()
  },
}

