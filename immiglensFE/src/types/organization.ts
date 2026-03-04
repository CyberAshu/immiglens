export type OrgRole = 'owner' | 'admin' | 'viewer'

export interface Organization {
  id: number
  name: string
  created_by: number
  created_at: string
}

export interface OrgMembership {
  id: number
  org_id: number
  user_id: number
  user_name: string
  user_email: string
  role: OrgRole
  joined_at: string
}

export interface OrgInvitation {
  id: number
  org_id: number
  email: string
  role: OrgRole
  token: string
  expires_at: string
  accepted_at: string | null
  created_at: string
}
