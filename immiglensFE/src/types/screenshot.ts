export type URLStatus = 'pending' | 'processing' | 'done' | 'failed'
export type JobStatus = 'queued' | 'running' | 'completed'

export interface ScreenshotResult {
  url: string
  status: URLStatus
  filename: string | null
  screenshot_url: string | null
  error: string | null
  duration_ms: number | null
}

export interface BatchJob {
  job_id: string
  status: JobStatus
  total: number
  completed: number
  failed: number
  results: ScreenshotResult[]
  created_at: number
  updated_at: number
}

export interface BatchSubmitResponse {
  job_id: string
  total: number
}
