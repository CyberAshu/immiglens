export interface PostingSnapshot {
  id: number
  job_url_id: number
  capture_result_id: number | null
  page_hash: string | null
  has_changed: boolean | null
  change_summary: string | null
  captured_at: string
}

export interface ChangeHistoryItem {
  snapshot_id: number
  captured_at: string
  has_changed: boolean | null
  change_summary: string | null
  screenshot_url: string | null
}
