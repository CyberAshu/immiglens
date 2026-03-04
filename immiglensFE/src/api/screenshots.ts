import { request } from './client'
import type { BatchJob, BatchSubmitResponse } from '../types'

export const screenshots = {
  submitBatch: (urls: string[]) =>
    request<BatchSubmitResponse>('/api/screenshots/batch', {
      method: 'POST',
      body: JSON.stringify({ urls }),
    }),
  getJob: (jobId: string) =>
    request<BatchJob>(`/api/screenshots/jobs/${jobId}`),
}
