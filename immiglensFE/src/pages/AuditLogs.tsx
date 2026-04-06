import { useState, useEffect, useRef, Fragment } from 'react'
import {
  Briefcase,
  Building2,
  Calendar,
  Camera,
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
import type { AuditLogPage } from '../api/audit_logs'

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

type ActionStyle = { label: string; bg: string; color: string; border: string }

const ACTION_STYLE_CREATED:     ActionStyle = { label: 'Created',    bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' }
const ACTION_STYLE_UPDATED:     ActionStyle = { label: 'Updated',    bg: '#fffbeb', color: '#b45309', border: '#fde68a' }
const ACTION_STYLE_DELETED:     ActionStyle = { label: 'Deleted',    bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' }
const ACTION_STYLE_FAILED:      ActionStyle = { label: 'Failed',     bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' }
const ACTION_STYLE_ACTIVATED:   ActionStyle = { label: 'Activated',  bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' }
const ACTION_STYLE_DEACTIVATED: ActionStyle = { label: 'Deactivated',bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' }
const ACTION_STYLE_AUTH:        ActionStyle = { label: 'Auth',       bg: '#f0f4f8', color: '#1e3a5f', border: '#c3d4e8' }
const ACTION_STYLE_BILLING:     ActionStyle = { label: 'Billing',    bg: '#faf5ff', color: '#7e22ce', border: '#e9d5ff' }
const ACTION_STYLE_NEUTRAL:     ActionStyle = { label: 'System',     bg: '#f8fafc', color: '#475569', border: '#e2e8f0' }

// Map old-style and new-style action values to visual styles
const ACTION_META: Record<string, ActionStyle> = {
  // Old format (migrated data)
  CREATE: ACTION_STYLE_CREATED,
  UPDATE: ACTION_STYLE_UPDATED,
  DELETE: ACTION_STYLE_DELETED,
  VIEW:   ACTION_STYLE_NEUTRAL,
}

/** Resolve any action string — old or new vocabulary — to a display style. */
function getActionMeta(action: string): ActionStyle {
  if (action in ACTION_META) return ACTION_META[action]
  if (/_CREATED$|^REGISTER$|_TRIGGERED$|_GENERATED$|_UPLOADED$|_SENT$/.test(action)) return ACTION_STYLE_CREATED
  if (/_UPDATED$|_CHANGED$|_ASSIGNED$|_ACKNOWLEDGED$/.test(action))                   return ACTION_STYLE_UPDATED
  if (/_DELETED$|_REMOVED$|_REVOKED$/.test(action))                                   return ACTION_STYLE_DELETED
  if (/_FAILED$/.test(action))                                                         return ACTION_STYLE_FAILED
  if (/_ACTIVATED$|_SUCCEEDED$|_COMPLETED$|_VERIFIED$|_GRANTED$|_ACCEPTED$/.test(action)) return ACTION_STYLE_ACTIVATED
  if (/_DEACTIVATED$|_CANCELLED$|_EXPIRED$/.test(action))                             return ACTION_STYLE_DEACTIVATED
  if (/^(LOGIN|LOGOUT|OTP|TRUSTED_DEVICE|PASSWORD|REGISTER)/.test(action))            return ACTION_STYLE_AUTH
  if (/^(SUBSCRIPTION|PAYMENT|CHECKOUT|PROMO_REDEEMED)/.test(action))                 return ACTION_STYLE_BILLING
  return ACTION_STYLE_NEUTRAL
}

// ── Human-readable summary ───────────────────────────────────────────────────

function buildSummary(log: AuditLog): string {
  // Prefer server-generated description when available
  if (log.description) return log.description

  const entityType = log.entity_type ?? log.resource_type ?? ''
  const res = RESOURCE_LABEL[entityType] ?? entityType
  const nd  = (log.new_data ?? {}) as Record<string, unknown>
  const od  = (log.old_data ?? {}) as Record<string, unknown>

  if (entityType === 'employer') {
    if (log.action === 'CREATE') return `Added employer "${nd.business_name ?? ''}"`
    if (log.action === 'DELETE') return `Removed employer "${od.business_name ?? ''}"`
    if (log.action === 'UPDATE') {
      if ('is_active' in nd) return nd.is_active ? `Re-activated employer "${nd.business_name ?? ''}"` : `Deactivated employer "${nd.business_name ?? ''}"`
      if (nd.business_name)  return `Renamed employer to "${nd.business_name}"`
      return 'Updated employer details'
    }
  }

  if (entityType === 'position') {
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

  if (entityType === 'posting') {
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

  if (entityType === 'capture_round') {
    if (log.action === 'CREATE') return 'Manually triggered a capture round'
  }

  if (entityType === 'organization') {
    if (log.action === 'CREATE') return `Created organization "${nd.name ?? ''}"`
    if (log.action === 'DELETE') return `Deleted organization "${od.name ?? ''}"`
  }

  if (entityType === 'org_invitation') {
    if (log.action === 'CREATE') return `Sent invitation to ${nd.email ?? 'user'} as ${nd.role ?? 'member'}`
  }

  if (entityType === 'org_member') {
    if (log.action === 'DELETE') return 'Removed a member from the organization'
  }

  if (entityType === 'user') {
    if (log.action === 'DELETE') return `Deleted user account${od.email ? ` (${od.email})` : ''}`
    if (log.action === 'UPDATE') {
      if ('is_admin' in nd) return nd.is_admin ? `Granted admin access to ${nd.email ?? 'user'}` : `Revoked admin access from ${nd.email ?? 'user'}`
      if ('tier_id'  in nd) return 'Assigned subscription tier to user'
      return 'Updated user account'
    }
  }

  if (entityType === 'subscription_tier') {
    const name = (nd.display_name ?? nd.name ?? od.display_name ?? '') as string
    if (log.action === 'CREATE') return `Created subscription tier "${name}"`
    if (log.action === 'UPDATE') {
      if ('is_active' in nd) return nd.is_active ? `Re-activated tier "${name}"` : `Deactivated tier "${name}"`
      return `Updated subscription tier "${name}"`
    }
  }

  return `${getActionMeta(log.action).label} ${res.toLowerCase()}${log.entity_id ? ` #${log.entity_id}` : ''}`
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
  { value: '',                         label: 'All Actions' },
  // Auth
  { value: 'REGISTER',                 label: 'Registered' },
  { value: 'LOGIN_FAILED',             label: 'Login Failed' },
  { value: 'OTP_VERIFIED',             label: 'OTP Verified' },
  { value: 'TRUSTED_DEVICE_LOGIN',     label: 'Trusted Device Login' },
  { value: 'TRUSTED_DEVICE_REGISTERED',label: 'Device Registered' },
  { value: 'PASSWORD_CHANGED',         label: 'Password Changed' },
  { value: 'PASSWORD_RESET_REQUESTED', label: 'Password Reset Req.' },
  { value: 'PASSWORD_RESET_COMPLETED', label: 'Password Reset Done' },
  { value: 'PROFILE_UPDATED',          label: 'Profile Updated' },
  // Employer
  { value: 'EMPLOYER_CREATED',         label: 'Employer Created' },
  { value: 'EMPLOYER_UPDATED',         label: 'Employer Updated' },
  { value: 'EMPLOYER_ACTIVATED',       label: 'Employer Activated' },
  { value: 'EMPLOYER_DEACTIVATED',     label: 'Employer Deactivated' },
  { value: 'EMPLOYER_DELETED',         label: 'Employer Deleted' },
  // Position
  { value: 'POSITION_CREATED',         label: 'Position Created' },
  { value: 'POSITION_UPDATED',         label: 'Position Updated' },
  { value: 'POSITION_ACTIVATED',       label: 'Position Activated' },
  { value: 'POSITION_DEACTIVATED',     label: 'Position Deactivated' },
  { value: 'POSITION_DELETED',         label: 'Position Deleted' },
  // Posting
  { value: 'POSTING_CREATED',          label: 'Posting Added' },
  { value: 'POSTING_UPDATED',          label: 'Posting Updated' },
  { value: 'POSTING_ACTIVATED',        label: 'Posting Activated' },
  { value: 'POSTING_DEACTIVATED',      label: 'Posting Deactivated' },
  { value: 'POSTING_DELETED',          label: 'Posting Deleted' },
  // Billing
  { value: 'SUBSCRIPTION_ACTIVATED',   label: 'Subscription Activated' },
  { value: 'SUBSCRIPTION_UPDATED',     label: 'Subscription Updated' },
  { value: 'SUBSCRIPTION_CANCELLED',   label: 'Subscription Cancelled' },
  { value: 'SUBSCRIPTION_EXPIRED',     label: 'Subscription Expired' },
  { value: 'SUBSCRIPTION_PLAN_CHANGED',label: 'Plan Changed' },
  { value: 'PAYMENT_SUCCEEDED',        label: 'Payment Succeeded' },
  { value: 'PAYMENT_FAILED',           label: 'Payment Failed' },
  // Captures
  { value: 'CAPTURE_TRIGGERED',        label: 'Capture Triggered' },
  // Documents / Reports
  { value: 'DOCUMENT_UPLOADED',        label: 'Document Uploaded' },
  { value: 'DOCUMENT_DELETED',         label: 'Document Deleted' },
  { value: 'REPORT_GENERATED',         label: 'Report Generated' },
  // Organization
  { value: 'ORG_CREATED',              label: 'Org Created' },
  { value: 'ORG_DELETED',              label: 'Org Deleted' },
  { value: 'ORG_MEMBER_REMOVED',       label: 'Member Removed' },
  { value: 'ORG_MEMBER_ROLE_CHANGED',  label: 'Role Changed' },
  { value: 'ORG_INVITATION_SENT',      label: 'Invitation Sent' },
  // Admin
  { value: 'USER_ADMIN_GRANTED',       label: 'Admin Granted' },
  { value: 'USER_ADMIN_REVOKED',       label: 'Admin Revoked' },
  { value: 'USER_TIER_ASSIGNED',       label: 'Tier Assigned' },
  { value: 'USER_DELETED_BY_ADMIN',    label: 'User Deleted (Admin)' },
  { value: 'TIER_CREATED',             label: 'Tier Created' },
  { value: 'TIER_UPDATED',             label: 'Tier Updated' },
  { value: 'TIER_DEACTIVATED',         label: 'Tier Deactivated' },
  // Promotions
  { value: 'PROMO_CREATED',            label: 'Promo Created' },
  { value: 'PROMO_UPDATED',            label: 'Promo Updated' },
  { value: 'PROMO_DEACTIVATED',        label: 'Promo Deactivated' },
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
  const headers = ['Date', 'Action', 'Entity Type', 'Entity ID', 'Summary', 'Performed By', 'Email', 'Status', 'Source', 'IP Address', 'Before', 'After']
  const lines = [headers.map(escapeCsv).join(',')]
  for (const log of rows) {
    const entityType = log.entity_type ?? log.resource_type ?? ''
    lines.push([
      new Date(log.created_at).toLocaleString(),
      log.action,
      RESOURCE_LABEL[entityType] ?? entityType,
      log.entity_id ?? '',
      buildSummary(log),
      log.actor_name ?? '',
      log.actor_email ?? '',
      log.status ?? '',
      log.source ?? '',
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

// ── Searchable select ────────────────────────────────────────────────────────

interface SelectOption { value: string; label: string }

function SearchableSelect({
  options,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  options: SelectOption[]
  value: string
  onChange: (val: string) => void
  placeholder?: string
  disabled?: boolean
}) {
  const [query, setQuery]     = useState('')
  const [open, setOpen]       = useState(false)
  const [focused, setFocused] = useState(-1)
  const containerRef          = useRef<HTMLDivElement>(null)
  const inputRef              = useRef<HTMLInputElement>(null)
  const listRef               = useRef<HTMLUListElement>(null)

  const selectedLabel = options.find(o => o.value === value)?.label ?? ''

  const filtered = query
    ? options.filter(o =>
        o.label.toLowerCase().includes(query.toLowerCase()) ||
        o.value.toLowerCase().includes(query.toLowerCase())
      )
    : options

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false); setQuery(''); setFocused(-1)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    if (focused >= 0 && listRef.current) {
      (listRef.current.children[focused] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' })
    }
  }, [focused])

  function select(opt: SelectOption) {
    onChange(opt.value); setOpen(false); setQuery(''); setFocused(-1)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) { if (e.key === 'ArrowDown') { setOpen(true); setFocused(0) } ; return }
    if (e.key === 'Escape')    { setOpen(false); setQuery(''); setFocused(-1); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocused(f => Math.min(f + 1, filtered.length - 1)); return }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setFocused(f => Math.max(f - 1, 0)); return }
    if (e.key === 'Enter' && focused >= 0) { e.preventDefault(); select(filtered[focused]); return }
  }

  return (
    <div ref={containerRef} className="audit-ss-wrap" onKeyDown={handleKeyDown}>
      <input
        ref={inputRef}
        className="audit-filter-control"
        style={{ cursor: open ? 'text' : 'pointer' }}
        value={open ? query : selectedLabel}
        placeholder={placeholder ?? 'All'}
        disabled={disabled}
        autoComplete="off"
        onChange={e => { setOpen(true); setQuery(e.target.value); setFocused(0) }}
        onFocus={() => { setOpen(true); setQuery('') }}
      />

      {open && (
        <ul ref={listRef} className="audit-ss-dropdown" role="listbox">
          {filtered.length === 0 ? (
            <li className="audit-ss-no-results">No matches</li>
          ) : filtered.map((opt, idx) => (
            <li
              key={opt.value}
              role="option"
              aria-selected={opt.value === value}
              className={[
                'audit-ss-option',
                opt.value === value ? 'audit-ss-option--active'  : '',
                idx === focused     ? 'audit-ss-option--focused' : '',
              ].filter(Boolean).join(' ')}
              onMouseDown={e => { e.preventDefault(); select(opt) }}
              onMouseEnter={() => setFocused(idx)}
            >
              {opt.label}
            </li>
          ))}
        </ul>
      )}

      {!open && value && (
        <button className="audit-filter-clear-btn" onClick={() => onChange('')} title="Clear filter">
          <X size={11} strokeWidth={2.5} />
        </button>
      )}
    </div>
  )
}

// ── Component ────────────────────────────────────────────────────────────────

export default function AuditLogs() {
  const [logs, setLogs]                   = useState<AuditLog[]>([])
  const [total, setTotal]                 = useState(0)
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState<string | null>(null)
  const [resourceType, setResourceType]   = useState('')
  const [action, setAction]               = useState('')
  const [selectedEmployerId, setSelectedEmployerId] = useState<number | ''>('')
  const [selectedPositionId, setSelectedPositionId] = useState<number | ''>('')
  const [dateFrom, setDateFrom]           = useState('')
  const [dateTo, setDateTo]               = useState('')
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
      entity_type:    resourceType    || undefined,
      action:         action          || undefined,
      employer_id:    selectedEmployerId !== '' ? selectedEmployerId : undefined,
      position_id:    selectedPositionId !== '' ? selectedPositionId : undefined,
      date_from:      dateFrom ? new Date(dateFrom).toISOString() : undefined,
      date_to:        dateTo   ? new Date(dateTo + 'T23:59:59').toISOString() : undefined,
      limit:          PAGE_SIZE,
      offset:         (p - 1) * PAGE_SIZE,
    })
      .then(({ data, total: t }: AuditLogPage) => {
        if (gen !== fetchGen.current) return  // stale response — newer fetch in flight
        setLogs(data)
        setTotal(t)
        setHasMore((p - 1) * PAGE_SIZE + data.length < t)
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
      const { data: allRows } = await auditApi.list({
        entity_type:   resourceType    || undefined,
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
              <SearchableSelect
                options={[
                  { value: '', label: loadingEmployers ? 'Loading…' : 'All Employers' },
                  ...employerList.map(emp => ({
                    value: String(emp.id),
                    label: emp.business_name + (emp.is_active ? '' : ' (inactive)'),
                  }))
                ]}
                value={selectedEmployerId === '' ? '' : String(selectedEmployerId)}
                onChange={v => setSelectedEmployerId(v === '' ? '' : Number(v))}
                placeholder="All Employers"
                disabled={loadingEmployers}
              />
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
              <SearchableSelect
                options={ACTION_FILTER_OPTIONS}
                value={action}
                onChange={setAction}
                placeholder="All Actions"
              />
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
                  background: getActionMeta(action).bg,
                  borderColor: getActionMeta(action).border,
                  color: getActionMeta(action).color,
                }}>
                  {getActionMeta(action).label}
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
              {loading ? '…' : `${total.toLocaleString()} result${total !== 1 ? 's' : ''}`}
              {(page > 1 || hasMore) && <> · page {page} of {Math.ceil(total / PAGE_SIZE) || 1}</>}
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
              {action && <> · Action: {getActionMeta(action).label}</>}
              {dateFrom && <> · From: {dateFrom}</>}
              {dateTo && <> · To: {dateTo}</>}
            </div>
          </div>

          <div className="audit-table-wrap">
            {logs.length === 0 ? (
              <div className="audit-empty">
                <FileText size={36} strokeWidth={1.5} color="#d1d5db" />
                <span>No activity found for the selected filters.</span>
              </div>
            ) : (
              <table className="audit-table">
                <thead>
                  <tr>
                    <th className="audit-th">Date &amp; Time</th>
                    <th className="audit-th">Action</th>
                    <th className="audit-th">Resource</th>
                    <th className="audit-th audit-th-desc">Description</th>
                    <th className="audit-th">Performed By</th>
                    <th className="audit-th">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => {
                    const entityType  = log.entity_type ?? log.resource_type ?? ''
                    const meta        = getActionMeta(log.action)
                    const IconComp    = RESOURCE_ICON[entityType] ?? FileText
                    const iconColor   = RESOURCE_ICON_COLOR[entityType] ?? '#6b7280'
                    const iconBg      = iconColor + '18'
                    const resLabel    = RESOURCE_LABEL[entityType] ?? entityType
                    const summary     = buildSummary(log)
                    const hasChanges  = !!(log.old_data || log.new_data)
                    const dt          = new Date(log.created_at)
                    const dateStr     = dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                    const timeStr     = dt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
                    const actionLabel = log.action.replace(/_/g, '\u00a0')  // non-breaking spaces keep the badge from splitting oddly

                    return (
                      <Fragment key={log.id}>
                        <tr className={['audit-tr', hasChanges ? 'audit-tr--has-detail' : ''].filter(Boolean).join(' ')}>
                          {/* Date / Time */}
                          <td className="audit-td audit-td-time">
                            <div className="audit-date">{dateStr}</div>
                            <div className="audit-time-sm">{timeStr}</div>
                          </td>

                          {/* Action badge */}
                          <td className="audit-td audit-td-action">
                            <span
                              className="audit-action-pill"
                              style={{ background: meta.bg, color: meta.color, borderColor: meta.border }}
                              title={log.action}
                            >
                              {actionLabel}
                            </span>
                          </td>

                          {/* Resource type + entity */}
                          <td className="audit-td audit-td-resource">
                            <div className="audit-res-cell">
                              <span className="audit-res-icon" style={{ background: iconBg, color: iconColor }}>
                                <IconComp size={13} strokeWidth={2} />
                              </span>
                              <div className="audit-res-info">
                                <div className="audit-res-type">{resLabel}</div>
                                {(log.entity_label || log.entity_id) && (
                                  <div className="audit-res-sub">
                                    {log.entity_label ?? `#${log.entity_id}`}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Description */}
                          <td className="audit-td audit-td-desc">
                            <span className="audit-summary-text">{summary}</span>
                          </td>

                          {/* Performed By */}
                          <td className="audit-td audit-td-who">
                            {log.actor_type === 'system' ? (
                              <div className="audit-actor-system">
                                <Monitor size={11} strokeWidth={2} />
                                System
                              </div>
                            ) : log.actor_name ? (
                              <>
                                <div className="audit-actor-name">{log.actor_name}</div>
                                <div className="audit-actor-email">{log.actor_email}</div>
                              </>
                            ) : (
                              <div className="audit-actor-email">
                                {log.actor_id ? `User\u00a0#${log.actor_id}` : '—'}
                              </div>
                            )}
                          </td>

                          {/* Status + IP */}
                          <td className="audit-td audit-td-status">
                            <span className={`audit-status-badge audit-status-${log.status ?? 'success'}`}>
                              {log.status === 'failed' ? 'Failed' : 'OK'}
                            </span>
                            {log.source && log.source !== 'api' && log.source !== 'web' && (
                              <div className="audit-source-tag">{log.source}</div>
                            )}
                            {log.ip_address && (
                              <div className="audit-ip-sm" title={`IP: ${log.ip_address}`}>
                                {log.ip_address}
                              </div>
                            )}
                          </td>

                        </tr>

                        {/* Always-visible before/after detail row */}
                        {hasChanges && (
                          <tr className="audit-tr-detail">
                            <td colSpan={6} className="audit-td-detail">
                              <div className="audit-detail-inner">
                                <div className="audit-change-grid">
                                  {log.old_data && (
                                    <ChangeCard label="Before" data={log.old_data as Record<string, unknown>} variant="old" />
                                  )}
                                  {log.new_data && (
                                    <ChangeCard label="After"  data={log.new_data as Record<string, unknown>} variant="new" />
                                  )}
                                </div>
                                {(log.ip_address || log.user_agent) && (
                                  <div className="audit-detail-meta">
                                    {log.ip_address && (
                                      <span>
                                        <Monitor size={11} strokeWidth={2} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                                        IP: <strong>{log.ip_address}</strong>
                                      </span>
                                    )}
                                    {log.user_agent && (
                                      <span className="audit-detail-ua">{log.user_agent}</span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            )}
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


