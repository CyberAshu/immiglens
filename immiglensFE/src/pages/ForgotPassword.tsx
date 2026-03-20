import { useState } from 'react'
import { Link } from 'react-router-dom'
import { auth } from '../api'
import { ShieldCheck, MailCheck } from 'lucide-react'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await auth.forgotPassword(email.trim().toLowerCase())
      setSent(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div className="auth-page">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
            <div style={{ width: 64, height: 64, borderRadius: 16, background: 'linear-gradient(135deg,#0b1f3b,#1a3a6b)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 20px rgba(11,31,59,0.25)' }}>
              <MailCheck size={30} color="#C8A24A" strokeWidth={2} />
            </div>
          </div>
          <h1 className="auth-title" style={{ marginBottom: '0.5rem' }}>Check your email</h1>
          <p className="auth-sub" style={{ marginBottom: '1.75rem' }}>
            If <strong>{email}</strong> is registered, a password reset link has been sent.
            The link expires in 1 hour.
          </p>
          <Link
            to="/login"
            className="btn-primary btn-block auth-submit"
            style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}
          >
            Back to Sign In
          </Link>
        </div>
      </div>
    )
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
          <h1 className="auth-title">Forgot password?</h1>
          <p className="auth-sub">Enter your email and we'll send you a reset link.</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-field">
            <label className="auth-label">Work Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
              placeholder="you@company.com"
            />
          </div>

          {error && (
            <div className="auth-error-box">
              <span className="auth-error-icon">⚠</span>
              {error}
            </div>
          )}

          <button className="btn-primary btn-block auth-submit" disabled={loading}>
            {loading ? <><span className="auth-spinner" /> Sending…</> : 'Send Reset Link'}
          </button>
        </form>

        <p className="auth-alt" style={{ textAlign: 'center' }}>
          Remembered it?{' '}
          <Link to="/login">Back to Sign In</Link>
        </p>
      </div>
    </div>
  )
}
