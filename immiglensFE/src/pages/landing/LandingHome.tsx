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
  Users,
  Briefcase,
  Building,
  Link as LinkIcon,
} from 'lucide-react'
import { FeatureCard, StepCard, CTABand, PricingCard } from './LandingUI'

// ── Hero Mockup (matches SupportCode/Mockups.tsx) ──────────────────────────────
function HeroMockup() {
  return (
    <div className="relative w-full max-w-2xl mx-auto xl:max-w-none">
      <div className="absolute inset-0 bg-gradient-to-tr from-brand-gold/20 to-brand-navy/5 rounded-3xl transform rotate-3 scale-105 z-0 pointer-events-none transition-transform duration-700 hover:rotate-6" />

      <div className="relative z-10 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col h-[500px]">
        {/* App Header */}
        <div className="h-14 border-b border-gray-100 flex items-center justify-between px-6 bg-gray-50/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-brand-navy rounded-lg flex items-center justify-center text-brand-gold">
              <span className="text-xs font-bold">LV</span>
            </div>
            <span className="font-semibold text-brand-navy">Dashboard</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-xs font-medium px-3 py-1.5 bg-brand-offwhite text-brand-charcoal rounded-md border border-gray-200 shadow-sm">
              Active Postings <span className="font-bold text-brand-navy">8/25</span>
            </div>
            <div className="w-8 h-8 rounded-full bg-gray-200 border-2 border-white shadow-sm flex items-center justify-center text-gray-500">
              <Settings size={14} />
            </div>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-48 border-r border-gray-100 bg-gray-50/30 p-4 hidden sm:flex flex-col gap-2">
            {[
              { icon: FileText, label: 'Job Positions', active: true },
              { icon: Clock, label: 'Schedules' },
              { icon: Download, label: 'Reports' },
              { icon: Settings, label: 'Settings' },
            ].map((item, i) => (
              <div
                key={i}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  item.active ? 'bg-brand-navy text-white shadow-md' : 'text-brand-charcoal hover:bg-gray-100'
                }`}
              >
                <item.icon size={16} />
                <span className="font-medium">{item.label}</span>
              </div>
            ))}
          </div>

          {/* Main Content */}
          <div className="flex-1 p-6 bg-white overflow-y-auto">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-xl font-bold text-brand-navy">Software Engineer</h2>
                <div className="flex items-center gap-2 mt-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> Active
                  </span>
                  <span className="text-sm text-gray-500 flex items-center gap-1">
                    <Clock size={14} /> Every 14 days for 8 weeks
                  </span>
                </div>
              </div>
              <div className="bg-brand-gold text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm cursor-default">
                <Download size={16} /> Generate LMIA Report (PDF)
              </div>
            </div>

            {/* Tracked Postings */}
            <div className="bg-brand-offwhite rounded-xl p-5 mb-6 border border-gray-100 shadow-sm">
              <h3 className="text-sm font-bold text-brand-navy mb-3 flex items-center gap-2">
                <LinkIcon size={16} /> Tracked Postings (3)
              </h3>
              <div className="space-y-2">
                {['Indeed', 'Job Bank', 'LinkedIn'].map((platform, i) => (
                  <div key={i} className="flex items-center justify-between bg-white px-4 py-2.5 rounded-lg border border-gray-100 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600">
                        {platform[0]}
                      </div>
                      <span className="text-sm font-medium text-brand-charcoal">{platform}</span>
                    </div>
                    <span className="text-xs text-green-600 font-medium bg-green-50 px-2 py-0.5 rounded border border-green-100">Verified</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Capture Timeline */}
            <div>
              <h3 className="text-sm font-bold text-brand-navy mb-4">Capture Timeline</h3>
              <div className="relative pl-4 border-l-2 border-brand-navy/10 space-y-6">
                {[
                  { date: 'Oct 12, 2023', time: '10:00 AM', status: 'completed' },
                  { date: 'Oct 26, 2023', time: '10:00 AM', status: 'completed' },
                  { date: 'Nov 09, 2023', time: '10:00 AM', status: 'scheduled' },
                ].map((capture, i) => (
                  <div key={i} className="relative">
                    <div className={`absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full border-2 ${
                      capture.status === 'completed' ? 'bg-brand-gold border-brand-gold' : 'bg-white border-gray-300'
                    }`} />
                    <div className="bg-white border border-gray-100 rounded-lg p-4 shadow-sm">
                      <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-brand-navy">{capture.date}</span>
                          <span className="text-xs text-gray-500">{capture.time}</span>
                        </div>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                          capture.status === 'completed'
                            ? 'bg-green-50 text-green-700 border-green-200'
                            : 'bg-gray-50 text-gray-600 border-gray-200'
                        }`}>
                          {capture.status === 'completed' ? 'Captured (3/3)' : 'Scheduled'}
                        </span>
                      </div>
                      {capture.status === 'completed' && (
                        <div className="flex gap-2 mt-3">
                          {[1, 2, 3].map((img) => (
                            <div key={img} className="w-12 h-10 bg-gray-100 rounded border border-gray-200 flex items-center justify-center">
                              <FileText size={14} className="text-gray-400" />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function LandingHome() {
  return (
    <div className="flex flex-col min-h-screen w-full overflow-hidden">
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
                Set it once. We capture LMIA recruitment proof{' '}
                <span className="text-brand-gold">automatically.</span>
              </h1>
              <p className="text-xl text-brand-charcoal/80 mb-10 leading-relaxed">
                Add your job posting links, choose the capture schedule, and download a timestamped
                LMIA-ready PDF report whenever you need it.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 mb-12">
                <Link
                  to="/register"
                  className="bg-brand-gold hover:bg-[#b38e3c] text-white px-8 py-4 rounded-xl font-semibold shadow-lg shadow-brand-gold/20 transition-all text-lg flex items-center justify-center gap-2"
                >
                  Start Free Trial <ArrowRight size={20} />
                </Link>
                <Link
                  to="/how-it-works"
                  className="bg-white hover:bg-gray-50 text-brand-navy border-2 border-brand-navy px-8 py-4 rounded-xl font-semibold shadow-sm transition-all text-lg flex items-center justify-center"
                >
                  View Sample Report
                </Link>
              </div>

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
                LMIA Vault Automation
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
              From setup to final report, LMIA Vault handles the heavy lifting.
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
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <PricingCard
              limit="10"
              price={39}
              features={['Automated captures', 'Evidence timeline', 'LMIA-ready PDF', 'Email alerts']}
            />
            <PricingCard
              limit="25"
              price={79}
              isPopular
              features={['Automated captures', 'Evidence timeline', 'LMIA-ready PDF', 'Email alerts', 'Priority processing']}
            />
            <PricingCard
              limit="50"
              price={119}
              features={['Automated captures', 'Evidence timeline', 'LMIA-ready PDF', 'Email alerts', 'Extended retention']}
            />
          </div>
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
