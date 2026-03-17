import { useState } from 'react'
import { Check } from 'lucide-react'
import { PricingCard, ROICard, FAQAccordion, CTABand } from './LandingUI'

const plans = [
  { limit: '5', price: 29 },
  { limit: '10', price: 39 },
  { limit: '25', price: 79, isPopular: true },
  { limit: '50', price: 119 },
  { limit: '100', price: 179 },
  { limit: 'Custom', price: 'Contact Sales' },
]

const features = [
  'Automated captures',
  'Evidence timeline',
  'LMIA-ready PDF',
  'Email alerts',
  'Watermarked trial exports',
]

const compareFeatures: { name: string; values: (string | boolean)[] }[] = [
  { name: 'Active Postings Limit', values: ['5', '10', '25', '50', '100'] },
  { name: 'Automated Captures', values: [true, true, true, true, true] },
  { name: 'LMIA-ready PDF Export', values: [true, true, true, true, true] },
  { name: 'Email Alerts', values: [true, true, true, true, true] },
  { name: 'Evidence Timeline', values: [true, true, true, true, true] },
  { name: 'Export History / Audit', values: [false, false, true, true, true] },
  { name: 'Priority Support', values: [false, false, true, true, true] },
  { name: 'Custom Retention', values: [false, false, false, true, true] },
]

const faqItems = [
  {
    q: 'What is an active posting?',
    a: 'An active posting is any job position currently being tracked and scheduled for screenshot captures. Draft, paused, or archived positions do not count towards your limit.',
  },
  {
    q: 'What happens when I reach my limit?',
    a: 'You won\'t be able to create new active positions until you either archive an existing one or upgrade your plan. Existing active postings continue to be captured as scheduled.',
  },
  {
    q: 'What is the trial exports watermark?',
    a: 'During your free trial, you have full access to all features. However, any PDF reports generated will contain a prominent "Trial Export" watermark. Upgrading removes this.',
  },
  {
    q: 'What happens if my payment fails?',
    a: 'Your existing data remains safe and accessible. However, you will be restricted from creating new job positions until your payment method is updated.',
  },
  {
    q: 'Can I switch plans later?',
    a: 'Yes, you can upgrade or downgrade your plan at any time from your account settings. Changes are prorated automatically.',
  },
  {
    q: 'Is annual billing available at signup?',
    a: 'Yes! You can choose annual billing immediately when starting your trial to lock in the discounted rate.',
  },
]

export function LandingPricing() {
  const [isAnnual, setIsAnnual] = useState(true)

  return (
    <div className="flex flex-col min-h-screen bg-brand-offwhite">
      {/* Header */}
      <section className="pt-24 pb-16 text-center px-4 sm:px-6 lg:px-8">
        <h1 className="text-4xl md:text-5xl font-extrabold text-brand-navy mb-4 tracking-tight">
          Pricing based on Active Job Positions
        </h1>
        <p className="text-xl text-brand-charcoal/70 mb-8 max-w-2xl mx-auto">
          Only Active positions count. Draft, Paused, or Archived don't.
        </p>

        <div className="flex items-center justify-center gap-4 mb-16">
          <span className={`font-semibold ${!isAnnual ? 'text-brand-navy' : 'text-brand-charcoal/50'}`}>
            Monthly
          </span>
          <button
            onClick={() => setIsAnnual(!isAnnual)}
            className="w-14 h-8 bg-brand-navy rounded-full p-1 relative transition-colors shadow-inner"
          >
            <div
              className={`w-6 h-6 bg-white rounded-full shadow-sm transition-transform duration-300 ${isAnnual ? 'translate-x-6' : 'translate-x-0'}`}
            />
          </button>
          <span className={`font-semibold flex items-center gap-2 ${isAnnual ? 'text-brand-navy' : 'text-brand-charcoal/50'}`}>
            Annual{' '}
            <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full font-bold">
              Save 20%
            </span>
          </span>
        </div>
      </section>

      {/* ROI */}
      <section className="pb-24 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto w-full">
        <ROICard />
      </section>

      {/* Pricing Cards */}
      <section className="py-24 bg-white border-y border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {plans.map((plan, idx) => (
              <PricingCard
                key={idx}
                limit={plan.limit}
                price={plan.price}
                isPopular={(plan as { isPopular?: boolean }).isPopular}
                features={features}
                isAnnual={isAnnual}
                annualDiscount={0.2}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Compare Table */}
      <section className="py-24 bg-brand-offwhite">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center text-brand-navy mb-16">
            Compare Plan Features
          </h2>
          <div className="overflow-x-auto bg-white rounded-3xl shadow-sm border border-gray-200">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-gray-50/50 border-b border-gray-200">
                  <th className="p-6 font-semibold text-brand-navy w-1/4 rounded-tl-3xl">Feature</th>
                  {plans.slice(0, 5).map((plan, i) => (
                    <th
                      key={i}
                      className={`p-6 text-center font-semibold text-brand-navy ${(plan as { isPopular?: boolean }).isPopular ? 'bg-brand-gold/10' : ''}`}
                    >
                      {plan.limit} Postings
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {compareFeatures.map((feature, idx) => (
                  <tr
                    key={idx}
                    className="border-b border-gray-100 last:border-0 hover:bg-gray-50/30 transition-colors"
                  >
                    <td className="p-6 text-brand-charcoal font-medium bg-white">
                      {feature.name}
                    </td>
                    {feature.values.map((val, i) => (
                      <td
                        key={i}
                        className={`p-6 text-center ${(plans[i] as { isPopular?: boolean }).isPopular ? 'bg-brand-gold/5' : 'bg-white'}`}
                      >
                        {typeof val === 'boolean' ? (
                          val ? (
                            <Check size={20} className="mx-auto text-green-500" />
                          ) : (
                            <span className="text-gray-300">–</span>
                          )
                        ) : (
                          <span className="font-semibold text-brand-navy">{val}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

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
