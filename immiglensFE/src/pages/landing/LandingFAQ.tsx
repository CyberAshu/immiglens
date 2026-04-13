import { FAQAccordion, CTABand } from './LandingUI'

const faqs = [
  {
    q: 'Are ImmigLens reports accepted by the ESDC/LMIA officers?',
    a: 'ImmigLens generates timestamped PDF reports that document your recruitment activity. The reports are designed to satisfy ESDC advertising proof requirements by providing dated screenshots, job posting URLs, and platform-level detail. While ESDC does not officially certify any third-party software, employers and immigration consultants have used these reports to support LMIA applications. We recommend consulting your immigration professional to confirm suitability for your specific case.',
  },
  {
    q: 'How does the automated capture work?',
    a: 'Once you set a schedule, our servers securely navigate to your provided job posting URLs at the specified intervals. We render the full page, take a high-resolution screenshot, apply a secure server timestamp, and save it directly to that position\'s folder in your Vault.',
  },
  {
    q: 'Can I customize the capture schedule?',
    a: 'Yes. While the default is every 14 days to align with standard LMIA requirements, you can choose weekly captures or set a custom interval. You can also define specific start and end dates for the automation.',
  },
  {
    q: 'What is included in the final LMIA report?',
    a: 'The generated PDF is a compiled, organized document containing all screenshots for a specific job position. It includes a summary cover page, followed by the screenshots grouped by platform and date, clearly showing the URL and indisputable timestamps.',
  },
  {
    q: 'What happens if my credit card payment fails?',
    a: 'We never delete your compliance data. If payment fails, you will still be able to access existing job positions, view timelines, and download reports. However, the creation of new Active Job Positions will be disabled until payment is resolved.',
  },
  {
    q: 'How are plan limits calculated?',
    a: 'Limits are based on "Active" job positions — those currently tracking and scheduled for screenshots. Paused or archived positions do not count. You can choose and upgrade your plan directly from the Billing section in your account dashboard at any time.',
  },
  {
    q: 'Is annual billing available immediately?',
    a: 'Yes! You can choose annual billing on day one to lock in a 20% discount compared to the monthly rates.',
  },
  {
    q: 'What happens if a job board blocks the automated capture?',
    a: 'If a site heavily restricts bots (like LinkedIn), our system will prompt you to use our secure browser extension. This extension helps you capture the page locally while still injecting our trusted server timestamp and saving it to your Vault.',
  },
  {
    q: 'How do email alerts work?',
    a: "You'll receive notifications for critical events: if an automated capture fails, when you are approaching your active position plan limit.",
  },
  {
    q: 'Can I choose where my data is stored?',
    a: 'By default, all data is stored securely in North American data centers. Enterprise customers on custom plans can request specific data residency options (e.g., Canada-only storage).',
  },
]

export function LandingFAQ() {
  return (
    <div className="flex flex-col min-h-screen bg-brand-offwhite">
      <section className="pt-24 pb-16 text-center px-4 sm:px-6 lg:px-8">
        <h1 className="text-4xl md:text-5xl font-extrabold text-brand-navy mb-6 tracking-tight">
          Frequently Asked Questions
        </h1>
        <p className="text-xl text-brand-charcoal/70 max-w-2xl mx-auto">
          Everything you need to know about ImmigLens, automation, and compliance.
        </p>
      </section>

      <section className="pb-24 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
        <FAQAccordion items={faqs} />
      </section>

      <CTABand />
    </div>
  )
}
