import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { auth } from '../api'
import { ShieldCheck } from 'lucide-react'

function pwStrengthLevel(pw: string): 0 | 1 | 2 | 3 {
  if (!pw) return 0
  if (pw.length < 8) return 1
  if (pw.length < 12) return 2
  return 3
}

const PW_STRENGTH_LABELS = ['', 'Weak', 'Good', 'Strong'] as const

export default function Register() {
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const strength = pwStrengthLevel(password)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const normalized = email.trim().toLowerCase()
    if (!normalized.endsWith('@gmail.com')) {
      setError('Only Gmail addresses (@gmail.com) are supported.')
      return
    }
    setLoading(true)
    try {
      await auth.register(normalized, password, fullName)
      navigate('/login')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">

        {/* Brand — centered icon */}
        <div className="auth-logo" style={{ justifyContent: 'center', marginBottom: '2rem' }}>
          <Link to="/" style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem', textDecoration: 'none' }}>
            <div className="auth-logo-mark" style={{ width: 52, height: 52, borderRadius: 14, fontSize: 'unset', boxShadow: '0 4px 20px rgba(11,31,59,0.25)' }}>
              <ShieldCheck size={26} color="#C8A24A" strokeWidth={2.5} />
            </div>
            <span className="auth-logo-text" style={{ fontSize: '1.1rem' }}>ImmigLens</span>
          </Link>
        </div>

        <div className="auth-header" style={{ textAlign: 'center' }}>
          <h1 className="auth-title">Create account</h1>
          <p className="auth-sub">Start tracking LMIA recruitment proof</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-field">
            <label className="auth-label">Full Name</label>
            <input
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              required
              autoFocus
              placeholder="Jane Smith"
            />
          </div>

          <div className="auth-field">
            <label className="auth-label">Gmail Address</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="you@gmail.com"
            />
          </div>

          <div className="auth-field">
            <label className="auth-label">Password</label>
            <div className="auth-pw-wrap">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={8}
                placeholder="Minimum 8 characters"
                className="auth-pw-input"
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
                      className={`pw-strength-bar${strength >= n ? ` pw-strength-bar--${['', 'weak', 'medium', 'strong'][strength]}` : ''}`}
                    />
                  ))}
                </div>
                <span className="pw-strength-label">{PW_STRENGTH_LABELS[strength]}</span>
              </div>
            )}
          </div>

          {error && (
            <div className="auth-error-box">
              <span className="auth-error-icon">⚠</span>
              {error}
            </div>
          )}

          <button className="btn-primary btn-block auth-submit" disabled={loading}>
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
