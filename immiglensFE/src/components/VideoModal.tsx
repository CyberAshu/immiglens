import { useEffect } from 'react'
import { X } from 'lucide-react'

interface VideoModalProps {
  open: boolean
  onClose: () => void
  videoUrl: string
}

export function VideoModal({ open, onClose, videoUrl }: VideoModalProps) {
  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl rounded-2xl overflow-hidden shadow-2xl bg-black"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-9 h-9 flex items-center justify-center rounded-full bg-black/60 hover:bg-black text-white transition-colors"
          aria-label="Close video"
        >
          <X size={18} strokeWidth={2.5} />
        </button>
        <div className="aspect-video w-full">
          <iframe
            src={videoUrl}
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            className="w-full h-full"
            title="Demo video"
          />
        </div>
      </div>
    </div>
  )
}
