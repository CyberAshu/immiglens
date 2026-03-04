import { request } from './client'
import type { JobPosition, JobPosting } from '../types'

export const positions = {
  list: (employerId: number) =>
    request<JobPosition[]>(`/api/employers/${employerId}/positions`),

  get: (employerId: number, positionId: number) =>
    request<JobPosition>(`/api/employers/${employerId}/positions/${positionId}`),

  create: (
    employerId: number,
    data: Omit<JobPosition, 'id' | 'employer_id' | 'created_at' | 'job_postings'>,
  ) =>
    request<JobPosition>(`/api/employers/${employerId}/positions`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  remove: (employerId: number, positionId: number) =>
    request<void>(`/api/employers/${employerId}/positions/${positionId}`, { method: 'DELETE' }),

  addPosting: (
    employerId: number,
    positionId: number,
    data: { platform: string; url: string },
  ) =>
    request<JobPosting>(
      `/api/employers/${employerId}/positions/${positionId}/postings`,
      { method: 'POST', body: JSON.stringify(data) },
    ),

  removePosting: (employerId: number, positionId: number, postingId: number) =>
    request<void>(
      `/api/employers/${employerId}/positions/${positionId}/postings/${postingId}`,
      { method: 'DELETE' },
    ),
}
