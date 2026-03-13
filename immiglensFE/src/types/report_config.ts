export interface CoverFields {
  show_address: boolean
  show_contact_person: boolean
  show_contact_email: boolean
  show_contact_phone: boolean
  show_noc_code: boolean
  show_wage_stream: boolean
  show_wage: boolean
  show_work_location: boolean
  show_positions_sought: boolean
  show_start_date: boolean
  show_capture_frequency: boolean
  show_total_rounds: boolean
  show_generated_at: boolean
}

export interface SummaryFields {
  show_url: boolean
  show_start_date: boolean
  show_capture_count: boolean
  show_ongoing: boolean
}

export interface EvidenceFields {
  show_capture_datetime: boolean
}

export type ReportBlock =
  | { id: string; type: 'cover'; enabled: boolean; label: string; fields: CoverFields }
  | { id: string; type: 'summary_table'; enabled: boolean; title: string; fields: SummaryFields }
  | { id: string; type: 'evidence'; enabled: boolean; title: string; fields: EvidenceFields }
  | { id: string; type: 'appendix'; enabled: boolean; title: string }
  | { id: string; type: 'job_match_activity'; enabled: boolean; title: string }
  | { id: string; type: 'custom_text'; enabled: boolean; heading: string; body: string }
  | { id: string; type: 'divider'; enabled: boolean }

export interface ReportConfigPayload {
  blocks: ReportBlock[]
}

export interface ReportConfigData {
  id: number
  config: ReportConfigPayload
  updated_at: string
}
