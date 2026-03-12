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
