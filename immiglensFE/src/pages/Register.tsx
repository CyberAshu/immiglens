import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { auth } from '../api'
import { Eye, EyeOff, MailCheck, ShieldCheck } from 'lucide-react'

function pwStrengthLevel(pw: string): 0 | 1 | 2 | 3 {
  if (!pw) return 0
  if (pw.length < 8) return 1
  const hasUpper = /[A-Z]/.test(pw)
  const hasDigit = /[0-9]/.test(pw)
  const hasSymbol = /[^A-Za-z0-9]/.test(pw)
  const extras = (hasUpper ? 1 : 0) + (hasDigit ? 1 : 0) + (hasSymbol ? 1 : 0)
  if (pw.length >= 12 && extras >= 2) return 3
  if (pw.length >= 8 && extras >= 1) return 2
  return 1
}

const PW_STRENGTH_LABELS = ['', 'Weak', 'Good', 'Strong'] as const
const PW_STRENGTH_COLORS = ['', '#ef4444', '#f59e0b', '#22c55e'] as const

export default function Register() {
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [acceptTerms, setAcceptTerms] = useState(false)
  const [acceptPrivacy, setAcceptPrivacy] = useState(false)
  const [acceptableUse, setAcceptableUse] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [registered, setRegistered] = useState(false)
  const [registeredEmail, setRegisteredEmail] = useState('')

  const strength = pwStrengthLevel(password)
  const allAccepted = acceptTerms && acceptPrivacy && acceptableUse

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    if (!allAccepted) {
      setError('Please accept all policies to continue.')
      return
    }
    const normalized = email.trim().toLowerCase()
    const trimmedName = fullName.trim()
    setLoading(true)
    try {
      await auth.register(normalized, password, trimmedName, {
        accept_terms: acceptTerms,
        accept_privacy: acceptPrivacy,
        accept_acceptable_use: acceptableUse,
      })
      setRegisteredEmail(normalized)
      setRegistered(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed.')
    } finally {
      setLoading(false)
    }
  }

  /* ── Success screen ──────────────────────────────────────── */
  if (registered) {
    return (
      <div className="auth-page">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
            <div style={{
              width: 64, height: 64, borderRadius: 16,
              background: 'linear-gradient(135deg,#0b1f3b,#1a3a6b)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 20px rgba(11,31,59,0.25)',
            }}>
              <MailCheck size={30} color="#C8A24A" strokeWidth={2} />
            </div>
          </div>
          <h1 className="auth-title" style={{ marginBottom: '0.4rem' }}>Account created!</h1>
          <p className="auth-sub" style={{ marginBottom: '1.5rem' }}>
            Welcome aboard. Here's what happens next:
          </p>
          <div style={{
            background: 'rgba(200,162,74,0.08)', border: '1px solid rgba(200,162,74,0.25)',
            borderRadius: 10, padding: '1rem 1.25rem', marginBottom: '1.75rem', textAlign: 'left',
          }}>
            <ol style={{ margin: 0, paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.9rem', color: 'var(--text-secondary, #64748b)' }}>
              <li>Click <strong>Sign in</strong> below and enter your password.</li>
              <li>A <strong>6-digit verification code</strong> will be sent to <strong>{registeredEmail}</strong>.</li>
              <li>Enter the code to complete sign-in and verify your email.</li>
            </ol>
          </div>
          <button
            className="btn-primary btn-block auth-submit"
            onClick={() => navigate('/login', { state: { email: registeredEmail } })}
          >
            Sign in now →
          </button>
        </div>
      </div>
    )
  }

  /* ── Registration form ───────────────────────────────────── */
  return (
    <div className="auth-page">
      <div className="auth-card">

        {/* Brand */}
        <div className="auth-logo" style={{ justifyContent: 'center', marginBottom: '1.5rem' }}>
          <Link to="/" style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', textDecoration: 'none' }}>
            <div className="auth-logo-mark" style={{ width: 52, height: 52, borderRadius: 14, fontSize: 'unset', boxShadow: '0 4px 20px rgba(11,31,59,0.25)' }}>
              <ShieldCheck size={26} color="#C8A24A" strokeWidth={2.5} />
            </div>
            <span className="auth-logo-text" style={{ fontSize: '1.1rem' }}>ImmigLens</span>
          </Link>
        </div>

        <div className="auth-header" style={{ textAlign: 'center', marginBottom: '1rem' }}>
          <h1 className="auth-title">Create account</h1>
          <p className="auth-sub">Start tracking LMIA recruitment proof</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form" noValidate style={{ gap: '0.65rem' }}>

          {/* Full Name + Email — side by side */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
            <div className="auth-field">
              <label className="auth-label">Full Name</label>
              <input
                type="text"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                required
                autoFocus
                autoComplete="name"
                placeholder="Jane Smith"
              />
            </div>
            <div className="auth-field">
              <label className="auth-label">Work Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@company.com"
              />
            </div>
          </div>

          {/* Password + Confirm — side by side */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
            <div className="auth-field">
              <label className="auth-label">Password</label>
              <div className="auth-pw-wrap">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="Min. 8 chars"
                  className="auth-pw-input"
                />
                <button type="button" className="auth-pw-toggle" onClick={() => setShowPassword(p => !p)} tabIndex={-1} aria-label={showPassword ? 'Hide' : 'Show'}>
                  {showPassword ? <EyeOff size={14} strokeWidth={2} /> : <Eye size={14} strokeWidth={2} />}
                </button>
              </div>
              {password.length > 0 && (
                <div className="pw-strength" style={{ marginTop: '0.3rem' }}>
                  <div className="pw-strength-bars">
                    {([1, 2, 3] as const).map(n => (
                      <div key={n} className="pw-strength-bar" style={{ background: strength >= n ? PW_STRENGTH_COLORS[strength] : undefined, opacity: strength >= n ? 1 : undefined }} />
                    ))}
                  </div>
                  <span className="pw-strength-label" style={{ color: PW_STRENGTH_COLORS[strength] }}>{PW_STRENGTH_LABELS[strength]}</span>
                </div>
              )}
            </div>
            <div className="auth-field">
              <label className="auth-label">Confirm Password</label>
              <div className="auth-pw-wrap">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  placeholder="Re-enter"
                  className="auth-pw-input"
                />
                <button type="button" className="auth-pw-toggle" onClick={() => setShowConfirmPassword(p => !p)} tabIndex={-1} aria-label={showConfirmPassword ? 'Hide' : 'Show'}>
                  {showConfirmPassword ? <EyeOff size={14} strokeWidth={2} /> : <Eye size={14} strokeWidth={2} />}
                </button>
              </div>
              {confirmPassword.length > 0 && (
                <p style={{ fontSize: '0.75rem', marginTop: '0.3rem', color: password === confirmPassword ? '#22c55e' : '#ef4444' }}>
                  {password === confirmPassword ? '✓ Matches' : '✗ No match'}
                </p>
              )}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="auth-error-box">
              <span className="auth-error-icon">⚠</span>
              {error}
            </div>
          )}

          {/* Policy acceptance — simple checkbox rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {([
              { key: 'terms',   checked: acceptTerms,   setter: setAcceptTerms,   label: 'Terms of Service' },
              { key: 'privacy', checked: acceptPrivacy, setter: setAcceptPrivacy, label: 'Privacy Policy' },
              { key: 'use',     checked: acceptableUse, setter: setAcceptableUse, label: 'Acceptable Use Policy' },
            ] as const).map(({ key, checked, setter, label }) => (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', userSelect: 'none' }}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={e => setter(e.target.checked)}
                  style={{ width: 15, height: 15, accentColor: '#1a3a6b', cursor: 'pointer', flexShrink: 0 }}
                />
                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary, #64748b)' }}>
                  I agree to the{' '}
                  <Link
                    to="/legal"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    style={{ color: '#1a3a6b', fontWeight: 600, textDecoration: 'none' }}
                  >
                    {label}
                  </Link>
                </span>
              </label>
            ))}
          </div>

          <button
            className="btn-primary btn-block auth-submit"
            disabled={loading || !allAccepted}
          >
            {loading
              ? <><span className="auth-spinner" /> Creating account…</>
              : 'Create Account →'}
          </button>
        </form>

        <p className="auth-alt" style={{ textAlign: 'center' }}>
          Already have an account?{' '}
          <Link to="/login">Sign in</Link>
        </p>

      </div>
    </div>
  )
}
