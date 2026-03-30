import { useEffect, useState } from 'react'
import { subscriptions as subApi } from '../api'
import type { UsageSummary } from '../types'

function tierColor(name: string) {
  if (name === 'enterprise') return '#f59e0b'
  if (name === 'pro')        return '#0B1F3B'
  return '#64748b'
}

function UsageBar({ used, max, color }: { used: number; max: number; color: string }) {
  const pct = max === -1 ? 0 : Math.min(100, Math.round((used / max) * 100))
  const warn = max !== -1 && pct >= 80
  return (
    <div className="usage-bar-wrap">
      <div className="usage-bar-track">
        <div
          className="usage-bar-fill"
          style={{ width: `${max === -1 ? 100 : pct}%`, background: warn ? '#ef4444' : color }}
        />
      </div>
      <span className="usage-bar-label">
        {used} / {max === -1 ? '∞' : max}
        {max !== -1 && <span className="usage-bar-pct"> ({pct}%)</span>}
      </span>
    </div>
  )
}

export default function Subscriptions() {
  const [data, setData]       = useState<UsageSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    subApi.usage()
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="loading">Loading…</div>
  if (error)   return <div className="error-msg">{error}</div>
  if (!data)   return null

  const { tier } = data

  const metrics = [
    { label: 'Active Positions',     used: data.active_positions_used, max: tier.max_active_positions,   color: '#C8A24A' },
    { label: 'Captures This Month',  used: data.captures_this_month,   max: tier.max_captures_per_month, color: '#22c55e' },
  ]

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Subscription</h1>
          <p className="sub-text">Your current plan and resource usage</p>
        </div>
      </div>

      {/* ── Plan card ─────────────────────────── */}
      <div className="card sub-plan-card" style={{ borderColor: tierColor(tier.name) + '44' }}>
        <div className="sub-plan-header">
          <div>
            <div className="sub-plan-name" style={{ color: tierColor(tier.name) }}>{tier.display_name}</div>
            <div className="sub-plan-slug">{tier.name} plan</div>
          </div>
          <div className="sub-plan-badge" style={{ background: tierColor(tier.name) + '22', color: tierColor(tier.name), borderColor: tierColor(tier.name) + '55' }}>
            {tier.name.toUpperCase()}
          </div>
        </div>
        <p className="sub-admin-note">ℹ️ Your plan is managed by the platform administrator.
          Contact support to request an upgrade.
        </p>

        <div className="sub-limits-grid">
          {[
            { label: 'Max Active Positions',  val: tier.max_active_positions },
            { label: 'URLs / Position',       val: tier.max_urls_per_position },
            { label: 'Captures / Month',      val: tier.max_captures_per_month },
          ].map(({ label, val }) => (
            <div key={label} className="sub-limit-item">
              <div className="sub-limit-val">{val === -1 ? '∞' : val}</div>
              <div className="sub-limit-label">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Usage ─────────────────────────────── */}
      <div className="card section-top">
        <div className="card-title">Current Usage</div>
        <div className="usage-list">
          {metrics.map(m => (
            <div key={m.label} className="usage-item">
              <div className="usage-item-label">{m.label}</div>
              <UsageBar used={m.used} max={m.max} color={m.color} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
