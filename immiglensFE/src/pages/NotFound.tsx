import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function NotFound() {
  const { user } = useAuth()
  const { pathname } = useLocation()

  const home = user ? '/dashboard' : '/'

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f8fafc',
      padding: '2rem',
      textAlign: 'center',
      fontFamily: 'inherit',
    }}>
      <div style={{
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 16,
        padding: '3rem 3.5rem',
        maxWidth: 460,
        width: '100%',
        boxShadow: '0 4px 24px rgba(11,31,59,0.07)',
      }}>
        {/* 404 number */}
        <div style={{
          fontSize: '5rem',
          fontWeight: 800,
          color: '#e5e7eb',
          lineHeight: 1,
          marginBottom: '0.5rem',
          letterSpacing: '-0.04em',
        }}>
          404
        </div>

        <h1 style={{
          fontSize: '1.25rem',
          fontWeight: 700,
          color: '#0B1F3B',
          margin: '0 0 0.6rem',
        }}>
          Page not found
        </h1>

        <p style={{
          fontSize: '0.88rem',
          color: '#6b7280',
          margin: '0 0 2rem',
          lineHeight: 1.6,
        }}>
          <code style={{
            background: '#f3f4f6',
            border: '1px solid #e5e7eb',
            borderRadius: 4,
            padding: '1px 6px',
            fontSize: '0.82rem',
            color: '#374151',
            wordBreak: 'break-all',
          }}>
            {pathname}
          </code>
          {' '}doesn't exist or may have been moved.
        </p>

        <Link
          to={home}
          style={{
            display: 'inline-block',
            background: '#0B1F3B',
            color: '#fff',
            borderRadius: 8,
            padding: '0.6rem 1.75rem',
            fontWeight: 600,
            fontSize: '0.9rem',
            textDecoration: 'none',
            transition: 'background 0.15s',
          }}
        >
          ← Back to {user ? 'Dashboard' : 'Home'}
        </Link>
      </div>
    </div>
  )
}
