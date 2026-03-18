import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { auth } from '../api'
import { ShieldCheck } from 'lucide-react'

type Step = 'credentials' | 'otp'

const OTP_TTL_SECONDS = 10 * 60 // must match backend OTP_EXPIRE_MINUTES
const OTP_DIGITS = 6

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

export default function Login() {
  const { loginWithToken } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const prefillEmail = (location.state as { email?: string } | null)?.email ?? ''
  const [step, setStep] = useState<Step>('credentials')
  const [email, setEmail] = useState(prefillEmail)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [digits, setDigits] = useState<string[]>(Array(OTP_DIGITS).fill(''))
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [timeLeft, setTimeLeft] = useState(OTP_TTL_SECONDS)
  const [rememberDevice, setRememberDevice] = useState(false)
  const digitRefs = useRef<(HTMLInputElement | null)[]>([])

  const otp = digits.join('')

  // Countdown timer — only active on OTP step
  useEffect(() => {
    if (step !== 'otp') return
    setTimeLeft(OTP_TTL_SECONDS)
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { clearInterval(interval); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [step])

  // Auto-focus first digit box when OTP step mounts
  useEffect(() => {
    if (step === 'otp') setTimeout(() => digitRefs.current[0]?.focus(), 60)
  }, [step])

  function handleDigitChange(index: number, value: string) {
    const cleaned = value.replace(/\D/g, '')
    // Handle SMS autofill or multi-char paste via onChange
    if (cleaned.length > 1) {
      const next = Array(OTP_DIGITS).fill('')
      for (let i = 0; i < Math.min(cleaned.length, OTP_DIGITS); i++) next[i] = cleaned[i]
      setDigits(next)
      digitRefs.current[Math.min(cleaned.length - 1, OTP_DIGITS - 1)]?.focus()
      return
    }
    const next = [...digits]
    next[index] = cleaned
    setDigits(next)
    if (cleaned && index < OTP_DIGITS - 1) digitRefs.current[index + 1]?.focus()
  }

  function handleDigitKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      digitRefs.current[index - 1]?.focus()
    }
  }

  function handleDigitPaste(e: React.ClipboardEvent) {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_DIGITS)
    if (!pasted) return
    const next = Array(OTP_DIGITS).fill('')
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i]
    setDigits(next)
    digitRefs.current[Math.min(pasted.length - 1, OTP_DIGITS - 1)]?.focus()
  }

  function resetDigits() {
    setDigits(Array(OTP_DIGITS).fill(''))
  }

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const normalized = normalizeEmail(email)
    setLoading(true)
    try {
      const res = await auth.requestOtp(normalized, password)
      if ('access_token' in res) {
        const me = await loginWithToken(res.access_token)
        navigate(me.is_admin ? '/admin' : '/dashboard')
        return
      }
      setEmail(normalized)
      resetDigits()
      setStep('otp')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed.')
    } finally {
      setLoading(false)
    }
  }

  async function handleOtp(e: React.FormEvent) {
    e.preventDefault()
    if (otp.length < OTP_DIGITS) return
    setError(null)
    setLoading(true)
    try {
      const res = await auth.verifyOtp(email, otp, rememberDevice)
      auth.saveDeviceToken(res.device_token)
      const me = await loginWithToken(res.access_token)
      navigate(me.is_admin ? '/admin' : '/dashboard')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Verification failed.'
      if (msg.includes('Too many attempts')) {
        setStep('credentials')
        resetDigits()
        setError('Too many failed attempts. Please sign in again.')
      } else {
        setError(msg)
        resetDigits()
        setTimeout(() => digitRefs.current[0]?.focus(), 50)
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    setError(null)
    resetDigits()
    setLoading(true)
    try {
      const res = await auth.requestOtp(email, password)
      if ('access_token' in res) {
        const me = await loginWithToken(res.access_token)
        navigate(me.is_admin ? '/admin' : '/dashboard')
        return
      }
      setStep('otp') // triggers useEffect to reset timer
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not resend code.')
    } finally {
      setLoading(false)
    }
  }

  const isExpired = timeLeft === 0
  const timerPct = (timeLeft / OTP_TTL_SECONDS) * 100

  if (step === 'otp') {
    return (
      <div className="auth-page">
        <div className="auth-card">

          {/* Brand */}
          <div className="auth-logo">
            <Link to="/" className="auth-logo-mark" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ShieldCheck size={20} color="#C8A24A" strokeWidth={2.5} />
            </Link>
            <span className="auth-logo-text">ImmigLens</span>
          </div>

          {/* Step indicator */}
          <div className="auth-stepper">
            <div className="auth-stepper-item auth-stepper-item--done">
              <div className="auth-stepper-circle">✓</div>
              <span>Credentials</span>
            </div>
            <div className="auth-stepper-track auth-stepper-track--done" />
            <div className="auth-stepper-item auth-stepper-item--active">
              <div className="auth-stepper-circle auth-stepper-circle--active">2</div>
              <span>Verify</span>
            </div>
          </div>

          <div className="auth-header">
            <h1 className="auth-title">Check your email</h1>
            <p className="auth-sub">
              We sent a 6-digit code to<br />
              <strong className="auth-em">{email}</strong>
            </p>
          </div>

          {/* Timer progress bar */}
          <div className="otp-progress">
            <div className="otp-progress-track">
              <div
                className={`otp-progress-fill${isExpired ? ' expired' : timeLeft <= 60 ? ' warn' : ''}`}
                style={{ width: `${timerPct}%` }}
              />
            </div>
            <p className={`otp-progress-label${isExpired ? ' expired' : timeLeft <= 60 ? ' warn' : ''}`}>
              {isExpired ? 'Code expired' : `Expires in ${formatTime(timeLeft)}`}
            </p>
          </div>

          <form onSubmit={handleOtp} className="auth-form">
            {/* OTP digit boxes */}
            <div className="otp-inputs" onPaste={handleDigitPaste}>
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={el => { digitRefs.current[i] = el }}
                  type="text"
                  inputMode="numeric"
                  maxLength={2}
                  value={d}
                  onChange={e => handleDigitChange(i, e.target.value)}
                  onKeyDown={e => handleDigitKeyDown(i, e)}
                  disabled={isExpired || loading}
                  className={`otp-digit${d ? ' otp-digit--filled' : ''}`}
                  autoComplete={i === 0 ? 'one-time-code' : 'off'}
                />
              ))}
            </div>

            {error && (
              <div className="auth-error-box">
                <span className="auth-error-icon">⚠</span>
                {error}
              </div>
            )}

            {!isExpired && (
              <div className="auth-form-bottom">
                <label className="remember-device">
                  <input
                    type="checkbox"
                    checked={rememberDevice}
                    onChange={e => setRememberDevice(e.target.checked)}
                  />
                  <span>Remember this device for 30 days</span>
                </label>
                <button
                  className="btn-primary btn-block auth-submit"
                  disabled={loading || otp.length < OTP_DIGITS}
                >
                  {loading
                    ? <><span className="auth-spinner" /> Verifying…</>
                    : 'Verify & Sign In'}
                </button>
              </div>
            )}
          </form>

          <div className="otp-footer">
            {isExpired ? (
              <button
                type="button"
                className="btn-primary btn-block auth-submit"
                onClick={handleResend}
                disabled={loading}
              >
                {loading ? <><span className="auth-spinner" /> Sending…</> : 'Resend Code'}
              </button>
            ) : (
              <p className="auth-alt">
                Didn&apos;t receive it?{' '}
                <button type="button" className="link-btn" onClick={handleResend} disabled={loading}>
                  Resend code
                </button>
              </p>
            )}
            <button
              type="button"
              className="auth-back"
              onClick={() => { setStep('credentials'); resetDigits(); setError(null) }}
            >
              ← Back to sign in
            </button>
          </div>

        </div>
      </div>
    )
  }

  return (
    <div className="auth-page">
      <div className="auth-card">

        {/* Brand — centered icon like SupportCode */}
        <div className="auth-logo" style={{ justifyContent: 'center', marginBottom: '2rem' }}>
          <Link to="/" style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem', textDecoration: 'none' }}>
            <div className="auth-logo-mark" style={{ width: 52, height: 52, borderRadius: 14, fontSize: 'unset', boxShadow: '0 4px 20px rgba(11,31,59,0.25)' }}>
              <ShieldCheck size={26} color="#C8A24A" strokeWidth={2.5} />
            </div>
            <span className="auth-logo-text" style={{ fontSize: '1.1rem' }}>ImmigLens</span>
          </Link>
        </div>

        <div className="auth-header" style={{ textAlign: 'center' }}>
          <h1 className="auth-title">Welcome back</h1>
          <p className="auth-sub">Log in to your ImmigLens account</p>
        </div>

        <form onSubmit={handleCredentials} className="auth-form">
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

          <div className="auth-field">
            <label className="auth-label">Password</label>
            <div className="auth-pw-wrap">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
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
          </div>

          {error && (
            <div className="auth-error-box">
              <span className="auth-error-icon">⚠</span>
              {error}
            </div>
          )}

          <button className="btn-primary btn-block auth-submit" disabled={loading}>
            {loading ? <><span className="auth-spinner" /> Sending code…</> : 'Continue →'}
          </button>
        </form>

        <p className="auth-alt" style={{ textAlign: 'center' }}>
          Don&apos;t have an account?{' '}
          <Link to="/register">Create account</Link>
        </p>

      </div>
    </div>
  )
}
