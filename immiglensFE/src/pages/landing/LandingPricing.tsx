import { useEffect, useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { subscriptions } from '../../api/subscriptions'
import { billing } from '../../api/billing'
import { ROICard, FAQAccordion, CTABand } from './LandingUI'
import type { SubscriptionTier } from '../../types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(val: number): string {
  return val === -1 ? 'Unlimited' : String(val)
}

function tierFeatureList(tier: SubscriptionTier): string[] {
  return [
    `${fmt(tier.max_active_positions)} active position${tier.max_active_positions === 1 ? '' : 's'}`,
    `${fmt(tier.max_urls_per_position)} job board URL${tier.max_urls_per_position === 1 ? '' : 's'} per position`,
    `${fmt(tier.max_captures_per_month)} capture${tier.max_captures_per_month === 1 ? '' : 's'} / month`,
    `Capture every ${tier.min_capture_frequency_days} day${tier.min_capture_frequency_days === 1 ? '' : 's'} minimum`,
  ]
}

const tableRows: { label: string; key: keyof SubscriptionTier }[] = [
  { label: 'Max Active Positions',          key: 'max_active_positions' },
  { label: 'Job Board URLs per Position',   key: 'max_urls_per_position' },
  { label: 'Captures per Month',            key: 'max_captures_per_month' },
  { label: 'Min. Capture Frequency (days)', key: 'min_capture_frequency_days' },
]

// ── Plan Card ─────────────────────────────────────────────────────────────────

