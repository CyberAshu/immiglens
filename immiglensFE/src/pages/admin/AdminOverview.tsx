import { useEffect, useState } from 'react'
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import {
  Users, Building2, Briefcase, Globe, Camera,
  Activity, CheckCircle2, AlertTriangle, XCircle, Layers,
} from 'lucide-react'
import { admin as adminApi } from '../../api'
import type { AdminGlobalStats, AdminUserRecord } from '../../types'

const CHART_STYLE = {
  contentStyle: {
    background: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    fontSize: 12,
    boxShadow: '0 4px 16px rgba(11,31,59,0.08)',
  },
  itemStyle: { color: '#374151' },
  cursor: { fill: 'rgba(11,31,59,0.04)' },
}

/* ── Sub-components ───────────────────────────────────────── */

function KpiCard({
  label, value, sub, accentColor, iconBg, icon, badge,
}: {
  label: string
  value: string | number
  sub?: string
  accentColor: string
  iconBg: string
  icon: React.ReactNode
  badge?: { text: string; type: 'success' | 'warn' | 'danger' | 'neutral' }
}) {
  return (
    <div className="ov2-kpi-card" style={{ borderBottomColor: accentColor }}>
      <div className="ov2-kpi-top">
        <div className="ov2-kpi-icon" style={{ background: iconBg, color: accentColor }}>
          {icon}
        </div>
        {badge && (
          <span className={`ov2-kpi-badge ov2-kpi-badge--${badge.type}`}>
            {badge.text}
          </span>
        )}
      </div>
      <div className="ov2-kpi-value" style={{ color: accentColor }}>{value}</div>
      <div className="ov2-kpi-label">{label}</div>
      {sub && <div className="ov2-kpi-sub">{sub}</div>}
    </div>
  )
}

function CardHeader({ title, accent, note }: { title: string; accent: string; note?: string }) {
  return (
    <div className="ov2-card-header">
      <div className="ov2-section-header">
        <span className="ov2-section-accent" style={{ background: accent }} />
        <span className="ov2-section-title">{title}</span>
      </div>
      {note && <span className="ov2-card-note">{note}</span>}
    </div>
  )
}

function StatRow({
  label, value, total, color, warn,
}: {
  label: string; value: number; total?: number; color: string; warn?: boolean
}) {
  const pct = total && total > 0 ? Math.round(value / total * 100) : null
  return (
    <div className="ov2-stat-row">
      <span className="ov2-stat-dot" style={{ background: color }} />
      <div className="ov2-stat-info">
        <span className="ov2-stat-label">{label}</span>
        {pct !== null && (
          <div className="ov2-stat-bar-wrap">
            <div className="ov2-stat-bar">
              <div className="ov2-stat-bar-fill" style={{ width: `${pct}%`, background: color }} />
            </div>
            <span className="ov2-stat-pct">{pct}%</span>
          </div>
        )}
      </div>
      <span className={`ov2-stat-value${warn ? ' ov2-stat-value--warn' : ''}`}>{value}</span>
    </div>
  )
}

/* ── Main component ──────────────────────────────────────── */

