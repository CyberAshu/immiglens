import { useSearchParams } from 'react-router-dom'

export function LandingLegal() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = (searchParams.get('tab') === 'privacy' ? 'privacy' : 'terms') as 'terms' | 'privacy'

  function setTab(tab: 'terms' | 'privacy') {
    setSearchParams({ tab }, { replace: true })
  }

  return (
    <div className="flex flex-col min-h-screen bg-brand-offwhite">
      <section className="pt-24 pb-16 text-center px-4 sm:px-6 lg:px-8">
        <h1 className="text-4xl md:text-5xl font-extrabold text-brand-navy mb-6 tracking-tight">
          Legal Agreements
        </h1>
        <p className="text-xl text-brand-charcoal/70 max-w-2xl mx-auto">
          Last Updated: March 17, 2026
        </p>
      </section>

      <section className="pb-24 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 w-full flex flex-col md:flex-row gap-12">
        {/* Sidebar */}
        <div className="md:w-64 shrink-0">
          <div className="sticky top-32 space-y-2">
            <button
              onClick={() => setTab('terms')}
              className={`w-full text-left px-5 py-3 rounded-xl font-medium transition-colors ${activeTab === 'terms' ? 'bg-brand-navy text-white shadow-md' : 'text-brand-charcoal/70 hover:bg-gray-100'}`}
            >
              Terms of Service
            </button>
            <button
              onClick={() => setTab('privacy')}
              className={`w-full text-left px-5 py-3 rounded-xl font-medium transition-colors ${activeTab === 'privacy' ? 'bg-brand-navy text-white shadow-md' : 'text-brand-charcoal/70 hover:bg-gray-100'}`}
            >
              Privacy Policy
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 bg-white rounded-3xl shadow-sm border border-gray-100 p-8 md:p-12">
          {activeTab === 'terms' ? (
            <>
              <h2 className="text-3xl font-bold text-brand-navy mb-8">Terms of Service</h2>

              <h3 className="text-xl font-bold text-brand-navy mt-8 mb-4">1. Acceptance of Terms</h3>
              <p className="text-brand-charcoal/80 leading-relaxed mb-6">
                By accessing or using ImmigLens ("Service"), you agree to be bound by
                these Terms of Service. If you disagree with any part of the terms, you do not have
                permission to access the Service.
              </p>

              <h3 className="text-xl font-bold text-brand-navy mt-8 mb-4">
                2. Description of Service
              </h3>
              <p className="text-brand-charcoal/80 leading-relaxed mb-6">
                ImmigLens is a Software as a Service (SaaS) platform designed to
                automate the capture, storage, and reporting of online job posting evidence for
                immigration compliance purposes.
              </p>

              <h3 className="text-xl font-bold text-brand-navy mt-8 mb-4">
                3. Subscriptions and Billing
              </h3>
              <p className="text-brand-charcoal/80 leading-relaxed mb-6">
                You will be billed in advance on a recurring and periodic basis ("Billing Cycle").
                Billing cycles are set either on a monthly or annual basis, depending on the type
                of subscription plan you select.
              </p>
              <p className="text-brand-charcoal/80 leading-relaxed mb-6">
                <strong>Failed Payments:</strong> If automatic billing fails to occur, we will
                issue an electronic invoice. While your payment is in arrears, you will retain
                access to existing data, but the creation of new "Active Job Positions" will be
                temporarily disabled.
              </p>

              <h3 className="text-xl font-bold text-brand-navy mt-8 mb-4">4. Acceptable Use</h3>
              <p className="text-brand-charcoal/80 leading-relaxed mb-4">
                You agree not to use the Service to:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-brand-charcoal/80 mb-6">
                <li>Violate any applicable national or international law or regulation.</li>
                <li>
                  Infringe upon the rights of others, including privacy and intellectual property
                  rights.
                </li>
                <li>
                  Attempt to bypass or break any security mechanism of the Service or target
                  websites.
                </li>
              </ul>
            </>
          ) : (
            <>
              <h2 className="text-3xl font-bold text-brand-navy mb-8">Privacy Policy</h2>

              <h3 className="text-xl font-bold text-brand-navy mt-8 mb-4">
                1. Information We Collect
              </h3>
              <p className="text-brand-charcoal/80 leading-relaxed mb-6">
                We collect information you provide directly to us when you create an account, such
                as your name, email address, and billing information. We also automatically collect
                data regarding your usage of the Service.
              </p>

              <h3 className="text-xl font-bold text-brand-navy mt-8 mb-4">
                2. How We Use Your Data
              </h3>
              <p className="text-brand-charcoal/80 leading-relaxed mb-4">
                We use the information we collect to:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-brand-charcoal/80 mb-6">
                <li>Provide, maintain, and improve the Service.</li>
                <li>Process transactions and send related information.</li>
                <li>
                  Send technical notices, updates, security alerts, and administrative messages.
                </li>
              </ul>

              <h3 className="text-xl font-bold text-brand-navy mt-8 mb-4">
                3. Job Posting Data (Compliance Evidence)
              </h3>
              <p className="text-brand-charcoal/80 leading-relaxed mb-6">
                The core function of our Service involves capturing publicly available job
                postings. We treat the collection, organization, and association of this data with
                your specific account as strictly confidential.
              </p>

              <h3 className="text-xl font-bold text-brand-navy mt-8 mb-4">4. Data Security</h3>
              <p className="text-brand-charcoal/80 leading-relaxed mb-6">
                We implement appropriate technical and organizational security measures designed to
                protect the security of any personal information we process. However, please note
                that we cannot guarantee that the internet itself is 100% secure.
              </p>
            </>
          )}
        </div>
      </section>
    </div>
  )
}
