export interface AdminGlobalStats {
  total_users: number
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
}

export interface AdminUserRecord {
  id: number
  email: string
  full_name: string
  is_admin: boolean
  employers: number
  positions: number
  screenshots: number
  created_at: string
  tier_id?: number | null
  tier_name?: string | null
  tier_expires_at?: string | null
}

export interface AdminOrgMember {
  user_id: number
  user_name: string
  user_email: string
  role: string
  joined_at: string
}

export interface AdminOrgOut {
  id: number
  name: string
  description?: string | null
  owner_id: number
  owner_name: string
  owner_email: string
  member_count: number
  created_at: string
  members: AdminOrgMember[]
}

export interface TierCreate {
  name: string
  display_name: string
  max_employers: number
  max_positions_per_employer: number
  max_postings_per_position: number
  max_captures_per_month: number
  min_capture_frequency_days: number
  price_per_month: number | null
}

export interface TierUpdate {
  display_name?: string
  max_employers?: number
  max_positions_per_employer?: number
  max_postings_per_position?: number
  max_captures_per_month?: number
  min_capture_frequency_days?: number
  price_per_month?: number | null
  is_active?: boolean
}

export interface AssignTierRequest {
  tier_id: number | null
  tier_expires_at?: string | null
}

export interface AdminCaptureRound {
  round_id: number
  status: string
  scheduled_at: string
  captured_at: string | null
  position_title: string
  employer_name: string
  user_email: string
  user_id: number
  employer_id: number
  position_id: number
  failed_results: number
  total_results: number
  error_sample: string | null
}

export interface AdminCaptureListResponse {
  rounds: AdminCaptureRound[]
  total: number
}