export default function AdminOverview() {
  const [stats, setStats] = useState<AdminGlobalStats | null>(null)
  const [users, setUsers] = useState<AdminUserRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([adminApi.stats(), adminApi.users()])
      .then(([s, u]) => { setStats(s); setUsers(u) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="ov2-loading">
      <div className="ov2-spinner" />
      <span>Loading overview…</span>
    </div>
  )

  if (!stats) return (
    <div className="ov2-error">
      <XCircle size={32} strokeWidth={1.5} />
      <span>{error ?? 'Failed to load dashboard data.'}</span>
    </div>
  )

  /* ── Derived values ── */
  const adminCount        = users.filter(u => u.is_admin).length
  const regularCount      = users.length - adminCount
  const captureTotal      = stats.total_screenshots + stats.failed_screenshots
  const successRate       = captureTotal > 0 ? Math.round(stats.total_screenshots / captureTotal * 100) : null
  const health            = successRate === null ? 'neutral' : successRate >= 90 ? 'good' : successRate >= 70 ? 'warn' : 'bad'
  const inactiveEmployers = stats.total_employers - stats.active_employers
  const inactivePositions = stats.total_positions - stats.active_positions
  const inactiveBoards    = stats.total_job_urls - stats.active_postings

  const healthConfig = {
    good:    { label: 'Healthy',  color: '#16a34a', icon: <CheckCircle2 size={13} strokeWidth={2.5} />, bg: '#f0fdf4', border: '#86efac' },
    warn:    { label: 'Degraded', color: '#d97706', icon: <AlertTriangle size={13} strokeWidth={2.5} />, bg: '#fffbeb', border: '#fcd34d' },
    bad:     { label: 'Critical', color: '#dc2626', icon: <XCircle size={13} strokeWidth={2.5} />, bg: '#fff5f5', border: '#fecaca' },
    neutral: { label: 'No Data',  color: '#6b7280', icon: <Activity size={13} strokeWidth={2.5} />, bg: '#f9fafb', border: '#e5e7eb' },
  }[health]

  /* ── Chart data ── */
  const capturePie = [
    { name: 'Successful', value: stats.total_screenshots,  color: '#22c55e' },
    { name: 'Failed',     value: stats.failed_screenshots, color: '#ef4444' },
    { name: 'Pending',    value: stats.pending_rounds,     color: '#94a3b8' },
  ].filter(d => d.value > 0)

  const rolePie = [
    { name: 'Admins',   value: adminCount,   color: '#6366f1' },
    { name: 'Regular',  value: regularCount, color: '#22d3ee' },
  ].filter(d => d.value > 0)

  const activityBar = users.slice(0, 12).map(u => ({
    name:        u.full_name.split(' ')[0],
    Employers:   u.employers,
    Positions:   u.positions,
    Screenshots: u.screenshots,
  }))

  const employerBar = users
    .filter(u => u.employers > 0)
    .sort((a, b) => b.employers - a.employers)
    .slice(0, 10)
    .map(u => ({ name: u.full_name.split(' ')[0], Employers: u.employers }))

  const now = new Date().toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="ov2-root">

      {/* ── Page Header ───────────────────────────────────── */}
      <div className="ov2-header">
        <div className="ov2-header-left">
          <h1 className="ov2-title">Admin Overview</h1>
          <p className="ov2-subtitle">Platform health, metrics, and user activity at a glance</p>
        </div>
        <div className="ov2-header-right">
          <div
            className="ov2-health-badge"
            style={{ background: healthConfig.bg, borderColor: healthConfig.border, color: healthConfig.color }}
          >
            {healthConfig.icon}
            <span>System {healthConfig.label}</span>
            {successRate !== null && <span className="ov2-health-rate">· {successRate}% success</span>}
          </div>
          <span className="ov2-last-updated">Updated {now}</span>
        </div>
      </div>

      {/* ── Scrollable body ───────────────────────────────── */}
      <div className="ov2-body">

        {/* ── KPI Cards: 3 × 2 grid ──────────────────────── */}
        <div className="ov2-kpi-grid">
          <KpiCard
            label="Total Users"
            value={stats.total_users}
            sub={`${adminCount} admin · ${regularCount} regular`}
            accentColor="#6366f1"
            iconBg="rgba(99,102,241,0.09)"
            icon={<Users size={18} strokeWidth={2} />}
          />
          <KpiCard
            label="Active Employers"
            value={stats.active_employers}
            sub={`${stats.total_employers} total${inactiveEmployers > 0 ? ` · ${inactiveEmployers} inactive` : ' · all active'}`}
            accentColor="#0ea5e9"
            iconBg="rgba(14,165,233,0.09)"
            icon={<Building2 size={18} strokeWidth={2} />}
            badge={inactiveEmployers > 0 ? { text: `${inactiveEmployers} inactive`, type: 'warn' } : undefined}
          />
          <KpiCard
            label="Active Positions"
            value={stats.active_positions}
            sub={`${stats.total_positions} total${inactivePositions > 0 ? ` · ${inactivePositions} inactive` : ' · all active'}`}
            accentColor="#8b5cf6"
            iconBg="rgba(139,92,246,0.09)"
            icon={<Briefcase size={18} strokeWidth={2} />}
            badge={inactivePositions > 0 ? { text: `${inactivePositions} inactive`, type: 'warn' } : undefined}
          />
          <KpiCard
            label="Active Job Boards"
            value={stats.active_postings}
            sub={`${stats.total_job_urls} total${inactiveBoards > 0 ? ` · ${inactiveBoards} inactive` : ' · all active'}`}
            accentColor="#f59e0b"
            iconBg="rgba(245,158,11,0.09)"
            icon={<Globe size={18} strokeWidth={2} />}
            badge={inactiveBoards > 0 ? { text: `${inactiveBoards} inactive`, type: 'warn' } : undefined}
          />
          <KpiCard
            label="Total Screenshots"
            value={stats.total_screenshots}
            sub={`${stats.failed_screenshots} failed · ${stats.total_capture_rounds} rounds`}
            accentColor="#22c55e"
            iconBg="rgba(34,197,94,0.09)"
            icon={<Camera size={18} strokeWidth={2} />}
            badge={stats.failed_screenshots > 0
              ? { text: `${stats.failed_screenshots} failed`, type: 'danger' }
              : { text: 'All clear', type: 'success' }}
          />
          <KpiCard
            label="Capture Success Rate"
            value={successRate !== null ? `${successRate}%` : '—'}
            sub={captureTotal > 0 ? `${captureTotal} total captures · ${stats.completed_rounds} completed rounds` : 'No capture data yet'}
            accentColor={healthConfig.color}
            iconBg={healthConfig.bg}
            icon={<Layers size={18} strokeWidth={2} />}
            badge={successRate !== null ? {
              text: healthConfig.label,
              type: health === 'good' ? 'success' : health === 'warn' ? 'warn' : 'danger',
            } : undefined}
          />
        </div>

        {/* ── Charts + Stats panel ────────────────────────── */}
        <div className="ov2-content-grid">

          {/* Left: charts column */}
          <div className="ov2-charts-col">

            {/* Activity per user — bar chart */}
            {activityBar.length > 0 && (
              <div className="ov2-card">
                <CardHeader title="Activity per User" accent="#6366f1" note="Employers · Positions · Screenshots" />
                <div className="ov2-card-body">
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={activityBar} barCategoryGap="32%" barGap={2}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip {...CHART_STYLE} />
                      <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11, color: '#6b7280', paddingTop: 4 }} />
                      <Bar dataKey="Employers"   fill="#6366f1" radius={[3,3,0,0]} />
                      <Bar dataKey="Positions"   fill="#22d3ee" radius={[3,3,0,0]} />
                      <Bar dataKey="Screenshots" fill="#22c55e" radius={[3,3,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Donut charts row */}
            <div className="ov2-donuts-row">
              {capturePie.length > 0 && (
                <div className="ov2-card">
                  <CardHeader title="Capture Status" accent="#22c55e" />
                  <div className="ov2-card-body ov2-card-body--chart">
                    <ResponsiveContainer width="100%" height={186}>
                      <PieChart>
                        <Pie data={capturePie} cx="50%" cy="46%" innerRadius={46} outerRadius={70} paddingAngle={3} dataKey="value">
                          {capturePie.map(e => <Cell key={e.name} fill={e.color} />)}
                        </Pie>
                        <Tooltip formatter={(v: any, n: any) => [`${v ?? 0}`, n]} {...CHART_STYLE} />
                        <Legend iconType="circle" iconSize={7}
                          formatter={(v: any, e: any) => `${v} (${e.payload?.value ?? 0})`}
                          wrapperStyle={{ fontSize: 11, color: '#6b7280' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
              {rolePie.length > 0 && (
                <div className="ov2-card">
                  <CardHeader title="User Roles" accent="#6366f1" />
                  <div className="ov2-card-body ov2-card-body--chart">
                    <ResponsiveContainer width="100%" height={186}>
                      <PieChart>
                        <Pie data={rolePie} cx="50%" cy="46%" innerRadius={46} outerRadius={70} paddingAngle={3} dataKey="value">
                          {rolePie.map(e => <Cell key={e.name} fill={e.color} />)}
                        </Pie>
                        <Tooltip formatter={(v: any, n: any) => [`${v ?? 0}`, n]} {...CHART_STYLE} />
                        <Legend iconType="circle" iconSize={7}
                          formatter={(v: any, e: any) => `${v} (${e.payload?.value ?? 0})`}
                          wrapperStyle={{ fontSize: 11, color: '#6b7280' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right: stats panel */}
          <div className="ov2-stats-col">

            <div className="ov2-card">
              <CardHeader title="Platform Content" accent="#0ea5e9" />
              <div className="ov2-card-body ov2-card-body--stats">
                <StatRow label="Active Employers"   value={stats.active_employers}  total={stats.total_employers}  color="#0ea5e9" />
                <StatRow label="Inactive Employers" value={inactiveEmployers}        total={stats.total_employers}  color="#f59e0b" warn={inactiveEmployers > 0} />
                <div className="ov2-stat-divider" />
                <StatRow label="Active Positions"   value={stats.active_positions}  total={stats.total_positions}  color="#8b5cf6" />
                <StatRow label="Inactive Positions" value={inactivePositions}        total={stats.total_positions}  color="#f59e0b" warn={inactivePositions > 0} />
                <div className="ov2-stat-divider" />
                <StatRow label="Active Job Boards"  value={stats.active_postings}   total={stats.total_job_urls}   color="#f59e0b" />
                <StatRow label="Inactive Boards"    value={inactiveBoards}          total={stats.total_job_urls}   color="#f87171" warn={inactiveBoards > 0} />
              </div>
            </div>

            <div className="ov2-card">
              <CardHeader title="Capture Performance" accent="#22c55e" />
              <div className="ov2-card-body ov2-card-body--stats">
                <StatRow label="Successful"      value={stats.total_screenshots}  total={captureTotal} color="#22c55e" />
                <StatRow label="Failed"          value={stats.failed_screenshots} total={captureTotal} color="#ef4444" warn={stats.failed_screenshots > 0} />
                {stats.pending_rounds > 0 && (
                  <StatRow label="Pending Rounds" value={stats.pending_rounds} total={stats.total_capture_rounds} color="#94a3b8" />
                )}
                <div className="ov2-stat-divider" />
                <StatRow label="Completed Rounds" value={stats.completed_rounds}  total={stats.total_capture_rounds} color="#6366f1" />
                <StatRow label="Total Rounds"     value={stats.total_capture_rounds} color="#e2e8f0" />
              </div>
            </div>

          </div>
        </div>

        {/* ── Employers per user (full-width horizontal bar) ─ */}
        {employerBar.length > 0 && (
          <div className="ov2-card">
            <CardHeader title="Employers per User" accent="#0ea5e9" note={`Top ${employerBar.length} users`} />
            <div className="ov2-card-body">
              <ResponsiveContainer width="100%" height={Math.max(110, employerBar.length * 34)}>
                <BarChart data={employerBar} layout="vertical" barCategoryGap="28%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} width={80} />
                  <Tooltip {...CHART_STYLE} />
                  <Bar dataKey="Employers" fill="#0ea5e9" radius={[0,4,4,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
