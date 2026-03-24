export interface Employer {
  id: number
  business_name: string
  address: string
  contact_person: string
  contact_email: string | null
  contact_phone: string | null
  business_number: string | null
  is_active: boolean
  created_at: string
}

export interface JobPosting {
  id: number
  platform: string
  url: string
  is_active: boolean
  created_at: string
}

export interface JobPosition {
  id: number
  employer_id: number
  job_title: string
  noc_code: string
  num_positions: number
  start_date: string
  end_date: string | null
  capture_frequency_days: number
  is_active: boolean
  wage: string | null
  work_location: string | null
  wage_stream: string | null
  created_at: string
  job_postings: JobPosting[]
  report_documents?: import('./report').ReportDocument[]
}
