import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Building2, Briefcase, Globe, CheckCircle2, Clock, AlertTriangle,
  TrendingUp, Camera, ArrowUpRight, CreditCard, BarChart2,
} from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { stats as statsApi, subscriptions as subApi } from '../api'
import { useAuth } from '../context/AuthContext'
import type { DashboardStats, UsageSummary } from '../types'

/* ── Helpers ─────────────────────────────────────────────── */

const CHART_TOOLTIP = {
  contentStyle: {
    background: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    fontSize: 12,
    boxShadow: '0 4px 16px rgba(11,31,59,0.08)',
  },
  itemStyle: { color: '#374151' },
}

function planAccent(name: string) {
  if (name === 'enterprise') return '#C8A24A'
  if (name === 'pro')        return '#0B1F3B'
  return '#6b7280'
}

function planGradient(name: string) {
  if (name === 'enterprise') return 'linear-gradient(135deg, #7c5c1f 0%, #C8A24A 60%, #a37a2a 100%)'
  if (name === 'pro')        return 'linear-gradient(135deg, #0B1F3B 0%, #1a3352 100%)'
  return 'linear-gradient(135deg, #374151 0%, #64748b 100%)'
}

function usagePct(used: number, max: number) {
  if (max === -1 || max === 0) return -1
  return Math.min(100, Math.round(used / max * 100))
}

function usageColor(pct: number) {
  if (pct >= 90) return '#dc2626'
  if (pct >= 70) return '#d97706'
  return '#22c55e'
}

/* ── Sub-components ──────────────────────────────────────── */

function KpiCard({
  label, value, sub, accentColor, iconBg, icon, warn, linkTo,
}: {
  label: string; value: string | number; sub?: string
  accentColor: string; iconBg: string; icon: React.ReactNode
  warn?: boolean; linkTo?: string
}) {
  const card = (
    <div
      className={`db-kpi${warn ? ' db-kpi--warn' : ''}`}
      style={{ borderBottomColor: warn ? '#dc2626' : accentColor }}
    >
      <div className="db-kpi-top">
        <div className="db-kpi-icon" style={{
          background: warn ? 'rgba(220,38,38,0.08)' : iconBg,
          color: warn ? '#dc2626' : accentColor,
        }}>
          {icon}
        </div>
        {linkTo && <ArrowUpRight size={14} className="db-kpi-arrow" />}
      </div>
      <div className="db-kpi-value" style={{ color: warn ? '#dc2626' : accentColor }}>{value}</div>
      <div className="db-kpi-label">{label}</div>
      {sub && <div className="db-kpi-sub">{sub}</div>}
    </div>
  )
  return linkTo
    ? <Link to={linkTo} style={{ textDecoration: 'none', display: 'block' }}>{card}</Link>
    : card
}

function UsageBar({ label, used, max }: { label: string; used: number; max: number }) {
  const unlimited = max === -1
  const pct       = unlimited ? 100 : usagePct(used, max)
  const color     = unlimited ? '#22c55e' : usageColor(pct)
  return (
    <div className="db-usage-item">
      <div className="db-usage-header">
        <span className="db-usage-label">{label}</span>
        <span className="db-usage-val" style={{ color }}>
          {unlimited ? '∞ Unlimited' : `${used} / ${max}`}
        </span>
      </div>
      <div className="db-usage-track">
        <div
          className="db-usage-fill"
          style={{ width: `${unlimited ? 100 : pct}%`, background: unlimited ? 'linear-gradient(90deg,#22c55e,#86efac)' : color }}
        />
      </div>
    </div>
  )
}

function ChartHeader({ title, note }: { title: string; note?: string }) {
  return (
    <div className="db-chart-header">
      <span className="db-chart-title">{title}</span>
      {note && <span className="db-chart-note">{note}</span>}
    </div>
  )
}

/* ── Main component ──────────────────────────────────────── */

