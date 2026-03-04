import { request } from './client'
import type { TokenResponse, User } from '../types'

export const auth = {
  register: (email: string, password: string, full_name: string) =>
    request<User>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, full_name }),
    }),
  login: (email: string, password: string) =>
    request<TokenResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<User>('/api/auth/me'),
}
