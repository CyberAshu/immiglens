import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Info } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConfirmOptions {
  title:         string
  message:       string
  confirmLabel?: string
  cancelLabel?:  string
  variant?:      'danger' | 'primary'
}

interface ConfirmState extends ConfirmOptions {
  resolve: (value: boolean) => void
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useConfirm() {
  const [state, setState] = useState<ConfirmState | null>(null)

  function askConfirm(options: ConfirmOptions): Promise<boolean> {
    return new Promise<boolean>(resolve => setState({ ...options, resolve }))
  }

  function handleConfirm() { state?.resolve(true);  setState(null) }
  function handleCancel()  { state?.resolve(false); setState(null) }

  const confirmModal = state ? (
    <ConfirmModal
      title={state.title}
      message={state.message}
      confirmLabel={state.confirmLabel ?? 'Confirm'}
      cancelLabel={state.cancelLabel  ?? 'Cancel'}
      variant={state.variant ?? 'danger'}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  ) : null

  return { confirmModal, askConfirm }
}

// ─── Component ────────────────────────────────────────────────────────────────

interface ConfirmModalProps {
  title:        string
  message:      string
  confirmLabel: string
  cancelLabel:  string
  variant:      'danger' | 'primary'
  onConfirm:    () => void
  onCancel:     () => void
}

export default function ConfirmModal({
  title, message, confirmLabel, cancelLabel, variant, onConfirm, onCancel,
}: ConfirmModalProps) {
  const confirmBtnRef = useRef<HTMLButtonElement>(null)

  // Focus confirm button on mount; close on Escape
  useEffect(() => {
    confirmBtnRef.current?.focus()
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="admin-modal-overlay" onClick={onCancel}>
      <div
        className="confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        onClick={e => e.stopPropagation()}
      >
        <div className={`confirm-modal-icon confirm-modal-icon--${variant}`}>
          {variant === 'danger'
            ? <AlertTriangle size={22} strokeWidth={2} />
            : <Info         size={22} strokeWidth={2} />
          }
        </div>

        <h2 className="confirm-modal-title" id="confirm-modal-title">{title}</h2>
        <p  className="confirm-modal-msg">{message}</p>

        <div className="confirm-modal-actions">
          <button className="btn-ghost" onClick={onCancel}>{cancelLabel}</button>
          <button
            ref={confirmBtnRef}
            className={`confirm-modal-btn confirm-modal-btn--${variant}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
