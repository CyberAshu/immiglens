import { Fragment, useEffect, useState } from 'react'
import {
  Briefcase,
  Building2,
  Camera,
  ChevronDown,
  ChevronUp,
  CreditCard,
  FileText,
  Landmark,
  Link,
  Mail,
  User,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { auditLogs as auditApi } from '../api'
import type { AuditLog } from '../types'

// â”€â”€â”€ Resource icon map â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const RESOURCE_ICON: Record<string, LucideIcon> = {
  employer:          Building2,
  position:          Briefcase,
  posting:           Link,
  capture_round:     Camera,
  organization:      Landmark,
  org_invitation:    Mail,
  org_member:        Users,
  user:              User,
  subscription_tier: CreditCard,
}

const RESOURCE_ICON_COLOR: Record<string, string> = {
  employer:          '#3b82f6',
  position:          '#8b5cf6',
  posting:           '#06b6d4',
  capture_round:     '#f59e0b',
  organization:      '#0B1F3B',
  org_invitation:    '#ec4899',
  org_member:        '#6366f1',
  user:              '#64748b',
  subscription_tier: '#C8A24A',
}

const RESOURCE_LABEL: Record<string, string> = {
  employer:          'Employer',
  position:          'Job Position',
  posting:           'Job Posting',
  capture_round:     'Capture Round',
  organization:      'Organization',
  org_invitation:    'Org Invitation',
  org_member:        'Org Member',
  user:              'User',
  subscription_tier: 'Subscription Tier',
}

// â”€â”€â”€ Action meta â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const ACTION_META: Record<string, { label: string; bg: string; color: string; border: string }> = {
  CREATE: { label: 'Created', bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
  UPDATE: { label: 'Updated', bg: '#fffbeb', color: '#b45309', border: '#fde68a' },
  DELETE: { label: 'Deleted', bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' },
  VIEW:   { label: 'Viewed',  bg: '#f0f4f8', color: '#1e3a5f', border: '#c3d4e8' },
}

// â”€â”€â”€ Human-readable summary â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function buildSummary(log: AuditLog): string {
  const res = RESOURCE_LABEL[log.resource_type] ?? log.resource_type
  const nd  = (log.new_data ?? {}) as Record<string, unknown>
  const od  = (log.old_data ?? {}) as Record<string, unknown>

  if (log.resource_type === 'employer') {
    if (log.action === 'CREATE') return `Added employer "${nd.business_name ?? ''}"`
    if (log.action === 'DELETE') return `Removed employer "${od.business_name ?? ''}"`
    if (log.action === 'UPDATE') {
      if ('is_active' in nd) return nd.is_active ? 'Re-activated employer' : 'Deactivated employer'
      if (nd.business_name)  return `Renamed employer to "${nd.business_name}"`
      return 'Updated employer details'
    }
  }

  if (log.resource_type === 'position') {
    if (log.action === 'CREATE') return `Added job position "${nd.job_title ?? ''}"`
    if (log.action === 'DELETE') return `Removed job position "${od.job_title ?? ''}"`
    if (log.action === 'UPDATE') {
      if ('is_active' in nd) return nd.is_active ? 'Re-activated job position' : 'Deactivated job position'
      if (nd.job_title)      return `Renamed position to "${nd.job_title}"`
      const keys = Object.keys(nd)
      if (keys.length === 1) return `Updated position ${keys[0].replace(/_/g, ' ')}`
      return 'Updated job position details'
    }
  }

  if (log.resource_type === 'posting') {
    const url  = (nd.url ?? od.url ?? '') as string
    const host = url ? (() => { try { return new URL(url).hostname } catch { return url } })() : ''
    if (log.action === 'CREATE') return `Added job posting${host ? ` â€” ${host}` : ''}`
    if (log.action === 'DELETE') return `Removed job posting${host ? ` â€” ${host}` : ''}`
    if (log.action === 'UPDATE') {
      if ('is_active' in nd) return nd.is_active ? 'Re-activated job posting' : 'Deactivated job posting'
      if (nd.url)            return `Updated posting URL${host ? ` to ${host}` : ''}`
      return 'Updated job posting'
    }
  }

  if (log.resource_type === 'capture_round') {
    if (log.action === 'CREATE') return 'Manually triggered a capture round'
  }

  if (log.resource_type === 'organization') {
    if (log.action === 'CREATE') return `Created organization "${nd.name ?? ''}"`
    if (log.action === 'DELETE') return `Deleted organization "${od.name ?? ''}"`
  }

  if (log.resource_type === 'org_invitation') {
    if (log.action === 'CREATE') return `Sent invitation to ${nd.email ?? 'user'} as ${nd.role ?? 'member'}`
  }

  if (log.resource_type === 'org_member') {
    if (log.action === 'DELETE') return 'Removed a member from the organization'
  }

  if (log.resource_type === 'user') {
    if (log.action === 'DELETE') return `Deleted user account${od.email ? ` (${od.email})` : ''}`
    if (log.action === 'UPDATE') {
      if ('is_admin' in nd) return nd.is_admin ? `Granted admin rights to ${nd.email ?? 'user'}` : `Revoked admin rights from ${nd.email ?? 'user'}`
      if ('tier_id'  in nd) return 'Assigned subscription tier to user'
      return 'Updated user account'
    }
  }

  if (log.resource_type === 'subscription_tier') {
    const name = (nd.display_name ?? nd.name ?? od.display_name ?? '') as string
    if (log.action === 'CREATE') return `Created subscription tier "${name}"`
    if (log.action === 'UPDATE') {
      if ('is_active' in nd) return nd.is_active ? `Re-activated tier "${name}"` : `Deactivated tier "${name}"`
      return `Updated subscription tier "${name}"`
    }
  }

  return `${ACTION_META[log.action]?.label ?? log.action} ${res.toLowerCase()}${log.resource_id ? ` #${log.resource_id}` : ''}`
}

