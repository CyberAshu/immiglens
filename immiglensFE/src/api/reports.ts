import { BASE, authHeaders, request } from './client'
import type { ReportDocument } from '../types'
import type { ReportConfigPayload } from '../types/report_config'

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

  generateUrl: (employerId: number, positionId: number, opts?: { removeBlankPages?: boolean }) => {
    const base = `${BASE}/api/employers/${employerId}/positions/${positionId}/reports/generate`
    if (opts?.removeBlankPages) return `${base}?remove_blank_pages=true`
    return base
  },

  previewHtml: async (
    employerId: number,
    positionId: number,
    config: ReportConfigPayload,
  ): Promise<string> => {
    const res = await fetch(
      `${BASE}/api/employers/${employerId}/positions/${positionId}/reports/preview-html`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ config }),
      },
    )
    if (!res.ok) throw new Error(`Preview failed: ${res.status}`)
    return res.text()
  },
}
