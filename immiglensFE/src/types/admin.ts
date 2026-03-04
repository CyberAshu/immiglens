export interface AdminGlobalStats {
  total_users: number
  total_employers: number
  total_positions: number
  total_job_postings: number
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
}

export interface TierUpdate {
  display_name?: string
  max_employers?: number
  max_positions_per_employer?: number
  max_postings_per_position?: number
  max_captures_per_month?: number
  is_active?: boolean
}

export interface AssignTierRequest {
  tier_id: number | null
}
