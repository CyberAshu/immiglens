import { request } from './client'
import type { ChangeHistoryItem, PostingSnapshot } from '../types'

export const changes = {
  snapshots: (urlId: number) => request<PostingSnapshot[]>(`/api/changes/urls/${urlId}`),
  history:   (urlId: number) => request<ChangeHistoryItem[]>(`/api/changes/urls/${urlId}/history`),
}
