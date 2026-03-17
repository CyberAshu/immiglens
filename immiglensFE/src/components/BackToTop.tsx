import { useEffect, useRef, useState } from 'react'

interface BackToTopProps {
  /** Pass a ref to the scrollable container. Omit to use window scroll (landing pages). */
  scrollRef?: React.RefObject<HTMLElement | null>
}

export function BackToTop({ scrollRef }: BackToTopProps) {
  const [visible, setVisible] = useState(false)
  // Keep a stable ref to the current scroll target so the click handler always hits the right element
  const targetRef = useRef<HTMLElement | Window | null>(null)

  useEffect(() => {
    const el = scrollRef?.current ?? null
    targetRef.current = el ?? window

    const handler = () => {
      const top = el ? el.scrollTop : window.scrollY
      setVisible(top > 300)
    }

    targetRef.current.addEventListener('scroll', handler, { passive: true })
    return () => targetRef.current?.removeEventListener('scroll', handler)
  }, [scrollRef])

  if (!visible) return null

  const handleClick = () => {
    const t = targetRef.current
    if (t && t !== window) {
      (t as HTMLElement).scrollTo({ top: 0, behavior: 'smooth' })
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  return (
    <button
      onClick={handleClick}
      aria-label="Back to top"
      style={{
        position: 'fixed',
        bottom: '1.5rem',
        right: '1.5rem',
        zIndex: 9999,
        width: '2.5rem',
        height: '2.5rem',
        borderRadius: '50%',
        background: '#0B1F3B',
        color: '#fff',
        border: '2px solid #C8A24A',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 4px 12px rgba(11,31,59,0.25)',
        transition: 'background 0.15s',
        fontSize: '1.1rem',
        lineHeight: 1,
      }}
      onMouseEnter={e => (e.currentTarget.style.background = '#1a3352')}
      onMouseLeave={e => (e.currentTarget.style.background = '#0B1F3B')}
    >
      ↑
    </button>
  )
}
