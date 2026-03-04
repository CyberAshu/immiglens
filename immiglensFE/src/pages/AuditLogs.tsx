import { useEffect, useState } from 'react'
import { auditLogs as auditApi } from '../api'
import type { AuditLog } from '../types'

const ACTION_COLORS: Record<string, string> = {
  CREATE: '#22c55e',
  UPDATE: '#f59e0b',
  DELETE: '#ef4444',
  VIEW:   '#6366f1',
}

const RESOURCE_TYPES = ['', 'employer', 'position', 'posting', 'capture_round', 'organization', 'org_invitation', 'org_member', 'user', 'subscription_tier']
const ACTIONS        = ['', 'CREATE', 'UPDATE', 'DELETE', 'VIEW']

export default function AuditLogs() {
  const [logs, setLogs]           = useState<AuditLog[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [resourceType, setResourceType] = useState('')
  const [action, setAction]       = useState('')
  const [expanded, setExpanded]   = useState<number | null>(null)

  function load() {
    setLoading(true)
    auditApi.list({ resource_type: resourceType || undefined, action: action || undefined, limit: 100 })
      .then(setLogs)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [resourceType, action])

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Audit Log</h1>
          <p className="sub-text">Complete record of all create / update / delete actions</p>
        </div>
      </div>

      {/* ── Filters ─────────────────────────────── */}
      <div className="filter-bar">
        <select className="filter-select" value={resourceType} onChange={e => setResourceType(e.target.value)}>
          <option value="">All Resources</option>
          {RESOURCE_TYPES.slice(1).map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select className="filter-select" value={action} onChange={e => setAction(e.target.value)}>
          <option value="">All Actions</option>
          {ACTIONS.slice(1).map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <span className="filter-count">{logs.length} result{logs.length !== 1 ? 's' : ''}</span>
      </div>

      {error   && <div className="error-msg">{error}</div>}
      {loading && <div className="loading">Loading…</div>}

      {!loading && !error && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Action</th>
                <th>Resource</th>
                <th>ID</th>
                <th>User</th>
                <th>IP</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && (
                <tr><td colSpan={7} className="empty-cell">No audit logs found.</td></tr>
              )}
              {logs.map(log => (
                <>
                  <tr key={log.id}>
                    <td className="mono text-dim">{new Date(log.created_at).toLocaleString()}</td>
                    <td>
                      <span className="action-badge" style={{ color: ACTION_COLORS[log.action] ?? '#888', borderColor: ACTION_COLORS[log.action] ?? '#444' }}>
                        {log.action}
                      </span>
                    </td>
                    <td>{log.resource_type}</td>
                    <td className="text-dim">{log.resource_id ?? '—'}</td>
                    <td>
                      {log.user_name
                        ? <><div style={{fontSize:'0.85rem'}}>{log.user_name}</div><div className="text-dim" style={{fontSize:'0.75rem'}}>{log.user_email}</div></>
                        : <span className="text-dim">{log.user_id ?? 'system'}</span>
                      }
                    </td>
                    <td className="text-dim mono">{log.ip_address ?? '—'}</td>
                    <td>
                      {(log.old_data || log.new_data) && (
                        <button
                          className="btn-ghost btn-xs"
                          onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                        >
                          {expanded === log.id ? 'hide' : 'diff'}
                        </button>
                      )}
                    </td>
                  </tr>
                  {expanded === log.id && (
                    <tr key={`${log.id}-diff`}>
                      <td colSpan={7} className="diff-row">
                        <div className="diff-grid">
                          {log.old_data && (
                            <div>
                              <div className="diff-label">Before</div>
                              <pre className="diff-pre diff-pre--old">{JSON.stringify(log.old_data, null, 2)}</pre>
                            </div>
                          )}
                          {log.new_data && (
                            <div>
                              <div className="diff-label">After</div>
                              <pre className="diff-pre diff-pre--new">{JSON.stringify(log.new_data, null, 2)}</pre>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
