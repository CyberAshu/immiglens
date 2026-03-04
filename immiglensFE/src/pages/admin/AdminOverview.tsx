import { useEffect, useState } from 'react'
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { admin as adminApi } from '../../api'
import type { AdminGlobalStats, AdminUserRecord } from '../../types'

const CHART_STYLE = {
  contentStyle: { background: '#13131f', border: '1px solid #2a2a3e', borderRadius: 8, fontSize: 12 },
  itemStyle: { color: '#c8c8d8' },
  cursor: { fill: 'rgba(99,102,241,0.06)' },
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="ov-section-label">{children}</div>
  )
}

function HeroKPI({ label, value, accent, sub }: { label: string; value: string | number; accent: string; sub?: string }) {
  return (
    <div className="ov-hero-kpi" style={{ borderTopColor: accent }}>
      <div className="ov-hero-value" style={{ color: accent }}>{value}</div>
      {sub && <div className="ov-hero-sub">{sub}</div>}
      <div className="ov-hero-label">{label}</div>
    </div>
  )
}

function MetricTile({ label, value, accent, warn }: { label: string; value: string | number; accent: string; warn?: boolean }) {
  return (
    <div className={`ov-metric-tile${warn ? ' ov-metric-tile--warn' : ''}`}>
      <div className="ov-metric-dot" style={{ background: accent }} />
      <div className="ov-metric-body">
        <div className="ov-metric-value" style={{ color: warn ? '#f87171' : '#fff' }}>{value}</div>
        <div className="ov-metric-label">{label}</div>
      </div>
    </div>
  )
}

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
    <div className="ov-loading">
      <div className="ov-loading-spinner" />
      <span>Loading overview…</span>
    </div>
  )

  if (!stats) return <div className="error-msg" style={{ margin: '2rem' }}>{error ?? 'Failed to load.'}</div>

  const adminCount  = users.filter(u => u.is_admin).length
  const regularCount = users.length - adminCount
  const total       = stats.total_screenshots + stats.failed_screenshots
  const successRate = total > 0 ? Math.round(stats.total_screenshots / total * 100) : null
  const health      = successRate === null ? 'neutral' : successRate >= 90 ? 'good' : successRate >= 70 ? 'warn' : 'bad'

  /* ── Chart data ── */
  const capturePie = [
    { name: 'Successful', value: stats.total_screenshots,  color: '#22c55e' },
    { name: 'Failed',     value: stats.failed_screenshots, color: '#ef4444' },
    { name: 'Pending',    value: Math.max(0, stats.total_capture_rounds * 2 - total), color: '#6366f1' },
  ].filter(d => d.value > 0)

  const rolePie = [
    { name: 'Admins',   value: adminCount,   color: '#a78bfa' },
    { name: 'Regular',  value: regularCount, color: '#22d3ee' },
  ].filter(d => d.value > 0)

  const activityBar = users.map(u => ({
    name:         u.full_name.split(' ')[0],
    Employers:    u.employers,
    Positions:    u.positions,
    Screenshots:  u.screenshots,
  }))

  const employerBar = users
    .filter(u => u.employers > 0)
    .sort((a, b) => b.employers - a.employers)
    .map(u => ({ name: u.full_name.split(' ')[0], Employers: u.employers }))

  const healthColors = { good: '#22c55e', warn: '#f59e0b', bad: '#ef4444', neutral: '#6366f1' }
  const healthColor  = healthColors[health]

  return (
    <div className="ov-root">

      {/* ── System Health Banner ─────────────────────────── */}
      <div className={`ov-health-banner ov-health-banner--${health}`}>
        <span className="ov-health-dot" style={{ background: healthColor }} />
        <span className="ov-health-text">
          System Health:&nbsp;
          <strong style={{ color: healthColor }}>
            {health === 'good' ? 'Healthy' : health === 'warn' ? 'Degraded' : health === 'bad' ? 'Critical' : 'No Data'}
          </strong>
          {successRate !== null && (
            <span className="ov-health-sub"> · {successRate}% capture success rate · {stats.total_capture_rounds} rounds total</span>
          )}
        </span>
        {error && <span className="ov-health-error">⚠ {error}</span>}
      </div>

      <div className="ov-body">

        {/* ── Hero KPIs ────────────────────────────────────── */}
        <div className="ov-hero-row">
          <HeroKPI label="Total Users"     value={stats.total_users}       accent="#6366f1" sub={`${adminCount} admin · ${regularCount} regular`} />
          <HeroKPI label="Total Employers" value={stats.total_employers}   accent="#22d3ee" />
          <HeroKPI label="Screenshots"     value={stats.total_screenshots} accent="#22c55e" />
          <HeroKPI label="Success Rate"    value={successRate !== null ? `${successRate}%` : '—'} accent={healthColor} sub={stats.failed_screenshots > 0 ? `${stats.failed_screenshots} failed` : 'No failures'} />
        </div>

        {/* ── Secondary metrics ────────────────────────────── */}
        <div className="ov-metrics-section">
          <div className="ov-metrics-group">
            <SectionLabel>Platform Content</SectionLabel>
            <div className="ov-metrics-row">
              <MetricTile label="Job Positions"  value={stats.total_positions}    accent="#a78bfa" />
              <MetricTile label="Job Board URLs" value={stats.total_job_postings} accent="#f59e0b" />
              <MetricTile label="Capture Rounds" value={stats.total_capture_rounds} accent="#38bdf8" />
              <MetricTile label="Completed"      value={stats.completed_rounds}   accent="#22c55e" />
            </div>
          </div>
          <div className="ov-metrics-group">
            <SectionLabel>Capture Performance</SectionLabel>
            <div className="ov-metrics-row">
              <MetricTile label="Total Captures"   value={total}                    accent="#6366f1" />
              <MetricTile label="Successful"        value={stats.total_screenshots} accent="#22c55e" />
              <MetricTile label="Failed"            value={stats.failed_screenshots} accent="#ef4444" warn={stats.failed_screenshots > 0} />
              <MetricTile label="Pending"           value={Math.max(0, stats.total_capture_rounds * 2 - total)} accent="#888" />
            </div>
          </div>
        </div>

        {/* ── Charts ───────────────────────────────────────── */}
        <div className="ov-charts-grid">

          {/* Left col: two small donuts stacked */}
          <div className="ov-charts-col-left">
            {capturePie.length > 0 && (
              <div className="ov-chart-card">
                <div className="ov-chart-title">Capture Status</div>
                <ResponsiveContainer width="100%" height={190}>
                  <PieChart>
                    <Pie data={capturePie} cx="50%" cy="48%" innerRadius={48} outerRadius={72} paddingAngle={3} dataKey="value">
                      {capturePie.map(e => <Cell key={e.name} fill={e.color} />)}
                    </Pie>
                    <Tooltip formatter={(v: number, n: string) => [`${v}`, n]} {...CHART_STYLE} />
                    <Legend iconType="circle" iconSize={8}
                      formatter={(v, e: { payload?: { value: number } }) => `${v} (${e.payload?.value ?? 0})`}
                      wrapperStyle={{ fontSize: 11, color: '#888', paddingTop: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
            {rolePie.length > 0 && (
              <div className="ov-chart-card">
                <div className="ov-chart-title">User Roles</div>
                <ResponsiveContainer width="100%" height={190}>
                  <PieChart>
                    <Pie data={rolePie} cx="50%" cy="48%" innerRadius={48} outerRadius={72} paddingAngle={3} dataKey="value">
                      {rolePie.map(e => <Cell key={e.name} fill={e.color} />)}
                    </Pie>
                    <Tooltip formatter={(v: number, n: string) => [`${v}`, n]} {...CHART_STYLE} />
                    <Legend iconType="circle" iconSize={8}
                      formatter={(v, e: { payload?: { value: number } }) => `${v} (${e.payload?.value ?? 0})`}
                      wrapperStyle={{ fontSize: 11, color: '#888', paddingTop: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Right col: activity bar */}
          {activityBar.length > 0 && (
            <div className="ov-chart-card ov-chart-card--tall">
              <div className="ov-chart-title">Activity per User</div>
              <ResponsiveContainer width="100%" height={420}>
                <BarChart data={activityBar} barCategoryGap="35%" barGap={3}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a1a2a" />
                  <XAxis dataKey="name" tick={{ fill: '#666', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#666', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip cursor={CHART_STYLE.cursor} contentStyle={CHART_STYLE.contentStyle} itemStyle={CHART_STYLE.itemStyle} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: '#888' }} />
                  <Bar dataKey="Employers"   fill="#6366f1" radius={[4,4,0,0]} />
                  <Bar dataKey="Positions"   fill="#22d3ee" radius={[4,4,0,0]} />
                  <Bar dataKey="Screenshots" fill="#22c55e" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* ── Employers per user (full-width bar) ─────────── */}
        {employerBar.length > 0 && (
          <div className="ov-chart-card" style={{ marginTop: '1rem' }}>
            <div className="ov-chart-title">Employers per User</div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={employerBar} layout="vertical" barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a2a" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#666', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#aaa', fontSize: 11 }} axisLine={false} tickLine={false} width={80} />
                <Tooltip cursor={CHART_STYLE.cursor} contentStyle={CHART_STYLE.contentStyle} itemStyle={CHART_STYLE.itemStyle} />
                <Bar dataKey="Employers" fill="#22d3ee" radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

      </div>
    </div>
  )
}
