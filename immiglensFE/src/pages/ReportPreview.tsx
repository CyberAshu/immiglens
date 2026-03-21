import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { consumePendingPdf } from '../reportStore'
import {
  ArrowLeft,
  Download,
  FileText,
  GripVertical,
  Loader2,
  RotateCcw,
  TriangleAlert,
  X,
} from 'lucide-react'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { reports as reportsApi } from '../api/reports'
import { positions as positionsApi } from '../api'
import type { JobPosition } from '../types'

GlobalWorkerOptions.workerSrc = workerUrl

// crypto.randomUUID() requires HTTPS — use getRandomValues as a fallback for HTTP
function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  return [...b].map((v, i) => ([4, 6, 8, 10].includes(i) ? '-' : '') + v.toString(16).padStart(2, '0')).join('')
}

interface PageItem {
  id: string
  originalIndex: number
  thumbnailDataUrl: string | null
  removed: boolean
}

type Phase =
  | { name: 'generating'; elapsed: number }
  | { name: 'editing'; pdfBytes: ArrayBuffer; pages: PageItem[] }
  | { name: 'error'; message: string }

function PageCard({
  page,
  onToggle,
}: {
  page: PageItem
  onToggle: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: page.id })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={[
        'pc-card',
        page.removed ? 'pc-card--removed' : '',
        isDragging ? 'pc-card--drag' : '',
      ].filter(Boolean).join(' ')}
    >
      <div className="pc-top">
        <span className="pc-grip" {...attributes} {...listeners}>
          <GripVertical size={12} strokeWidth={2} />
        </span>
        <button
          className="pc-toggle"
          onClick={onToggle}
          title={page.removed ? 'Restore page' : 'Remove page'}
        >
          {page.removed
            ? <RotateCcw size={11} strokeWidth={2.5} />
            : <X size={11} strokeWidth={2.5} />}
        </button>
      </div>
      <div className="pc-thumb">
        {page.thumbnailDataUrl
          ? <img src={page.thumbnailDataUrl} alt={`Page ${page.originalIndex + 1}`} />
          : <div className="pc-skeleton" />}
      </div>
      <div className="pc-label">Page {page.originalIndex + 1}</div>
    </div>
  )
}

