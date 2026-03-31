/**
 * Onboarding Wizard
 *
 * Handles the post-registration journey:
 *   Step 1 - verify   -> OTP email verification (email + password kept in location.state)
 *   Step 2 - plan     -> Choose a subscription plan (Monthly / Annual / Free)
 *   Step 3 - done     -> Welcome / success after Stripe checkout
 *
 * URL params used:
 *   ?step=verify|plan|done
 *   ?email=user@example.com      (preserved for OTP resend display)
 *   ?planId=2                    (pre-selects a plan from the pricing page)
 *   ?period=monthly|annual       (pre-selects billing period)
 *   ?checkout=success|cancelled  (echo from Stripe redirect on done step)
 */
import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowRight, Check, CheckCircle2, Loader2,
  ShieldCheck, Zap, Camera, Bell, FileText,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { auth } from '../api/auth'
import { billing } from '../api/billing'
import { subscriptions } from '../api/subscriptions'
import type { SubscriptionTier } from '../types'

// --- Constants ---------------------------------------------------------------

const OTP_TTL_SECONDS = 10 * 60
const OTP_DIGITS = 6

// --- Helpers -----------------------------------------------------------------

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

function fmt(val: number): string {
  return val === -1 ? 'Unlimited' : String(val)
}

// --- Shared Left Panel -------------------------------------------------------

interface LeftPanelProps {
  step: 'verify' | 'plan' | 'done'
}

function LeftPanel({ step }: LeftPanelProps) {
  const headline =
    step === 'verify' ? (<>Verify your<br /><span className="asl-headline-gold">identity.</span></>) :
    step === 'plan'   ? (<>Pick the plan<br /><span className="asl-headline-gold">that fits you.</span></>) :
                        (<>You&apos;re all<br /><span className="asl-headline-gold">set to go.</span></>)

  const sub =
    step === 'verify' ? 'Check your inbox for a 6-digit code. It expires in 10 minutes.' :
    step === 'plan'   ? 'All plans include a 14-day free trial. No charge until your trial ends.' :
                        'Start adding employers, attaching job boards, and generating reports.'

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
          <h2 className="asl-headline">{headline}</h2>
          <p className="asl-sub">{sub}</p>
          <ul className="asl-features">
            <li className="asl-feature">
              <div className="asl-feature-icon"><Camera size={14} color="#C8A24A" strokeWidth={2} /></div>
              <div>
                <div className="asl-feature-title">Automated captures</div>
                <div className="asl-feature-desc">Screenshot every job board posting on schedule</div>
              </div>
            </li>
            <li className="asl-feature">
              <div className="asl-feature-icon"><Bell size={14} color="#C8A24A" strokeWidth={2} /></div>
              <div>
                <div className="asl-feature-title">Change detection</div>
                <div className="asl-feature-desc">Instant alerts when postings are modified or removed</div>
              </div>
            </li>
            <li className="asl-feature">
              <div className="asl-feature-icon"><FileText size={14} color="#C8A24A" strokeWidth={2} /></div>
              <div>
                <div className="asl-feature-title">IRCC-ready reports</div>
                <div className="asl-feature-desc">PDF compliance packages generated in one click</div>
              </div>
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

// --- Plan Card ----------------------------------------------------------------

interface PlanCardProps {
  tier: SubscriptionTier
  isSelected: boolean
  isAnnual: boolean
  hasBillingAccount: boolean
  isPopular: boolean
  onSelect: () => void
}

function PlanCard({ tier, isSelected, isAnnual, hasBillingAccount, isPopular, onSelect }: PlanCardProps) {
  const rawMonthly = tier.price_per_month
  const monthlyDisplay = rawMonthly != null && isAnnual ? Math.floor(rawMonthly * 0.8) : rawMonthly

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`ob-plan-card${isSelected ? ' ob-plan-card--selected' : ''}${isPopular ? ' ob-plan-card--popular' : ''}`}
    >
      {isPopular && <div className="ob-plan-badge">Most Popular</div>}
      <div className="ob-plan-name">{tier.display_name}</div>

      {monthlyDisplay != null ? (
        <div className="ob-plan-price">
          <span className="ob-plan-amount">${monthlyDisplay}</span>
          <span className="ob-plan-period">/mo</span>
        </div>
      ) : (
        <div className="ob-plan-price">
          <span className="ob-plan-amount" style={{ fontSize: '1.1rem' }}>Contact Sales</span>
        </div>
      )}

      {isAnnual && rawMonthly != null && rawMonthly > 0 && (
        <div className="ob-plan-billing-note">${Math.floor(rawMonthly * 0.8 * 12)}/yr · save 20%</div>
      )}
      {!isAnnual && rawMonthly != null && rawMonthly > 0 && (
        <div className="ob-plan-billing-note">billed monthly</div>
      )}

      <ul className="ob-plan-features">
        {[
          `${fmt(tier.max_active_positions)} active positions`,
          `${fmt(tier.max_urls_per_position)} URLs / position`,
          `${fmt(tier.max_captures_per_month)} captures / month`,
        ].map(f => (
          <li key={f}>
            <Check size={13} strokeWidth={2.5} className="ob-plan-check" />
            {f}
          </li>
        ))}
      </ul>

      <div className={`ob-plan-cta${isSelected ? ' ob-plan-cta--selected' : ''}`}>
        {isSelected ? 'Selected ✓' : hasBillingAccount ? 'Select Plan' : 'Start Free Trial'}
      </div>
    </button>
  )
}

