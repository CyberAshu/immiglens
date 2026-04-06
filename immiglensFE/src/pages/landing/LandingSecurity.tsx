import { Shield, Lock, Eye, Database, FileCheck } from 'lucide-react'

const sections = [
  {
    icon: Lock,
    title: 'Security Overview',
    content:
      'Your data is protected by bank-grade security protocols. We utilize AES-256 encryption at rest and TLS 1.2+ for data in transit. Daily automated backups ensure your compliance evidence is never lost. Our infrastructure is hosted on ISO 27001 and SOC 2 certified cloud providers.',
  },
  {
    icon: Database,
    title: 'Data Handling & Privacy',
    content:
      'We store screenshots, generated PDFs, source URLs, and system timestamps. Our system is designed to avoid collecting unnecessary sensitive personally identifiable information (PII). We only capture the public job posting data required for LMIA recruitment proof.',
  },
  {
    icon: Eye,
    title: 'Audit & Export History',
    content:
      'Every action within ImmigLens is logged. Our comprehensive audit trail tracks who created positions, when captures occurred, and who exported reports. This ensures complete accountability and traceability for your firm\'s compliance processes.',
  },
  {
    icon: FileCheck,
    title: 'Retention & Portability',
    content:
      'Your data belongs to you. You can export your evidence packages at any time, even on the free trial. We offer customizable data retention policies allowing you to automatically purge data after the required legal retention period has passed.',
  },
]

export function LandingSecurity() {
  return (
    <div className="flex flex-col min-h-screen bg-brand-offwhite">
      {/* Hero */}
      <section className="pt-24 pb-16 bg-brand-navy text-white text-center px-4 sm:px-6 lg:px-8 relative overflow-hidden">
        <div className="absolute inset-0 bg-white/5 pattern-dots pointer-events-none" />
        <div className="relative z-10">
          <div className="w-20 h-20 bg-brand-gold/20 rounded-full flex items-center justify-center text-brand-gold mx-auto mb-8">
            <Shield size={40} />
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold mb-6">Security & Compliance</h1>
          <p className="text-xl text-white/80 max-w-2xl mx-auto">
            Built from the ground up to protect your clients' sensitive immigration data and ensure
            absolute compliance.
          </p>
        </div>
      </section>

      {/* Content */}
      <section className="py-24 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
        <div className="bg-green-50 border border-green-200 rounded-2xl p-6 mb-10 shadow-sm">
          <h3 className="text-green-900 font-bold mb-2 text-lg">In plain language</h3>
          <p className="text-green-800/80 leading-relaxed">
            ImmigLens stores your job posting screenshots and timestamps on encrypted, Canadian-compliant servers. Only you and your team members have access. We never sell or share your data. You can export or delete everything at any time.
          </p>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 mb-16 shadow-sm">
          <h3 className="text-amber-900 font-bold mb-2 flex items-center gap-2">
            <Shield size={20} className="text-amber-600" /> Important Note on Capture Modes
          </h3>
          <p className="text-amber-800/80 leading-relaxed text-sm">
            <strong>Hands-free capture for supported platforms:</strong> Sites like Job Bank are
            automatically captured by our servers without intervention.
            <br />
            <strong>Guided capture for restricted sites:</strong> Some platforms (e.g., LinkedIn)
            block automated bots. For these, we provide a secure browser extension that guides you
            through capturing the page locally while still injecting indisputable server timestamps
            and organizing the data securely in your vault.
          </p>
        </div>

        <div className="space-y-12">
          {sections.map((sec, i) => (
            <div
              key={i}
              className="bg-white rounded-3xl p-8 md:p-12 shadow-sm border border-gray-100 flex flex-col md:flex-row gap-8 items-start"
            >
              <div className="w-16 h-16 bg-brand-offwhite rounded-2xl flex items-center justify-center text-brand-navy shrink-0">
                <sec.icon size={32} />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-brand-navy mb-4">{sec.title}</h2>
                <p className="text-brand-charcoal/80 leading-relaxed text-lg">{sec.content}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-24 text-center">
          <h3 className="text-2xl font-bold text-brand-navy mb-6">
            Have specific security requirements?
          </h3>
          <a
            href="mailto:hello@immiglens.ca"
            className="bg-brand-navy hover:bg-brand-charcoal text-white px-8 py-4 rounded-xl font-semibold shadow-lg transition-all text-lg inline-flex items-center gap-2"
          >
            Contact Our Security Team
          </a>
        </div>
      </section>
    </div>
  )
}
