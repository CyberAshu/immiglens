export interface CaptureResult {
  id: number
  job_posting_id: number
  url: string
  status: string
  screenshot_url: string | null
  error: string | null
  duration_ms: number | null
}

export interface CaptureRound {
  id: number
  job_position_id: number
  scheduled_at: string
  captured_at: string | null
  status: 'pending' | 'running' | 'completed' | 'failed'
  results: CaptureResult[]
}
