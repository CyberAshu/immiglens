import { request } from './client'
import type { CaptureRound } from '../types'

export const captures = {
  list: (employerId: number, positionId: number) =>
    request<CaptureRound[]>(`/api/employers/${employerId}/positions/${positionId}/captures`),

  runNow: (employerId: number, positionId: number, roundId: number) =>
    request<CaptureRound>(
      `/api/employers/${employerId}/positions/${positionId}/captures/${roundId}/run`,
      { method: 'POST' },
    ),

  recaptureResult: (
    employerId: number,
    positionId: number,
    roundId: number,
    resultId: number,
  ) =>
    request<CaptureRound>(
      `/api/employers/${employerId}/positions/${positionId}/captures/${roundId}/results/${resultId}/recapture`,
      { method: 'POST' },
    ),
}
