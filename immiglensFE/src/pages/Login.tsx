import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { auth } from '../api'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await login(email, password)
      const me = await auth.me()
      navigate(me.is_admin ? '/admin' : '/dashboard')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">ImmigLens</h1>
        <p className="auth-sub">LMIA Recruitment Proof Tool</p>
        <form onSubmit={handleSubmit} className="auth-form">
          <label>Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
          <label>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
          {error && <p className="error-msg">{error}</p>}
          <button className="btn-primary btn-block" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
        <p className="auth-alt">No account? <Link to="/register">Register</Link></p>
      </div>
    </div>
  )
}
