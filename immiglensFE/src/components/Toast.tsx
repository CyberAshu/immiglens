import { useEffect, useState } from 'react'
import { TriangleAlert, CheckCircle, X } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'warning'

export interface ToastData {
  message: string
  type: ToastType
}

interface Props {
  toast: ToastData | null
  onDismiss: () => void
}

export default function Toast({ toast, onDismiss }: Props) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!toast) { setVisible(false); return }
    setVisible(true)
    const t = setTimeout(() => {
      setVisible(false)
      setTimeout(onDismiss, 250) // let fade-out finish
    }, 5000)
    return () => clearTimeout(t)
  }, [toast]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!toast) return null

  const icons: Record<ToastType, React.ReactNode> = {
    success: <CheckCircle size={16} strokeWidth={2.5} style={{ flexShrink: 0 }} />,
    error:   <TriangleAlert size={16} strokeWidth={2.5} style={{ flexShrink: 0 }} />,
    warning: <TriangleAlert size={16} strokeWidth={2.5} style={{ flexShrink: 0 }} />,
  }

  return (
    <div
      className={`app-toast app-toast--${toast.type}${visible ? ' app-toast--in' : ' app-toast--out'}`}
      role="alert"
    >
      {icons[toast.type]}
      <span style={{ flex: 1 }}>{toast.message}</span>
      <button className="app-toast__close" onClick={() => { setVisible(false); setTimeout(onDismiss, 250) }} aria-label="Dismiss">
        <X size={14} strokeWidth={2.5} />
      </button>
    </div>
  )
}

/**
 * Helper hook to manage toast state.
 *
 * Usage:
 *   const { toast, showToast, clearToast } = useToast()
 *   ...
 *   showToast('Your message', 'error')
 *   ...
 *   <Toast toast={toast} onDismiss={clearToast} />
 */
export function useToast() {
  const [toast, setToast] = useState<ToastData | null>(null)

  function showToast(message: string, type: ToastType = 'error') {
    setToast({ message, type })
  }

  function clearToast() {
    setToast(null)
  }

  return { toast, showToast, clearToast }
}
