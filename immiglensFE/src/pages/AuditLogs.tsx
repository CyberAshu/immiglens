import { useState, useEffect, useRef, Fragment } from 'react'
import {
  Briefcase,
  Building2,
  Calendar,
  Camera,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Download,
  FileText,
  Filter,
  Landmark,
  Link,
  Loader2,
  Mail,
  Monitor,
  Printer,
  User,
  Users,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { auditLogs as auditApi, employers as employersApi, positions as positionsApi } from '../api'
import type { AuditLog, Employer, JobPosition } from '../types'

// ── Resource icon map ────────────────────────────────────────────────────────

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

// ── Action meta ──────────────────────────────────────────────────────────────

const ACTION_META: Record<string, { label: string; bg: string; color: string; border: string }> = {
  CREATE: { label: 'Created', bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
  UPDATE: { label: 'Updated', bg: '#fffbeb', color: '#b45309', border: '#fde68a' },
  DELETE: { label: 'Deleted', bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' },
  VIEW:   { label: 'Viewed',  bg: '#f0f4f8', color: '#1e3a5f', border: '#c3d4e8' },
}

// ── Human-readable summary ───────────────────────────────────────────────────

function buildSummary(log: AuditLog): string {
  const res = RESOURCE_LABEL[log.resource_type] ?? log.resource_type
  const nd  = (log.new_data ?? {}) as Record<string, unknown>
  const od  = (log.old_data ?? {}) as Record<string, unknown>

  if (log.resource_type === 'employer') {
    if (log.action === 'CREATE') return `Added employer "${nd.business_name ?? ''}"`
    if (log.action === 'DELETE') return `Removed employer "${od.business_name ?? ''}"`
    if (log.action === 'UPDATE') {
      if ('is_active' in nd) return nd.is_active ? `Re-activated employer "${nd.business_name ?? ''}"` : `Deactivated employer "${nd.business_name ?? ''}"`
      if (nd.business_name)  return `Renamed employer to "${nd.business_name}"`
      return 'Updated employer details'
    }
  }

  if (log.resource_type === 'position') {
    if (log.action === 'CREATE') return `Added job position "${nd.job_title ?? ''}"`
    if (log.action === 'DELETE') return `Removed job position "${od.job_title ?? ''}"`
    if (log.action === 'UPDATE') {
      if ('is_active' in nd) return nd.is_active ? `Re-activated position "${nd.job_title ?? ''}"` : `Deactivated position "${nd.job_title ?? ''}"`
      if (nd.job_title)      return `Renamed position to "${nd.job_title}"`
      const keys = Object.keys(nd)
      if (keys.length === 1) return `Updated position ${keys[0].replace(/_/g, ' ')}`
      return 'Updated job position details'
    }
  }

  if (log.resource_type === 'posting') {
    const url  = (nd.url ?? od.url ?? '') as string
    const host = url ? (() => { try { return new URL(url).hostname } catch { return url } })() : ''
    if (log.action === 'CREATE') return `Added job board${host ? ` — ${host}` : ''}`
    if (log.action === 'DELETE') return `Removed job board${host ? ` — ${host}` : ''}`
    if (log.action === 'UPDATE') {
      if ('is_active' in nd) return nd.is_active ? `Re-activated job board${host ? ` (${host})` : ''}` : `Deactivated job board${host ? ` (${host})` : ''}`
      if (nd.url)            return `Updated job board URL to ${host || nd.url}`
      return 'Updated job board'
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
      if ('is_admin' in nd) return nd.is_admin ? `Granted admin access to ${nd.email ?? 'user'}` : `Revoked admin access from ${nd.email ?? 'user'}`
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

// ── Change detail card ───────────────────────────────────────────────────────

function formatValue(_key: string, value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  const str = String(value)
  if (/^\d{4}-\d{2}-\d{2}T/.test(str)) {
    try { return new Date(str).toLocaleString() } catch { return str }
  }
  if (/^https?:\/\//.test(str)) {
    try { return new URL(str).hostname + new URL(str).pathname } catch { return str }
  }
  return str.length > 120 ? str.slice(0, 117) + '…' : str
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

// ── Filter options ───────────────────────────────────────────────────────────

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

// ── CSV export helper ────────────────────────────────────────────────────────

function escapeCsv(val: unknown): string {
  if (val === null || val === undefined) return ''
  const s = typeof val === 'object' ? JSON.stringify(val) : String(val)
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s
}

function buildCsvRows(rows: AuditLog[]): string {
  const headers = ['Date', 'Action', 'Resource Type', 'Resource ID', 'Summary', 'Performed By', 'Email', 'IP Address', 'Before', 'After']
  const lines = [headers.map(escapeCsv).join(',')]
  for (const log of rows) {
    lines.push([
      new Date(log.created_at).toLocaleString(),
      log.action,
      RESOURCE_LABEL[log.resource_type] ?? log.resource_type,
      log.resource_id ?? '',
      buildSummary(log),
      log.user_name ?? '',
      log.user_email ?? '',
      log.ip_address ?? '',
      log.old_data ? JSON.stringify(log.old_data) : '',
      log.new_data ? JSON.stringify(log.new_data) : '',
    ].map(escapeCsv).join(','))
  }
  return lines.join('\r\n')
}

function downloadCsv(content: string, filename: string) {
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  // Allow the browser to process the click before revoking
  setTimeout(() => {
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, 150)
}

// ── Component ────────────────────────────────────────────────────────────────

export default function AuditLogs() {
  const [logs, setLogs]                   = useState<AuditLog[]>([])
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState<string | null>(null)
  const [resourceType, setResourceType]   = useState('')
  const [action, setAction]               = useState('')
  const [selectedEmployerId, setSelectedEmployerId] = useState<number | ''>('')
  const [selectedPositionId, setSelectedPositionId] = useState<number | ''>('')
  const [dateFrom, setDateFrom]           = useState('')
  const [dateTo, setDateTo]               = useState('')
  const [expanded, setExpanded]           = useState<number | null>(null)
  const [page, setPage]                   = useState(1)
  const [hasMore, setHasMore]             = useState(false)
  const [exporting, setExporting]         = useState(false)
  const printRef                          = useRef<HTMLDivElement>(null)
  const fetchGen                          = useRef(0)  // increments on each new fetch; stale responses are ignored

  // Employer + position options for cascading filter dropdowns
  const [employerList, setEmployerList]   = useState<Employer[]>([])
  const [positionList, setPositionList]   = useState<JobPosition[]>([])
  const [loadingEmployers, setLoadingEmployers] = useState(false)
  const [loadingPositions, setLoadingPositions] = useState(false)

  // Load employers once on mount
  useEffect(() => {
    setLoadingEmployers(true)
    employersApi.list()
      .then(data => setEmployerList(data))
      .catch(() => {/* non-critical */})
      .finally(() => setLoadingEmployers(false))
  }, [])

  // Load positions when employer changes
  useEffect(() => {
    setSelectedPositionId('')
    setPositionList([])
    if (!selectedEmployerId) return
    setLoadingPositions(true)
    positionsApi.list(selectedEmployerId as number)
      .then(data => setPositionList(data))
      .catch(() => {/* non-critical */})
      .finally(() => setLoadingPositions(false))
  }, [selectedEmployerId])

  function load(p: number) {
    setLoading(true)
    const gen = ++fetchGen.current
    auditApi.list({
      resource_type:  resourceType    || undefined,
      action:         action          || undefined,
      employer_id:    selectedEmployerId !== '' ? selectedEmployerId : undefined,
      position_id:    selectedPositionId !== '' ? selectedPositionId : undefined,
      date_from:      dateFrom ? new Date(dateFrom).toISOString() : undefined,
      date_to:        dateTo   ? new Date(dateTo + 'T23:59:59').toISOString() : undefined,
      limit:          PAGE_SIZE,
      offset:         (p - 1) * PAGE_SIZE,
    })
      .then(data => {
        if (gen !== fetchGen.current) return  // stale response — newer fetch in flight
        setLogs(data)
        setHasMore(data.length === PAGE_SIZE)
      })
      .catch((e: Error) => { if (gen === fetchGen.current) setError(e.message) })
      .finally(() => { if (gen === fetchGen.current) setLoading(false) })
  }

  useEffect(() => { setPage(1) }, [resourceType, action, selectedEmployerId, selectedPositionId, dateFrom, dateTo])
  useEffect(() => { load(page) }, [page, resourceType, action, selectedEmployerId, selectedPositionId, dateFrom, dateTo])

  function clearFilters() {
    setResourceType('')
    setAction('')
    setSelectedEmployerId('')
    setSelectedPositionId('')
    setDateFrom('')
    setDateTo('')
    setPage(1)
  }

  const hasActiveFilters = !!(resourceType || action || selectedEmployerId !== '' || selectedPositionId !== '' || dateFrom || dateTo)

  // ── Export all matching rows as CSV (fetches up to 5000 rows) ──────────────
  async function handleExportCsv() {
    setExporting(true)
    try {
      const allRows = await auditApi.list({
        resource_type: resourceType    || undefined,
        action:        action          || undefined,
        employer_id:   selectedEmployerId !== '' ? selectedEmployerId : undefined,
        position_id:   selectedPositionId !== '' ? selectedPositionId : undefined,
        date_from:     dateFrom ? new Date(dateFrom).toISOString() : undefined,
        date_to:       dateTo   ? new Date(dateTo + 'T23:59:59').toISOString() : undefined,
        limit: 5000,
        offset: 0,
      })
      const datePart = new Date().toISOString().slice(0, 10)
      downloadCsv(buildCsvRows(allRows), `activity-log-${datePart}.csv`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to export CSV')
    } finally {
      setExporting(false)
    }
  }

  // ── Print: opens the browser print dialog on the printable section ─────────
  function handlePrint() {
    window.print()
  }

  const selectedEmployer = employerList.find(e => e.id === selectedEmployerId)
  const selectedPosition = positionList.find(p => p.id === selectedPositionId)

  // Count active filters for the badge
  const activeFilterCount = [resourceType, action, selectedEmployerId !== '' ? 1 : '', selectedPositionId !== '' ? 1 : '', dateFrom, dateTo].filter(Boolean).length

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Activity Log</h1>
          <p className="sub-text">A full history of all changes made in your account</p>
        </div>
        <div className="audit-export-actions">
          <button
            className="btn-ghost btn-sm"
            onClick={handleExportCsv}
            disabled={exporting || logs.length === 0}
            title="Download current results as CSV"
          >
            {exporting
              ? <Loader2 size={14} strokeWidth={2} className="spin" />
              : <Download size={14} strokeWidth={2} />}
            {exporting ? 'Exporting…' : 'Download CSV'}
          </button>
          <button
            className="btn-ghost btn-sm"
            onClick={handlePrint}
            disabled={logs.length === 0}
            title="Print activity log"
          >
            <Printer size={14} strokeWidth={2} />
            Print
          </button>
        </div>
      </div>

      {/* ── Filter Panel ──────────────────────────────────────────────────── */}
      <div className="audit-filter-panel">
        <div className="audit-filter-header">
          <span className="audit-filter-title">
            <Filter size={13} strokeWidth={2.5} style={{ verticalAlign: 'middle', marginRight: 5 }} />
            Filters
            {activeFilterCount > 0 && (
              <span className="audit-filter-badge">{activeFilterCount}</span>
            )}
          </span>
          {hasActiveFilters && (
            <button className="audit-filter-clear" onClick={clearFilters}>
              <X size={12} strokeWidth={2.5} />
              Clear all
            </button>
          )}
        </div>

        <div className="audit-filter-grid">
          {/* Employer */}
          <div className="audit-filter-group">
            <label className="audit-filter-label">
              <Building2 size={11} strokeWidth={2.5} />
              Employer
            </label>
            <div className="audit-filter-select-wrap">
              <select
                className="audit-filter-control"
                value={selectedEmployerId}
                onChange={e => setSelectedEmployerId(e.target.value === '' ? '' : Number(e.target.value))}
                disabled={loadingEmployers}
              >
                <option value="">{loadingEmployers ? 'Loading…' : 'All Employers'}</option>
                {employerList.map(emp => (
                  <option key={emp.id} value={emp.id}>
                    {emp.business_name}{emp.is_active ? '' : ' (inactive)'}
                  </option>
                ))}
              </select>
              {selectedEmployerId !== '' && (
                <button
                  className="audit-filter-clear-btn"
                  onClick={() => setSelectedEmployerId('')}
                  title="Clear employer filter"
                >
                  <X size={11} strokeWidth={2.5} />
                </button>
              )}
            </div>
          </div>

          {/* Position — cascades from employer */}
          <div className="audit-filter-group">
            <label className="audit-filter-label" style={{ opacity: !selectedEmployerId ? 0.45 : 1 }}>
              <Briefcase size={11} strokeWidth={2.5} />
              Job Position
            </label>
            <div className="audit-filter-select-wrap">
              <select
                className="audit-filter-control"
                value={selectedPositionId}
                onChange={e => setSelectedPositionId(e.target.value === '' ? '' : Number(e.target.value))}
                disabled={!selectedEmployerId || loadingPositions}
              >
                <option value="">
                  {!selectedEmployerId
                    ? 'Select employer first'
                    : loadingPositions
                      ? 'Loading…'
                      : 'All Positions'}
                </option>
                {positionList.map(pos => (
                  <option key={pos.id} value={pos.id}>
                    {pos.job_title}{pos.is_active ? '' : ' (inactive)'}
                  </option>
                ))}
              </select>
              {selectedPositionId !== '' && (
                <button
                  className="audit-filter-clear-btn"
                  onClick={() => setSelectedPositionId('')}
                  title="Clear position filter"
                >
                  <X size={11} strokeWidth={2.5} />
                </button>
              )}
            </div>
          </div>

          {/* Resource Type */}
          <div className="audit-filter-group">
            <label className="audit-filter-label">
              <FileText size={11} strokeWidth={2.5} />
              Resource Type
            </label>
            <div className="audit-filter-select-wrap">
              <select
                className="audit-filter-control"
                value={resourceType}
                onChange={e => setResourceType(e.target.value)}
              >
                {RESOURCE_FILTER_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              {resourceType && (
                <button
                  className="audit-filter-clear-btn"
                  onClick={() => setResourceType('')}
                  title="Clear resource type filter"
                >
                  <X size={11} strokeWidth={2.5} />
                </button>
              )}
            </div>
          </div>

          {/* Action */}
          <div className="audit-filter-group">
            <label className="audit-filter-label">
              <Filter size={11} strokeWidth={2.5} />
              Action
            </label>
            <div className="audit-filter-select-wrap">
              <select
                className="audit-filter-control"
                value={action}
                onChange={e => setAction(e.target.value)}
              >
                {ACTION_FILTER_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              {action && (
                <button
                  className="audit-filter-clear-btn"
                  onClick={() => setAction('')}
                  title="Clear action filter"
                >
                  <X size={11} strokeWidth={2.5} />
                </button>
              )}
            </div>
          </div>

          {/* Date From */}
          <div className="audit-filter-group">
            <label className="audit-filter-label">
              <Calendar size={11} strokeWidth={2.5} />
              From Date
            </label>
            <div className="audit-filter-select-wrap">
              <input
                type="date"
                className="audit-filter-control"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={e => setDateFrom(e.target.value)}
              />
              {dateFrom && (
                <button
                  className="audit-filter-clear-btn"
                  onClick={() => setDateFrom('')}
                  title="Clear from date"
                >
                  <X size={11} strokeWidth={2.5} />
                </button>
              )}
            </div>
          </div>

          {/* Date To */}
          <div className="audit-filter-group">
            <label className="audit-filter-label">
              <Calendar size={11} strokeWidth={2.5} />
              To Date
            </label>
            <div className="audit-filter-select-wrap">
              <input
                type="date"
                className="audit-filter-control"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={e => setDateTo(e.target.value)}
              />
              {dateTo && (
                <button
                  className="audit-filter-clear-btn"
                  onClick={() => setDateTo('')}
                  title="Clear to date"
                >
                  <X size={11} strokeWidth={2.5} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Active filter chips + result count */}
        {(hasActiveFilters || logs.length > 0) && (
          <div className="audit-filter-footer">
            <div className="audit-filter-chips">
              {selectedEmployer && (
                <span className="audit-filter-chip">
                  <Building2 size={10} strokeWidth={2.5} />
                  {selectedEmployer.business_name}
                  <button onClick={() => setSelectedEmployerId('')}><X size={9} strokeWidth={3} /></button>
                </span>
              )}
              {selectedPosition && (
                <span className="audit-filter-chip">
                  <Briefcase size={10} strokeWidth={2.5} />
                  {selectedPosition.job_title}
                  <button onClick={() => setSelectedPositionId('')}><X size={9} strokeWidth={3} /></button>
                </span>
              )}
              {resourceType && (
                <span className="audit-filter-chip">
                  {RESOURCE_LABEL[resourceType] ?? resourceType}
                  <button onClick={() => setResourceType('')}><X size={9} strokeWidth={3} /></button>
                </span>
              )}
              {action && (
                <span className="audit-filter-chip" style={{
                  background: ACTION_META[action]?.bg,
                  borderColor: ACTION_META[action]?.border,
                  color: ACTION_META[action]?.color,
                }}>
                  {ACTION_META[action]?.label ?? action}
                  <button onClick={() => setAction('')}><X size={9} strokeWidth={3} /></button>
                </span>
              )}
              {dateFrom && (
                <span className="audit-filter-chip">
                  <Calendar size={10} strokeWidth={2.5} />
                  From {dateFrom}
                  <button onClick={() => setDateFrom('')}><X size={9} strokeWidth={3} /></button>
                </span>
              )}
              {dateTo && (
                <span className="audit-filter-chip">
                  <Calendar size={10} strokeWidth={2.5} />
                  To {dateTo}
                  <button onClick={() => setDateTo('')}><X size={9} strokeWidth={3} /></button>
                </span>
              )}
            </div>
            <span className="audit-filter-count">
              {loading ? '…' : `${logs.length}${hasMore ? '+' : ''} result${logs.length !== 1 ? 's' : ''}`}
              {(page > 1 || hasMore) && <> · page {page}</>}
            </span>
          </div>
        )}
      </div>

      {error   && <div className="error-msg">{error}</div>}
      {loading && <div className="loading">Loading…</div>}

      {!loading && !error && (
        <div ref={printRef} className="audit-printable">
          {/* Print-only header (hidden in screen view) */}
          <div className="audit-print-header">
            <div className="audit-print-title">Activity Log</div>
            <div className="audit-print-meta">
              Generated: {new Date().toLocaleString()}
              {selectedEmployer && <> · Employer: {selectedEmployer.business_name}</>}
              {selectedPosition && <> · Position: {selectedPosition.job_title}</>}
              {resourceType && <> · Resource: {RESOURCE_LABEL[resourceType] ?? resourceType}</>}
              {action && <> · Action: {ACTION_META[action]?.label ?? action}</>}
              {dateFrom && <> · From: {dateFrom}</>}
              {dateTo && <> · To: {dateTo}</>}
            </div>
          </div>

          <div className="audit-list">
          {logs.length === 0 && (
            <div className="audit-empty">
              <FileText size={32} strokeWidth={1.5} color="#d1d5db" />
              <span>No activity found for the selected filters.</span>
            </div>
          )}

          {logs.map(log => {
            const meta       = ACTION_META[log.action] ?? ACTION_META['VIEW']
            const IconComp   = RESOURCE_ICON[log.resource_type] ?? FileText
            const iconColor  = RESOURCE_ICON_COLOR[log.resource_type] ?? '#6b7280'
            const iconBg     = iconColor + '18'
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
                      {log.ip_address && (
                        <span className="audit-ip" title="IP address">
                          <Monitor size={11} strokeWidth={2} style={{ verticalAlign: 'middle', marginRight: 3 }} />
                          {log.ip_address}
                        </span>
                      )}
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
                    {log.ip_address && (
                      <div style={{ marginTop: 8, fontSize: 12, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Monitor size={12} strokeWidth={2} />
                        Action performed from IP: <strong>{log.ip_address}</strong>
                      </div>
                    )}
                  </div>
                )}
              </Fragment>
            )
          })}
        </div>
        </div>
      )}

      {/* ── Pagination ────────────────────────────────────────────────────── */}
      {!loading && !error && (page > 1 || hasMore) && (
        <div className="pagination-bar">
          <button className="btn-ghost btn-sm" onClick={() => setPage(p => p - 1)} disabled={page === 1}>
            ← Previous
          </button>
          <span className="pagination-page">Page {page}</span>
          <button className="btn-ghost btn-sm" onClick={() => setPage(p => p + 1)} disabled={!hasMore}>
            Next →
          </button>
        </div>
      )}
    </div>
  )
}

