import { request } from './client'
import type { JobPosition, JobPosting } from '../types'

export const positions = {
  list: (employerId: number) =>
    request<JobPosition[]>(`/api/employers/${employerId}/positions`),

  get: (employerId: number, positionId: number) =>
    request<JobPosition>(`/api/employers/${employerId}/positions/${positionId}`),

  create: (
    employerId: number,
    data: Omit<JobPosition, 'id' | 'employer_id' | 'created_at' | 'job_postings' | 'is_active' | 'report_documents'>,
  ) =>
    request<JobPosition>(`/api/employers/${employerId}/positions`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  remove: (employerId: number, positionId: number) =>
    request<void>(`/api/employers/${employerId}/positions/${positionId}`, { method: 'DELETE' }),

  update: (employerId: number, positionId: number, data: { start_date?: string; end_date?: string | null; job_title?: string; noc_code?: string; num_positions?: number; capture_frequency_days?: number; wage?: string | null; work_location?: string; wage_stream?: string | null }) =>
    request<JobPosition>(`/api/employers/${employerId}/positions/${positionId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

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

  updatePosting: (
    employerId: number,
    positionId: number,
    postingId: number,
    data: { platform?: string; url?: string },
  ) =>
    request<JobPosting>(
      `/api/employers/${employerId}/positions/${positionId}/postings/${postingId}`,
      { method: 'PATCH', body: JSON.stringify(data) },
    ),

  togglePosition: (employerId: number, positionId: number) =>
    request<JobPosition>(
      `/api/employers/${employerId}/positions/${positionId}/toggle`,
      { method: 'PATCH' },
    ),

  togglePosting: (employerId: number, positionId: number, postingId: number) =>
    request<JobPosting>(
      `/api/employers/${employerId}/positions/${positionId}/postings/${postingId}/toggle`,
      { method: 'PATCH' },
    ),
}
