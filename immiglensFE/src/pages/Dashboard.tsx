import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import { stats as statsApi, subscriptions as subApi } from '../api'
import type { DashboardStats, UsageSummary } from '../types'
import { StatCard } from '../components/StatCard'

function planColor(name: string) {
  if (name === 'enterprise') return '#f59e0b'
  if (name === 'pro')        return '#a78bfa'
  return '#64748b'
}

const STAT_CARDS = (s: DashboardStats) => [
  { label: 'Employers',          value: s.total_employers,    accent: '#6366f1' },
  { label: 'Job Positions',      value: s.total_positions,    accent: '#22d3ee' },
  { label: 'Job Board URLs',     value: s.total_job_postings, accent: '#a78bfa' },
  { label: 'Rounds Completed',   value: `${s.completed_rounds}/${s.total_capture_rounds}`, accent: '#22c55e' },
  { label: 'Rounds Pending',     value: s.pending_rounds,     accent: '#f59e0b' },
  { label: 'Screenshots',        value: s.total_screenshots,  accent: '#38bdf8' },
  { label: 'Failed Captures',    value: s.failed_screenshots, accent: '#ef4444', warn: true },
]

export default function Dashboard() {
  const [statsData, setStatsData] = useState<DashboardStats | null>(null)
  const [planData, setPlanData]   = useState<UsageSummary | null>(null)
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    Promise.all([statsApi.get(), subApi.usage()])
      .then(([s, plan]) => { setStatsData(s); setPlanData(plan) })
      .finally(() => setLoading(false))
  }, [])

  const hasChartData = statsData && (
    statsData.capture_breakdown.some(c => c.value > 0) ||
    statsData.employer_breakdown.length > 0 ||
    statsData.rounds_timeline.length > 0
  )

  return (
    <div className="page">
      <div className="page-header">
        <h1>Dashboard</h1>
      </div>

      {/* ── Plan strip ────────────────── */}
      {planData && (
        <div className="plan-strip" style={{ borderLeftColor: planColor(planData.tier.name) }}>
          <div className="plan-strip-tier">
            <span className="plan-strip-dot" style={{ background: planColor(planData.tier.name) }} />
            {planData.tier.display_name}
          </div>
          <div className="plan-strip-divider" />
          <div className="plan-strip-stat">
            <span className="plan-strip-label">Employers</span>
            <strong>{planData.employers_used} / {planData.tier.max_employers === -1 ? '∞' : planData.tier.max_employers}</strong>
          </div>
          <div className="plan-strip-stat">
            <span className="plan-strip-label">Captures this month</span>
            <strong>{planData.captures_this_month} / {planData.tier.max_captures_per_month === -1 ? '∞' : planData.tier.max_captures_per_month}</strong>
          </div>
          <div className="plan-strip-stat">
            <span className="plan-strip-label">Positions tracked</span>
            <strong>{planData.positions_used}</strong>
          </div>
          <Link to="/subscriptions" className="plan-strip-link">View Plan →</Link>
        </div>
      )}

      {/* ── KPI cards ─────────────────────────── */}
      {statsData && (
        <div className="stats-grid">
          {STAT_CARDS(statsData).map(c => (
            <StatCard key={c.label} label={c.label} value={c.value} accent={c.accent} warn={c.warn} />
          ))}
        </div>
      )}

      {/* ── Charts row ────────────────────────── */}
      {hasChartData && statsData && (
        <div className="charts-grid">

          {/* Donut — capture status */}
          <div className="chart-card">
            <div className="chart-title">Capture Status</div>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={statsData.capture_breakdown.filter(d => d.value > 0)}
                  cx="50%" cy="50%"
                  innerRadius={58} outerRadius={88}
                  paddingAngle={3}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {statsData.capture_breakdown.map(entry => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#1a1a2e', border: '1px solid #2e2e44', borderRadius: 8, fontSize: 12 }}
                  itemStyle={{ color: '#e8e8f0' }}
                />
                <Legend
                  iconType="circle" iconSize={8}
                  wrapperStyle={{ fontSize: 11, color: '#aaa', paddingTop: 8 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Bar — per-employer breakdown */}
          {statsData.employer_breakdown.length > 0 && (
            <div className="chart-card chart-card--wide">
              <div className="chart-title">Screenshots by Employer</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={statsData.employer_breakdown} barGap={4} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                  <XAxis dataKey="name" tick={{ fill: '#888', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#888', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    cursor={{ fill: 'rgba(99,102,241,0.08)' }}
                    contentStyle={{ background: '#1a1a2e', border: '1px solid #2e2e44', borderRadius: 8, fontSize: 12 }}
                    itemStyle={{ color: '#e8e8f0' }}
                  />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: '#aaa' }} />
                  <Bar dataKey="screenshots" name="Successful" fill="#22c55e" radius={[4,4,0,0]} />
                  <Bar dataKey="failed"      name="Failed"     fill="#ef4444" radius={[4,4,0,0]} />
                  <Bar dataKey="positions"   name="Positions"  fill="#6366f1" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Area — rounds timeline */}
          {statsData.rounds_timeline.length > 0 && (
            <div className="chart-card chart-card--full">
              <div className="chart-title">Capture Rounds Timeline</div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={statsData.rounds_timeline}>
                  <defs>
                    <linearGradient id="gradCompleted" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="gradPending" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="gradFailed" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                  <XAxis dataKey="date" tick={{ fill: '#888', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#888', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: '#1a1a2e', border: '1px solid #2e2e44', borderRadius: 8, fontSize: 12 }}
                    itemStyle={{ color: '#e8e8f0' }}
                  />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: '#aaa' }} />
                  <Area type="monotone" dataKey="completed" name="Completed" stroke="#22c55e" fill="url(#gradCompleted)" strokeWidth={2} dot={false} />
                  <Area type="monotone" dataKey="pending"   name="Pending"   stroke="#6366f1" fill="url(#gradPending)"   strokeWidth={2} dot={false} />
                  <Area type="monotone" dataKey="failed"    name="Failed"    stroke="#ef4444" fill="url(#gradFailed)"    strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {loading && <div className="loading">Loading...</div>}
    </div>
  )
}