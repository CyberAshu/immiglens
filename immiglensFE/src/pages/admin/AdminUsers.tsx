import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Users, ShieldCheck, CreditCard, UserX,
  Search, Building2, Briefcase, Camera, ChevronRight, ChevronDown, X,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { admin as adminApi } from '../../api'
import { useConfirm } from '../../components/ConfirmModal'
import UserDrawer from '../../components/UserDrawer'
import type { AdminUserRecord, SubscriptionTier } from '../../types'

const PAGE_SIZE = 25

/* ── Stat Card (reuses ov2 design system) ─────────────────── */
function StatCard({ label, value, icon, accent, iconBg }: {
  label: string; value: number; icon: React.ReactNode; accent: string; iconBg: string
}) {
  return (
    <div className="ov2-kpi-card" style={{ borderBottomColor: accent }}>
      <div className="ov2-kpi-top">
        <div className="ov2-kpi-icon" style={{ background: iconBg, color: accent }}>
          {icon}
        </div>
      </div>
      <div className="ov2-kpi-value" style={{ color: accent }}>{value}</div>
      <div className="ov2-kpi-label">{label}</div>
    </div>
  )
}

/* ── Plan Filter Dropdown ─────────────────────────────────── */
function PlanDropdown({ value, onChange, tiers, users }: {
  value: string
  onChange: (v: string) => void
  tiers: SubscriptionTier[]
  users: AdminUserRecord[]
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const freeCount = users.filter(u => !u.tier_id).length
  const activeTiers = tiers.filter(t => t.is_active)

  const items: { key: string; label: string; count: number; color: string }[] = [
    { key: 'all', label: 'All plans', count: users.length, color: '#0B1F3B' },
    { key: 'free', label: 'Free', count: freeCount, color: '#6b7280' },
    ...activeTiers.map((t, i) => {
      const colors = ['#16a34a', '#2563eb', '#7c3aed', '#ea580c', '#0891b2', '#c026d3']
      return {
        key: String(t.id),
        label: t.display_name,
        count: users.filter(u => u.tier_id === t.id).length,
        color: colors[i % colors.length],
      }
    }),
  ]

  const selected = items.find(i => i.key === value) ?? items[0]
  const isFiltered = value !== 'all'

  return (
    <div className="au-dropdown" ref={ref}>
      <button
        className={`au-dropdown-trigger ${isFiltered ? 'au-dropdown-trigger--active' : ''}`}
        onClick={() => setOpen(o => !o)}
      >
        {isFiltered && <span className="au-dropdown-dot" style={{ background: selected.color }} />}
        <span>{selected.label}</span>
        {isFiltered && (
          <span
            className="au-dropdown-clear"
            onClick={e => { e.stopPropagation(); onChange('all'); setOpen(false) }}
          >
            <X size={12} />
          </span>
        )}
        <ChevronDown size={14} className={`au-dropdown-arrow ${open ? 'au-dropdown-arrow--open' : ''}`} />
      </button>

      {open && (
        <div className="au-dropdown-menu">
          {items.map(item => (
            <button
              key={item.key}
              className={`au-dropdown-item ${value === item.key ? 'au-dropdown-item--active' : ''}`}
              onClick={() => { onChange(item.key); setOpen(false) }}
            >
              <span className="au-dropdown-dot" style={{ background: item.color }} />
              <span className="au-dropdown-item-label">{item.label}</span>
              <span className="au-dropdown-item-count">{item.count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── User Row Card ────────────────────────────────────────── */
function UserCard({ u, isSelected, onClick }: {
  u: AdminUserRecord; isSelected: boolean; onClick: () => void
}) {
  return (
    <div
      className={`au-user-card ${isSelected ? 'au-user-card--selected' : ''}`}
      onClick={onClick}
    >
      {/* Avatar */}
      <div className={`au-avatar ${u.is_admin ? 'au-avatar--admin' : ''}`}>
        {u.full_name.charAt(0).toUpperCase()}
      </div>

      {/* Identity */}
      <div className="au-user-identity">
        <div className="au-user-name">
          {u.full_name}
          {u.is_admin && <span className="au-role-tag au-role-tag--admin">Admin</span>}
        </div>
        <div className="au-user-email">{u.email}</div>
      </div>

      {/* Plan */}
      <div className="au-user-plan-col">
        <span className={`au-plan-badge ${u.tier_name ? 'au-plan-badge--paid' : ''}`}>
          {u.tier_name ?? 'Free'}
        </span>
        {u.tier_expires_at && (
          <span className="au-plan-expiry">exp {new Date(u.tier_expires_at).toLocaleDateString()}</span>
        )}
      </div>

      {/* Stats */}
      <div className="au-user-metrics">
        <div className="au-metric" title="Employers">
          <Building2 size={13} />
          <span>{u.employers}</span>
        </div>
        <div className="au-metric" title="Positions">
          <Briefcase size={13} />
          <span>{u.positions}</span>
        </div>
        <div className="au-metric" title="Screenshots">
          <Camera size={13} />
          <span>{u.screenshots}</span>
        </div>
      </div>

      {/* Date + Arrow */}
      <div className="au-user-meta">
        <span className="au-user-date">
          {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
        </span>
        <ChevronRight size={16} className="au-chevron" />
      </div>
    </div>
  )
}

/* ── Main Page ────────────────────────────────────────────── */
export default function AdminUsers() {
  const { user } = useAuth()
  const [users, setUsers]           = useState<AdminUserRecord[]>([])
  const [tiers, setTiers]           = useState<SubscriptionTier[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [search, setSearch]         = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'user'>('all')
  const [tierFilter, setTierFilter] = useState<string>('all')
  const [page, setPage]             = useState(1)
  const [selectedUser, setSelectedUser] = useState<AdminUserRecord | null>(null)
  const { confirmModal, askConfirm } = useConfirm()

  useEffect(() => {
    Promise.all([adminApi.users(), adminApi.allTiers()])
      .then(([u, t]) => { setUsers(u); setTiers(t) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  async function handleToggleAdmin(userId: number) {
    try {
      const updated = await adminApi.toggleAdmin(userId)
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_admin: updated.is_admin } : u))
      if (selectedUser?.id === userId) {
        setSelectedUser(prev => prev ? { ...prev, is_admin: updated.is_admin } : null)
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to toggle admin.')
    }
  }

  function handleUserUpdated(updated: AdminUserRecord) {
    setUsers(prev => prev.map(u => u.id === updated.id ? updated : u))
    setSelectedUser(updated)
  }

  function handleUserDeleted(userId: number) {
    setUsers(prev => prev.filter(u => u.id !== userId))
    setSelectedUser(null)
  }

  const filtered = useMemo(() => users.filter(u => {
    const q = search.toLowerCase()
    const matchSearch = !q || u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    const matchRole = roleFilter === 'all' || (roleFilter === 'admin' ? u.is_admin : !u.is_admin)
    const matchTier = tierFilter === 'all'
      || (tierFilter === 'free' && !u.tier_id)
      || (tierFilter !== 'free' && u.tier_id === Number(tierFilter))
    return matchSearch && matchRole && matchTier
  }), [users, search, roleFilter, tierFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  useMemo(() => { setPage(1) }, [search, roleFilter, tierFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="admin-loading">Loading users…</div>

  const adminCount = users.filter(u => u.is_admin).length
  const paidCount = users.filter(u => u.tier_id).length
  const freeCount = users.length - paidCount

  return (
    <div className="admin-page">
      {confirmModal}

      {/* ── Header ────────────────────────────────── */}
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">User Management</h1>
          <p className="admin-page-sub">Manage accounts, roles, and subscriptions</p>
        </div>
      </div>

      {error && <div className="admin-error" style={{ margin: '0 0 1rem' }}>{error}</div>}

      {/* ── KPI Cards ─────────────────────────────── */}
      <div className="ov2-kpi-grid" style={{ marginBottom: '1.5rem' }}>
        <StatCard
          label="Total Users"
          value={users.length}
          icon={<Users size={18} />}
          accent="#0B1F3B"
          iconBg="rgba(11,31,59,0.08)"
        />
        <StatCard
          label="Paid Plans"
          value={paidCount}
          icon={<CreditCard size={18} />}
          accent="#16a34a"
          iconBg="rgba(22,163,74,0.08)"
        />
        <StatCard
          label="Free Users"
          value={freeCount}
          icon={<UserX size={18} />}
          accent="#6b7280"
          iconBg="rgba(107,114,128,0.08)"
        />
        <StatCard
          label="Admins"
          value={adminCount}
          icon={<ShieldCheck size={18} />}
          accent="#7c3aed"
          iconBg="rgba(124,58,237,0.08)"
        />
      </div>

      {/* ── Filters ───────────────────────────────── */}
      <div className="au-filters">
        <div className="au-search-wrap">
          <Search size={15} className="au-search-icon" />
          <input
            className="au-search-input"
            placeholder="Search by name or email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="au-pill-group">
          {([['all', 'All'], ['admin', 'Admins'], ['user', 'Users']] as const).map(([val, label]) => (
            <button
              key={val}
              className={`au-pill ${roleFilter === val ? 'au-pill--active' : ''}`}
              onClick={() => setRoleFilter(val)}
            >
              {label}
            </button>
          ))}
        </div>
        <PlanDropdown
          value={tierFilter}
          onChange={setTierFilter}
          tiers={tiers}
          users={users}
        />
        {(roleFilter !== 'all' || tierFilter !== 'all' || search) && (
          <button
            className="au-clear-all"
            onClick={() => { setSearch(''); setRoleFilter('all'); setTierFilter('all') }}
          >
            <X size={12} />
            Clear filters
          </button>
        )}
        <span className="au-result-count">
          {filtered.length} user{filtered.length !== 1 ? 's' : ''}
          {totalPages > 1 && ` · page ${page}/${totalPages}`}
        </span>
      </div>

      {/* ── User List ─────────────────────────────── */}
      <div className="au-list-header">
        <span className="au-lh-user">User</span>
        <span className="au-lh-plan">Plan</span>
        <span className="au-lh-stats">Activity</span>
        <span className="au-lh-date">Joined</span>
      </div>

      <div className="au-user-list">
        {filtered.length === 0 && (
          <div className="au-empty">
            No users match your filters.
          </div>
        )}
        {paginated.map(u => (
          <UserCard
            key={u.id}
            u={u}
            isSelected={selectedUser?.id === u.id}
            onClick={() => setSelectedUser(u)}
          />
        ))}
      </div>

      {/* ── Pagination ────────────────────────────── */}
      {totalPages > 1 && (
        <div className="au-pagination">
          <button className="admin-btn admin-btn-secondary" onClick={() => setPage(p => p - 1)} disabled={page === 1}>
            ← Prev
          </button>
          <span className="au-page-info">Page {page} of {totalPages}</span>
          <button className="admin-btn admin-btn-secondary" onClick={() => setPage(p => p + 1)} disabled={page === totalPages}>
            Next →
          </button>
        </div>
      )}

      {/* ── User Drawer ───────────────────────────── */}
      {selectedUser && (
        <UserDrawer
          user={selectedUser}
          tiers={tiers}
          currentUserId={user?.id}
          onClose={() => setSelectedUser(null)}
          onUserUpdated={handleUserUpdated}
          onUserDeleted={handleUserDeleted}
          onToggleAdmin={handleToggleAdmin}
          askConfirm={askConfirm}
        />
      )}
    </div>
  )
}