// --- Step 1: Verify Email ----------------------------------------------------

interface VerifyStepProps {
  email: string
  password: string | null
  onSuccess: (token: string) => void
}

function VerifyStep({ email, password, onSuccess }: VerifyStepProps) {
  const [digits, setDigits] = useState<string[]>(Array(OTP_DIGITS).fill(''))
  const [rememberDevice, setRememberDevice] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [timeLeft, setTimeLeft] = useState(OTP_TTL_SECONDS)
  const [resendLoading, setResendLoading] = useState(false)
  const digitRefs = useRef<(HTMLInputElement | null)[]>([])

  const otp = digits.join('')
  const isExpired = timeLeft === 0
  const timerPct = (timeLeft / OTP_TTL_SECONDS) * 100

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { clearInterval(interval); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    setTimeout(() => digitRefs.current[0]?.focus(), 80)
  }, [])

  function handleDigitChange(index: number, value: string) {
    const cleaned = value.replace(/\D/g, '')
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

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    if (otp.length < OTP_DIGITS) return
    setError(null)
    setLoading(true)
    try {
      const res = await auth.verifyOtp(email, otp, rememberDevice)
      onSuccess(res.access_token)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Verification failed.')
      setDigits(Array(OTP_DIGITS).fill(''))
      setTimeout(() => digitRefs.current[0]?.focus(), 50)
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    if (!password) return
    setError(null)
    setResendLoading(true)
    try {
      await auth.requestOtp(email, password)
      setDigits(Array(OTP_DIGITS).fill(''))
      setTimeLeft(OTP_TTL_SECONDS)
      setTimeout(() => digitRefs.current[0]?.focus(), 80)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not resend code.')
    } finally {
      setResendLoading(false)
    }
  }

  return (
    <div className="auth-split-layout">
      <LeftPanel step="verify" />
      <div className="auth-split-right">
        <div className="auth-split-form anim-fade-up">

          <Link to="/" className="asf-mobile-brand">
            <div className="asf-mobile-logo"><ShieldCheck size={18} color="#C8A24A" strokeWidth={2.5} /></div>
            <span>ImmigLens</span>
          </Link>

          <div className="asf-steps">
            <div className="asf-step asf-step--active">
              <div className="asf-step-circle asf-step-circle--active">1</div>
              <span>Verify email</span>
            </div>
            <div className="asf-step-track" />
            <div className="asf-step">
              <div className="asf-step-circle">2</div>
              <span>Choose plan</span>
            </div>
            <div className="asf-step-track" />
            <div className="asf-step">
              <div className="asf-step-circle">3</div>
              <span>Dashboard</span>
            </div>
          </div>

          <div className="asf-header">
            <p className="asf-eyebrow">Step 1 of 3</p>
            <h1 className="asf-title">Check your email</h1>
            <p className="asf-sub">
              We sent a 6-digit code to{' '}
              <strong style={{ color: '#0B1F3B' }}>{email}</strong>
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

          <form onSubmit={handleVerify}>
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
                  {loading
                    ? <><span className="auth-spinner" /> Verifying...</>
                    : <>Verify &amp; Continue <ArrowRight size={16} strokeWidth={2.5} /></>}
                </button>
              </>
            )}
          </form>

          <div className="asf-otp-footer">
            {isExpired ? (
              password ? (
                <button type="button" className="asf-btn" style={{ marginTop: 0 }} onClick={handleResend} disabled={resendLoading}>
                  {resendLoading ? <><span className="auth-spinner" /> Sending...</> : 'Resend Code'}
                </button>
              ) : (
                <p className="asf-resend">
                  Code expired.{' '}
                  <Link to="/login" style={{ color: '#C8A24A', fontWeight: 700 }}>Sign in again</Link>{' '}
                  to get a new code.
                </p>
              )
            ) : (
              password ? (
                <p className="asf-resend">
                  Didn&apos;t receive it?{' '}
                  <button type="button" onClick={handleResend} disabled={resendLoading}>Resend code</button>
                </p>
              ) : (
                <p className="asf-resend">
                  <Link to="/login" className="asf-back">← Back to sign in</Link>
                </p>
              )
            )}
          </div>

        </div>
      </div>
    </div>
  )
}

