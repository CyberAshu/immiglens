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
  User,
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
function HeroMockup() {
  const stats = [
    { label: 'Employers',      value: '4',   accent: '#0B1F3B' },
    { label: 'Job Positions',  value: '8',   accent: '#C8A24A' },
    { label: 'Job Board URLs', value: '12',  accent: '#1a3352' },
    { label: 'Rounds Done',    value: '6/8', accent: '#22c55e' },
    { label: 'Pending',        value: '2',   accent: '#f59e0b' },
    { label: 'Screenshots',    value: '47',  accent: '#0B1F3B' },
  ]
  const sidebarLinks = ['Dashboard','Employers','Organizations','Notifications','Audit Logs']
  const bars = [
    { name: 'Maple',  done: 100, failed: 13 },
    { name: 'NorCan', done: 75,  failed: 0  },
    { name: 'Peak',   done: 63,  failed: 13 },
    { name: 'Bright', done: 56,  failed: 6  },
  ]

  return (
    <div className="relative w-full max-w-2xl mx-auto xl:max-w-none">
      {/* Glow backdrop */}
      <div className="absolute inset-0 bg-gradient-to-tr from-brand-gold/20 to-brand-navy/5 rounded-3xl transform rotate-3 scale-105 z-0 pointer-events-none transition-transform duration-700" />

      {/* Shell */}
      <div className="relative z-10 rounded-2xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col select-none"
        style={{ height: 490, background: '#F6F4EF' }}>

        {/* ── Navbar ── */}
        <div className="flex items-center justify-between flex-shrink-0 px-5"
          style={{ height: 52, background: '#0B1F3B', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center flex-shrink-0"
              style={{ width: 30, height: 30, borderRadius: 9, background: 'linear-gradient(135deg,#C8A24A,#e0b95a)', boxShadow: '0 2px 8px rgba(200,162,74,0.35)' }}>
              <Shield size={14} color="#fff" strokeWidth={2.5} />
            </div>
            <span style={{ fontWeight: 800, color: '#fff', fontSize: 13, letterSpacing: '-0.4px' }}>ImmigLens</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5" style={{ color: 'rgba(255,255,255,0.82)', fontSize: 11 }}>
              <div className="flex items-center justify-center"
                style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(200,162,74,0.2)', border: '1px solid rgba(200,162,74,0.4)' }}>
                <User size={11} color="#C8A24A" />
              </div>
              Sarah Chen
            </div>
            <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.12)' }} />
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 5, padding: '3px 8px' }}>Logout</div>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex flex-1 overflow-hidden">

          {/* Sidebar */}
          <div className="flex flex-col flex-shrink-0 py-4 px-2.5"
            style={{ width: 152, background: '#0B1F3B', borderRight: '1px solid rgba(255,255,255,0.07)' }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.28)', padding: '0 8px', marginBottom: 6 }}>Navigation</div>
            {sidebarLinks.map((label, i) => (
              <div key={label} className="relative flex items-center gap-2 rounded-lg" style={{
                padding: '7px 10px', marginBottom: 2,
                background: i === 0 ? 'rgba(200,162,74,0.14)' : 'transparent',
                color: i === 0 ? '#d4aa55' : 'rgba(255,255,255,0.42)',
                fontSize: 11, fontWeight: i === 0 ? 600 : 500,
              }}>
                {i === 0 && <div style={{ position: 'absolute', left: 0, top: '20%', bottom: '20%', width: 3, background: '#C8A24A', borderRadius: '0 3px 3px 0' }} />}
                <div style={{ width: 14, height: 14, borderRadius: 4, background: i === 0 ? 'rgba(200,162,74,0.25)' : 'rgba(255,255,255,0.06)', flexShrink: 0 }} />
                {label}
              </div>
            ))}
            <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '8px 6px' }} />
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.28)', padding: '0 8px', marginBottom: 6 }}>Account</div>
            <div className="flex items-center gap-2 rounded-lg" style={{ padding: '7px 10px', color: 'rgba(255,255,255,0.38)', fontSize: 11 }}>
              <div style={{ width: 14, height: 14, borderRadius: 4, background: 'rgba(255,255,255,0.06)', flexShrink: 0 }} />
              My Plan
            </div>
          </div>

          {/* Main content */}
          <div className="flex-1 overflow-hidden flex flex-col gap-3 p-4" style={{ background: '#F6F4EF' }}>

            {/* Page title */}
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0B1F3B', lineHeight: 1 }}>Dashboard</div>

            {/* Plan strip */}
            <div className="flex items-center gap-3 flex-shrink-0" style={{
              background: '#fff', border: '1px solid #e5e7eb', borderLeft: '3px solid #C8A24A',
              borderRadius: 10, padding: '7px 14px', fontSize: 10,
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
            }}>
              <div className="flex items-center gap-1.5">
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#C8A24A' }} />
                <span style={{ fontWeight: 700, color: '#0B1F3B', fontSize: 11 }}>Pro Plan</span>
              </div>
              <div style={{ width: 1, height: 14, background: '#e5e7eb' }} />
              <span style={{ color: '#6b7280' }}>Employers <strong style={{ color: '#0B1F3B' }}>4/10</strong></span>
              <span style={{ color: '#6b7280' }}>Captures <strong style={{ color: '#0B1F3B' }}>47/50</strong></span>
              <span style={{ color: '#6b7280' }}>Positions <strong style={{ color: '#0B1F3B' }}>8</strong></span>
              <span style={{ color: '#C8A24A', fontWeight: 600, marginLeft: 'auto', fontSize: 10 }}>View Plan →</span>
            </div>

            {/* Stat cards */}
            <div className="grid grid-cols-3 gap-2 flex-shrink-0">
              {stats.map(s => (
                <div key={s.label} style={{
                  background: '#fff', borderRadius: 10, padding: '8px 12px',
                  border: '1px solid #e5e7eb', borderTop: `3px solid ${s.accent}`,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                }}>
                  <div style={{ fontSize: 9, color: '#9ca3af', fontWeight: 600, marginBottom: 3 }}>{s.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: s.accent, lineHeight: 1 }}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Charts */}
            <div className="flex gap-2" style={{ flex: 1, minHeight: 0 }}>

              {/* Donut */}
              <div style={{ width: 120, background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', padding: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', marginBottom: 6 }}>Capture Status</div>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="72" height="72" viewBox="0 0 70 70">
                    <circle cx="35" cy="35" r="25" fill="none" stroke="#f3f4f6" strokeWidth="10"/>
                    <circle cx="35" cy="35" r="25" fill="none" stroke="#22c55e" strokeWidth="10"
                      strokeDasharray="94 63" transform="rotate(-90 35 35)"/>
                    <circle cx="35" cy="35" r="25" fill="none" stroke="#C8A24A" strokeWidth="10"
                      strokeDasharray="25 132" strokeDashoffset="-94" transform="rotate(-90 35 35)"/>
                    <circle cx="35" cy="35" r="25" fill="none" stroke="#ef4444" strokeWidth="10"
                      strokeDasharray="10 147" strokeDashoffset="-119" transform="rotate(-90 35 35)"/>
                    <text x="35" y="39" textAnchor="middle" fill="#0B1F3B" fontSize="12" fontWeight="700">47</text>
                  </svg>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {[{ c: '#22c55e', l: 'Done 60%' }, { c: '#C8A24A', l: 'Pending 16%' }, { c: '#ef4444', l: 'Failed 6%' }].map(x => (
                    <div key={x.l} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: '#6b7280' }}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', background: x.c, flexShrink: 0 }} />{x.l}
                    </div>
                  ))}
                </div>
              </div>

              {/* Bar chart */}
              <div style={{ flex: 1, background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', padding: '10px 12px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', marginBottom: 8 }}>Screenshots by Employer</div>
                <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: 8, padding: '0 4px' }}>
                  {bars.map(d => (
                    <div key={d.name} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                      <div style={{ width: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 2 }}>
                        <div style={{ width: 9, height: `${d.done}px`, background: '#22c55e', borderRadius: '3px 3px 0 0' }} />
                        {d.failed > 0 && <div style={{ width: 9, height: `${d.failed}px`, background: '#ef4444', borderRadius: '3px 3px 0 0' }} />}
                      </div>
                      <div style={{ fontSize: 8, color: '#9ca3af', marginTop: 3 }}>{d.name}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 8, paddingTop: 6, borderTop: '1px solid #f3f4f6' }}>
                  {[{ c: '#22c55e', l: 'Successful' }, { c: '#ef4444', l: 'Failed' }].map(x => (
                    <div key={x.l} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: '#6b7280' }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: x.c }} />{x.l}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
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
              <h1 className="text-5xl lg:text-6xl font-extrabold text-brand-navy leading-[1.1] mb-6 tracking-tight">
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
                  className="bg-brand-gold hover:bg-[#b38e3c] text-white px-8 py-4 rounded-xl font-semibold shadow-lg shadow-brand-gold/20 transition-all text-lg flex items-center justify-center gap-2"
                >
                  Start Free Trial <ArrowRight size={20} />
                </Link>
                <button
                  onClick={() => setDemoOpen(true)}
                  className="bg-white hover:bg-gray-50 text-brand-navy border-2 border-brand-navy px-8 py-4 rounded-xl font-semibold shadow-sm transition-all text-lg flex items-center justify-center gap-2"
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
            <div className="relative lg:h-[600px] flex items-center justify-center lg:justify-end perspective-1000">
              <HeroMockup />
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
              description="Stay informed with instant notifications for captures, plan limits, and trial status."
              bullets={['Capture failure notifications', 'Trial ending alerts', 'Plan limit warnings']}
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
