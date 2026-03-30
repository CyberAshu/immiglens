import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2, Briefcase, Globe, CheckCircle2, Clock, AlertTriangle } from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import { stats as statsApi, subscriptions as subApi } from '../api'
import type { DashboardStats, UsageSummary } from '../types'
import { StatCard } from '../components/StatCard'

function planColor(name: string) {
  if (name === 'enterprise') return '#C8A24A'
  if (name === 'pro')        return '#0B1F3B'
  return '#6b7280'
}

type StatCardDef = {
  label: string
  value: string | number
  accent: string
  sub?: string
  icon?: React.ReactNode
  warn?: boolean
}

const STAT_CARDS = (s: DashboardStats): StatCardDef[] => {
  const totalCaptures = s.total_screenshots + s.failed_screenshots
  const successRate = totalCaptures > 0
    ? Math.round((s.total_screenshots / totalCaptures) * 100)
    : null

  const cards: StatCardDef[] = [
    {
      label: 'Active Employers',
      value: s.active_employers,
      sub: `of ${s.total_employers} total`,
      accent: '#0B1F3B',
      icon: <Building2 size={18} strokeWidth={1.8} />,
    },
    {
      label: 'Active Positions',
      value: s.active_positions,
      sub: `of ${s.total_positions} total`,
      accent: '#C8A24A',
      icon: <Briefcase size={18} strokeWidth={1.8} />,
    },
    {
      label: 'Active Job Boards',
      value: s.active_postings,
      sub: `of ${s.total_job_urls} total`,
      accent: '#1a3352',
      icon: <Globe size={18} strokeWidth={1.8} />,
    },
    {
      label: 'Capture Success Rate',
      value: successRate !== null ? `${successRate}%` : '—',
      sub: `${s.total_screenshots} successful screenshot${s.total_screenshots !== 1 ? 's' : ''}`,
      accent: '#22c55e',
      icon: <CheckCircle2 size={18} strokeWidth={1.8} />,
    },
    {
      label: 'Pending Captures',
      value: s.pending_rounds,
      sub: 'scheduled rounds',
      accent: '#f59e0b',
      icon: <Clock size={18} strokeWidth={1.8} />,
    },
  ]

  if (s.failed_screenshots > 0) {
    cards.push({
      label: 'Failed Captures',
      value: s.failed_screenshots,
      sub: 'need attention',
      accent: '#ef4444',
      icon: <AlertTriangle size={18} strokeWidth={1.8} />,
      warn: true,
    })
  }

  return cards
}

export default function Dashboard() {
  const [statsData, setStatsData] = useState<DashboardStats | null>(null)
  const [planData, setPlanData]   = useState<UsageSummary | null>(null)
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    Promise.all([statsApi.get(), subApi.usage()])
      .then(([s, plan]) => { setStatsData(s); setPlanData(plan) })
      .finally(() => setLoading(false))
  }, [])

  const noCapturesYet = statsData && !statsData.capture_breakdown.some(c => c.value > 0)
  const noRoundsYet   = statsData && statsData.rounds_timeline.length === 0

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
            <span className="plan-strip-label">Active Positions</span>
            <strong>{planData.active_positions_used} / {planData.tier.max_active_positions === -1 ? '∞' : planData.tier.max_active_positions}</strong>
          </div>
          <div className="plan-strip-stat">
            <span className="plan-strip-label">URLs / Position</span>
            <strong>{planData.tier.max_urls_per_position === -1 ? '∞' : `up to ${planData.tier.max_urls_per_position}`}</strong>
          </div>
          <div className="plan-strip-stat">
            <span className="plan-strip-label">Captures this month</span>
            <strong>{planData.captures_this_month} / {planData.tier.max_captures_per_month === -1 ? '∞' : planData.tier.max_captures_per_month}</strong>
          </div>
          <Link to="/subscriptions" className="plan-strip-link">View Plan →</Link>
        </div>
      )}

      {/* ── KPI cards ─────────────────────────── */}
      {statsData && (
        <div className="stats-grid">
          {STAT_CARDS(statsData).map(c => (
            <StatCard key={c.label} label={c.label} value={c.value} accent={c.accent} sub={c.sub} icon={c.icon} warn={c.warn} />
          ))}
        </div>
      )}

      {/* ── Charts row ────────────────────────── */}
      {statsData && (
        <div className="charts-grid">

          {/* Donut — capture status */}
          <div className="chart-card">
            <div className="chart-title">Capture Status</div>
            {noCapturesYet ? (
              <div className="chart-empty">
                <CheckCircle2 size={32} strokeWidth={1.5} style={{ color: '#d1d5db', marginBottom: 8 }} />
                <p>No captures yet</p>
                <span>Capture rounds will appear here once your scheduler runs.</span>
              </div>
            ) : (
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
                    contentStyle={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12 }}
                    itemStyle={{ color: '#1E2329' }}
                  />
                  <Legend
                    iconType="circle" iconSize={8}
                    wrapperStyle={{ fontSize: 11, color: '#6b7280', paddingTop: 8 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Bar — per-employer breakdown */}
          {statsData.employer_breakdown.length > 0 && (
            <div className="chart-card chart-card--wide">
              <div className="chart-title">Screenshots by Employer</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={statsData.employer_breakdown} barGap={4} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="name" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    cursor={{ fill: 'rgba(11,31,59,0.04)' }}
                    contentStyle={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12 }}
                    itemStyle={{ color: '#1E2329' }}
                  />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: '#6b7280' }} />
                  <Bar dataKey="screenshots" name="Successful" fill="#22c55e" radius={[4,4,0,0]} />
                  <Bar dataKey="failed"      name="Failed"     fill="#ef4444" radius={[4,4,0,0]} />
                  <Bar dataKey="positions"   name="Positions"  fill="#0B1F3B" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Area — rounds timeline */}
          <div className="chart-card chart-card--full">
            <div className="chart-title">Capture Rounds Timeline</div>
            {noRoundsYet ? (
              <div className="chart-empty">
                <Clock size={32} strokeWidth={1.5} style={{ color: '#d1d5db', marginBottom: 8 }} />
                <p>No capture rounds scheduled yet</p>
                <span>Add job board URLs to a position and the scheduler will queue rounds automatically.</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={statsData.rounds_timeline}>
                  <defs>
                    <linearGradient id="gradCompleted" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="gradPending" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#C8A24A" stopOpacity={0.3}/>
                      <stop offset="95%"  stopColor="#C8A24A" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="gradFailed" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12 }}
                    itemStyle={{ color: '#1E2329' }}
                  />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: '#6b7280' }} />
                  <Area type="monotone" dataKey="completed" name="Completed" stroke="#22c55e" fill="url(#gradCompleted)" strokeWidth={2} dot={false} />
                  <Area type="monotone" dataKey="pending"   name="Pending"   stroke="#C8A24A" fill="url(#gradPending)"   strokeWidth={2} dot={false} />
                  <Area type="monotone" dataKey="failed"    name="Failed"    stroke="#ef4444" fill="url(#gradFailed)"    strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}

      {loading && <div className="loading">Loading...</div>}
    </div>
  )
}