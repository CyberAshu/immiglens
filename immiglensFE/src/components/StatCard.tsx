interface StatCardProps {
  label: string
  value: string | number
  accent: string
  warn?: boolean
}

export function StatCard({ label, value, accent, warn = false }: StatCardProps) {
  return (
    <div
      className={`stat-card${warn ? ' stat-card--warn' : ''}`}
      style={{ borderTopColor: accent, borderTopWidth: 3, borderTopStyle: 'solid' }}
    >
      <div className="stat-value" style={{ color: warn ? '#ef4444' : '#0B1F3B' }}>
        {value}
      </div>
      <div className="stat-label">{label}</div>
    </div>
  )
}
