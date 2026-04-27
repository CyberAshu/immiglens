import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Clock,
  FileText,
  CheckCircle2,
  Shield,
  Bell,
  ListTodo,
  Download,
  Settings,
  Play,
  Users,
  Briefcase,
  Building,
  Loader2,
} from 'lucide-react'
import { FeatureCard, StepCard, CTABand, PricingCard } from './LandingUI'
import { VideoModal } from '../../components/VideoModal'
import { subscriptions } from '../../api/subscriptions'
import type { SubscriptionTier } from '../../types'

const DEMO_VIDEO_URL = 'https://www.youtube.com/embed/?autoplay=1'

function fmt(v: number) { return v === -1 ? 'Unlimited' : String(v) }

function tierFeatures(tier: SubscriptionTier): string[] {
  return [
    `${fmt(tier.max_active_positions)} active position${tier.max_active_positions === 1 ? '' : 's'}`,
    `${fmt(tier.max_urls_per_position)} job board URL${tier.max_urls_per_position === 1 ? '' : 's'} per position`,
    `${fmt(tier.max_captures_per_month)} capture${tier.max_captures_per_month === 1 ? '' : 's'} / month`,
  ]
}

// ── Hero Mockup — mirrors the real app dashboard ─────────────────────────────
// ── Tab content panels ────────────────────────────────────────────────────────
function MockDashboardPanel() {
  const kpis = [
    { label: 'Active Employers',  value: '4',   accent: '#0B1F3B', iconBg: 'rgba(11,31,59,0.07)',   sub: 'of 4 total',   icon: '🏢' },
    { label: 'Active Positions',  value: '8',   accent: '#C8A24A', iconBg: 'rgba(200,162,74,0.1)',  sub: 'of 8 total',   icon: '💼' },
    { label: 'Active Job Boards', value: '12',  accent: '#1a3352', iconBg: 'rgba(26,51,82,0.08)',   sub: 'of 12 total',  icon: '🌐' },
    { label: 'Capture Success',   value: '94%', accent: '#22c55e', iconBg: 'rgba(34,197,94,0.09)',  sub: '47 successful', icon: '✅' },
    { label: 'Pending Rounds',    value: '2',   accent: '#f59e0b', iconBg: 'rgba(245,158,11,0.09)', sub: 'in queue',      icon: '⏱' },
    { label: 'Screenshots',       value: '47',  accent: '#6366f1', iconBg: 'rgba(99,102,241,0.09)', sub: 'all time',      icon: '📸' },
  ]
  const bars = [
    { name: 'Maple',  ss: 18, failed: 2 },
    { name: 'NorCan', ss: 14, failed: 0 },
    { name: 'Peak',   ss: 10, failed: 2 },
    { name: 'Bright', ss: 5,  failed: 1 },
  ]
  const BAR_MAX = 20
  const timeline = [
    { c: 2, p: 1, f: 0 }, { c: 3, p: 2, f: 1 }, { c: 4, p: 1, f: 0 },
    { c: 3, p: 2, f: 1 }, { c: 5, p: 1, f: 0 }, { c: 6, p: 2, f: 1 },
  ]
  const TL_MAX = 7
  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 7, padding: '10px 12px', background: '#F6F4EF' }}>
      {/* Welcome bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#0B1F3B', letterSpacing: '-0.3px', lineHeight: 1.2 }}>Good afternoon, Sarah</div>
          <div style={{ fontSize: 8.5, color: '#6b7280', marginTop: 1 }}>Sunday, April 27</div>
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 8.5, fontWeight: 600, padding: '3px 9px', borderRadius: 99, border: '1px solid rgba(200,162,74,0.4)', background: 'rgba(200,162,74,0.09)', color: '#C8A24A', whiteSpace: 'nowrap' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#C8A24A', flexShrink: 0 }} />Pro Plan
        </div>
      </div>

      {/* Plan card — 3-col grid matching real db-plan-card */}
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: 10, background: 'linear-gradient(135deg,#0B1F3B 0%,#1a3352 100%)', borderRadius: 10, padding: '8px 11px', position: 'relative', overflow: 'hidden', flexShrink: 0, boxShadow: '0 3px 14px rgba(11,31,59,0.22)' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px)', backgroundSize: '16px 16px', pointerEvents: 'none' }} />
        {/* Left: plan name */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 7, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.5)', marginBottom: 1 }}>Current Plan</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', letterSpacing: '-0.4px', lineHeight: 1.1 }}>Pro</div>
          <div style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.7)', marginTop: 1 }}>$79<span style={{ fontSize: 7, fontWeight: 400 }}>/mo</span></div>
          <div style={{ display: 'flex', gap: 4, marginTop: 3 }}>
            {['25 positions', 'Daily'].map(p => (
              <span key={p} style={{ fontSize: 7, fontWeight: 600, color: 'rgba(255,255,255,0.6)', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 4, padding: '1px 5px', whiteSpace: 'nowrap' }}>{p}</span>
            ))}
          </div>
        </div>
        {/* Center: dark glassy usage panel */}
        <div style={{ position: 'relative', zIndex: 1, background: 'rgba(0,0,0,0.18)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
          {[{ label: 'Active Positions', used: 8, max: 25 }, { label: 'Captures / Month', used: 47, max: 50 }].map(({ label, used, max }) => {
            const pct = Math.round(used / max * 100)
            const color = pct >= 90 ? '#dc2626' : pct >= 70 ? '#d97706' : '#22c55e'
            return (
              <div key={label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                  <span style={{ fontSize: 7.5, color: 'rgba(255,255,255,0.58)', fontWeight: 500 }}>{label}</span>
                  <span style={{ fontSize: 7.5, fontWeight: 700, color }}>{used}/{max}</span>
                </div>
                <div style={{ height: 3, background: 'rgba(255,255,255,0.12)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2 }} />
                </div>
              </div>
            )
          })}
        </div>
        {/* Right: CTA */}
        <div style={{ position: 'relative', zIndex: 1, flexShrink: 0 }}>
          <div style={{ fontSize: 7.5, fontWeight: 600, color: '#fff', background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 6, padding: '5px 9px', whiteSpace: 'nowrap' }}>Manage Plan</div>
        </div>
      </div>

      {/* KPI grid — icon badge + value + uppercase label + sub */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5, flexShrink: 0 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ background: '#fff', borderRadius: 8, padding: '6px 8px 5px', border: '1px solid #e5e7eb', borderBottom: `3px solid ${k.accent}`, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 5 }}>
              <div style={{ width: 20, height: 20, borderRadius: 5, background: k.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>{k.icon}</div>
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: k.accent, lineHeight: 1, letterSpacing: '-0.5px' }}>{k.value}</div>
            <div style={{ fontSize: 7, fontWeight: 600, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>{k.label}</div>
            <div style={{ fontSize: 7, color: '#9ca3af', marginTop: 1 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Charts row — donut (fixed) + bar chart (grow) matching db-charts-row */}
      <div style={{ display: 'flex', gap: 5, flex: 1, minHeight: 0 }}>
        {/* Donut — capture status */}
        <div style={{ width: 106, background: '#fff', borderRadius: 8, border: '1px solid #e5e7eb', padding: '7px 9px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          <div style={{ fontSize: 7, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#374151', paddingBottom: 4, borderBottom: '1px solid #f1f5f9', marginBottom: 5 }}>Capture Status</div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="62" height="62" viewBox="0 0 62 62">
              <circle cx="31" cy="31" r="22" fill="none" stroke="#f3f4f6" strokeWidth="9"/>
              <circle cx="31" cy="31" r="22" fill="none" stroke="#22c55e" strokeWidth="9" strokeDasharray="83 55" transform="rotate(-90 31 31)"/>
              <circle cx="31" cy="31" r="22" fill="none" stroke="#C8A24A" strokeWidth="9" strokeDasharray="22 116" strokeDashoffset="-83" transform="rotate(-90 31 31)"/>
              <circle cx="31" cy="31" r="22" fill="none" stroke="#ef4444" strokeWidth="9" strokeDasharray="8 130" strokeDashoffset="-105" transform="rotate(-90 31 31)"/>
              <text x="31" y="35" textAnchor="middle" fill="#0B1F3B" fontSize="11" fontWeight="700">47</text>
            </svg>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {[{ c: '#22c55e', l: 'Done 60%' }, { c: '#C8A24A', l: 'Pending 16%' }, { c: '#ef4444', l: 'Failed 6%' }].map(x => (
              <div key={x.l} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 7.5, color: '#6b7280' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: x.c, flexShrink: 0 }} />{x.l}
              </div>
            ))}
          </div>
        </div>

        {/* Bar chart — screenshots by employer */}
        <div style={{ flex: 1, background: '#fff', borderRadius: 8, border: '1px solid #e5e7eb', padding: '7px 9px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ fontSize: 7, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#374151', paddingBottom: 4, borderBottom: '1px solid #f1f5f9', marginBottom: 5, display: 'flex', justifyContent: 'space-between' }}>
            <span>Screenshots by Employer</span>
            <span style={{ fontWeight: 400, color: '#9ca3af', textTransform: 'none', letterSpacing: 0 }}>4 employers</span>
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: 5, padding: '0 2px' }}>
            {bars.map(d => (
              <div key={d.name} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                <div style={{ width: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 2, height: 42 }}>
                  <div style={{ width: 7, height: `${Math.round(d.ss / BAR_MAX * 42)}px`, background: '#22c55e', borderRadius: '2px 2px 0 0', minHeight: 2 }} />
                  {d.failed > 0 && <div style={{ width: 7, height: `${Math.round(d.failed / BAR_MAX * 42)}px`, background: '#ef4444', borderRadius: '2px 2px 0 0', minHeight: 2 }} />}
                </div>
                <div style={{ fontSize: 7, color: '#9ca3af', marginTop: 2 }}>{d.name}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 7, marginTop: 5, paddingTop: 4, borderTop: '1px solid #f3f4f6' }}>
            {[{ c: '#22c55e', l: 'Successful' }, { c: '#ef4444', l: 'Failed' }, { c: '#0B1F3B', l: 'Positions' }].map(x => (
              <div key={x.l} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 7, color: '#6b7280' }}>
                <div style={{ width: 6, height: 6, borderRadius: 2, background: x.c }} />{x.l}
              </div>
            ))}
          </div>
        </div>

        {/* Area chart — rounds timeline */}
        <div style={{ flex: 1, background: '#fff', borderRadius: 8, border: '1px solid #e5e7eb', padding: '7px 9px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ fontSize: 7, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#374151', paddingBottom: 4, borderBottom: '1px solid #f1f5f9', marginBottom: 5 }}>Rounds Timeline</div>
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            <svg width="100%" height="100%" viewBox="0 0 100 40" preserveAspectRatio="none">
              <defs>
                <linearGradient id="hm-gc" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#22c55e" stopOpacity="0.25"/><stop offset="100%" stopColor="#22c55e" stopOpacity="0"/></linearGradient>
                <linearGradient id="hm-gp" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#C8A24A" stopOpacity="0.2"/><stop offset="100%" stopColor="#C8A24A" stopOpacity="0"/></linearGradient>
                <linearGradient id="hm-gf" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ef4444" stopOpacity="0.2"/><stop offset="100%" stopColor="#ef4444" stopOpacity="0"/></linearGradient>
              </defs>
              {[10,20,30,40].map(y => <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="#f3f4f6" strokeWidth="0.5"/>)}
              <polygon points={`0,40 ${timeline.map((t,i)=>`${(i/(timeline.length-1))*100},${40-(t.c/TL_MAX)*36}`).join(' ')} 100,40`} fill="url(#hm-gc)"/>
              <polyline points={timeline.map((t,i)=>`${(i/(timeline.length-1))*100},${40-(t.c/TL_MAX)*36}`).join(' ')} fill="none" stroke="#22c55e" strokeWidth="1.5" strokeLinejoin="round"/>
              <polygon points={`0,40 ${timeline.map((t,i)=>`${(i/(timeline.length-1))*100},${40-(t.p/TL_MAX)*36}`).join(' ')} 100,40`} fill="url(#hm-gp)"/>
              <polyline points={timeline.map((t,i)=>`${(i/(timeline.length-1))*100},${40-(t.p/TL_MAX)*36}`).join(' ')} fill="none" stroke="#C8A24A" strokeWidth="1.2" strokeLinejoin="round" strokeDasharray="2 1"/>
              <polygon points={`0,40 ${timeline.map((t,i)=>`${(i/(timeline.length-1))*100},${40-(t.f/TL_MAX)*36}`).join(' ')} 100,40`} fill="url(#hm-gf)"/>
              <polyline points={timeline.map((t,i)=>`${(i/(timeline.length-1))*100},${40-(t.f/TL_MAX)*36}`).join(' ')} fill="none" stroke="#ef4444" strokeWidth="1.2" strokeLinejoin="round" strokeDasharray="2 1"/>
            </svg>
          </div>
          <div style={{ display: 'flex', gap: 7, marginTop: 5, paddingTop: 4, borderTop: '1px solid #f3f4f6' }}>
            {[{ c: '#22c55e', l: 'Completed' }, { c: '#C8A24A', l: 'Pending' }, { c: '#ef4444', l: 'Failed' }].map(x => (
              <div key={x.l} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 7, color: '#6b7280' }}>
                <div style={{ width: 6, height: 6, borderRadius: 2, background: x.c }} />{x.l}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function MockEmployersPanel() {
  const employers = [
    { name: 'Maple Staffing Inc.',      positions: 3, boards: 5, pct: 100 },
    { name: 'NorCan Recruitment',       positions: 2, boards: 3, pct: 93  },
    { name: 'Peak Workforce Solutions', positions: 2, boards: 3, pct: 67  },
    { name: 'Brightpath HR',            positions: 1, boards: 1, pct: 83  },
  ]
  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: '10px 12px', gap: 8, background: '#F6F4EF' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0B1F3B', letterSpacing: '-0.3px' }}>Employers</div>
          <div style={{ fontSize: 8.5, color: '#6b7280', marginTop: 1 }}>Manage your employer profiles</div>
        </div>
        <div style={{ fontSize: 9, fontWeight: 600, padding: '4px 10px', borderRadius: 7, background: '#0B1F3B', color: '#C8A24A', cursor: 'pointer' }}>+ Add Employer</div>
      </div>
      <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', flex: 1 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 52px 56px 56px', padding: '5px 12px', borderBottom: '1px solid #f3f4f6', background: '#f9fafb' }}>
          {['Employer', 'Pos.', 'Boards', 'Success'].map(h => (
            <div key={h} style={{ fontSize: 7.5, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</div>
          ))}
        </div>
        {employers.map((e, i) => (
          <div key={e.name} style={{ display: 'grid', gridTemplateColumns: '1fr 52px 56px 56px', padding: '7px 12px', borderBottom: i < employers.length - 1 ? '1px solid #f3f4f6' : 'none', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{ width: 24, height: 24, borderRadius: 7, background: '#0B1F3B', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: '#C8A24A' }}>{e.name[0]}</span>
              </div>
              <div style={{ fontSize: 9.5, fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name}</div>
            </div>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#374151' }}>{e.positions}</div>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#374151' }}>{e.boards}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ flex: 1, height: 4, background: '#f3f4f6', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${e.pct}%`, background: e.pct >= 90 ? '#22c55e' : e.pct >= 70 ? '#f59e0b' : '#ef4444', borderRadius: 99 }} />
              </div>
              <span style={{ fontSize: 7.5, fontWeight: 600, color: '#6b7280', flexShrink: 0 }}>{e.pct}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function MockActivityPanel() {
  const logs = [
    { action: 'CAPTURE_TRIGGERED', user: 'sarah@techtalent.ca',  resource: 'Round #48',      time: '09:14', c: '#22c55e' },
    { action: 'EMPLOYER_UPDATED',  user: 'sarah@techtalent.ca',  resource: 'Maple Staffing', time: '09:02', c: '#C8A24A' },
    { action: 'POSITION_CREATED',  user: 'sarah@techtalent.ca',  resource: 'DevOps Lead',    time: '08:55', c: '#C8A24A' },
    { action: 'MANUAL_UPLOAD',     user: 'sarah@techtalent.ca',  resource: 'Round #47',      time: '08:30', c: '#22c55e' },
    { action: 'USER_LOGIN',        user: 'sarah@techtalent.ca',  resource: '—',              time: '08:15', c: '#6366f1' },
  ]
  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: '10px 12px', gap: 8, background: '#F6F4EF' }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#0B1F3B', letterSpacing: '-0.3px' }}>Activity Log</div>
        <div style={{ fontSize: 8.5, color: '#6b7280', marginTop: 1 }}>All account events</div>
      </div>
      <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', flex: 1 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 74px 36px', padding: '5px 12px', borderBottom: '1px solid #f3f4f6', background: '#f9fafb' }}>
          {['Action', 'User', 'Resource', 'Time'].map(h => (
            <div key={h} style={{ fontSize: 7.5, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</div>
          ))}
        </div>
        {logs.map((l, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 74px 36px', padding: '7px 12px', borderBottom: i < logs.length - 1 ? '1px solid #f3f4f6' : 'none', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: l.c, flexShrink: 0 }} />
              <div style={{ fontSize: 8.5, fontWeight: 600, color: '#1E2329', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.action}</div>
            </div>
            <div style={{ fontSize: 7.5, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.user}</div>
            <div style={{ fontSize: 7.5, color: '#374151' }}>{l.resource}</div>
            <div style={{ fontSize: 7.5, color: '#9ca3af' }}>{l.time}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Hero Mockup shell ─────────────────────────────────────────────────────────
function HeroMockup() {
  const [activeTab, setActiveTab] = useState<'Dashboard' | 'Employers' | 'Activity Log'>('Dashboard')

  // matches real Layout.tsx sidebar — white bg, dark text, lucide-style icon squares
  const navLinks: { id: 'Dashboard' | 'Employers' | 'Activity Log'; label: string }[] = [
    { id: 'Dashboard',    label: 'Dashboard'    },
    { id: 'Employers',    label: 'Employers'    },
    { id: 'Activity Log', label: 'Activity Log' },
  ]

  return (
    <div className="relative w-full max-w-2xl mx-auto xl:max-w-none">
      {/* Glow backdrop */}
      <div className="absolute inset-0 bg-gradient-to-tr from-brand-gold/20 to-brand-navy/5 rounded-3xl transform rotate-3 scale-105 z-0 pointer-events-none" />

      {/* Shell */}
      <div className="relative z-10 rounded-2xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col select-none"
        style={{ height: 490, background: '#F6F4EF' }}>

        {/* ── Navbar — #061629, gold border-bottom, profile initials ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', height: 48, background: '#061629', borderBottom: '1px solid rgba(200,162,74,0.2)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: 'linear-gradient(135deg,#C8A24A,#e0b95a)', boxShadow: '0 2px 6px rgba(200,162,74,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Shield size={12} color="#fff" strokeWidth={2.5} />
            </div>
            <span style={{ fontWeight: 800, color: '#fff', fontSize: 12, letterSpacing: '-0.3px' }}>ImmigLens</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Bell icon */}
            <div style={{ width: 26, height: 26, borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Bell size={11} color="rgba(255,255,255,0.6)" strokeWidth={2} />
            </div>
            <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.12)' }} />
            {/* Profile button with initials */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 7px', borderRadius: 6, cursor: 'pointer' }}>
              <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(200,162,74,0.2)', border: '1px solid rgba(200,162,74,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: '#C8A24A', flexShrink: 0 }}>SC</div>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.85)', fontWeight: 500 }}>Sarah Chen</span>
              <svg width="10" height="10" viewBox="0 0 10 10" style={{ color: 'rgba(255,255,255,0.4)' }}><polyline points="2,3.5 5,6.5 8,3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
          </div>
        </div>

        {/* ── Body ── */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* Sidebar — WHITE, 130px, dark text, matches real .sidebar */}
          <div style={{ width: 130, minWidth: 130, background: '#ffffff', borderRight: '1px solid rgba(0,0,0,0.08)', display: 'flex', flexDirection: 'column', padding: '10px 7px', gap: 0 }}>
            <div style={{ fontSize: 7.5, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'rgba(30,35,41,0.35)', padding: '0 8px', marginBottom: 4 }}>Navigation</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {navLinks.map(({ id, label }) => {
                const active = id === activeTab
                return (
                  <button
                    key={id}
                    onClick={() => setActiveTab(id)}
                    style={{
                      all: 'unset', position: 'relative', display: 'flex', alignItems: 'center', gap: 6,
                      borderRadius: 7, padding: '5px 8px', boxSizing: 'border-box', width: '100%',
                      background: active ? 'rgba(200,162,74,0.14)' : 'transparent',
                      color: active ? '#1E2329' : '#1E2329',
                      fontSize: 10, fontWeight: active ? 600 : 500,
                      cursor: 'pointer', transition: 'background 0.15s',
                      opacity: active ? 1 : 0.6,
                    }}
                  >
                    {active && <div style={{ position: 'absolute', left: 0, top: '20%', height: '60%', width: 3, background: '#C8A24A', borderRadius: '0 3px 3px 0' }} />}
                    {/* Icon square */}
                    <div style={{ width: 14, height: 14, borderRadius: 4, background: active ? 'rgba(200,162,74,0.2)' : 'rgba(30,35,41,0.07)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {id === 'Dashboard'    && <svg width="8" height="8" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><rect x="9" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><rect x="1" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><rect x="9" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5"/></svg>}
                      {id === 'Employers'    && <svg width="8" height="8" viewBox="0 0 16 16" fill="none"><rect x="2" y="7" width="12" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><path d="M5 7V4a3 3 0 016 0v3" stroke="currentColor" strokeWidth="1.5"/></svg>}
                      {id === 'Activity Log' && <svg width="8" height="8" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/><line x1="5" y1="6" x2="11" y2="6" stroke="currentColor" strokeWidth="1.2"/><line x1="5" y1="9" x2="11" y2="9" stroke="currentColor" strokeWidth="1.2"/></svg>}
                    </div>
                    {label}
                  </button>
                )
              })}
            </div>
            <div style={{ height: 1, background: 'rgba(0,0,0,0.07)', margin: '8px 4px' }} />
            <div style={{ fontSize: 7.5, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'rgba(30,35,41,0.35)', padding: '0 8px', marginBottom: 4 }}>Account</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {[{ label: 'My Plan' }, { label: 'My Account' }].map(({ label }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderRadius: 7, color: '#1E2329', fontSize: 10, fontWeight: 500, opacity: 0.5 }}>
                  <div style={{ width: 14, height: 14, borderRadius: 4, background: 'rgba(30,35,41,0.07)', flexShrink: 0 }} />
                  {label}
                </div>
              ))}
            </div>
          </div>

          {/* Main content area — switches per tab */}
          {activeTab === 'Dashboard'    && <MockDashboardPanel />}
          {activeTab === 'Employers'    && <MockEmployersPanel />}
          {activeTab === 'Activity Log' && <MockActivityPanel />}
        </div>
      </div>
    </div>
  )
}
export function LandingHome() {
  const [tiers, setTiers]         = useState<SubscriptionTier[]>([])
  const [tiersLoading, setTiersLoading] = useState(true)
  const [demoOpen, setDemoOpen]   = useState(false)

  useEffect(() => {
    subscriptions.tiers()
      .then(setTiers)
      .catch(() => setTiers([]))
      .finally(() => setTiersLoading(false))
  }, [])

  // Up to 3 tiers for the teaser; middle one highlighted
  const teaserTiers = tiers.slice(0, 3)
  const popularIdx  = Math.floor((teaserTiers.length - 1) / 2)

  return (

    <div className="flex flex-col min-h-screen w-full overflow-hidden">
      <VideoModal open={demoOpen} onClose={() => setDemoOpen(false)} videoUrl={DEMO_VIDEO_URL} />
      {/* A) HERO */}
      <section className="relative pt-24 pb-32 lg:pt-36 lg:pb-40 overflow-hidden">
        <div className="absolute inset-0 bg-brand-navy/5 pattern-dots pointer-events-none" />
        <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-brand-gold/10 rounded-full blur-3xl opacity-50 transform translate-x-1/2 -translate-y-1/2 pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid lg:grid-cols-2 gap-16 lg:gap-8 items-center">
            {/* Left Content */}
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-gold/10 text-brand-navy font-semibold text-sm mb-8 border border-brand-gold/20 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-brand-gold animate-pulse" />
                LMIA Recruitment Proof Automated
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-brand-navy leading-[1.1] mb-6 tracking-tight">
                No more manual screenshots.{' '}
                <span className="text-brand-gold">We capture your recruitment proof automatically.</span>
              </h1>
              <p className="text-xl text-brand-charcoal/80 mb-10 leading-relaxed">
                ImmigLens monitors your job postings and captures timestamped screenshots automatically
                so you always have audit-ready LMIA recruitment proof, without the manual work.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 mb-4">
                <Link
                  to="/register"
                  className="w-full sm:w-auto bg-brand-gold hover:bg-[#b38e3c] text-white px-8 py-4 rounded-xl font-semibold shadow-lg shadow-brand-gold/20 transition-all text-lg flex items-center justify-center gap-2"
                >
                  Get Started <ArrowRight size={20} />
                </Link>
                <button
                  onClick={() => setDemoOpen(true)}
                  className="w-full sm:w-auto bg-white hover:bg-gray-50 text-brand-navy border-2 border-brand-navy px-8 py-4 rounded-xl font-semibold shadow-sm transition-all text-lg flex items-center justify-center gap-2"
                >
                  <Play size={18} strokeWidth={2.5} /> Watch Demo
                </button>
              </div>
              <p className="text-xs text-brand-charcoal/50 mb-8">No credit card required · Cancel anytime</p>

              <div className="pt-8 border-t border-brand-navy/10">
                <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm font-medium text-brand-charcoal/70 mb-4">
                  <span className="flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-brand-gold" /> Timestamped evidence
                  </span>
                  <span className="flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-brand-gold" /> Automated captures
                  </span>
                  <span className="flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-brand-gold" /> One-click LMIA report
                  </span>
                  <span className="flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-brand-gold" /> Email alerts
                  </span>
                </div>
                <p className="text-xs text-brand-charcoal/50">
                  * Hands-free capture for supported platforms; guided capture for restricted sites.
                </p>
              </div>
            </div>

            {/* Right – Hero Mockup */}
            {/* overflow-x-hidden clips the scale transform's horizontal bleed on small screens */}
            <div className="relative lg:h-[600px] flex items-center justify-center lg:justify-end perspective-1000 overflow-x-hidden lg:overflow-x-visible mt-8 lg:mt-0">
              {/* Scale the fixed-px mockup proportionally on smaller screens.
                  Negative margin-bottom compensates for the layout gap left by the scale transform:
                  -mb = height × (1 − scale) so the container collapses to the visual height. */}
              <div className="w-full [transform-origin:top_center]
                              scale-[0.72] -mb-[137px]
                              sm:scale-[0.86] sm:-mb-[69px]
                              md:scale-[0.93] md:-mb-[34px]
                              lg:scale-100 lg:mb-0">
                <HeroMockup />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* B) BENEFITS STRIP */}
      <section className="bg-brand-navy py-12 border-y border-brand-navy/80 relative z-20 shadow-2xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { icon: Settings, text: 'No manual screenshots' },
              { icon: FileText, text: 'Export-ready evidence' },
              { icon: Clock, text: 'Time-stamped captures' },
              { icon: Download, text: 'Report in one click' },
            ].map((benefit, i) => (
              <div key={i} className="flex flex-col items-center text-center gap-3 group">
                <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-brand-gold group-hover:bg-brand-gold group-hover:text-white transition-colors duration-300 shadow-inner">
                  <benefit.icon size={24} />
                </div>
                <span className="text-white font-medium tracking-wide">{benefit.text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* C) PROBLEM → SOLUTION */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="bg-red-50/50 rounded-3xl p-10 border border-red-100 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-red-100/50 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
              <h3 className="text-2xl font-bold text-red-900 mb-6 flex items-center gap-3">
                <span className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-600">✕</span>
                The Old Way
              </h3>
              <ul className="space-y-5">
                {[
                  'Setting alarms to manually take screenshots every 14 days',
                  'Scrambling when someone forgets to capture a posting',
                  'Messy folders filled with improperly named image files',
                  'Wasting hours formatting a PDF for the LMIA application',
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-4 text-red-800/80 font-medium">
                    <span className="mt-1 w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-green-50/50 rounded-3xl p-10 border border-green-200 shadow-lg relative overflow-hidden transform lg:-translate-y-4">
              <div className="absolute top-0 right-0 w-32 h-32 bg-green-200/50 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
              <h3 className="text-3xl font-bold text-brand-navy mb-6 flex items-center gap-3">
                <span className="w-10 h-10 rounded-full bg-brand-gold flex items-center justify-center text-white shadow-md">✓</span>
                ImmigLens Automation
              </h3>
              <ul className="space-y-6">
                {[
                  'System automatically captures screenshots on your exact schedule',
                  'Never miss a required interval with automated tracking',
                  'All evidence is securely stored and perfectly organized by position',
                  'Generate a compliance-ready, timestamped PDF in seconds',
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-4 text-brand-navy font-semibold text-lg">
                    <CheckCircle2 size={24} className="text-brand-gold shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* D) FEATURE GRID */}
      <section className="py-24 bg-brand-offwhite">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-4xl font-bold text-brand-navy mb-6 tracking-tight">
              Everything you need for perfect compliance
            </h2>
            <p className="text-xl text-brand-charcoal/70">
              Built specifically for the rigorous requirements of Canadian immigration LMIA
              recruitment proof.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <FeatureCard
              icon={Settings}
              title="Automated Screenshot Capture"
              description="Set your capture schedule once and our system automatically captures evidence on the exact dates required."
              bullets={['Set it and forget it', 'Captures full page views', 'Supports major job boards']}
            />
            <FeatureCard
              icon={Clock}
              title="Capture Schedule per Position"
              description="Configure the exact frequency that works for your LMIA timeline, per individual job position."
              bullets={['Every 14 days standard interval', 'Weekly or custom schedules', 'Set start and end dates']}
            />
            <FeatureCard
              icon={ListTodo}
              title="Evidence Timeline"
              description="Every capture is logged with an indisputable timestamp and the original URL preserved for verification."
              bullets={['Indisputable timestamps', 'Original URLs preserved', 'Visual proof gallery']}
            />
            <FeatureCard
              icon={FileText}
              title="One-click LMIA Report PDF"
              description="Generate a professional, ESDC-ready PDF with all captures organized by platform and date."
              bullets={['Auto-organized by platform', 'Ready for ESDC submission', 'Professional formatting']}
            />
            <FeatureCard
              icon={Bell}
              title="Email Alerts"
              description="Stay informed with instant notifications for captures, plan limits, and system alerts."
              bullets={['Capture failure notifications', 'Plan limit warnings', 'Billing alerts']}
            />
            <FeatureCard
              icon={Shield}
              title="Secure Storage + Audit Logs"
              description="All evidence is encrypted and stored securely, with a complete audit trail of every export and access."
              bullets={['Encrypted cloud storage', 'Complete export history', 'Data retention policies']}
            />
          </div>
        </div>
      </section>

      {/* E) HOW IT WORKS PREVIEW */}
      <section className="py-24 bg-white border-y border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-20">
            <h2 className="text-4xl font-bold text-brand-navy mb-6 tracking-tight">
              Proof collection in three simple steps
            </h2>
            <p className="text-xl text-brand-charcoal/70">
              From setup to final report, ImmigLens handles the heavy lifting.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 md:gap-12 mb-16 relative">
            <StepCard
              number={1}
              title="Create Job Position"
              description="Enter the job title, NOC code, and wage details to start tracking a new LMIA position."
            />
            <StepCard
              number={2}
              title="Add Links + Set Schedule"
              description="Paste URLs from Job Bank, Indeed, etc. Choose how often we should capture screenshots."
            />
            <StepCard
              number={3}
              title="Download LMIA-ready Report"
              description="Return when recruitment is done to download a perfectly formatted PDF with all timestamps."
              isLast
            />
          </div>

          <div className="text-center">
            <Link
              to="/how-it-works"
              className="inline-flex items-center gap-2 text-brand-navy font-bold text-lg hover:text-brand-gold transition-colors pb-1 border-b-2 border-brand-gold"
            >
              See How It Works in Detail <ArrowRight size={20} />
            </Link>
          </div>
        </div>
      </section>

      {/* F) WHO IT'S FOR */}
      <section className="py-24 bg-brand-offwhite">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-brand-navy mb-6">Built for immigration professionals</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm hover:shadow-lg transition-all text-center">
              <div className="w-16 h-16 bg-brand-navy/5 rounded-2xl flex items-center justify-center text-brand-navy mx-auto mb-6">
                <Building size={32} />
              </div>
              <h3 className="text-2xl font-bold text-brand-navy mb-4">RCICs & Firms</h3>
              <p className="text-brand-charcoal/70 leading-relaxed">
                Reduce admin work and standardize evidence collection across all your clients and cases.
              </p>
            </div>
            {/* Middle card — elevated with gold top bar */}
            <div className="bg-white p-8 rounded-3xl border border-brand-gold/20 shadow-md hover:shadow-xl transition-all text-center transform md:-translate-y-4 relative overflow-hidden">
              <div className="absolute top-0 inset-x-0 h-1 bg-brand-gold" />
              <div className="w-16 h-16 bg-brand-gold/10 rounded-2xl flex items-center justify-center text-brand-gold mx-auto mb-6">
                <Users size={32} />
              </div>
              <h3 className="text-2xl font-bold text-brand-navy mb-4">Recruiters</h3>
              <p className="text-brand-charcoal/70 leading-relaxed">
                Deliver repeatable, flawless proof packages to employers without wasting your sourcing time.
              </p>
            </div>
            <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm hover:shadow-lg transition-all text-center">
              <div className="w-16 h-16 bg-brand-navy/5 rounded-2xl flex items-center justify-center text-brand-navy mx-auto mb-6">
                <Briefcase size={32} />
              </div>
              <h3 className="text-2xl font-bold text-brand-navy mb-4">Employers</h3>
              <p className="text-brand-charcoal/70 leading-relaxed">
                Keep perfectly organized records ready for submission without relying on HR to remember.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* G) PRICING TEASER */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-4xl font-bold text-brand-navy mb-6 tracking-tight">
              Simple pricing based on Active Postings
            </h2>
            <p className="text-xl text-brand-charcoal/70">
              Draft, paused, or archived positions never count towards your limit.
            </p>
          </div>
          {tiersLoading && (
            <div className="flex items-center justify-center gap-3 py-12 text-brand-charcoal/50">
              <Loader2 size={22} className="animate-spin" />
              <span>Loading plans…</span>
            </div>
          )}

          {!tiersLoading && teaserTiers.length > 0 && (
            <div className={`grid md:grid-cols-${Math.min(teaserTiers.length, 3)} gap-8 max-w-5xl mx-auto`}>
              {teaserTiers.map((tier, idx) => (
                <PricingCard
                  key={tier.id}
                  limit={fmt(tier.max_active_positions)}
                  price={tier.price_per_month ?? 'Contact Sales'}
                  isPopular={idx === popularIdx && teaserTiers.length > 1}
                  features={tierFeatures(tier)}
                />
              ))}
            </div>
          )}

          {!tiersLoading && teaserTiers.length === 0 && (
            <div className={`grid md:grid-cols-3 gap-8 max-w-5xl mx-auto`}>
              <PricingCard limit="10" price={39}
                features={['Automated captures', 'Evidence timeline', 'LMIA-ready PDF', 'Email alerts']} />
              <PricingCard limit="25" price={79} isPopular
                features={['Automated captures', 'Evidence timeline', 'LMIA-ready PDF', 'Email alerts', 'Priority processing']} />
              <PricingCard limit="50" price={119}
                features={['Automated captures', 'Evidence timeline', 'LMIA-ready PDF', 'Email alerts', 'Extended retention']} />
            </div>
          )}
          <div className="text-center mt-12">
            <Link
              to="/pricing"
              className="text-brand-navy font-bold text-lg hover:text-brand-gold transition-colors inline-flex items-center gap-2"
            >
              See All Pricing Plans <ArrowRight size={20} />
            </Link>
          </div>
        </div>
      </section>

      {/* H) SECURITY TEASER — navy bg, 2-col */}
      <section className="py-24 bg-brand-navy text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-white/5 pattern-dots pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div>
              <div className="w-16 h-16 bg-brand-gold/20 rounded-2xl flex items-center justify-center text-brand-gold mb-8">
                <Shield size={32} />
              </div>
              <h2 className="text-4xl font-bold mb-6">
                Bank-grade security for sensitive compliance data
              </h2>
              <ul className="space-y-4 mb-10">
                {[
                  'End-to-end encryption for stored proof',
                  'Role-based controlled access',
                  'Comprehensive audit logs',
                  'Customizable retention options',
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-white/80 font-medium text-lg">
                    <CheckCircle2 size={20} className="text-brand-gold" />
                    {item}
                  </li>
                ))}
              </ul>
              <Link
                to="/security"
                className="bg-white hover:bg-gray-100 text-brand-navy px-8 py-4 rounded-xl font-bold shadow-lg transition-all inline-flex items-center gap-2"
              >
                Security & Compliance Details <ArrowRight size={20} />
              </Link>
            </div>
            {/* Audit log mockup */}
            <div className="bg-[#153461] border border-[#2a4d82] rounded-3xl p-8 shadow-2xl">
              <div className="space-y-6">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-4 bg-brand-navy/50 p-4 rounded-xl border border-white/5">
                    <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center text-green-400">
                      <Shield size={18} />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white">System Audit Log</div>
                      <div className="text-xs text-white/50">
                        User 00{i} accessed Report ID {890 + i} • Today at 10:4{i} AM
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* I) FINAL CTA */}
      <CTABand />
    </div>
  )
}
