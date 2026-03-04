import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { auth } from '../api'

export default function Register() {
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await auth.register(email, password, fullName)
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
        <h1 className="auth-title">ImmigLens</h1>
        <p className="auth-sub">Create your RCIC account</p>
        <form onSubmit={handleSubmit} className="auth-form">
          <label>Full Name</label>
          <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} required autoFocus />
          <label>Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
          <label>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} />
          {error && <p className="error-msg">{error}</p>}
          <button className="btn-primary btn-block" disabled={loading}>
            {loading ? 'Creating account…' : 'Create Account'}
          </button>
        </form>
        <p className="auth-alt">Already have an account? <Link to="/login">Sign in</Link></p>
      </div>
    </div>
  )
}
