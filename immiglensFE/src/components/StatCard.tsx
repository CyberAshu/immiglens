import type { ReactNode } from 'react'

interface StatCardProps {
  label: string
  value: string | number
  accent: string
  sub?: string
  icon?: ReactNode
  warn?: boolean
}

export function StatCard({ label, value, accent, sub, icon, warn = false }: StatCardProps) {
  return (
    <div
      className={`stat-card${warn ? ' stat-card--warn' : ''}`}
      style={{ borderTopColor: accent, borderTopWidth: 3, borderTopStyle: 'solid' }}
    >
      {icon && (
        <div className="stat-icon" style={{ color: warn ? '#ef4444' : accent }}>
          {icon}
        </div>
      )}
      <div className="stat-value" style={{ color: warn ? '#ef4444' : '#0B1F3B' }}>
        {value}
      </div>
      {sub && <div className="stat-sub">{sub}</div>}
      <div className="stat-label">{label}</div>
    </div>
  )
}
