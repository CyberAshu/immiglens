import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ChevronDown, ChevronUp, AlertCircle, ArrowRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// ── FeatureCard ──────────────────────────────────────────────────────────────
export function FeatureCard({
  icon: Icon,
  title,
  bullets,
}: {
  icon: LucideIcon
  title: string
  description?: string
  bullets?: string[]
}) {
  return (
    <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
      <div className="w-12 h-12 bg-brand-offwhite rounded-xl flex items-center justify-center text-brand-navy mb-6">
        <Icon size={24} />
      </div>
      <h3 className="text-xl font-semibold text-brand-navy mb-4">{title}</h3>
      <ul className="space-y-3">
        {(bullets ?? []).map((bullet, idx) => (
          <li key={idx} className="flex items-start gap-3 text-brand-charcoal/80">
            <Check size={18} className="text-brand-gold shrink-0 mt-0.5" />
            <span className="text-sm leading-relaxed">{bullet}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── StepCard ─────────────────────────────────────────────────────────────────
export function StepCard({
  number,
  title,
  description,
  isLast,
}: {
  number: number
  title: string
  description: string
  isLast?: boolean
}) {
  return (
    <div className="relative group">
      {!isLast && (
        <div className="hidden md:block absolute top-12 left-24 right-0 h-0.5 bg-gradient-to-r from-brand-gold/20 to-transparent z-0" />
      )}
      <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 hover:shadow-md transition-shadow relative z-10 flex flex-col h-full">
        <div className="w-14 h-14 bg-brand-navy rounded-2xl flex items-center justify-center text-brand-gold font-bold text-xl mb-6 shadow-sm group-hover:bg-brand-gold group-hover:text-white transition-colors">
          {number}
        </div>
        <h3 className="text-2xl font-bold text-brand-navy mb-4">{title}</h3>
        <p className="text-brand-charcoal/80 leading-relaxed">{description}</p>
      </div>
    </div>
  )
}

// ── PricingCard ───────────────────────────────────────────────────────────────
export function PricingCard({
  limit,
  price,
  isPopular,
  features,
  isAnnual = false,
  annualDiscount = 0,
}: {
  limit: string
  price: string | number
  isPopular?: boolean
  features: string[]
  isAnnual?: boolean
  annualDiscount?: number
}) {
  const displayPrice =
    isAnnual && typeof price === 'number' ? Math.floor(price * (1 - annualDiscount)) : price

  return (
    <div
      className={`relative bg-white rounded-3xl p-8 border transition-all duration-300 hover:-translate-y-1 flex flex-col h-full ${
        isPopular ? 'border-brand-gold shadow-lg shadow-brand-gold/10' : 'border-gray-200 shadow-sm'
      }`}
    >
      {isPopular && (
        <div className="absolute -top-4 inset-x-0 flex justify-center">
          <span className="bg-brand-gold text-white text-xs font-bold uppercase tracking-wider py-1.5 px-4 rounded-full shadow-sm">
            Most Popular
          </span>
        </div>
      )}
      <div className="mb-6">
        <h3 className="text-xl font-bold text-brand-navy mb-2">{limit} Active Postings</h3>
        <p className="text-brand-charcoal/60 text-sm h-5">
          {limit === 'Custom' ? 'Unlimited potential' : 'Only active postings count'}
        </p>
      </div>
      <div className="mb-8 flex items-baseline gap-2">
        {typeof displayPrice === 'number' ? (
          <>
            <span className="text-5xl font-bold text-brand-navy">${displayPrice}</span>
            <span className="text-brand-charcoal/60 font-medium">/mo</span>
          </>
        ) : (
          <span className="text-4xl font-bold text-brand-navy">{displayPrice}</span>
        )}
      </div>

      {isAnnual && typeof price === 'number' && (
        <div className="bg-green-50 text-green-700 text-xs font-semibold px-3 py-1.5 rounded-lg mb-6 w-fit border border-green-200">
          Save ${Math.floor(price * 12 * annualDiscount)} a year
        </div>
      )}

      <Link
        to={limit === 'Custom' ? '/contact' : '/register'}
        className={`w-full block text-center py-3.5 rounded-xl font-semibold mb-8 transition-colors border ${
          isPopular
            ? 'bg-brand-navy hover:bg-brand-charcoal text-white border-transparent shadow-md'
            : 'bg-white hover:bg-gray-50 text-brand-navy border-gray-200'
        }`}
      >
        {limit === 'Custom' ? 'Contact Sales' : 'Get Started'}
      </Link>

      <div className="mt-auto">
        <p className="text-xs font-semibold text-brand-navy uppercase tracking-wider mb-4">Includes:</p>
        <ul className="space-y-3.5">
          {features.map((feature, idx) => (
            <li key={idx} className="flex items-start gap-3">
              <Check size={18} className="text-brand-gold shrink-0 mt-0.5" />
              <span className="text-sm text-brand-charcoal/80">{feature}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

// ── ROICard ──────────────────────────────────────────────────────────────────
export function ROICard() {
  return (
    <div className="bg-gradient-to-br from-brand-navy to-[#153461] rounded-3xl p-8 md:p-12 shadow-xl border border-[#2a4d82] overflow-hidden relative">
      <div className="relative z-10 grid md:grid-cols-2 gap-12 items-center">
        <div>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6 leading-tight">
            Replace $880/month of admin time with{' '}
            <span className="text-brand-gold">$79/month.</span>
          </h2>
          <p className="text-white/80 text-lg mb-8 leading-relaxed">
            Many firms spend 8–10 hours/week taking screenshots and organizing proof. That's ~40
            hours/month.
          </p>
          <div className="hidden md:flex gap-4">
            <Link
              to="/register"
              className="bg-brand-gold hover:bg-[#b38e3c] text-white px-8 py-4 rounded-xl font-semibold shadow-lg shadow-brand-gold/20 transition-all flex items-center justify-center gap-2 text-lg"
            >
              Get Started <ArrowRight size={20} />
            </Link>
          </div>
        </div>

        <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-8 shadow-2xl">
          <div className="space-y-6">
            <div className="flex justify-between items-center border-b border-white/10 pb-6">
              <span className="text-white/80">Manual Admin Time</span>
              <div className="text-right">
                <span className="block text-2xl font-bold text-red-400">40 hours</span>
                <span className="text-xs text-white/50">× $22/hour = $880/mo</span>
              </div>
            </div>
            <div className="flex justify-between items-center pt-2">
              <span className="text-white font-medium text-lg flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-brand-gold" />
                ImmigLens
              </span>
              <span className="text-3xl font-bold text-brand-gold">$79/mo</span>
            </div>
          </div>
          <div className="mt-8 pt-6 border-t border-white/10 flex flex-col md:hidden">
            <Link
              to="/register"
              className="bg-brand-gold hover:bg-[#b38e3c] text-white px-8 py-4 rounded-xl font-semibold transition-all flex items-center justify-center gap-2"
            >
              Get Started
            </Link>
          </div>
          <p className="text-white/40 text-xs text-center mt-6">
            Example for illustration; results vary.
          </p>
        </div>
      </div>
    </div>
  )
}

// ── CTABand ───────────────────────────────────────────────────────────────────
export function CTABand() {
  return (
    <section className="py-24 bg-brand-offwhite relative overflow-hidden">
      <div className="absolute inset-0 bg-brand-navy/5 pattern-dots pointer-events-none" />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
        <h2 className="text-4xl md:text-5xl font-bold text-brand-navy mb-8 tracking-tight">
          Stop chasing screenshots.<br className="hidden sm:block" /> Export LMIA proof in minutes.
        </h2>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            to="/register"
            className="w-full sm:w-auto bg-brand-gold hover:bg-[#b38e3c] text-white px-8 py-4 rounded-xl font-semibold shadow-lg shadow-brand-gold/20 transition-all text-lg flex items-center justify-center gap-2"
          >
            Get Started <ArrowRight size={20} />
          </Link>
          <Link
            to="/contact"
            className="w-full sm:w-auto bg-white hover:bg-gray-50 text-brand-navy border border-gray-200 px-8 py-4 rounded-xl font-semibold shadow-sm transition-all text-lg flex items-center justify-center"
          >
            Contact Sales
          </Link>
        </div>
      </div>
    </section>
  )
}

// ── FAQAccordion ──────────────────────────────────────────────────────────────
export function FAQAccordion({ items }: { items: { q: string; a: React.ReactNode }[] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(0)

  return (
    <div className="space-y-4">
      {items.map((item, idx) => {
        const isOpen = openIdx === idx
        return (
          <div
            key={idx}
            className={`bg-white border rounded-2xl overflow-hidden transition-all duration-300 shadow-sm ${
              isOpen ? 'border-brand-navy/20 shadow-md' : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <button
              onClick={() => setOpenIdx(isOpen ? null : idx)}
              className="w-full px-6 py-5 flex items-center justify-between text-left focus:outline-none"
            >
              <span
                className={`font-semibold pr-8 text-lg ${
                  isOpen ? 'text-brand-navy' : 'text-brand-charcoal'
                }`}
              >
                {item.q}
              </span>
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                  isOpen ? 'bg-brand-navy text-white' : 'bg-gray-100 text-gray-500'
                }`}
              >
                {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </div>
            </button>
            <div
              style={{
                maxHeight: isOpen ? '600px' : '0',
                opacity: isOpen ? 1 : 0,
                overflow: 'hidden',
                transition: 'max-height 0.35s ease, opacity 0.25s ease',
              }}
            >
              <div className="px-6 pb-6 pt-2 text-brand-charcoal/80 leading-relaxed border-t border-gray-100 mt-2">
                {item.a}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── AlertBanner ───────────────────────────────────────────────────────────────
export function AlertBanner({
  type,
  message,
}: {
  type: 'warning' | 'error' | 'info'
  message: string
}) {
  const styles = {
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    error: 'bg-red-50 border-red-200 text-red-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
  }

  return (
    <div className={`p-4 border rounded-xl flex items-start gap-3 ${styles[type]}`}>
      <AlertCircle size={20} className="shrink-0 mt-0.5" />
      <div className="text-sm font-medium">{message}</div>
    </div>
  )
}
