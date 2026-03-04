import { BASE, authHeaders, request } from './client'
import type { ReportDocument } from '../types'

export const reports = {
  uploadDocument: async (
    employerId: number,
    positionId: number,
    file: File,
  ): Promise<ReportDocument> => {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(
      `${BASE}/api/employers/${employerId}/positions/${positionId}/reports/documents`,
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

  generateUrl: (employerId: number, positionId: number) =>
    `${BASE}/api/employers/${employerId}/positions/${positionId}/reports/generate`,
}
