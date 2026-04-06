import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { auth } from '../api'
import {
  Eye, EyeOff, ShieldCheck,
  CheckCircle2, Clock, Shield, ArrowRight,
} from 'lucide-react'

function pwStrengthLevel(pw: string): 0 | 1 | 2 | 3 {
  if (!pw) return 0
  if (pw.length < 8) return 1
  const hasUpper  = /[A-Z]/.test(pw)
  const hasDigit  = /[0-9]/.test(pw)
  const hasSymbol = /[^A-Za-z0-9]/.test(pw)
  const extras = (hasUpper ? 1 : 0) + (hasDigit ? 1 : 0) + (hasSymbol ? 1 : 0)
  if (pw.length >= 12 && extras >= 2) return 3
  if (pw.length >= 8  && extras >= 1) return 2
  return 1
}

const PW_LABELS = ['', 'Weak', 'Good', 'Strong'] as const
const PW_COLORS = ['', '#ef4444', '#f59e0b', '#22c55e'] as const

function LeftPanel() {
  return (
    <div className="asl-panel">
      <div className="asl-grid-overlay" />
      <div className="asl-content">
        <Link to="/" className="asl-brand">
          <div className="asl-logo-mark">
            <ShieldCheck size={20} color="#C8A24A" strokeWidth={2.2} />
          </div>
          <span className="asl-logo-name">ImmigLens</span>
        </Link>
        <div className="asl-body">
          <h2 className="asl-headline">
            Automate your LMIA<br />
            <span className="asl-headline-gold">documentation.</span>
          </h2>
          <p className="asl-sub">
            Join immigration professionals who trust ImmigLens to capture,
            monitor, and report on job postings automatically.
          </p>
          <ul className="asl-features">
            <li className="asl-feature">
              <div className="asl-feature-icon"><CheckCircle2 size={14} color="#C8A24A" strokeWidth={2} /></div>
              <div><div className="asl-feature-title">Screenshot proof</div><div className="asl-feature-desc">Auto-capture all job boards on your schedule</div></div>
            </li>
            <li className="asl-feature">
              <div className="asl-feature-icon"><Clock size={14} color="#C8A24A" strokeWidth={2} /></div>
              <div><div className="asl-feature-title">Set up in minutes</div><div className="asl-feature-desc">Add your postings and captures start automatically</div></div>
            </li>
            <li className="asl-feature">
              <div className="asl-feature-icon"><Shield size={14} color="#C8A24A" strokeWidth={2} /></div>
              <div><div className="asl-feature-title">IRCC-compliant exports</div><div className="asl-feature-desc">Generate audit-ready PDFs for every LMIA file</div></div>
            </li>
          </ul>
        </div>
        <div className="asl-trust">
          <span className="asl-trust-dot" />
          <span className="asl-trust-text">14-day free trial · No credit card required to start</span>
        </div>
      </div>
    </div>
  )
}