export default function Dashboard() {
  const { user } = useAuth()
  const [statsData, setStatsData] = useState<DashboardStats | null>(null)
  const [planData, setPlanData]   = useState<UsageSummary | null>(null)
  const [planError, setPlanError] = useState<string | null>(null)
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    Promise.all([
      statsApi.get(),
      subApi.usage().catch((e: Error) => { setPlanError(e.message); return null }),
    ])
      .then(([s, plan]) => { setStatsData(s); if (plan) setPlanData(plan) })
      .finally(() => setLoading(false))
  }, [])

  const firstName = user?.full_name?.split(' ')[0] ?? 'there'
  const hour      = new Date().getHours()
  const greeting  = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const dateStr   = new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })

  const captureTotal = (statsData?.total_screenshots ?? 0) + (statsData?.failed_screenshots ?? 0) + (statsData?.failed_rounds ?? 0)
  const successRate  = captureTotal > 0
    ? Math.round((statsData!.total_screenshots / captureTotal) * 100)
    : null

  const noCapturesYet = statsData && !statsData.capture_breakdown.some(c => c.value > 0)
  const noRoundsYet   = statsData && statsData.rounds_timeline.length === 0

  if (loading) return (
    <div className="db-loading">
      <div className="db-spinner" />
      <span>Loading dashboard…</span>
    </div>
  )

  return (
    <div className="db-root">

      {/* ── Welcome bar ─────────────────────────────────── */}
      <div className="db-welcome">
        <div className="db-welcome-left">
          <h1 className="db-welcome-title">{greeting}, {firstName}</h1>
          <p className="db-welcome-sub">{dateStr}</p>
        </div>
        {planData && (
          <div
            className="db-welcome-badge"
            style={{
              color: planAccent(planData.tier.name),
              borderColor: `${planAccent(planData.tier.name)}40`,
              background: `${planAccent(planData.tier.name)}0d`,
            }}
          >
            <span className="db-welcome-badge-dot" style={{ background: planAccent(planData.tier.name) }} />
            {planData.tier.display_name} Plan
          </div>
        )}
      </div>

      {/* ── Plan card ───────────────────────────────────── */}
      {planError && (
        <div className="db-plan-card" style={{ background: 'linear-gradient(135deg,#374151,#1f2937)', padding: '1rem 1.5rem' }}>
          <div className="db-plan-texture" />
          <div style={{ color: '#fca5a5', fontSize: '0.85rem' }}>⚠ {planError}</div>
        </div>
      )}
      {planData && (
        <div className="db-plan-card" style={{ background: planGradient(planData.tier.name) }}>
          {/* Subtle texture layer */}
          <div className="db-plan-texture" />

          {/* Left: tier info */}
          <div className="db-plan-left">
            <div className="db-plan-eyebrow">Current Plan</div>
            <div className="db-plan-name">{planData.tier.display_name}</div>
            {planData.tier.price_per_month !== null && planData.tier.price_per_month > 0 && (
              <div className="db-plan-price">
                ${planData.tier.price_per_month}
                <span className="db-plan-price-period">/mo</span>
              </div>
            )}
            {planData.tier.price_per_month === 0 && (
              <div className="db-plan-price" style={{ color: 'rgba(255,255,255,0.65)' }}>Free</div>
            )}
            <div className="db-plan-meta-row">
              <span className="db-plan-meta-pill">
                {planData.tier.max_urls_per_position === -1
                  ? '∞ URLs/position'
                  : `${planData.tier.max_urls_per_position} URLs/position`}
              </span>
              <span className="db-plan-meta-pill">
                Every {planData.tier.min_capture_frequency_days === 1
                  ? 'day'
                  : `${planData.tier.min_capture_frequency_days} days`}
              </span>
            </div>
            {planData.applied_promotion_name && (
              <div className="db-plan-promo">
                🎟 {planData.applied_promotion_name}
                {planData.applied_discount_type === 'percent' && ` · ${planData.applied_discount_value}% off`}
                {planData.applied_discount_type === 'fixed' && ` · $${planData.applied_discount_value} off`}
              </div>
            )}
          </div>

          {/* Center: usage bars */}
          <div className="db-plan-usage">
            <UsageBar
              label="Active Positions"
              used={planData.active_positions_used}
              max={planData.tier.max_active_positions}
            />
            <UsageBar
              label="Captures this Month"
              used={planData.captures_this_month}
              max={planData.tier.max_captures_per_month}
            />
          </div>

          {/* Right: CTA */}
          <div className="db-plan-right">
            <Link to="/subscriptions" className="db-plan-cta">
              <CreditCard size={14} strokeWidth={2} />
              Manage Plan
            </Link>
          </div>
        </div>
      )}

      {/* ── KPI grid ────────────────────────────────────── */}
      {statsData && (
        <div className="db-kpi-grid">
          <KpiCard
            label="Active Employers"
            value={statsData.active_employers}
            sub={`of ${statsData.total_employers} total`}
            accentColor="#0B1F3B"
            iconBg="rgba(11,31,59,0.07)"
            icon={<Building2 size={17} strokeWidth={1.8} />}
            linkTo="/employers"
          />
          <KpiCard
            label="Active Positions"
            value={statsData.active_positions}
            sub={`of ${statsData.total_positions} total`}
            accentColor="#C8A24A"
            iconBg="rgba(200,162,74,0.1)"
            icon={<Briefcase size={17} strokeWidth={1.8} />}
            linkTo="/employers"
          />
          <KpiCard
            label="Active Job Boards"
            value={statsData.active_postings}
            sub={`of ${statsData.total_job_urls} total`}
            accentColor="#1a3352"
            iconBg="rgba(26,51,82,0.08)"
            icon={<Globe size={17} strokeWidth={1.8} />}
          />
          <KpiCard
            label="Capture Success Rate"
            value={successRate !== null ? `${successRate}%` : '—'}
            sub={`${statsData.total_screenshots} successful captures`}
            accentColor="#22c55e"
            iconBg="rgba(34,197,94,0.09)"
            icon={<CheckCircle2 size={17} strokeWidth={1.8} />}
          />
          <KpiCard
            label="Pending Rounds"
            value={statsData.pending_rounds}
            sub="scheduled in queue"
            accentColor="#f59e0b"
            iconBg="rgba(245,158,11,0.09)"
            icon={<Clock size={17} strokeWidth={1.8} />}
          />
          {statsData.failed_screenshots > 0 ? (
            <KpiCard
              label="Failed Captures"
              value={statsData.failed_screenshots}
              sub="require attention"
              accentColor="#ef4444"
              iconBg="rgba(239,68,68,0.08)"
              icon={<AlertTriangle size={17} strokeWidth={1.8} />}
              warn
            />
          ) : (
            <KpiCard
              label="Total Screenshots"
              value={statsData.total_screenshots}
              sub="all time"
              accentColor="#6366f1"
              iconBg="rgba(99,102,241,0.09)"
              icon={<Camera size={17} strokeWidth={1.8} />}
            />
          )}
        </div>
      )}

      {/* ── Charts row ──────────────────────────────────── */}
      {statsData && (
        <div className="db-charts-row">

          {/* Capture status donut */}
          <div className="db-chart-card">
            <ChartHeader title="Capture Status" />
            {noCapturesYet ? (
              <div className="db-chart-empty">
                <CheckCircle2 size={28} strokeWidth={1.5} />
                <p>No captures yet</p>
                <span>Rounds appear here once the scheduler runs.</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={224}>
                <PieChart>
                  <Pie
                    data={statsData.capture_breakdown.filter(d => d.value > 0)}
                    cx="50%" cy="50%"
                    innerRadius={56} outerRadius={82}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {statsData.capture_breakdown.map(entry => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip {...CHART_TOOLTIP} />
                  <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11, color: '#6b7280', paddingTop: 6 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Screenshots by employer */}
          <div className="db-chart-card db-chart-card--grow">
            <ChartHeader
              title="Screenshots by Employer"
              note={statsData.employer_breakdown.length > 0 ? `${statsData.employer_breakdown.length} employers` : undefined}
            />
            {statsData.employer_breakdown.length === 0 ? (
              <div className="db-chart-empty">
                <BarChart2 size={28} strokeWidth={1.5} />
                <p>No employer data</p>
                <span>Add employers and positions to start tracking screenshots.</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={224}>
                <BarChart data={statsData.employer_breakdown} barGap={4} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip cursor={{ fill: 'rgba(11,31,59,0.04)' }} {...CHART_TOOLTIP} />
                  <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11, color: '#6b7280' }} />
                  <Bar dataKey="screenshots" name="Successful" fill="#22c55e" radius={[3,3,0,0]} />
                  <Bar dataKey="failed"      name="Failed"     fill="#ef4444" radius={[3,3,0,0]} />
                  <Bar dataKey="positions"   name="Positions"  fill="#0B1F3B" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}

      {/* ── Capture rounds timeline ─────────────────────── */}
      {statsData && (
        <div className="db-chart-card">
          <ChartHeader
            title="Capture Rounds Timeline"
            note={!noRoundsYet ? `${statsData.rounds_timeline.length} data points` : undefined}
          />
          {noRoundsYet ? (
            <div className="db-chart-empty">
              <TrendingUp size={28} strokeWidth={1.5} />
              <p>No rounds yet</p>
              <span>Add job board URLs to a position to start automated captures.</span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={210}>
              <AreaChart data={statsData.rounds_timeline}>
                <defs>
                  <linearGradient id="dbGradC" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.22}/>
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="dbGradP" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#C8A24A" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#C8A24A" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="dbGradF" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip {...CHART_TOOLTIP} />
                <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11, color: '#6b7280' }} />
                <Area type="monotone" dataKey="completed" name="Completed" stroke="#22c55e" fill="url(#dbGradC)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="pending"   name="Pending"   stroke="#C8A24A" fill="url(#dbGradP)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="failed"    name="Failed"    stroke="#ef4444" fill="url(#dbGradF)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

    </div>
  )
}