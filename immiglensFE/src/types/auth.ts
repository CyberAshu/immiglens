export interface User {
  id: number
  email: string
  full_name: string
  is_admin: boolean
  tier_id: number | null
  tier_expires_at?: string | null
  created_at: string
}

export interface TokenResponse {
  access_token: string
  token_type: string
}

export interface TrustedDevice {
  id: number
  device_name: string | null
  browser: string | null
  os: string | null
  ip_address: string | null
  created_at: string
  expires_at: string
  last_used_at: string | null
}
