import { request } from './client'
import type { TokenResponse, User } from '../types'

const DEVICE_TOKEN_KEY = 'device_token'

export const auth = {
  register: (email: string, password: string, full_name: string) =>
    request<User>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, full_name }),
    }),

  requestOtp: (email: string, password: string) => {
    const device_token = localStorage.getItem(DEVICE_TOKEN_KEY) ?? undefined
    return request<{ message: string } | TokenResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, device_token }),
    })
  },

  verifyOtp: (email: string, otp: string, remember_device: boolean) =>
    request<TokenResponse>('/api/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ email, otp, remember_device }),
    }),

  saveDeviceToken: (token: string | null | undefined) => {
    if (token) localStorage.setItem(DEVICE_TOKEN_KEY, token)
  },

  clearDeviceToken: () => localStorage.removeItem(DEVICE_TOKEN_KEY),

  me: () => request<User>('/api/auth/me'),
}
