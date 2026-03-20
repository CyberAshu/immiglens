import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { auth } from '../api'
import { ShieldCheck } from 'lucide-react'

function pwStrengthLevel(pw: string): 0 | 1 | 2 | 3 {
  if (!pw) return 0
  if (pw.length < 8) return 1
  if (pw.length < 12) return 2
  return 3
}

const PW_STRENGTH_LABELS = ['', 'Weak', 'Good', 'Strong'] as const

export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const strength = pwStrengthLevel(password)

  // No token in URL — show a clear error immediately
  if (!token) {
    return (
      <div className="auth-page">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <h1 className="auth-title" style={{ marginBottom: '0.75rem' }}>Invalid link</h1>
          <p className="auth-sub" style={{ marginBottom: '1.5rem' }}>
            This reset link is invalid or has expired. Please request a new one.
          </p>
          <Link
            to="/forgot-password"
            className="btn-primary btn-block auth-submit"
            style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}
          >
            Request New Link
          </Link>
        </div>
      </div>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    try {
      await auth.resetPassword(token, password)
      navigate('/login', { state: { passwordReset: true } })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Reset failed. The link may have expired.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo" style={{ justifyContent: 'center', marginBottom: '2rem' }}>
          <Link to="/" style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem', textDecoration: 'none' }}>
            <div className="auth-logo-mark" style={{ width: 52, height: 52, borderRadius: 14, fontSize: 'unset', boxShadow: '0 4px 20px rgba(11,31,59,0.25)' }}>
              <ShieldCheck size={26} color="#C8A24A" strokeWidth={2.5} />
            </div>
            <span className="auth-logo-text" style={{ fontSize: '1.1rem' }}>ImmigLens</span>
          </Link>
        </div>

        <div className="auth-header" style={{ textAlign: 'center' }}>
          <h1 className="auth-title">Choose new password</h1>
          <p className="auth-sub">Enter a new password for your account.</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-field">
            <label className="auth-label">New Password</label>
            <div className="auth-pw-wrap">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={8}
                placeholder="Minimum 8 characters"
                className="auth-pw-input"
                autoFocus
              />
              <button
                type="button"
                className="auth-pw-toggle"
                onClick={() => setShowPassword(p => !p)}
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            {password.length > 0 && (
              <div className="pw-strength">
                <div className="pw-strength-bars">
                  {([1, 2, 3] as const).map(n => (
                    <div
                      key={n}
                      className={`pw-strength-bar${strength >= n ? ` pw-strength-bar--${['', 'weak', 'good', 'strong'][strength]}` : ''}`}
                    />
                  ))}
                </div>
                <span className={`pw-strength-label pw-strength-label--${['', 'weak', 'good', 'strong'][strength]}`}>
                  {PW_STRENGTH_LABELS[strength]}
                </span>
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
                placeholder="••••••••"
                className="auth-pw-input"
              />
              <button
                type="button"
                className="auth-pw-toggle"
                onClick={() => setShowConfirmPassword(p => !p)}
                tabIndex={-1}
                aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
              >
                {showConfirmPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {error && (
            <div className="auth-error-box">
              <span className="auth-error-icon">⚠</span>
              {error}
            </div>
          )}

          <button className="btn-primary btn-block auth-submit" disabled={loading}>
            {loading ? <><span className="auth-spinner" /> Saving…</> : 'Set New Password'}
          </button>
        </form>

        <p className="auth-alt" style={{ textAlign: 'center' }}>
          <Link to="/login">Back to Sign In</Link>
        </p>
      </div>
    </div>
  )
}
