import { useEffect, useState } from 'react'
import { auth as authApi } from '../api'
import { useAuth } from '../context/AuthContext'
import type { TrustedDevice } from '../types'
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Lock,
  Monitor,
  Pencil,
  Shield,
  Smartphone,
  Trash2,
  UserCircle2,
} from 'lucide-react'

export default function AccountSettings() {
  const { user, loginWithToken, token } = useAuth()

  const [fullName, setFullName]           = useState(user?.full_name ?? '')
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileMsg, setProfileMsg]       = useState<{ ok: boolean; text: string } | null>(null)

  const [pwOpen, setPwOpen]       = useState(false)
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw]         = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwSaving, setPwSaving]   = useState(false)
  const [pwMsg, setPwMsg]         = useState<{ ok: boolean; text: string } | null>(null)

  const [devicesOpen, setDevicesOpen]       = useState(false)
  const [devices, setDevices]               = useState<TrustedDevice[]>([])
  const [devicesLoading, setDevicesLoading] = useState(false)
  const [revoking, setRevoking]             = useState<number | null>(null)
  const [revokingAll, setRevokingAll]       = useState(false)

  useEffect(() => { setFullName(user?.full_name ?? '') }, [user])

  function toggleDevices() {
    if (!devicesOpen) {
      setDevicesLoading(true)
      authApi.listTrustedDevices()
        .then(setDevices)
        .catch(() => setDevices([]))
        .finally(() => setDevicesLoading(false))
    }
    setDevicesOpen(o => !o)
  }

  async function handleProfileSave(e: React.FormEvent) {
    e.preventDefault()
    if (!fullName.trim()) return
    setProfileSaving(true)
    setProfileMsg(null)
    try {
      await authApi.updateProfile(fullName.trim())
      if (token) await loginWithToken(token)
      setProfileMsg({ ok: true, text: 'Name updated successfully.' })
    } catch (err: unknown) {
      setProfileMsg({ ok: false, text: err instanceof Error ? err.message : 'Failed to update.' })
    } finally {
      setProfileSaving(false)
    }
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault()
    setPwMsg(null)
    if (newPw !== confirmPw) { setPwMsg({ ok: false, text: 'Passwords do not match.' }); return }
    if (newPw.length < 8)    { setPwMsg({ ok: false, text: 'Minimum 8 characters required.' }); return }
    setPwSaving(true)
    try {
      await authApi.changePassword(currentPw, newPw)
      setPwMsg({ ok: true, text: 'Password updated successfully.' })
      setCurrentPw(''); setNewPw(''); setConfirmPw('')
      setTimeout(() => { setPwOpen(false); setPwMsg(null) }, 1800)
    } catch (err: unknown) {
      setPwMsg({ ok: false, text: err instanceof Error ? err.message : 'Failed to update password.' })
    } finally {
      setPwSaving(false)
    }
  }

  async function handleRevoke(id: number) {
    setRevoking(id)
    try {
      await authApi.revokeDevice(id)
      setDevices(prev => prev.filter(d => d.id !== id))
    } catch { /* ignore */ } finally {
      setRevoking(null)
    }
  }

  async function handleRevokeAll() {
    setRevokingAll(true)
    try {
      await authApi.revokeAllDevices()
      setDevices([])
    } catch { /* ignore */ } finally {
      setRevokingAll(false)
    }
  }

  function fmt(d: string) {
    return new Date(d).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })
  }

  const initials = user?.full_name
    ? user.full_name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : 'U'

  const joinedLong = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-CA', { year: 'numeric', month: 'long' })
    : ''

  return (
    <div className="acct-page-a">
      <div className="acct-hero">
        <div className="acct-hero-avatar">{initials}</div>
        <div className="acct-hero-info">
          <div className="acct-hero-name">{user?.full_name}</div>
          <div className="acct-hero-meta">
            <span>{user?.email}</span>
            {joinedLong && (
              <>
                <span className="acct-hero-dot" />
                <span>Member since {joinedLong}</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="acct-grid">
        <div className="acct-card-a">
          <div className="acct-card-head">
            <div className="acct-card-icon acct-card-icon--profile">
              <UserCircle2 size={17} strokeWidth={1.8} />
            </div>
            <div>
              <div className="acct-card-title">Profile</div>
              <div className="acct-card-desc">Update your display name</div>
            </div>
          </div>
          <form onSubmit={handleProfileSave} className="acct-card-body">
            <div className="acct-field">
              <label className="acct-label">Full Name</label>
              <div className="acct-input-icon-wrap">
                <input className="acct-input" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your full name" required />
                <Pencil size={13} className="acct-input-suffix-icon" />
              </div>
            </div>
            <div className="acct-field">
              <label className="acct-label">Email Address</label>
              <div className="acct-input-icon-wrap">
                <input className="acct-input acct-input--readonly" value={user?.email ?? ''} readOnly />
                <Lock size={12} className="acct-input-suffix-icon acct-input-suffix-icon--lock" />
              </div>
              <span className="acct-hint">Email address cannot be changed.</span>
            </div>
            {profileMsg && (
              <div className={`acct-msg${profileMsg.ok ? ' acct-msg--ok' : ' acct-msg--err'}`}>
                {profileMsg.ok ? <CheckCircle2 size={14} strokeWidth={2} /> : <AlertCircle size={14} strokeWidth={2} />}
                {profileMsg.text}
              </div>
            )}
            <button type="submit" className="btn-save btn-save--full" disabled={profileSaving}>
              {profileSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </form>
        </div>

        <div className="acct-card-a">
          <div className="acct-card-head">
            <div className="acct-card-icon acct-card-icon--security">
              <Shield size={17} strokeWidth={1.8} />
            </div>
            <div>
              <div className="acct-card-title">Security</div>
              <div className="acct-card-desc">Password &amp; trusted devices</div>
            </div>
          </div>
          <div className="acct-card-body acct-card-body--security">
            <div className="acct-sec-row" onClick={() => setPwOpen(o => !o)}>
              <div className="acct-sec-row-left">
                <span className="acct-sec-row-label">Password</span>
                <span className="acct-sec-row-val">••••••••••</span>
              </div>
              <button type="button" className="acct-action-btn">
                Change Password
                <ChevronRight size={14} className={`acct-chevron${pwOpen ? ' acct-chevron--open' : ''}`} />
              </button>
            </div>
            {pwOpen && (
              <form onSubmit={handlePasswordChange} className="acct-expand">
                <div className="acct-field">
                  <label className="acct-label">Current Password</label>
                  <input className="acct-input" type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} placeholder="Current password" required autoComplete="current-password" />
                </div>
                <div className="acct-row">
                  <div className="acct-field">
                    <label className="acct-label">New Password</label>
                    <input className="acct-input" type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="New password" required autoComplete="new-password" />
                  </div>
                  <div className="acct-field">
                    <label className="acct-label">Confirm Password</label>
                    <input className="acct-input" type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="Confirm password" required autoComplete="new-password" />
                  </div>
                </div>
                {pwMsg && (
                  <div className={`acct-msg${pwMsg.ok ? ' acct-msg--ok' : ' acct-msg--err'}`}>
                    {pwMsg.ok ? <CheckCircle2 size={14} strokeWidth={2} /> : <AlertCircle size={14} strokeWidth={2} />}
                    {pwMsg.text}
                  </div>
                )}
                <div className="acct-expand-footer">
                  <button type="button" className="acct-cancel-btn" onClick={() => { setPwOpen(false); setPwMsg(null); setCurrentPw(''); setNewPw(''); setConfirmPw('') }}>Cancel</button>
                  <button type="submit" className="btn-save" disabled={pwSaving}>{pwSaving ? 'Updating...' : 'Update Password'}</button>
                </div>
              </form>
            )}
            <div className="acct-sec-divider" />
            <div className="acct-sec-row" onClick={toggleDevices}>
              <div className="acct-sec-row-left">
                <span className="acct-sec-row-label">Trusted Devices</span>
                <span className="acct-sec-row-val">
                  {devicesOpen && devicesLoading ? 'Loading...' : devicesOpen ? `${devices.length} device${devices.length !== 1 ? 's' : ''}` : 'Active sessions'}
                </span>
              </div>
              <button type="button" className="acct-action-btn">
                Manage
                <ChevronRight size={14} className={`acct-chevron${devicesOpen ? ' acct-chevron--open' : ''}`} />
              </button>
            </div>
            {devicesOpen && (
              <div className="acct-expand">
                {devicesLoading ? (
                  <div className="loading">Loading...</div>
                ) : devices.length === 0 ? (
                  <div className="acct-empty-devices">
                    <Monitor size={24} strokeWidth={1.2} />
                    <span>No trusted devices on your account.</span>
                  </div>
                ) : (
                  <div className="acct-devices-list">
                    {devices.map(device => {
                      const isMobile = device.os && /ios|android|ipad/i.test(device.os)
                      const displayName = device.device_name ?? 'Trusted Device'
                      return (
                        <div key={device.id} className="acct-device-row">
                          <div className="acct-device-icon-wrap">
                            {isMobile
                              ? <Smartphone size={15} strokeWidth={1.8} />
                              : <Monitor size={15} strokeWidth={1.8} />}
                          </div>
                          <div className="acct-device-info">
                            <div className="acct-device-name">{displayName}</div>
                            <div className="acct-device-meta">
                              {device.ip_address && <span>{device.ip_address} &middot; </span>}
                              Added {fmt(device.created_at)}
                              {device.last_used_at && <span> &middot; Last used {fmt(device.last_used_at)}</span>}
                              <span> &middot; Expires {fmt(device.expires_at)}</span>
                            </div>
                          </div>
                          <button
                            className="acct-revoke-btn"
                            onClick={e => { e.stopPropagation(); handleRevoke(device.id) }}
                            disabled={revoking === device.id || revokingAll}
                          >
                            <Trash2 size={12} strokeWidth={2} />
                            {revoking === device.id ? 'Revoking...' : 'Revoke'}
                          </button>
                        </div>
                      )
                    })}
                    {devices.length > 1 && (
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                        <button
                          className="acct-revoke-btn acct-revoke-btn--all"
                          onClick={handleRevokeAll}
                          disabled={revokingAll}
                        >
                          <Trash2 size={12} strokeWidth={2} />
                          {revokingAll ? 'Revoking all...' : 'Revoke All Devices'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}