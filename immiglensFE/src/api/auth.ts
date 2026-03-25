import { request } from './client'
import type { TokenResponse, TrustedDevice, User } from '../types'

export const auth = {
  register: (email: string, password: string, full_name: string) =>
    request<User>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, full_name }),
    }),

  requestOtp: (email: string, password: string) => {
    localStorage.removeItem('device_token')
    return request<{ message: string } | TokenResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
  },

  verifyOtp: (email: string, otp: string, remember_device: boolean) =>
    request<TokenResponse>('/api/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ email, otp, remember_device }),
    }),

  me: () => request<User>('/api/auth/me'),

  forgotPassword: (email: string) =>
    request<{ message: string }>('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  resetPassword: (token: string, new_password: string) =>
    request<{ message: string }>('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, new_password }),
    }),

  updateProfile: (full_name: string) =>
    request<User>('/api/auth/me', {
      method: 'PATCH',
      body: JSON.stringify({ full_name }),
    }),

  changePassword: (current_password: string, new_password: string) =>
    request<{ message: string }>('/api/auth/change-password', {
      method: 'PATCH',
      body: JSON.stringify({ current_password, new_password }),
    }),

  listTrustedDevices: () =>
    request<TrustedDevice[]>('/api/auth/trusted-devices'),

  revokeDevice: (id: number) =>
    request<{ message: string }>(`/api/auth/trusted-devices/${id}`, { method: 'DELETE' }),

  revokeAllDevices: () =>
    request<{ message: string }>('/api/auth/trusted-devices', { method: 'DELETE' }),
}
