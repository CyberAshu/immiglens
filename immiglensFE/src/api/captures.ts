import { BASE, authHeaders, request } from './client'
import type { CaptureResult, CaptureRound } from '../types'

export const captures = {
  list: (employerId: number, positionId: number) =>
    request<CaptureRound[]>(`/api/employers/${employerId}/positions/${positionId}/captures`),

  runNow: (employerId: number, positionId: number, roundId: number) =>
    request<{ detail: string; round_id: number }>(
      `/api/employers/${employerId}/positions/${positionId}/captures/${roundId}/run`,
      { method: 'POST' },
    ),

  recaptureResult: (
    employerId: number,
    positionId: number,
    roundId: number,
    resultId: number,
  ) =>
    request<{ detail: string; round_id: number; result_id: number }>(
      `/api/employers/${employerId}/positions/${positionId}/captures/${roundId}/results/${resultId}/recapture`,
      { method: 'POST' },
    ),

  manualUpload: async (
    employerId: number,
    positionId: number,
    roundId: number,
    jobUrlId: number,
    file: File,
  ): Promise<CaptureResult> => {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(
      `${BASE}/api/employers/${employerId}/positions/${positionId}/captures/${roundId}/manual-upload?job_url_id=${jobUrlId}`,
      { method: 'POST', headers: authHeaders(), body: form },
    )
    if (!res.ok) {
      let detail = `Upload failed (${res.status})`
      try {
        const body = await res.json()
        if (body?.detail) detail = body.detail
      } catch { /* ignore */ }
      throw new Error(detail)
    }
    return res.json()
  },
}