// â”€â”€â”€ Change detail card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function formatValue(_key: string, value: unknown): string {
  if (value === null || value === undefined) return 'â€”'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  const str = String(value)
  if (/^\d{4}-\d{2}-\d{2}T/.test(str)) {
    try { return new Date(str).toLocaleString() } catch { return str }
  }
  if (/^https?:\/\//.test(str)) {
    try { return new URL(str).hostname + new URL(str).pathname } catch { return str }
  }
  return str.length > 120 ? str.slice(0, 117) + 'â€¦' : str
}

function ChangeCard({ label, data, variant }: { label: string; data: Record<string, unknown>; variant: 'old' | 'new' }) {
  const entries = Object.entries(data)
  if (entries.length === 0) return null
  return (
    <div className={`audit-change-card audit-change-card--${variant}`}>
      <div className="audit-change-label">{label}</div>
      <dl className="audit-change-dl">
        {entries.map(([k, v]) => (
          <div key={k} className="audit-change-row">
            <dt className="audit-change-key">{k.replace(/_/g, ' ')}</dt>
            <dd className="audit-change-val">{formatValue(k, v)}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

// â”€â”€â”€ Filter options â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const RESOURCE_FILTER_OPTIONS = [
  { value: '',                  label: 'All Resources' },
  { value: 'employer',          label: 'Employer' },
  { value: 'position',          label: 'Job Position' },
  { value: 'posting',           label: 'Job Posting' },
  { value: 'capture_round',     label: 'Capture Round' },
  { value: 'organization',      label: 'Organization' },
  { value: 'org_invitation',    label: 'Invitation' },
  { value: 'org_member',        label: 'Org Member' },
  { value: 'user',              label: 'User' },
  { value: 'subscription_tier', label: 'Subscription Tier' },
]

const ACTION_FILTER_OPTIONS = [
  { value: '',       label: 'All Actions' },
  { value: 'CREATE', label: 'Created' },
  { value: 'UPDATE', label: 'Updated' },
  { value: 'DELETE', label: 'Deleted' },
  { value: 'VIEW',   label: 'Viewed' },
]

const PAGE_SIZE = 20

// â”€â”€â”€ Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function AuditLogs() {
  const [logs, setLogs]                 = useState<AuditLog[]>([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState<string | null>(null)
  const [resourceType, setResourceType] = useState('')
  const [action, setAction]             = useState('')
  const [expanded, setExpanded]         = useState<number | null>(null)
  const [page, setPage]                 = useState(1)
  const [hasMore, setHasMore]           = useState(false)

  function load(p: number) {
    setLoading(true)
    auditApi.list({
      resource_type: resourceType || undefined,
      action:        action        || undefined,
      limit:         PAGE_SIZE,
      offset:        (p - 1) * PAGE_SIZE,
    })
      .then(data => { setLogs(data); setHasMore(data.length === PAGE_SIZE) })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { setPage(1) }, [resourceType, action])
  useEffect(() => { load(page) }, [page, resourceType, action])

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Activity Log</h1>
          <p className="sub-text">A history of all changes made to your account</p>
        </div>
      </div>

      {/* â”€â”€ Filters â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="filter-bar">
        <select className="filter-select" value={resourceType} onChange={e => setResourceType(e.target.value)}>
          {RESOURCE_FILTER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select className="filter-select" value={action} onChange={e => setAction(e.target.value)}>
          {ACTION_FILTER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <span className="filter-count">
          {logs.length} result{logs.length !== 1 ? 's' : ''}{page > 1 || hasMore ? ` Â· page ${page}` : ''}
        </span>
      </div>

      {error   && <div className="error-msg">{error}</div>}
      {loading && <div className="loading">Loadingâ€¦</div>}

      {!loading && !error && (
        <div className="audit-list">
          {logs.length === 0 && (
            <div className="audit-empty">
              <FileText size={32} strokeWidth={1.5} color="#d1d5db" />
              <span>No activity found.</span>
            </div>
          )}

          {logs.map(log => {
            const meta       = ACTION_META[log.action] ?? ACTION_META['VIEW']
            const IconComp   = RESOURCE_ICON[log.resource_type] ?? FileText
            const iconColor  = RESOURCE_ICON_COLOR[log.resource_type] ?? '#6b7280'
            const iconBg     = iconColor + '18'   // 10% opacity tint
            const resLabel   = RESOURCE_LABEL[log.resource_type] ?? log.resource_type
            const summary    = buildSummary(log)
            const hasChanges = log.old_data || log.new_data
            const isOpen     = expanded === log.id

            return (
              <Fragment key={log.id}>
                <div className={`audit-row${isOpen ? ' audit-row--expanded' : ''}`}>

                  {/* Resource icon */}
                  <div className="audit-icon-col">
                    <span className="audit-icon" style={{ background: iconBg }}>
                      <IconComp size={16} strokeWidth={2} color={iconColor} />
                    </span>
                  </div>

                  {/* Summary + meta */}
                  <div className="audit-main">
                    <div className="audit-summary">{summary}</div>
                    <div className="audit-meta">
                      <span
                        className="audit-action-pill"
                        style={{ background: meta.bg, color: meta.color, borderColor: meta.border }}
                      >
                        {meta.label}
                      </span>
                      <span className="audit-res-tag">
                        {resLabel}{log.resource_id ? ` #${log.resource_id}` : ''}
                      </span>
                      <span className="audit-time">{new Date(log.created_at).toLocaleString()}</span>
                    </div>
                  </div>

                  {/* Who performed the action */}
                  <div className="audit-who">
                    {log.user_name
                      ? <>
                          <div className="audit-who-name">{log.user_name}</div>
                          <div className="audit-who-email">{log.user_email}</div>
                        </>
                      : <span className="audit-who-email">{log.user_id ? `User #${log.user_id}` : 'System'}</span>
                    }
                  </div>

                  {/* Details toggle */}
                  <div className="audit-actions-col">
                    {hasChanges && (
                      <button
                        className="audit-details-btn"
                        onClick={() => setExpanded(isOpen ? null : log.id)}
                        aria-expanded={isOpen}
                      >
                        {isOpen ? 'Hide' : 'Details'}
                        {isOpen
                          ? <ChevronUp  size={13} strokeWidth={2.5} />
                          : <ChevronDown size={13} strokeWidth={2.5} />
                        }
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded change detail */}
                {isOpen && (
                  <div className="audit-detail-pane">
                    <div className="audit-change-grid">
                      {log.old_data && <ChangeCard label="Before" data={log.old_data as Record<string, unknown>} variant="old" />}
                      {log.new_data && <ChangeCard label="After"  data={log.new_data as Record<string, unknown>} variant="new" />}
                    </div>
                  </div>
                )}
              </Fragment>
            )
          })}
        </div>
      )}

      {/* â”€â”€ Pagination â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {!loading && !error && (page > 1 || hasMore) && (
        <div className="pagination-bar">
          <button className="btn-ghost btn-sm" onClick={() => setPage(p => p - 1)} disabled={page === 1}>
            â† Previous
          </button>
          <span className="pagination-page">Page {page}</span>
          <button className="btn-ghost btn-sm" onClick={() => setPage(p => p + 1)} disabled={!hasMore}>
            Next â†’
          </button>
        </div>
      )}
    </div>
  )
}