// --- Step 2: Choose Plan -----------------------------------------------------

interface PlanStepProps {
  preselectedTierId: number | null
  preselectedPeriod: 'monthly' | 'annual'
  hasBillingAccount: boolean
  onSkip: () => void
}

function PlanStep({ preselectedTierId, preselectedPeriod, hasBillingAccount, onSkip }: PlanStepProps) {
  const [tiers, setTiers] = useState<SubscriptionTier[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isAnnual, setIsAnnual] = useState(preselectedPeriod === 'annual')
  const [selectedId, setSelectedId] = useState<number | null>(preselectedTierId)
  const [skipTrial, setSkipTrial] = useState(false)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    subscriptions.tiers()
      .then(data => {
        const paid = data.filter(t => t.is_active && t.stripe_price_id)
        setTiers(paid)
        if (!preselectedTierId && paid.length > 0) {
          setSelectedId(paid[Math.floor((paid.length - 1) / 2)].id)
        }
      })
      .catch(e => setLoadError((e as Error).message))
      .finally(() => setLoading(false))
  }, [preselectedTierId])

  async function handleProceed() {
    if (!selectedId) return
    setError(null)
    setCheckoutLoading(true)
    try {
      const { url } = await billing.createCheckout(selectedId, true, isAnnual)
      window.location.href = url
    } catch (e) {
      setError((e as Error).message)
      setCheckoutLoading(false)
    }
  }

  const popularIdx = Math.floor((tiers.length - 1) / 2)

  return (
    <div className="auth-split-layout">
      <LeftPanel step="plan" />
      <div className="auth-split-right">
        <div className="auth-split-form ob-plan-form anim-fade-up">

          <Link to="/" className="asf-mobile-brand">
            <div className="asf-mobile-logo"><ShieldCheck size={18} color="#C8A24A" strokeWidth={2.5} /></div>
            <span>ImmigLens</span>
          </Link>

          <div className="asf-steps">
            <div className="asf-step asf-step--done">
              <div className="asf-step-circle">&#10003;</div>
              <span>Verify email</span>
            </div>
            <div className="asf-step-track asf-step-track--done" />
            <div className="asf-step asf-step--active">
              <div className="asf-step-circle asf-step-circle--active">2</div>
              <span>Choose plan</span>
            </div>
            <div className="asf-step-track" />
            <div className="asf-step">
              <div className="asf-step-circle">3</div>
              <span>Dashboard</span>
            </div>
          </div>

          <div className="asf-header">
            <p className="asf-eyebrow">Step 2 of 3</p>
            <h1 className="asf-title">Choose your plan</h1>
            <p className="asf-sub">
              {hasBillingAccount
                ? 'Select a plan below and activate it immediately.'
                : <><strong>14-day free trial</strong> included. Skip it below if you prefer to pay now.</>}
            </p>
          </div>

          <div className="ob-billing-toggle" style={{ marginBottom: '1.5rem' }}>
            <span className={`ob-toggle-label${!isAnnual ? ' ob-toggle-label--active' : ''}`}>Monthly</span>
            <button
              type="button"
              onClick={() => setIsAnnual(a => !a)}
              className="ob-toggle-switch"
              aria-label="Toggle billing period"
            >
              <div className={`ob-toggle-knob${isAnnual ? ' ob-toggle-knob--on' : ''}`} />
            </button>
            <span className={`ob-toggle-label${isAnnual ? ' ob-toggle-label--active' : ''}`}>
              Annual <span className="ob-save-badge">Save 20%</span>
            </span>
          </div>

          {loading && (
            <div className="ob-loading">
              <Loader2 size={22} className="ob-spinner" />
              <span>Loading plans...</span>
            </div>
          )}

          {loadError && (
            <div className="asf-error" style={{ marginBottom: '1rem' }}>
              <span>⚠</span>{loadError}
            </div>
          )}

          {!loading && !loadError && (
            <div className="ob-plan-grid">
              {tiers.map((tier, idx) => (
                <PlanCard
                  key={tier.id}
                  tier={tier}
                  isSelected={selectedId === tier.id}
                  isAnnual={isAnnual}
                  hasBillingAccount={hasBillingAccount}
                  isPopular={idx === popularIdx && tiers.length > 1}
                  onSelect={() => setSelectedId(tier.id)}
                />
              ))}
            </div>
          )}

          {error && (
            <div className="asf-error" style={{ marginTop: '1rem' }}>
              <span>⚠</span>{error}
            </div>
          )}

          <div className="ob-plan-actions" style={{ marginTop: '1.5rem' }}>
            {/* Trial opt-out — only shown for new users without an existing billing account */}
            {!hasBillingAccount && (
              <label className="asf-remember" style={{ marginBottom: '0.25rem' }}>
                <input
                  type="checkbox"
                  checked={skipTrial}
                  onChange={e => setSkipTrial(e.target.checked)}
                />
                <span>Skip free trial — subscribe &amp; pay now</span>
              </label>
            )}
            <button
              className="asf-btn"
              style={{ marginTop: 0, maxWidth: 280 }}
              onClick={handleProceed}
              disabled={checkoutLoading || !selectedId || loading}
            >
              {checkoutLoading
                ? <><span className="auth-spinner" /> Redirecting...</>
                : hasBillingAccount || skipTrial
                  ? <>Subscribe Now <ArrowRight size={16} strokeWidth={2.5} /></>
                  : <>Start 14-day Free Trial <ArrowRight size={16} strokeWidth={2.5} /></>}
            </button>
            <button type="button" className="ob-skip-btn" onClick={onSkip} disabled={checkoutLoading}>
              Continue with free tier for now
            </button>
          </div>

          <p className="ob-plan-note">
            <Zap size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />
            You can upgrade or change your plan at any time from your account settings.
          </p>

        </div>
      </div>
    </div>
  )
}