function TierCard({ tier, isHighlighted, isAnnual, isLoggedIn }: { tier: SubscriptionTier; isHighlighted: boolean; isAnnual: boolean; isLoggedIn: boolean }) {
  const [loading, setLoading] = useState(false)

  async function handleGetStarted() {
    if (!isLoggedIn || !tier.stripe_price_id) return
    setLoading(true)
    try {
      const { url } = await billing.createCheckout(tier.id, 14)
      window.location.href = url
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setLoading(false)
    }
  }
  const features = tierFeatureList(tier)
  const monthlyPrice = tier.price_per_month
  const displayPrice = monthlyPrice != null && isAnnual
    ? Math.floor(monthlyPrice * 0.8)
    : monthlyPrice

  return (
    <div
      className={`relative bg-white rounded-3xl p-8 border transition-all duration-300 hover:-translate-y-1 flex flex-col h-full ${
        isHighlighted
          ? 'border-brand-gold shadow-lg shadow-brand-gold/10'
          : 'border-gray-200 shadow-sm'
      }`}
    >
      {isHighlighted && (
        <div className="absolute -top-4 inset-x-0 flex justify-center">
          <span className="bg-brand-gold text-white text-xs font-bold uppercase tracking-wider py-1.5 px-4 rounded-full shadow-sm">
            Most Popular
          </span>
        </div>
      )}

      <div className="mb-4">
        <h3 className="text-xl font-bold text-brand-navy mb-1">{tier.display_name}</h3>
      </div>

      {/* Price */}
      <div className="mb-6">
        {displayPrice != null ? (
          <>
            <div className="flex items-baseline gap-1">
              <span className="text-5xl font-extrabold text-brand-navy">${displayPrice}</span>
              <span className="text-brand-charcoal/60 font-medium">/mo</span>
            </div>
            {isAnnual && monthlyPrice != null && monthlyPrice > 0 && (
              <p className="text-brand-charcoal/50 text-sm mt-1">
                ${Math.floor(monthlyPrice * 0.8 * 12)} billed annually
              </p>
            )}
            {!isAnnual && monthlyPrice != null && monthlyPrice > 0 && (
              <p className="text-brand-charcoal/50 text-sm mt-1">billed monthly</p>
            )}
          </>
        ) : (
          <span className="text-2xl font-bold text-brand-navy">Contact Sales</span>
        )}
        {isAnnual && monthlyPrice != null && monthlyPrice > 0 && (
          <div className="mt-2 bg-green-50 text-green-700 text-xs font-semibold px-3 py-1.5 rounded-lg w-fit border border-green-200">
            Save ${Math.floor(monthlyPrice * 12 * 0.2)} / year
          </div>
        )}
      </div>

      {isLoggedIn && tier.stripe_price_id ? (
        <button
          onClick={handleGetStarted}
          disabled={loading}
          className={`w-full block text-center py-3.5 rounded-xl font-semibold mb-8 transition-colors border ${
            isHighlighted
              ? 'bg-brand-navy hover:bg-brand-charcoal text-white border-transparent shadow-md'
              : 'bg-white hover:bg-gray-50 text-brand-navy border-gray-200'
          }`}
        >
          {loading ? 'Redirecting…' : 'Start Free Trial'}
        </button>
      ) : (
        <Link
          to="/register"
          className={`w-full block text-center py-3.5 rounded-xl font-semibold mb-8 transition-colors border ${
            isHighlighted
              ? 'bg-brand-navy hover:bg-brand-charcoal text-white border-transparent shadow-md'
              : 'bg-white hover:bg-gray-50 text-brand-navy border-gray-200'
          }`}
        >
          Get Started
        </Link>
      )}

      <div className="mt-auto">
        <p className="text-xs font-semibold text-brand-navy uppercase tracking-wider mb-4">
          Plan Limits
        </p>
        <ul className="space-y-3.5">
          {features.map((f, i) => (
            <li key={i} className="flex items-start gap-3">
              <Check size={18} className="text-brand-gold shrink-0 mt-0.5" />
              <span className="text-sm text-brand-charcoal/80">{f}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

// ── Static FAQ ────────────────────────────────────────────────────────────────

const faqItems = [
  {
    q: 'How does the free trial work?',
    a: 'Every paid plan includes a 14-day free trial. You\'ll need to enter a card to start — you won\'t be charged until the trial ends. Cancel anytime from your billing portal before the 14 days are up.',
  },
  {
    q: 'What is an active posting?',
    a: 'An active posting is any job position currently being tracked and scheduled for screenshot captures. Draft, paused, or archived positions do not count towards your limit.',
  },
  {
    q: 'What happens when I reach my limit?',
    a: "You won't be able to create new employers or positions until you upgrade your plan. Existing active postings continue to be captured as scheduled.",
  },
  {
    q: 'How is my plan assigned?',
    a: 'Plans are assigned by the platform administrator after registration. Contact support to discuss which plan fits your needs.',
  },
  {
    q: 'What is the trial exports watermark?',
    a: 'During your free trial, you have full access to all features. However, any PDF reports generated will contain a prominent "Trial Export" watermark. Upgrading removes this.',
  },
  {
    q: 'Can I switch plans later?',
    a: 'Yes, plans can be upgraded or changed by contacting the platform administrator. Your existing data is always preserved.',
  },
]

// ── Page ──────────────────────────────────────────────────────────────────────

export function LandingPricing() {
  const [tiers, setTiers]     = useState<SubscriptionTier[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(false)
  const [isAnnual, setIsAnnual] = useState(true)

  // Detect if user is logged in (token in localStorage)
  const isLoggedIn = !!localStorage.getItem('token')

  useEffect(() => {
    subscriptions.tiers()
      .then(data => setTiers(data))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  // Highlight the middle tier as "most popular"
  const popularIdx = Math.floor((tiers.length - 1) / 2)

  return (
    <div className="flex flex-col min-h-screen bg-brand-offwhite">

      {/* Header */}
      <section className="pt-24 pb-16 text-center px-4 sm:px-6 lg:px-8">
        <h1 className="text-4xl md:text-5xl font-extrabold text-brand-navy mb-4 tracking-tight">
          Simple, Transparent Plans
        </h1>
        <p className="text-xl text-brand-charcoal/70 mb-8 max-w-2xl mx-auto">
          Start with a 14-day free trial on any plan. Card required — cancel anytime before the trial ends.
        </p>

        {/* Annual toggle */}
        <div className="flex items-center justify-center gap-4">
          <span className={`font-semibold ${!isAnnual ? 'text-brand-navy' : 'text-brand-charcoal/50'}`}>
            Monthly
          </span>
          <button
            onClick={() => setIsAnnual(a => !a)}
            className="w-14 h-8 bg-brand-navy rounded-full p-1 relative transition-colors shadow-inner"
          >
            <div
              className={`w-6 h-6 bg-white rounded-full shadow-sm transition-transform duration-300 ${isAnnual ? 'translate-x-6' : 'translate-x-0'}`}
            />
          </button>
          <span className={`font-semibold flex items-center gap-2 ${isAnnual ? 'text-brand-navy' : 'text-brand-charcoal/50'}`}>
            Annual{' '}
            <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full font-bold">Save 20%</span>
          </span>
        </div>
      </section>

      {/* ROI */}
      <section className="pb-24 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto w-full">
        <ROICard />
      </section>

      {/* Plan Cards */}
      <section className="py-24 bg-white border-y border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {loading && (
            <div className="flex items-center justify-center gap-3 py-16 text-brand-charcoal/60">
              <Loader2 size={24} className="animate-spin" />
              <span>Loading plans…</span>
            </div>
          )}

          {!loading && error && (
            <p className="text-center text-red-500 py-16">
              Could not load plans. Please try again later.
            </p>
          )}

          {!loading && !error && tiers.length === 0 && (
            <p className="text-center text-brand-charcoal/60 py-16">
              No plans available at the moment. Please check back soon.
            </p>
          )}

          {!loading && !error && tiers.length > 0 && (
            <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-${Math.min(tiers.length, 3)} gap-8`}>
              {tiers.map((tier, idx) => (
                <TierCard
                  key={tier.id}
                  tier={tier}
                  isHighlighted={idx === popularIdx && tiers.length > 1}
                  isAnnual={isAnnual}
                  isLoggedIn={isLoggedIn}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Comparison Table */}
      {!loading && !error && tiers.length > 1 && (
        <section className="py-24 bg-brand-offwhite">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl font-bold text-center text-brand-navy mb-16">
              Compare Plans
            </h2>
            <div className="overflow-x-auto bg-white rounded-3xl shadow-sm border border-gray-200">
              <table className="w-full text-left border-collapse" style={{ minWidth: `${200 + tiers.length * 160}px` }}>
                <thead>
                  <tr className="bg-gray-50/50 border-b border-gray-200">
                    <th className="p-6 font-semibold text-brand-navy rounded-tl-3xl w-56">Limit</th>
                    {tiers.map((tier, i) => (
                      <th
                        key={tier.id}
                        className={`p-6 text-center font-semibold text-brand-navy ${i === popularIdx ? 'bg-brand-gold/10' : ''}`}
                      >
                        {tier.display_name}
                        {i === popularIdx && tiers.length > 1 && (
                          <span className="block text-xs font-normal text-brand-gold mt-1">Most Popular</span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((row, rIdx) => (
                    <tr
                      key={rIdx}
                      className="border-b border-gray-100 last:border-0 hover:bg-gray-50/30 transition-colors"
                    >
                      <td className="p-6 text-brand-charcoal font-medium bg-white">{row.label}</td>
                      {tiers.map((tier, i) => {
                        const raw = tier[row.key] as number
                        return (
                          <td
                            key={tier.id}
                            className={`p-6 text-center ${i === popularIdx ? 'bg-brand-gold/5' : 'bg-white'}`}
                          >
                            <span className="font-semibold text-brand-navy">{fmt(raw)}</span>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* FAQ */}
      <section className="py-24 bg-white border-y border-gray-100">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center text-brand-navy mb-12">
            Frequently Asked Questions
          </h2>
          <FAQAccordion items={faqItems} />
        </div>
      </section>

      <CTABand />
    </div>
  )
}
