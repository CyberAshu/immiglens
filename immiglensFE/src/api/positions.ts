import { request } from './client'
import type { JobPosition, JobUrl } from '../types'

export const positions = {
  list: (employerId: number) =>
    request<JobPosition[]>(`/api/employers/${employerId}/positions`),

  get: (employerId: number, positionId: number) =>
    request<JobPosition>(`/api/employers/${employerId}/positions/${positionId}`),

  create: (
    employerId: number,
    data: Omit<JobPosition, 'id' | 'employer_id' | 'created_at' | 'job_urls' | 'is_active' | 'report_documents'>,
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

  addUrl: (
    employerId: number,
    positionId: number,
    data: { platform: string; url: string },
  ) =>
    request<JobUrl>(
      `/api/employers/${employerId}/positions/${positionId}/urls`,
      { method: 'POST', body: JSON.stringify(data) },
    ),

  removeUrl: (employerId: number, positionId: number, urlId: number) =>
    request<void>(
      `/api/employers/${employerId}/positions/${positionId}/urls/${urlId}`,
      { method: 'DELETE' },
    ),

  updateUrl: (
    employerId: number,
    positionId: number,
    urlId: number,
    data: { platform?: string; url?: string },
  ) =>
    request<JobUrl>(
      `/api/employers/${employerId}/positions/${positionId}/urls/${urlId}`,
      { method: 'PATCH', body: JSON.stringify(data) },
    ),

  togglePosition: (employerId: number, positionId: number) =>
    request<JobPosition>(
      `/api/employers/${employerId}/positions/${positionId}/toggle`,
      { method: 'PATCH' },
    ),

  toggleUrl: (employerId: number, positionId: number, urlId: number) =>
    request<JobUrl>(
      `/api/employers/${employerId}/positions/${positionId}/urls/${urlId}/toggle`,
      { method: 'PATCH' },
    ),
}
