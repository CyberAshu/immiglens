import { request } from './client'
import type { ChangeHistoryItem, PostingSnapshot } from '../types'

export const changes = {
  snapshots: (postingId: number) => request<PostingSnapshot[]>(`/api/changes/postings/${postingId}`),
  history:   (postingId: number) => request<ChangeHistoryItem[]>(`/api/changes/postings/${postingId}/history`),
}