// --- Step 3: Done ------------------------------------------------------------

interface DoneStepProps {
  userName: string
  wasCancelled: boolean
  onContinue: () => void
}

function DoneStep({ userName, wasCancelled, onContinue }: DoneStepProps) {
  return (
    <div className="auth-split-layout">
      <LeftPanel step="done" />
      <div className="auth-split-right">
        <div className="auth-split-form anim-fade-up" style={{ textAlign: 'center' }}>

          <Link to="/" className="asf-mobile-brand" style={{ justifyContent: 'center' }}>
            <div className="asf-mobile-logo"><ShieldCheck size={18} color="#C8A24A" strokeWidth={2.5} /></div>
            <span>ImmigLens</span>
          </Link>

          <div className="asf-steps">
            <div className="asf-step asf-step--done">
              <div className="asf-step-circle">&#10003;</div>
              <span>Verify email</span>
            </div>
            <div className="asf-step-track asf-step-track--done" />
            <div className={`asf-step${wasCancelled ? ' asf-step--active' : ' asf-step--done'}`}>
              <div className={`asf-step-circle${wasCancelled ? ' asf-step-circle--active' : ''}`}>
                {wasCancelled ? '2' : '✓'}
              </div>
              <span>Choose plan</span>
            </div>
            <div className={`asf-step-track${wasCancelled ? '' : ' asf-step-track--done'}`} />
            <div className={`asf-step${wasCancelled ? '' : ' asf-step--active'}`}>
              <div className={`asf-step-circle${wasCancelled ? '' : ' asf-step-circle--active'}`}>3</div>
              <span>Dashboard</span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', margin: '1.5rem 0 1rem' }}>
            <div style={{
              width: 68, height: 68, borderRadius: 18,
              background: wasCancelled
                ? 'linear-gradient(135deg,#1f2937,#374151)'
                : 'linear-gradient(135deg,#0b1f3b,#1a3a6b)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 6px 24px rgba(11,31,59,0.22)',
            }}>
              {wasCancelled
                ? <ShieldCheck size={32} color="#9ca3af" strokeWidth={2} />
                : <CheckCircle2 size={32} color="#C8A24A" strokeWidth={2} />}
            </div>
          </div>

          <div className="asf-header" style={{ marginBottom: '1.25rem' }}>
            <p className="asf-eyebrow">{wasCancelled ? 'No worries' : 'Step 3 of 3'}</p>
            <h1 className="asf-title">
              {wasCancelled ? 'Checkout cancelled' : `Welcome, ${userName.split(' ')[0]}!`}
            </h1>
            <p className="asf-sub">
              {wasCancelled
                ? 'Your account is active on the free tier. You can subscribe any time from your account settings.'
                : 'Your subscription is active. Start tracking LMIA recruitment proof right away.'}
            </p>
          </div>

          {!wasCancelled && (
            <div style={{
              background: 'rgba(200,162,74,0.07)',
              border: '1px solid rgba(200,162,74,0.2)',
              borderRadius: 10,
              padding: '0.9rem 1.1rem',
              marginBottom: '1.5rem',
              textAlign: 'left',
            }}>
              <ul style={{ margin: 0, paddingLeft: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.45rem', fontSize: '0.86rem', color: '#4b5563' }}>
                <li>Add your first employer and job position</li>
                <li>Attach job board URLs to auto-capture screenshots</li>
                <li>Generate LMIA-ready PDF reports any time</li>
              </ul>
            </div>
          )}

          <button className="asf-btn" style={{ marginTop: 0 }} onClick={onContinue}>
            Go to Dashboard <ArrowRight size={16} strokeWidth={2.5} />
          </button>

        </div>
      </div>
    </div>
  )
}

// --- Main Onboarding Component -----------------------------------------------

export default function Onboarding() {
  const { user, loginWithToken, refreshUser, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()

  const stepParam     = searchParams.get('step') ?? 'verify'
  const emailParam    = searchParams.get('email') ?? ''
  const planIdParam   = searchParams.get('planId')
  const periodParam   = (searchParams.get('period') ?? 'monthly') as 'monthly' | 'annual'
  const checkoutParam = searchParams.get('checkout')

  const locState = location.state as {
    password?: string
    email?: string
    hasBillingAccount?: boolean
  } | null

  const emailForOtp    = emailParam || locState?.email || ''
  const passwordForOtp = locState?.password ?? null

  type WizardStep = 'verify' | 'plan' | 'done'
  const step: WizardStep = (['verify', 'plan', 'done'].includes(stepParam)
    ? stepParam
    : 'verify') as WizardStep

  if (authLoading) return <div className="loading full-loading">Loading...</div>

  const hasToken = !!localStorage.getItem('token')
  if ((step === 'plan' || step === 'done') && !hasToken && !user) {
    return <Navigate to="/login" replace />
  }

  if (step === 'plan' && user && user.tier_id && checkoutParam !== 'cancelled') {
    return <Navigate to="/dashboard" replace />
  }

  if (step === 'verify' && !emailForOtp) {
    return <Navigate to="/register" replace />
  }

  async function handleVerifySuccess(token: string) {
    const me = await loginWithToken(token)
    if (me.is_admin) { navigate('/admin', { replace: true }); return }
    if (me.tier_id)  { navigate('/dashboard', { replace: true }); return }
    const params = new URLSearchParams({ step: 'plan' })
    if (planIdParam) params.set('planId', planIdParam)
    if (periodParam !== 'monthly') params.set('period', periodParam)
    navigate(`/onboarding?${params.toString()}`, { replace: true, state: { hasBillingAccount: false } })
  }

  function handleSkipPlan() {
    navigate('/dashboard', { replace: true })
  }

  async function handleDoneContinue() {
    // Sync subscription state proactively before the webhook fires (race-condition fix)
    const sid = searchParams.get('session_id')
    if (sid) {
      try { await billing.syncCheckout(sid) } catch { /* non-fatal: webhook will catch up */ }
    }
    await refreshUser()
    navigate('/dashboard', { replace: true })
  }

  return (
    <>
      {step === 'verify' && (
        <VerifyStep
          email={emailForOtp}
          password={passwordForOtp}
          onSuccess={handleVerifySuccess}
        />
      )}
      {step === 'plan' && (
        <PlanStep
          preselectedTierId={planIdParam ? parseInt(planIdParam, 10) : null}
          preselectedPeriod={periodParam}
          hasBillingAccount={locState?.hasBillingAccount ?? false}
          onSkip={handleSkipPlan}
        />
      )}
      {step === 'done' && user && (
        <DoneStep
          userName={user.full_name}
          wasCancelled={checkoutParam === 'cancelled'}
          onContinue={handleDoneContinue}
        />
      )}
    </>
  )
}
