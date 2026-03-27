import { request } from './client'
import type {
  AdminCaptureListResponse,
  AdminGlobalStats,
  AdminOrgOut,
  AdminUserRecord,
  AssignTierRequest,
  TierCreate,
  TierUpdate,
} from '../types'
import type { User } from '../types'
import type { SubscriptionTier } from '../types'

export const admin = {
  // ── Stats ──────────────────────────────────────────────────
  stats: () => request<AdminGlobalStats>('/api/admin/stats'),

  // ── Users ─────────────────────────────────────────────────
  users: () => request<AdminUserRecord[]>('/api/admin/users'),
  toggleAdmin: (userId: number) =>
    request<User>(`/api/admin/users/${userId}/toggle-admin`, { method: 'PATCH' }),
  deleteUser: (userId: number) =>
    request<void>(`/api/admin/users/${userId}`, { method: 'DELETE' }),
  assignTier: (userId: number, body: AssignTierRequest) =>
    request<User>(`/api/admin/users/${userId}/tier`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  // ── Organizations ─────────────────────────────────────────
  allOrgs: () => request<AdminOrgOut[]>('/api/admin/organizations'),
  deleteOrg: (orgId: number) =>
    request<void>(`/api/admin/organizations/${orgId}`, { method: 'DELETE' }),

  // ── Subscription Tiers ────────────────────────────────────
  allTiers: () => request<SubscriptionTier[]>('/api/admin/subscriptions/tiers'),
  createTier: (body: TierCreate) =>
    request<SubscriptionTier>('/api/admin/subscriptions/tiers', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateTier: (tierId: number, body: TierUpdate) =>
    request<SubscriptionTier>(`/api/admin/subscriptions/tiers/${tierId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deactivateTier: (tierId: number) =>
    request<void>(`/api/admin/subscriptions/tiers/${tierId}`, { method: 'DELETE' }),

  // ── Capture management ────────────────────────────────────
  problematicCaptures: () =>
    request<AdminCaptureListResponse>('/api/admin/captures/problematic'),
  retryCapture: (roundId: number) =>
    request<{ detail: string; round_id: number }>(`/api/admin/captures/${roundId}/retry`, { method: 'POST' }),
  bulkRetryCaptures: () =>
    request<{ detail: string; queued: number }>('/api/admin/captures/bulk-retry', { method: 'POST' }),
  recoverAll: () =>
    request<{ detail: string; queued: number }>('/api/admin/captures/recover-all', { method: 'POST' }),
}
