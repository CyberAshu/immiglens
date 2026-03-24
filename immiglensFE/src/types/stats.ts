export interface CaptureBreakdownItem {
  name: string
  value: number
  color: string
}

export interface EmployerBreakdownItem {
  name: string
  positions: number
  screenshots: number
  failed: number
}

export interface RoundTimelineItem {
  date: string
  completed: number
  pending: number
  failed: number
}

export interface DashboardStats {
  total_employers: number
  active_employers: number
  total_positions: number
  active_positions: number
  total_job_postings: number
  active_postings: number
  total_capture_rounds: number
  completed_rounds: number
  pending_rounds: number
  total_screenshots: number
  failed_screenshots: number
  capture_breakdown: CaptureBreakdownItem[]
  employer_breakdown: EmployerBreakdownItem[]
  rounds_timeline: RoundTimelineItem[]
}
