export interface User {
  id: number
  email: string
  full_name: string
  is_admin: boolean
  tier_expires_at?: string | null
  created_at: string
}

export interface TokenResponse {
  access_token: string
  token_type: string
  device_token?: string | null
}

export interface TrustedDevice {
  id: number
  created_at: string
  expires_at: string
}
