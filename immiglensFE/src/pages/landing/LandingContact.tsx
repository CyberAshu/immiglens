import { useState } from 'react'
import { Mail, Clock, ShieldCheck, Send } from 'lucide-react'
import { BASE } from '../../api/client'

export function LandingContact() {
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    subject: 'General Inquiry',
    message: '',
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`${BASE}/api/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: form.firstName,
          last_name: form.lastName,
          email: form.email,
          subject: form.subject,
          message: form.message,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.detail ?? 'Failed to send message. Please try again.')
      }
      setSubmitted(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col min-h-screen bg-brand-offwhite">
      <section className="pt-24 pb-16 text-center px-4 sm:px-6 lg:px-8">
        <h1 className="text-4xl md:text-5xl font-extrabold text-brand-navy mb-6 tracking-tight">
          Get in touch
        </h1>
        <p className="text-xl text-brand-charcoal/70 max-w-2xl mx-auto">
          Whether you need a custom enterprise plan or have a technical question, our team is here
          to help.
        </p>
      </section>

      <section className="pb-24 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
        <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden flex flex-col lg:flex-row">
          {/* Sidebar */}
          <div className="bg-brand-navy text-white p-12 lg:w-1/3 flex flex-col justify-between relative overflow-hidden">
            <div className="absolute inset-0 bg-white/5 pattern-dots pointer-events-none" />
            <div className="relative z-10">
              <h3 className="text-2xl font-bold mb-8">Contact Information</h3>
              <div className="space-y-8">
                <div className="flex items-start gap-4">
                  <Mail className="text-brand-gold shrink-0 mt-1" size={24} />
                  <div>
                    <p className="font-semibold text-white/90">Email Us</p>
                    <a
                      href="mailto:info@immiglens.ca"
                      className="text-lg hover:text-brand-gold transition-colors"
                    >
                      info@immiglens.ca
                    </a>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <Clock className="text-brand-gold shrink-0 mt-1" size={24} />
                  <div>
                    <p className="font-semibold text-white/90">Response Time</p>
                    <p className="text-white/70">
                      We aim to respond to all inquiries within 24 business hours.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <ShieldCheck className="text-brand-gold shrink-0 mt-1" size={24} />
                  <div>
                    <p className="font-semibold text-white/90">Privacy Assured</p>
                    <p className="text-white/70 text-sm">
                      Your information is kept strictly confidential and never shared with third
                      parties.
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="relative z-10 mt-16 pt-8 border-t border-white/10">
              <p className="text-white/50 text-sm">
                For technical support, please include your account email address if you are an
                existing customer.
              </p>
            </div>
          </div>

          {/* Form */}
          <div className="p-12 lg:w-2/3">
            {submitted ? (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-6 min-h-[400px]">
                <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center text-green-500 mb-4">
                  <Send size={40} />
                </div>
                <h3 className="text-3xl font-bold text-brand-navy">Message Sent!</h3>
                <p className="text-lg text-brand-charcoal/70 max-w-md">
                  Thank you for reaching out. A member of our team will get back to you within 24 business hours. In the meantime, you can{' '}
                  <a href="/how-it-works" className="text-brand-navy font-semibold underline hover:text-brand-gold transition-colors">see how ImmigLens works</a>.
                </p>
                <button
                  onClick={() => {
                    setSubmitted(false)
                    setForm({ firstName: '', lastName: '', email: '', subject: 'General Inquiry', message: '' })
                  }}
                  className="mt-4 text-brand-navy font-semibold hover:text-brand-gold transition-colors"
                >
                  Send another message
                </button>
              </div>
            ) : (
              <form
                onSubmit={handleSubmit}
                className="space-y-6"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label htmlFor="firstName" className="text-sm font-semibold text-brand-navy">
                      First Name
                    </label>
                    <input
                      type="text"
                      id="firstName"
                      required
                      placeholder="Jane"
                      value={form.firstName}
                      onChange={e => setForm(p => ({ ...p, firstName: e.target.value }))}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/20 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="lastName" className="text-sm font-semibold text-brand-navy">
                      Last Name
                    </label>
                    <input
                      type="text"
                      id="lastName"
                      required
                      placeholder="Doe"
                      value={form.lastName}
                      onChange={e => setForm(p => ({ ...p, lastName: e.target.value }))}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/20 outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="email" className="text-sm font-semibold text-brand-navy">
                    Work Email
                  </label>
                  <input
                    type="email"
                    id="email"
                    required
                    placeholder="jane@immigrationfirm.com"
                    value={form.email}
                    onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/20 outline-none transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="subject" className="text-sm font-semibold text-brand-navy">
                    Subject
                  </label>
                  <select
                    id="subject"
                    value={form.subject}
                    onChange={e => setForm(p => ({ ...p, subject: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/20 outline-none transition-all bg-white"
                  >
                    <option>General Inquiry</option>
                    <option>Enterprise Pricing / Custom Plan</option>
                    <option>Technical Support</option>
                    <option>Billing Question</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label htmlFor="message" className="text-sm font-semibold text-brand-navy">
                    Message
                  </label>
                  <textarea
                    id="message"
                    required
                    rows={5}
                    placeholder="How can we help you today?"
                    value={form.message}
                    onChange={e => setForm(p => ({ ...p, message: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/20 outline-none transition-all resize-none"
                  />
                </div>

                {error && (
                  <p className="text-sm text-red-600">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-brand-navy hover:bg-brand-charcoal text-white py-4 rounded-xl font-bold shadow-md transition-all flex items-center justify-center gap-2 mt-8 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Sending…' : 'Send Message'}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
