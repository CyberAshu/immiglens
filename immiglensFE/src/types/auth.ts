export interface User {
  id: number
  email: string
  full_name: string
  is_admin: boolean
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
