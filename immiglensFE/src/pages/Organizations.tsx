import { useEffect, useState } from 'react'
import { organizations as orgApi } from '../api'
import type { OrgInvitation, OrgMembership, OrgRole, Organization } from '../types'
import { useConfirm } from '../components/ConfirmModal'

function RoleBadge({ role }: { role: OrgRole }) {
  const colors: Record<OrgRole, string> = { owner: '#C8A24A', admin: '#0B1F3B', viewer: '#6b7280' }
  const labels: Record<OrgRole, string> = { owner: 'Owner', admin: 'Admin', viewer: 'Member' }
  return (
    <span className="role-pill" style={{ color: colors[role], borderColor: colors[role] }}>
      {labels[role]}
    </span>
  )
}

export default function Organizations() {
  const [orgs, setOrgs]             = useState<Organization[]>([])
  const [selected, setSelected]     = useState<Organization | null>(null)
  const [members, setMembers]       = useState<OrgMembership[]>([])
  const [invitations, setInvitations] = useState<OrgInvitation[]>([])
  const [loading, setLoading]       = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [newName, setNewName]       = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<OrgRole>('viewer')
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const { confirmModal, askConfirm } = useConfirm()

  useEffect(() => {
    orgApi.list()
      .then(setOrgs)
      .finally(() => setLoading(false))
  }, [])

  async function selectOrg(org: Organization) {
    setSelected(org)
    const [m, i] = await Promise.all([orgApi.listMembers(org.id), orgApi.listInvitations(org.id)])
    setMembers(m)
    setInvitations(i)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError(null)
    try {
      const org = await orgApi.create(newName)
      setOrgs(prev => [...prev, org])
      setShowCreate(false); setNewName('')
      selectOrg(org)
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Failed.') }
    finally { setSaving(false) }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!selected) return
    setSaving(true); setError(null)
    try {
      const inv = await orgApi.invite(selected.id, inviteEmail, inviteRole)
      setInvitations(prev => [...prev, inv])
      setShowInvite(false); setInviteEmail('')
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Failed.') }
    finally { setSaving(false) }
  }

  async function handleRemoveMember(uid: number) {
    if (!selected || !await askConfirm({ title: 'Remove Member', message: 'Remove this member from the organization?', confirmLabel: 'Remove' })) return
    await orgApi.removeMember(selected.id, uid)
    setMembers(prev => prev.filter(m => m.user_id !== uid))
  }

  async function handleDeleteOrg() {
    if (!selected || !await askConfirm({ title: 'Delete Organization', message: `Delete "${selected.name}"? This cannot be undone.`, confirmLabel: 'Delete' })) return
    await orgApi.remove(selected.id)
    setOrgs(prev => prev.filter(o => o.id !== selected.id))
    setSelected(null)
  }

  if (loading) return <div className="loading">Loading…</div>

  return (
    <div className="page">
      {confirmModal}
      <div className="page-header">
        <div>
          <h1>Organizations</h1>
          <p className="sub-text">Share employers and positions with your team</p>
        </div>
        <button className="btn-primary" onClick={() => setShowCreate(v => !v)}>
          {showCreate ? 'Cancel' : '+ New Organization'}
        </button>
      </div>

      {/* ── Create form ─────────────────────────── */}
      {showCreate && (
        <form className="card form-card" onSubmit={handleCreate}>
          <div className="card-title">Create Organization</div>
          {error && <div className="error-msg">{error}</div>}
          <div className="form-group">
            <label className="form-label">Name</label>
            <input required className="form-input" value={newName}
              placeholder="e.g. Acme Immigration Team"
              onChange={e => setNewName(e.target.value)} />
          </div>
          <div className="form-actions">
            <button className="btn-primary" type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create'}</button>
          </div>
        </form>
      )}

      <div className="two-col-layout">
        {/* ── Org list ─────────────────────────── */}
        <div>
          <div className="section-heading-sm">Your Organizations</div>
          {orgs.length === 0
            ? <p className="empty-hint">No organizations yet.</p>
            : (
              <div className="org-list">
                {orgs.map(org => (
                  <button
                    key={org.id}
                    className={`org-item ${selected?.id === org.id ? 'org-item--active' : ''}`}
                    onClick={() => selectOrg(org)}
                  >
                    <span className="org-item-name">{org.name}</span>
                    <span className="org-item-date">{new Date(org.created_at).toLocaleDateString()}</span>
                  </button>
                ))}
              </div>
            )}
        </div>

        {/* ── Org detail ───────────────────────── */}
        {selected && (
          <div className="org-detail">
            <div className="card">
              <div className="card-title" style={{ justifyContent: 'space-between' }}>
                {selected.name}
                <button className="btn-ghost btn-xs btn-danger" onClick={handleDeleteOrg}>Delete Org</button>
              </div>

              {/* Members */}
              <div className="section-heading-sm" style={{ marginTop: '1rem' }}>Members</div>
              <div className="table-wrap" style={{ border: 'none' }}>
                <table className="data-table">
                  <thead><tr><th>Member</th><th>Role</th><th>Joined</th><th></th></tr></thead>
                  <tbody>
                    {members.map(m => (
                      <tr key={m.id}>
                        <td>
                          <div>{m.user_name || <span className="text-dim">Unknown</span>}</div>
                          <div className="text-dim" style={{ fontSize: '0.75rem' }}>{m.user_email}</div>
                        </td>
                        <td><RoleBadge role={m.role} /></td>
                        <td className="text-dim">{new Date(m.joined_at).toLocaleDateString()}</td>
                        <td>
                          {m.role !== 'owner' && (
                            <button className="btn-ghost btn-xs btn-danger" onClick={() => handleRemoveMember(m.user_id)}>Remove</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Invite */}
              <button className="btn-secondary btn-sm" style={{ marginTop: '1rem' }} onClick={() => setShowInvite(v => !v)}>
                {showInvite ? 'Cancel Invite' : '+ Invite Member'}
              </button>

              {showInvite && (
                <form onSubmit={handleInvite} style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  {error && <div className="error-msg" style={{ width: '100%' }}>{error}</div>}
                  <div className="form-group" style={{ flex: 1, minWidth: '180px' }}>
                    <label className="form-label">Email</label>
                    <input required className="form-input" type="email" value={inviteEmail}
                      placeholder="colleague@example.com"
                      onChange={e => setInviteEmail(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Role</label>
                    <select className="form-input" value={inviteRole}
                      onChange={e => setInviteRole(e.target.value as OrgRole)}>
                      <option value="admin">Admin</option>
                      <option value="viewer">Member</option>
                    </select>
                  </div>
                  <button className="btn-primary btn-sm" type="submit" disabled={saving}>{saving ? '…' : 'Send Invite'}</button>
                </form>
              )}

              {/* Pending invitations */}
              {invitations.filter(i => !i.accepted_at).length > 0 && (
                <>
                  <div className="section-heading-sm" style={{ marginTop: '1.5rem' }}>Pending Invitations</div>
                  <div className="table-wrap" style={{ border: 'none' }}>
                    <table className="data-table">
                      <thead><tr><th>Email</th><th>Role</th><th>Expires</th></tr></thead>
                      <tbody>
                        {invitations.filter(i => !i.accepted_at).map(i => (
                          <tr key={i.id}>
                            <td className="mono">{i.email}</td>
                            <td><RoleBadge role={i.role} /></td>
                            <td className="text-dim">{new Date(i.expires_at).toLocaleDateString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
