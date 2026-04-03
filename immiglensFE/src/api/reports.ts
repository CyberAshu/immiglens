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
    if (!res.ok) {
      let detail = `Upload failed (${res.status})`
      try {
        const body = await res.json()
        if (body?.detail) detail = body.detail
      } catch { /* ignore parse errors */ }
      throw new Error(detail)
    }
    return res.json()
  },

  removeDocument: (employerId: number, positionId: number, docId: number) =>
    request<void>(
      `/api/employers/${employerId}/positions/${positionId}/reports/documents/${docId}`,
      { method: 'DELETE' },
    ),

  generate: async (employerId: number, positionId: number, acknowledgeEarly = false): Promise<Blob> => {
    const res = await fetch(
      `${BASE}/api/employers/${employerId}/positions/${positionId}/reports/generate`,
      {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ acknowledge_early: acknowledgeEarly }),
      },
    )
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      // 422 with EARLY_REPORT code is handled by the caller — re-throw with structured detail
      throw Object.assign(new Error((body as { detail?: { message?: string; code?: string } | string })?.detail instanceof Object
        ? (body.detail as { message: string }).message
        : (body.detail as string) ?? `Server error: ${res.status}`
      ), { detail: (body as { detail?: unknown }).detail })
    }
    return res.blob()
  },
}

