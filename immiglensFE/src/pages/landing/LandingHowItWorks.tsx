import { Link } from 'react-router-dom'
import { ArrowRight, FileText, Link as LinkIcon, Clock, Camera, Download, Bell } from 'lucide-react'
import { CTABand, AlertBanner } from './LandingUI'

const steps = [
  {
    icon: FileText,
    title: 'Create a Job Position',
    content:
      'Start by entering the basic details for the LMIA application: Job Title, NOC code, Wage, and any internal reference numbers. This creates a dedicated folder for all upcoming evidence.',
    features: ['Job Title & NOC', 'Wage Details', 'Internal Reference ID'],
  },
  {
    icon: LinkIcon,
    title: 'Add Posting Links',
    content:
      'Paste the URLs where your job ad is currently live. We support major platforms like Job Bank, Indeed, LinkedIn, and more.',
    features: ['Multiple Platforms', 'URL Validation', 'Status Tracking'],
  },
  {
    icon: Clock,
    title: 'Set Capture Schedule',
    content:
      'Choose how often you need screenshots. The standard is every 14 days, but you can select weekly or create a custom schedule. Set a start date and an optional end date.',
    features: ['14-day Intervals', 'Weekly Options', 'Start/End Dates'],
  },
  {
    icon: Camera,
    title: 'Automated Captures Saved',
    content:
      "Our system takes over. On the scheduled dates, it visits each URL, captures a full-page screenshot, securely stamps the time and date, and saves it to the position's folder.",
    features: ['Full-page Screenshots', 'Indisputable Timestamps', 'Original URLs'],
  },
  {
    icon: Download,
    title: 'Generate PDF Report',
    content:
      'When recruitment is complete, simply click "Generate Report". We compile all screenshots, logically organized by platform and date, into a single, professional PDF ready for ESDC.',
    features: ['Organized Sections', 'Professional Formatting', 'ESDC Ready'],
  },
  {
    icon: Bell,
    title: 'Email Notifications',
    content:
      "Stay informed without checking the dashboard. We'll alert you if a capture fails, when your trial is ending, or if you reach your plan limit.",
    features: ['Failure Alerts', 'Plan Limits', 'Trial Reminders'],
  },
]

export function LandingHowItWorks() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero */}
      <section className="pt-24 pb-16 bg-brand-navy text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-white/5 pattern-dots pointer-events-none" />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <h1 className="text-4xl md:text-6xl font-extrabold mb-6 tracking-tight">
            How LMIA Vault Works
          </h1>
          <p className="text-xl text-white/80 leading-relaxed mb-8">
            From pasting a link to downloading a compliance-ready PDF, see how automation replaces
            manual admin work.
          </p>
          <AlertBanner
            type="info"
            message="Hands-free capture for supported platforms; guided capture for restricted sites."
          />
        </div>
      </section>

      {/* Steps */}
      <section className="py-24 bg-brand-offwhite relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="hidden lg:block absolute left-1/2 top-40 bottom-40 w-0.5 bg-brand-gold/20 -translate-x-1/2 z-0" />

          <div className="space-y-24 relative z-10">
            {steps.map((step, idx) => {
              const isEven = idx % 2 === 0
              return (
                <div
                  key={idx}
                  className={`flex flex-col lg:flex-row gap-12 lg:gap-24 items-center ${isEven ? '' : 'lg:flex-row-reverse'}`}
                >
                  {/* Mockup placeholder */}
                  <div className="flex-1 w-full relative">
                    <div className="bg-white rounded-3xl p-6 shadow-xl border border-gray-100 flex items-center justify-center min-h-[260px] relative overflow-hidden group">
                      <div className="absolute inset-0 pattern-dots opacity-30 transition-opacity group-hover:opacity-60" />
                      <div className="relative z-10 text-center">
                        <div className="w-20 h-20 bg-brand-offwhite rounded-2xl flex items-center justify-center text-brand-navy mx-auto mb-4 shadow-sm">
                          <step.icon size={40} />
                        </div>
                        <span className="text-sm font-semibold text-brand-charcoal/70 bg-white/80 px-4 py-2 rounded-lg border border-gray-200 shadow-sm">
                          Step {idx + 1}: {step.title}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Content */}
                  <div className={`flex-1 ${isEven ? 'lg:pr-12' : 'lg:pl-12'}`}>
                    <div className="w-16 h-16 bg-brand-navy rounded-2xl flex items-center justify-center text-brand-gold text-2xl font-bold mb-6 shadow-lg shadow-brand-navy/20">
                      {idx + 1}
                    </div>
                    <h2 className="text-3xl font-bold text-brand-navy mb-4 tracking-tight">
                      {step.title}
                    </h2>
                    <p className="text-lg text-brand-charcoal/80 mb-8 leading-relaxed">
                      {step.content}
                    </p>
                    <ul className="space-y-4">
                      {step.features.map((feature, i) => (
                        <li key={i} className="flex items-center gap-3 text-brand-charcoal font-medium">
                          <div className="w-6 h-6 rounded-full bg-brand-gold/10 flex items-center justify-center text-brand-gold">
                            <span className="w-2 h-2 rounded-full bg-brand-gold" />
                          </div>
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 bg-white border-y border-gray-100">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-brand-navy rounded-full text-brand-gold mb-8 shadow-xl shadow-brand-navy/20">
            <Download size={40} />
          </div>
          <h2 className="text-4xl font-bold text-brand-navy mb-8 tracking-tight">
            Ready to see the final output?
          </h2>
          <p className="text-xl text-brand-charcoal/70 mb-10 leading-relaxed">
            Stop worrying about formatting PDFs. Our reports are designed specifically for ESDC
            review, containing everything needed to prove your recruitment efforts.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/register"
              className="bg-brand-gold hover:bg-[#b38e3c] text-white px-8 py-4 rounded-xl font-semibold shadow-lg transition-all text-lg flex items-center justify-center gap-2"
            >
              Start Free Trial <ArrowRight size={20} />
            </Link>
            <Link
              to="/pricing"
              className="bg-white hover:bg-gray-50 text-brand-navy border-2 border-brand-navy px-8 py-4 rounded-xl font-semibold shadow-sm transition-all text-lg flex items-center justify-center"
            >
              See Pricing
            </Link>
          </div>
        </div>
      </section>

      <CTABand />
    </div>
  )
}