export default function ReportPreview() {
  const { employerId, positionId } = useParams<{ employerId: string; positionId: string }>()
  const navigate = useNavigate()
  const eId = Number(employerId)
  const pId = Number(positionId)
  const renderCancelRef = useRef(false)
  const originalBlobRef = useRef<string | null>(null)
  const pagesDirtyRef = useRef(false)

  const [phase, setPhase] = useState<Phase>(() => {
    const buf = consumePendingPdf()
    if (buf) return { name: 'editing', pdfBytes: buf, pages: [] }
    return { name: 'generating', elapsed: 0 }
  })
  const [position, setPosition] = useState<JobPosition | null>(null)
  const [showRemoved, setShowRemoved] = useState(false)
  const [viewMode, setViewMode] = useState<'preview' | 'manage'>('preview')
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null)
  const [previewBuilding, setPreviewBuilding] = useState(false)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  useEffect(() => {
    positionsApi.get(eId, pId).then(pos => setPosition(pos))
  }, [eId, pId])

  // If buffer was pre-generated and passed via store, build pages and blob URL immediately
  useEffect(() => {
    if (phase.name !== 'editing' || phase.pages.length > 0) return
    const buf = phase.pdfBytes
    getDocument({ data: buf.slice(0) }).promise.then(pdfDoc => {
      const pages: PageItem[] = Array.from({ length: pdfDoc.numPages }, (_, i) => ({
        id: uuid(),
        originalIndex: i,
        thumbnailDataUrl: null,
        removed: false,
      }))
      const blobUrl = URL.createObjectURL(new Blob([buf], { type: 'application/pdf' }))
      originalBlobRef.current = blobUrl
      setPreviewBlobUrl(blobUrl)
      pagesDirtyRef.current = false
      setPhase({ name: 'editing', pdfBytes: buf, pages })
    })
  }, [])

  useEffect(() => {
    if (phase.name !== 'generating') return
    handleGenerate()
  }, [])

  useEffect(() => {
    if (phase.name !== 'generating') return
    const timer = setInterval(() => {
      setPhase(p =>
        p.name === 'generating' ? { name: 'generating', elapsed: p.elapsed + 1 } : p,
      )
    }, 1000)
    return () => clearInterval(timer)
  }, [phase.name])

  useEffect(() => {
    if (phase.name !== 'editing') return
    renderCancelRef.current = false

    async function renderThumbnails() {
      if (phase.name !== 'editing') return
      const pdfDoc = await getDocument({ data: phase.pdfBytes.slice(0) }).promise
      for (let i = 0; i < pdfDoc.numPages; i++) {
        if (renderCancelRef.current) break
        const pg = await pdfDoc.getPage(i + 1)
        const viewport = pg.getViewport({ scale: 1.0 })
        const canvas = document.createElement('canvas')
        canvas.width = viewport.width
        canvas.height = viewport.height
        const ctx = canvas.getContext('2d')!
        await pg.render({ canvasContext: ctx, viewport, canvas }).promise
        const dataUrl = canvas.toDataURL('image/jpeg', 0.82)
        if (!renderCancelRef.current) {
          setPhase(prev =>
            prev.name === 'editing'
              ? {
                  ...prev,
                  pages: prev.pages.map(p =>
                    p.originalIndex === i ? { ...p, thumbnailDataUrl: dataUrl } : p,
                  ),
                }
              : prev,
          )
        }
      }
    }

    renderThumbnails()
    return () => { renderCancelRef.current = true }
  }, [phase.name === 'editing' ? phase.pdfBytes : null])

  async function handleGenerate() {
    setPhase({ name: 'generating', elapsed: 0 })
    try {
      const blob = await reportsApi.generate(eId, pId)
      const buffer = await blob.arrayBuffer()
      const pdfDoc = await getDocument({ data: buffer.slice(0) }).promise
      const pages: PageItem[] = Array.from({ length: pdfDoc.numPages }, (_, i) => ({
        id: uuid(),
        originalIndex: i,
        thumbnailDataUrl: null,
        removed: false,
      }))
      const blobUrl = URL.createObjectURL(new Blob([buffer], { type: 'application/pdf' }))
      originalBlobRef.current = blobUrl
      setPreviewBlobUrl(blobUrl)
      pagesDirtyRef.current = false
      setPhase({ name: 'editing', pdfBytes: buffer, pages })
    } catch (e: unknown) {
      setPhase({ name: 'error', message: e instanceof Error ? e.message : 'Generation failed.' })
    }
  }

  async function handleDownload() {
    if (phase.name !== 'editing') return
    const { PDFDocument } = await import('pdf-lib')
    const srcDoc = await PDFDocument.load(phase.pdfBytes)
    const outDoc = await PDFDocument.create()
    const kept = phase.pages.filter(p => !p.removed)
    const copied = await outDoc.copyPages(srcDoc, kept.map(p => p.originalIndex))
    copied.forEach(pg => outDoc.addPage(pg))
    const bytes = await outDoc.save()
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'LMIA_Report.pdf'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }

  function handleDragEnd(e: DragEndEvent) {
    if (phase.name !== 'editing') return
    const { active, over } = e
    if (over && active.id !== over.id) {
      pagesDirtyRef.current = true
      setPhase(prev => {
        if (prev.name !== 'editing') return prev
        const from = prev.pages.findIndex(p => p.id === active.id)
        const to = prev.pages.findIndex(p => p.id === over.id)
        return { ...prev, pages: arrayMove(prev.pages, from, to) }
      })
    }
  }

  function togglePage(id: string) {
    if (phase.name !== 'editing') return
    pagesDirtyRef.current = true
    setPhase(prev => {
      if (prev.name !== 'editing') return prev
      return {
        ...prev,
        pages: prev.pages.map(p => p.id === id ? { ...p, removed: !p.removed } : p),
      }
    })
  }

  // Rebuild preview whenever user switches back to Preview tab after managing pages
  useEffect(() => {
    if (viewMode !== 'preview' || phase.name !== 'editing' || !pagesDirtyRef.current) return
    pagesDirtyRef.current = false
    let cancelled = false
    setPreviewBuilding(true)
    import('pdf-lib').then(async ({ PDFDocument }) => {
      if (cancelled || phase.name !== 'editing') return
      const srcDoc = await PDFDocument.load(phase.pdfBytes)
      const outDoc = await PDFDocument.create()
      const kept = phase.pages.filter(p => !p.removed)
      const copied = await outDoc.copyPages(srcDoc, kept.map(p => p.originalIndex))
      copied.forEach(pg => outDoc.addPage(pg))
      const bytes = await outDoc.save()
      if (!cancelled) {
        const newUrl = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))
        setPreviewBlobUrl(prev => {
          if (prev && prev !== originalBlobRef.current) URL.revokeObjectURL(prev)
          return newUrl
        })
        setPreviewBuilding(false)
      }
    })
    return () => { cancelled = true }
  }, [viewMode])

  function handleBack() {
    if (originalBlobRef.current) URL.revokeObjectURL(originalBlobRef.current)
    setPreviewBlobUrl(prev => {
      if (prev && prev !== originalBlobRef.current) URL.revokeObjectURL(prev)
      return null
    })
    originalBlobRef.current = null
    pagesDirtyRef.current = false
    navigate(`/employers/${eId}/positions/${pId}`)
  }

  if (phase.name === 'generating') {
    const mins = Math.floor(phase.elapsed / 60)
    const secs = String(phase.elapsed % 60).padStart(2, '0')
    return (
      <div className="rp-generating">
        <Loader2 size={32} className="rp-spin" />
        <div className="rp-gen-title">Generating PDF…</div>
        {position && (
          <div className="rp-gen-sub">{position.job_title} · NOC {position.noc_code}</div>
        )}
        <div className="rp-gen-time">{mins}:{secs}</div>
        <div className="rp-gen-hint">
          Rendering pages and merging capture evidence. This takes 30–120 seconds.
        </div>
        <Link to={`/employers/${eId}/positions/${pId}`} className="rp-gen-back">
          ← Back to Position
        </Link>
      </div>
    )
  }

  if (phase.name === 'error') {
    return (
      <div className="rp-generating">
        <TriangleAlert size={28} style={{ color: '#dc2626' }} />
        <div className="rp-gen-title" style={{ color: '#dc2626' }}>Generation Failed</div>
        {position && (
          <div className="rp-gen-sub">{position.job_title} · NOC {position.noc_code}</div>
        )}
        <div className="rp-gen-hint">{phase.message}</div>
        <button className="rp-btn-primary" style={{ marginTop: '1.5rem' }} onClick={handleGenerate}>
          Retry
        </button>
        <Link
          to={`/employers/${eId}/positions/${pId}`}
          className="rp-gen-back"
        >
          ← Back to Position
        </Link>
      </div>
    )
  }

  const keptCount = phase.pages.filter(p => !p.removed).length
  const removedCount = phase.pages.filter(p => p.removed).length
  const visiblePages = showRemoved ? phase.pages : phase.pages.filter(p => !p.removed)

  return (
    <div className="rpe-shell">
      <div className="rpe-topbar">

        {/* Left: back + title */}
        <div className="rpe-topbar-left">
          <button className="rpe-back" onClick={handleBack}>
            <ArrowLeft size={13} strokeWidth={2.5} />
            Back
          </button>
          <div className="rpe-topbar-divider" />
          <div className="rpe-topbar-title">
            <FileText size={13} strokeWidth={2} className="rpe-topbar-icon" />
            <span>LMIA Report</span>
            {position && (
              <span className="rpe-topbar-sub">{position.job_title} &nbsp;·&nbsp; NOC {position.noc_code}</span>
            )}
          </div>
        </div>

        {/* Centre: tabs */}
        <div className="rpe-tabs">
          <button
            className={`rpe-tab ${viewMode === 'preview' ? 'rpe-tab--active' : ''}`}
            onClick={() => setViewMode('preview')}
          >
            Preview
          </button>
          <button
            className={`rpe-tab ${viewMode === 'manage' ? 'rpe-tab--active' : ''}`}
            onClick={() => setViewMode('manage')}
          >
            Manage Pages
          </button>
        </div>

        {/* Right: stats + actions */}
        <div className="rpe-topbar-right">
          <div className="rpe-stats">
            <span className="rpe-stats-count">{keptCount} page{keptCount !== 1 ? 's' : ''}</span>
            {removedCount > 0 && (
              <span className="rpe-removed-badge">{removedCount} removed</span>
            )}
          </div>
          {viewMode === 'manage' && removedCount > 0 && (
            <button
              className={`rpe-btn-ghost ${showRemoved ? 'rpe-btn-ghost--on' : ''}`}
              onClick={() => setShowRemoved(v => !v)}
            >
              {showRemoved ? 'Hide removed' : `Show removed`}
            </button>
          )}
          <button
            className="rpe-btn-download"
            onClick={handleDownload}
            disabled={keptCount === 0}
          >
            <Download size={13} strokeWidth={2.5} /> Download PDF
          </button>
        </div>

      </div>

      {viewMode === 'preview' ? (
        <div className="rpe-preview-wrap">
          {previewBuilding && (
            <div className="rpe-preview-rebuilding">
              <Loader2 size={16} className="rp-spin" /> Updating preview…
            </div>
          )}
          <object
            className="rpe-preview-obj"
            data={previewBlobUrl ?? ''}
            type="application/pdf"
          >
            <div className="rpe-no-pdf">
              Your browser cannot display PDFs inline.{' '}
              <a href={previewBlobUrl ?? ''} download="LMIA_Report.pdf">Download instead</a>.
            </div>
          </object>
        </div>
      ) : (
        <div className="rpe-body">
          <div className="rpe-scroll-wrap">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={visiblePages.map(p => p.id)} strategy={rectSortingStrategy}>
                <div className="rpe-grid">
                  {visiblePages.map(page => (
                    <PageCard key={page.id} page={page} onToggle={() => togglePage(page.id)} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
            {keptCount === 0 && (
              <div className="rpe-empty">
                All pages have been removed. Restore some pages before downloading.
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        *, *::before, *::after { box-sizing: border-box; }

        /* Idle */
        .rp-idle {
          display: flex; flex-direction: column; align-items: center;
          height: 100vh; overflow-y: auto; background: #F6F4EF; padding: 2rem 1.5rem;
          font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
        }
        .rp-idle-back {
          align-self: flex-start; display: flex; align-items: center; gap: 0.35rem;
          font-size: 0.82rem; color: #6b7280; text-decoration: none; margin-bottom: 3rem;
          transition: color 0.15s;
        }
        .rp-idle-back:hover { color: #0B1F3B; }
        .rp-idle-card {
          display: flex; flex-direction: column; align-items: center; text-align: center;
          background: #fff; border: 1px solid #e5e7eb; border-radius: 12px;
          padding: 3rem 2.5rem; max-width: 480px; width: 100%;
          box-shadow: 0 2px 12px rgba(0,0,0,0.06);
        }
        .rp-idle-icon { color: #C8A24A; margin-bottom: 1.25rem; }
        .rp-idle-title { font-size: 1.3rem; font-weight: 700; color: #0B1F3B; margin-bottom: 0.4rem; }
        .rp-idle-sub { font-size: 0.85rem; color: #6b7280; margin-bottom: 1.5rem; }
        .rp-idle-desc {
          font-size: 0.85rem; color: #4b5563; line-height: 1.65;
          margin-bottom: 2rem; text-align: left;
        }
        .rp-btn-primary {
          display: inline-flex; align-items: center; gap: 0.4rem;
          background: #0B1F3B; color: #fff; border: none; border-radius: 7px;
          padding: 0.65rem 1.4rem; font-size: 0.85rem; font-weight: 600;
          cursor: pointer; transition: background 0.15s;
        }
        .rp-btn-primary:hover { background: #1a3352; }

        /* Generating / Error */
        .rp-generating {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          min-height: 100vh; gap: 0.75rem; background: #F6F4EF; text-align: center;
          font-family: 'Inter', ui-sans-serif, system-ui, sans-serif; padding: 2rem;
        }
        .rp-spin { animation: rp-rotate 1s linear infinite; }
        @keyframes rp-rotate { to { transform: rotate(360deg); } }
        .rp-gen-title { font-size: 1.05rem; font-weight: 700; color: #0B1F3B; }
        .rp-gen-sub { font-size: 0.83rem; color: #6b7280; margin-top: -0.25rem; }
        .rp-gen-time {
          font-size: 1.5rem; font-weight: 700; color: #C8A24A;
          font-variant-numeric: tabular-nums;
        }
        .rp-gen-hint { font-size: 0.83rem; color: #6b7280; max-width: 340px; }
        .rp-gen-back {
          margin-top: 0.5rem; font-size: 0.8rem; color: #9ca3af;
          text-decoration: none; transition: color 0.15s;
        }
        .rp-gen-back:hover { color: #0B1F3B; }

        /* Editor shell */
        .rpe-shell {
          display: flex; flex-direction: column; height: 100vh; overflow: hidden;
          background: #F6F4EF;
          font-family: 'Inter', ui-sans-serif, system-ui, sans-serif; font-size: 13px;
        }

        /* Topbar */
        .rpe-topbar {
          display: flex; align-items: center; justify-content: space-between;
          padding: 0 1.5rem; height: 56px; flex-shrink: 0;
          background: #0B1F3B; border-bottom: 1px solid rgba(255,255,255,0.07);
          gap: 1rem;
        }
        .rpe-topbar-left {
          display: flex; align-items: center; gap: 0.85rem; min-width: 0;
        }
        .rpe-back {
          display: flex; align-items: center; gap: 0.3rem;
          font-size: 0.8rem; font-weight: 500;
          color: rgba(255,255,255,0.48); background: none; border: none;
          cursor: pointer; white-space: nowrap; transition: color 0.15s;
          padding: 0.25rem 0; font-family: inherit;
        }
        .rpe-back:hover { color: #C8A24A; }
        .rpe-topbar-divider {
          width: 1px; height: 18px; background: rgba(255,255,255,0.1); flex-shrink: 0;
        }
        .rpe-topbar-title {
          display: flex; align-items: center; gap: 0.45rem;
          font-size: 0.88rem; font-weight: 700; color: #fff;
          white-space: nowrap; overflow: hidden;
        }
        .rpe-topbar-icon { color: #C8A24A; flex-shrink: 0; }
        .rpe-topbar-sub {
          font-weight: 400; font-size: 0.78rem;
          color: rgba(255,255,255,0.38); white-space: nowrap;
          overflow: hidden; text-overflow: ellipsis;
        }

        /* Tabs — centred */
        .rpe-tabs {
          display: flex; align-items: center;
          background: rgba(255,255,255,0.07); border-radius: 7px;
          padding: 3px; gap: 2px; flex-shrink: 0;
        }
        .rpe-tab {
          background: transparent; border: none; cursor: pointer; font-family: inherit;
          font-size: 0.8rem; font-weight: 600; color: rgba(255,255,255,0.45);
          padding: 0.32rem 1rem; border-radius: 5px;
          transition: background 0.15s, color 0.15s; white-space: nowrap;
        }
        .rpe-tab:hover { color: rgba(255,255,255,0.8); }
        .rpe-tab--active {
          background: rgba(255,255,255,0.13); color: #fff;
          box-shadow: 0 1px 3px rgba(0,0,0,0.2);
        }

        /* Right side */
        .rpe-topbar-right {
          display: flex; align-items: center; gap: 0.65rem; flex-shrink: 0;
        }
        .rpe-stats {
          display: flex; align-items: center; gap: 0.45rem;
        }
        .rpe-stats-count {
          font-size: 0.78rem; font-weight: 600; color: rgba(255,255,255,0.55);
          white-space: nowrap;
        }
        .rpe-removed-badge {
          font-size: 0.7rem; font-weight: 700; white-space: nowrap;
          background: rgba(220,38,38,0.18); color: #fca5a5;
          border: 1px solid rgba(220,38,38,0.3);
          border-radius: 20px; padding: 0.1rem 0.55rem;
        }
        .rpe-btn-ghost {
          display: inline-flex; align-items: center; gap: 0.35rem;
          font-size: 0.78rem; font-weight: 500; font-family: inherit;
          color: rgba(255,255,255,0.55); background: transparent;
          border: 1px solid rgba(255,255,255,0.12); border-radius: 6px;
          padding: 0.3rem 0.75rem; cursor: pointer;
          transition: color 0.15s, border-color 0.15s, background 0.15s;
          white-space: nowrap;
        }
        .rpe-btn-ghost:hover { color: #fff; border-color: rgba(255,255,255,0.3); background: rgba(255,255,255,0.06); }
        .rpe-btn-ghost--on { color: #C8A24A; border-color: rgba(200,162,74,0.4); background: rgba(200,162,74,0.08); }
        .rpe-btn-download {
          display: inline-flex; align-items: center; gap: 0.4rem;
          background: #C8A24A; color: #fff; border: none; border-radius: 7px;
          padding: 0.42rem 1rem; font-size: 0.82rem; font-weight: 600;
          cursor: pointer; transition: background 0.15s; font-family: inherit;
          white-space: nowrap; box-shadow: 0 1px 4px rgba(200,162,74,0.35);
        }
        .rpe-btn-download:hover { background: #b8923a; }
        .rpe-btn-download:disabled { opacity: 0.4; cursor: not-allowed; }

        /* Native PDF preview */
        .rpe-preview-wrap { flex:1; display:flex; flex-direction:column; position:relative; overflow:hidden; }
        .rpe-preview-rebuilding {
          position:absolute; top:0.75rem; left:50%; transform:translateX(-50%); z-index:10;
          display:flex; align-items:center; gap:0.4rem; background:rgba(11,31,59,0.88);
          color:#fff; font-size:0.78rem; font-weight:600; padding:0.35rem 0.85rem;
          border-radius:20px; white-space:nowrap; pointer-events:none;
        }
        .rpe-preview-obj { flex:1; width:100%; border:none; display:block; background:#525659; }
        .rpe-no-pdf {
          display:flex; align-items:center; justify-content:center; gap:0.4rem;
          height:100%; color:#9ca3af; font-size:0.85rem;
        }
        .rpe-no-pdf a { color:#C8A24A; text-decoration:none; }
        .rpe-no-pdf a:hover { text-decoration:underline; }

        /* Body + grid */
        .rpe-body { flex: 1; overflow-y: auto; padding: 2rem 1.5rem; }
        .rpe-scroll-wrap { max-width: 1200px; margin: 0 auto; }
        .rpe-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 1.5rem;
        }
        .rpe-empty {
          text-align: center; padding: 3rem; color: #9ca3af; font-size: 0.85rem;
        }

        /* Page card */
        .pc-card {
          background: #fff; border: 1px solid #e5e7eb; border-radius: 10px;
          overflow: hidden; display: flex; flex-direction: column;
          transition: opacity 0.2s, box-shadow 0.15s;
          box-shadow: 0 2px 8px rgba(0,0,0,0.08);
        }
        .pc-card:hover { box-shadow: 0 6px 20px rgba(0,0,0,0.13); }
        .pc-card--removed { opacity: 0.35; border-style: dashed; }
        .pc-card--drag { box-shadow: 0 12px 32px rgba(0,0,0,0.22); opacity: 0.92; }
        .pc-top {
          display: flex; align-items: center; justify-content: space-between;
          padding: 0.4rem 0.55rem; background: #f8f9fa; border-bottom: 1px solid #eaecef;
        }
        .pc-grip {
          color: #b0b7c3; cursor: grab; display: flex; align-items: center;
          touch-action: none; padding: 2px;
          transition: color 0.12s;
        }
        .pc-grip:hover { color: #6b7280; }
        .pc-grip:active { cursor: grabbing; }
        .rpe-shell .pc-toggle {
          display: flex; align-items: center; justify-content: center;
          width: 22px; height: 22px; border-radius: 5px;
          border: 1px solid rgba(0,0,0,0.1);
          padding: 0;
          background: #fff; cursor: pointer; color: #9ca3af;
          transition: background 0.13s, color 0.13s, border-color 0.13s;
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        }
        .rpe-shell .pc-toggle:hover {
          background: #fee2e2; color: #dc2626;
          border-color: rgba(220,38,38,0.25);
        }
        .rpe-shell .pc-card--removed .pc-toggle {
          background: #f0fdf4; color: #16a34a;
          border-color: rgba(22,163,74,0.3);
        }
        .rpe-shell .pc-card--removed .pc-toggle:hover {
          background: #dcfce7; color: #15803d;
          border-color: rgba(22,163,74,0.5);
        }
        .pc-thumb {
          aspect-ratio: 210 / 297; background: #f3f4f6;
          display: flex; align-items: center; justify-content: center; overflow: hidden;
        }
        .pc-thumb img { width: 100%; height: 100%; object-fit: contain; display: block; background: #fff; }
        .pc-skeleton {
          width: 100%; height: 100%;
          background: linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%);
          background-size: 200% 100%; animation: pc-shimmer 1.4s infinite;
        }
        @keyframes pc-shimmer { to { background-position: -200% 0; } }
        .pc-label {
          padding: 0.45rem 0.6rem; font-size: 0.77rem; color: #6b7280;
          text-align: center; font-weight: 500; background: #fafafa;
          border-top: 1px solid #f0f0f0;
        }
      `}</style>
    </div>
  )
}
