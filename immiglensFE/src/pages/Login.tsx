import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { auth } from '../api'
import {
  Eye, EyeOff, ShieldCheck,
  Camera, Bell, FileText, ArrowRight,
} from 'lucide-react'

type Step = 'credentials' | 'otp'

const OTP_TTL_SECONDS = 10 * 60
const OTP_DIGITS = 6

function normalizeEmail(e: string) { return e.trim().toLowerCase() }

function formatTime(s: number) {
  return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`
}

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
            Your LMIA compliance<br />
            <span className="asl-headline-gold">dashboard awaits.</span>
          </h2>
          <p className="asl-sub">
            Sign in to continue tracking job postings, capturing screenshots,
            and generating compliance reports automatically.
          </p>
          <ul className="asl-features">
            <li className="asl-feature">
              <div className="asl-feature-icon"><Camera size={14} color="#C8A24A" strokeWidth={2} /></div>
              <div><div className="asl-feature-title">Automated captures</div><div className="asl-feature-desc">Screenshot every job board posting on schedule</div></div>
            </li>
            <li className="asl-feature">
              <div className="asl-feature-icon"><Bell size={14} color="#C8A24A" strokeWidth={2} /></div>
              <div><div className="asl-feature-title">Change detection</div><div className="asl-feature-desc">Alerts when postings are modified or removed</div></div>
            </li>
            <li className="asl-feature">
              <div className="asl-feature-icon"><FileText size={14} color="#C8A24A" strokeWidth={2} /></div>
              <div><div className="asl-feature-title">IRCC-ready reports</div><div className="asl-feature-desc">PDF compliance packages generated in one click</div></div>
            </li>
          </ul>
        </div>
        <div className="asl-trust">
          <span className="asl-trust-dot" />
          <span className="asl-trust-text">Trusted by immigration consultants &amp; law firms across Canada</span>
        </div>
      </div>
    </div>
  )
}

export default function Login() {
  const { loginWithToken } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const prefillEmail    = (location.state as { email?: string; passwordReset?: boolean } | null)?.email ?? ''
  const passwordResetOk = (location.state as { passwordReset?: boolean } | null)?.passwordReset ?? false

  const [step, setStep]             = useState<Step>('credentials')
  const [email, setEmail]           = useState(prefillEmail)
  const [password, setPassword]     = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [digits, setDigits]         = useState<string[]>(Array(OTP_DIGITS).fill(''))
  const [error, setError]           = useState<string | null>(null)
  const [loading, setLoading]       = useState(false)
  const [timeLeft, setTimeLeft]     = useState(OTP_TTL_SECONDS)
  const [rememberDevice, setRememberDevice] = useState(false)
  const digitRefs = useRef<(HTMLInputElement | null)[]>([])

  const otp = digits.join('')

  useEffect(() => {
    if (step !== 'otp') return
    setTimeLeft(OTP_TTL_SECONDS)
    const id = setInterval(() => setTimeLeft(p => (p <= 1 ? (clearInterval(id), 0) : p - 1)), 1000)
    return () => clearInterval(id)
  }, [step])

  useEffect(() => {
    if (step === 'otp') setTimeout(() => digitRefs.current[0]?.focus(), 60)
  }, [step])

  function resetDigits() { setDigits(Array(OTP_DIGITS).fill('')) }

  function handleDigitChange(idx: number, val: string) {
    const cleaned = val.replace(/\D/g, '')
    if (cleaned.length > 1) {
      const next = Array(OTP_DIGITS).fill('')
      for (let i = 0; i < Math.min(cleaned.length, OTP_DIGITS); i++) next[i] = cleaned[i]
      setDigits(next)
      digitRefs.current[Math.min(cleaned.length - 1, OTP_DIGITS - 1)]?.focus()
      return
    }
    const next = [...digits]
    next[idx] = cleaned
    setDigits(next)
    if (cleaned && idx < OTP_DIGITS - 1) digitRefs.current[idx + 1]?.focus()
  }

  function handleDigitKeyDown(idx: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) digitRefs.current[idx - 1]?.focus()
  }

  function handleDigitPaste(e: React.ClipboardEvent) {
    e.preventDefault()
    const p = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_DIGITS)
    if (!p) return
    const next = Array(OTP_DIGITS).fill('')
    for (let i = 0; i < p.length; i++) next[i] = p[i]
    setDigits(next)
    digitRefs.current[Math.min(p.length - 1, OTP_DIGITS - 1)]?.focus()
  }

  function redirect(isAdmin: boolean, tierId: number | null) {
    if (isAdmin) navigate('/admin', { replace: true })
    else if (!tierId) navigate('/onboarding?step=plan', { replace: true, state: { hasBillingAccount: false } })
    else navigate('/dashboard', { replace: true })
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
        redirect(me.is_admin, me.tier_id)
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
      const me = await loginWithToken(res.access_token)
      redirect(me.is_admin, me.tier_id)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Verification failed.'
      if (msg.includes('Too many attempts')) {
        setStep('credentials'); resetDigits()
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
        redirect(me.is_admin, me.tier_id)
        return
      }
      setStep('otp')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not resend code.')
    } finally {
      setLoading(false)
    }
  }

  const isExpired = timeLeft === 0
  const timerPct  = (timeLeft / OTP_TTL_SECONDS) * 100

  if (step === 'otp') {
    return (
      <div className="auth-split-layout">
        <LeftPanel />
        <div className="auth-split-right">
          <div className="auth-split-form anim-fade-up">
            <Link to="/" className="asf-mobile-brand">
              <div className="asf-mobile-logo"><ShieldCheck size={18} color="#C8A24A" strokeWidth={2.5} /></div>
              <span>ImmigLens</span>
            </Link>

            <div className="asf-steps">
              <div className="asf-step asf-step--done">
                <div className="asf-step-circle">✓</div>
                <span>Sign in</span>
              </div>
              <div className="asf-step-track asf-step-track--done" />
              <div className="asf-step asf-step--active">
                <div className="asf-step-circle asf-step-circle--active">2</div>
                <span>Verify</span>
              </div>
            </div>

            <div className="asf-header">
              <p className="asf-eyebrow">Step 2 of 2</p>
              <h1 className="asf-title">Check your email</h1>
              <p className="asf-sub">
                We sent a 6-digit code to <strong style={{ color: '#0B1F3B' }}>{email}</strong>
              </p>
            </div>

            <div className="asf-timer">
              <div className="asf-timer-track">
                <div
                  className={`asf-timer-fill${isExpired ? ' expired' : timeLeft <= 60 ? ' warn' : ''}`}
                  style={{ width: `${timerPct}%` }}
                />
              </div>
              <p className={`asf-timer-label${isExpired ? ' expired' : timeLeft <= 60 ? ' warn' : ''}`}>
                {isExpired ? 'Code expired' : `Expires in ${formatTime(timeLeft)}`}
              </p>
            </div>

            <form onSubmit={handleOtp}>
              <div className="asf-otp-grid" onPaste={handleDigitPaste}>
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
                    className={`asf-otp-digit${d ? ' filled' : ''}`}
                    autoComplete={i === 0 ? 'one-time-code' : 'off'}
                  />
                ))}
              </div>

              {error && <div className="asf-error"><span>⚠</span>{error}</div>}

              {!isExpired && (
                <>
                  <label className="asf-remember">
                    <input type="checkbox" checked={rememberDevice} onChange={e => setRememberDevice(e.target.checked)} />
                    <span>Remember this device for 30 days</span>
                  </label>
                  <button className="asf-btn" disabled={loading || otp.length < OTP_DIGITS}>
                    {loading ? <><span className="auth-spinner" /> Verifying…</> : <>Verify &amp; Sign In <ArrowRight size={16} strokeWidth={2.5} /></>}
                  </button>
                </>
              )}
            </form>

            <div className="asf-otp-footer">
              {isExpired ? (
                <button type="button" className="asf-btn" onClick={handleResend} disabled={loading}>
                  {loading ? <><span className="auth-spinner" /> Sending…</> : 'Resend Code'}
                </button>
              ) : (
                <p className="asf-resend">
                  Didn&apos;t receive it?{' '}
                  <button type="button" onClick={handleResend} disabled={loading}>Resend code</button>
                </p>
              )}
              <button type="button" className="asf-back" onClick={() => { setStep('credentials'); resetDigits(); setError(null) }}>
                ← Back to sign in
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-split-layout">
      <LeftPanel />
      <div className="auth-split-right">
        <div className="auth-split-form anim-fade-up">

          <Link to="/" className="asf-mobile-brand">
            <div className="asf-mobile-logo"><ShieldCheck size={18} color="#C8A24A" strokeWidth={2.5} /></div>
            <span>ImmigLens</span>
          </Link>

          <div className="asf-header">
            <p className="asf-eyebrow">Welcome back</p>
            <h1 className="asf-title">Sign in to your account</h1>
            <p className="asf-sub">Enter your credentials to continue.</p>
          </div>

          {passwordResetOk && (
            <div className="asf-banner-success">✓ Password updated successfully. Please sign in.</div>
          )}

          <form onSubmit={handleCredentials} noValidate>
            <div className="asf-field">
              <label className="asf-label">Work Email</label>
              <div className="asf-input-wrap">
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus autoComplete="email" placeholder="you@company.com" />
              </div>
            </div>

            <div className="asf-field">
              <div className="asf-label-row">
                <label className="asf-label">Password</label>
                <Link to="/forgot-password" className="asf-forgot">Forgot password?</Link>
              </div>
              <div className="asf-input-wrap">
                <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••" autoComplete="current-password" className="asf-pw-input" />
                <button type="button" className="asf-pw-toggle" onClick={() => setShowPassword(p => !p)} tabIndex={-1} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                  {showPassword ? <EyeOff size={16} strokeWidth={2} /> : <Eye size={16} strokeWidth={2} />}
                </button>
              </div>
            </div>

            {error && <div className="asf-error"><span>⚠</span>{error}</div>}

            <button className="asf-btn" disabled={loading}>
              {loading ? <><span className="auth-spinner" /> Sending code…</> : <>Continue <ArrowRight size={16} strokeWidth={2.5} /></>}
            </button>
          </form>

          <p className="asf-switch">
            Don&apos;t have an account?{' '}
            <Link to="/register">Create account</Link>
          </p>

        </div>
      </div>
    </div>
  )
}