export default function Register() {
  const navigate     = useNavigate()
  const [searchParams] = useSearchParams()
  const planIdParam  = searchParams.get('planId')
  const periodParam  = searchParams.get('period') ?? 'monthly'

  const [fullName, setFullName]     = useState('')
  const [email, setEmail]           = useState('')
  const [dob, setDob]               = useState('')
  const [password, setPassword]     = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword]       = useState(false)
  const [showConfirm, setShowConfirm]         = useState(false)
  const [acceptAll, setAcceptAll]             = useState(false)
  const [error, setError]   = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const strength   = pwStrengthLevel(password)
  const allAccepted = acceptAll

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password !== confirmPassword) { setError('Passwords do not match.'); return }
    if (!dob) { setError('Please enter your date of birth.'); return }
    const dobDate = new Date(dob)
    const today = new Date()
    const age = today.getFullYear() - dobDate.getFullYear() -
      (today.getMonth() < dobDate.getMonth() ||
       (today.getMonth() === dobDate.getMonth() && today.getDate() < dobDate.getDate()) ? 1 : 0)
    if (age < 18) { setError('You must be at least 18 years old to register.'); return }
    if (!allAccepted) { setError('Please accept all policies to continue.'); return }
    const normalized  = email.trim().toLowerCase()
    const trimmedName = fullName.trim()
    setLoading(true)
    try {
      await auth.register(normalized, password, trimmedName, dob, {
        accept_terms: true,
        accept_privacy: true,
        accept_acceptable_use: true,
      })
      await auth.requestOtp(normalized, password)
      const params = new URLSearchParams({ step: 'verify', email: normalized })
      if (planIdParam) params.set('planId', planIdParam)
      if (periodParam && periodParam !== 'monthly') params.set('period', periodParam)
      navigate(`/onboarding?${params.toString()}`, {
        state: { email: normalized, password },
        replace: true,
      })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-split-layout">
      <LeftPanel />

      <div className="auth-split-right">
        <div className="auth-split-form auth-split-form--wide anim-fade-up">

          <Link to="/" className="asf-mobile-brand">
            <div className="asf-mobile-logo"><ShieldCheck size={18} color="#C8A24A" strokeWidth={2.5} /></div>
            <span>ImmigLens</span>
          </Link>

          <div className="asf-header">
            <p className="asf-eyebrow">Get started free</p>
            <h1 className="asf-title">Create your account</h1>
            <p className="asf-sub">Start tracking LMIA recruitment proof today.</p>
          </div>

          <form onSubmit={handleSubmit} noValidate>

            {/* Row 1: Name + Email */}
            <div className="asf-row">
              <div className="asf-field">
                <label className="asf-label">Full Name</label>
                <div className="asf-input-wrap">
                  <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} required autoFocus autoComplete="name" placeholder="Jane Smith" />
                </div>
              </div>
              <div className="asf-field">
                <label className="asf-label">Work Email</label>
                <div className="asf-input-wrap">
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" placeholder="you@company.com" />
                </div>
              </div>
            </div>

            {/* Row 2: DOB */}
            <div className="asf-row">
              <div className="asf-field">
                <label className="asf-label">Date of Birth</label>
                <div className="asf-input-wrap">
                  <input
                    type="date"
                    value={dob}
                    onChange={e => setDob(e.target.value)}
                    required
                    max={new Date(new Date().setFullYear(new Date().getFullYear() - 18)).toISOString().split('T')[0]}
                  />
                </div>
              </div>
            </div>

            {/* Row 3: Password + Confirm */}
            <div className="asf-row">
              <div className="asf-field">
                <label className="asf-label">Password</label>
                <div className="asf-input-wrap">
                  <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" placeholder="Min. 8 characters" className="asf-pw-input" />
                  <button type="button" className="asf-pw-toggle" onClick={() => setShowPassword(p => !p)} tabIndex={-1} aria-label={showPassword ? 'Hide' : 'Show'}>
                    {showPassword ? <EyeOff size={16} strokeWidth={2} /> : <Eye size={16} strokeWidth={2} />}
                  </button>
                </div>
                {password.length > 0 && (
                  <div className="asf-strength">
                    <div className="asf-strength-bars">
                      {([1, 2, 3] as const).map(n => (
                        <div key={n} className="asf-strength-bar" style={{ background: strength >= n ? PW_COLORS[strength] : undefined, opacity: strength >= n ? 1 : undefined }} />
                      ))}
                    </div>
                    <span className="asf-strength-label" style={{ color: PW_COLORS[strength] }}>{PW_LABELS[strength]}</span>
                  </div>
                )}
              </div>
              <div className="asf-field">
                <label className="asf-label">Confirm Password</label>
                <div className="asf-input-wrap">
                  <input type={showConfirm ? 'text' : 'password'} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required autoComplete="new-password" placeholder="Re-enter password" className="asf-pw-input" />
                  <button type="button" className="asf-pw-toggle" onClick={() => setShowConfirm(p => !p)} tabIndex={-1} aria-label={showConfirm ? 'Hide' : 'Show'}>
                    {showConfirm ? <EyeOff size={16} strokeWidth={2} /> : <Eye size={16} strokeWidth={2} />}
                  </button>
                </div>
                {confirmPassword.length > 0 && (
                  <p style={{ fontSize: '0.75rem', marginTop: '0.3rem', color: password === confirmPassword ? '#22c55e' : '#ef4444' }}>
                    {password === confirmPassword ? '✓ Passwords match' : '✗ No match'}
                  </p>
                )}
              </div>
            </div>

            {error && <div className="asf-error"><span>⚠</span>{error}</div>}

            {/* Policy checkbox */}
            <label className="asf-check-label asf-checks">
              <input type="checkbox" checked={acceptAll} onChange={e => setAcceptAll(e.target.checked)} />
              <span>
                I accept the{' '}
                <Link to="/legal" target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>Terms of Service</Link>
                {', '}
                <Link to="/legal" target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>Privacy Policy</Link>
                {' & '}
                <Link to="/legal" target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>Acceptable Use Policy</Link>
              </span>
            </label>

            <button className="asf-btn" disabled={loading || !allAccepted}>
              {loading
                ? <><span className="auth-spinner" /> Creating account…</>
                : <>Create Account &amp; Continue <ArrowRight size={16} strokeWidth={2.5} /></>}
            </button>

          </form>

          <p className="asf-switch">
            Already have an account?{' '}
            <Link to="/login">Sign in</Link>
          </p>

        </div>
      </div>
    </div>
  )
}
