import { request } from './client'
import type { OrgInvitation, OrgMembership, OrgRole, Organization } from '../types'

export const organizations = {
  list:             ()                                          => request<Organization[]>('/api/organizations'),
  create:           (name: string)                             => request<Organization>('/api/organizations', { method: 'POST', body: JSON.stringify({ name }) }),
  get:              (id: number)                               => request<Organization>(`/api/organizations/${id}`),
  remove:           (id: number)                               => request<void>(`/api/organizations/${id}`, { method: 'DELETE' }),

  listMembers:      (id: number)                               => request<OrgMembership[]>(`/api/organizations/${id}/members`),
  changeRole:       (orgId: number, uid: number, role: OrgRole) =>
    request<OrgMembership>(`/api/organizations/${orgId}/members/${uid}?role=${role}`, { method: 'PATCH' }),
  removeMember:     (orgId: number, uid: number)               => request<void>(`/api/organizations/${orgId}/members/${uid}`, { method: 'DELETE' }),

  listInvitations:  (id: number)                               => request<OrgInvitation[]>(`/api/organizations/${id}/invitations`),
  invite:           (id: number, email: string, role: OrgRole) =>
    request<OrgInvitation>(`/api/organizations/${id}/invite`, { method: 'POST', body: JSON.stringify({ email, role }) }),
  acceptInvitation: (token: string)                            =>
    request<OrgMembership>(`/api/organizations/invitations/${token}/accept`, { method: 'POST' }),
}
