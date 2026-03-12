import React, { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Bookmark,
  Download,
  Eye,
  EyeOff,
  FileText,
  GripVertical,
  Layers,
  Loader2,
  Minus,
  Paperclip,
  PenLine,
  RefreshCw,
  RotateCcw,
  Search,
  Table2,
  TriangleAlert,
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
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { reportConfigApi } from '../api/report_config'
import { reports as reportsApi } from '../api/reports'
import type {
  CoverFields,
  EvidenceFields,
  ReportBlock,
  ReportConfigPayload,
  SummaryFields,
} from '../types/report_config'

// ─────────────────────────────────────────────────────────────────────────────
// Meta
// ─────────────────────────────────────────────────────────────────────────────
const BLOCK_META: Record<string, { label: string; color: string; Icon: React.ElementType }> = {
  cover:              { label: 'Cover Page',                color: '#6366f1', Icon: Bookmark  },
  summary_table:      { label: 'Recruitment Summary Table', color: '#0ea5e9', Icon: Table2    },
  evidence:           { label: 'Per-Platform Evidence',     color: '#10b981', Icon: Search    },
  job_match_activity: { label: 'Job Match Activity',        color: '#e11d48', Icon: FileText  },
  appendix:           { label: 'Appendix',                  color: '#f59e0b', Icon: Paperclip },
  custom_text:        { label: 'Custom Text',               color: '#a855f7', Icon: PenLine   },
  divider:            { label: 'Divider',                   color: '#64748b', Icon: Minus     },
}

const COVER_FIELDS: { key: keyof CoverFields; label: string }[] = [
  { key: 'show_address',           label: 'Employer Address'           },
  { key: 'show_contact_person',    label: 'Contact Person'             },
  { key: 'show_contact_email',     label: 'Contact Email'              },
  { key: 'show_contact_phone',     label: 'Contact Phone'              },
  { key: 'show_noc_code',          label: 'NOC Code / TEER'            },
  { key: 'show_wage_stream',       label: 'Wage Stream'                },
  { key: 'show_wage',              label: 'Advertised Wage'            },
  { key: 'show_work_location',     label: 'Work Location'              },
  { key: 'show_positions_sought',  label: 'Positions Sought'           },
  { key: 'show_start_date',        label: 'Recruitment Start Date'     },
  { key: 'show_capture_frequency', label: 'Capture Frequency'          },
  { key: 'show_total_rounds',      label: 'Total Capture Rounds'       },
  { key: 'show_generated_at',      label: 'Report Generated Timestamp' },
]

const SUMMARY_FIELDS: { key: keyof SummaryFields; label: string }[] = [
  { key: 'show_url',           label: 'Job Posting URL column'       },
  { key: 'show_start_date',    label: 'Posting Start Date column'    },
  { key: 'show_capture_count', label: '# Successful Captures column' },
]

const EVIDENCE_FIELDS: { key: keyof EvidenceFields; label: string }[] = [
  { key: 'show_capture_datetime', label: 'Capture Date & Time' },
]

// ─────────────────────────────────────────────────────────────────────────────
// Sortable page-list item
// ─────────────────────────────────────────────────────────────────────────────
function PageItem({
  block, isSelected, onSelect, onToggleEnabled,
}: {
  block: ReportBlock
  isSelected: boolean
  onSelect: () => void
  onToggleEnabled: (v: boolean) => void
}) {
  const meta = BLOCK_META[block.type] ?? { label: block.type, color: '#64748b', Icon: Layers }
  const { Icon } = meta
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: block.id })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={[
        'pi-item',
        isSelected ? 'pi-item--active' : '',
        !block.enabled ? 'pi-item--off' : '',
        isDragging ? 'pi-item--drag' : '',
      ].filter(Boolean).join(' ')}
      onClick={onSelect}
    >
      <span className="pi-handle" {...attributes} {...listeners} onClick={e => e.stopPropagation()}>
        <GripVertical size={12} />
      </span>
      <span className="pi-icon-wrap" style={{ background: meta.color + '22', color: meta.color }}>
        <Icon size={13} strokeWidth={2} />
      </span>
      <span className="pi-label">{meta.label}</span>
      <button
        className="pi-vis-btn"
        title={block.enabled ? 'Hide section' : 'Show section'}
        onClick={e => { e.stopPropagation(); onToggleEnabled(!block.enabled) }}
      >
        {block.enabled ? <Eye size={12} /> : <EyeOff size={12} />}
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Properties panel
// ─────────────────────────────────────────────────────────────────────────────
function PropsPanel({
  block, onUpdate, onRefresh, previewing,
}: {
  block: ReportBlock | null
  onUpdate: (b: ReportBlock) => void
  onRefresh: () => void
  previewing: boolean
}) {
  if (!block) {
    return (
      <div className="pp-empty">
        <Layers size={24} strokeWidth={1.5} />
        <span>Select a section to edit its properties</span>
      </div>
    )
  }

  const meta = BLOCK_META[block.type] ?? { label: block.type, color: '#64748b', Icon: Layers }

  return (
    <div className="pp-root">
      <div className="pp-header" style={{ borderLeftColor: meta.color }}>
        <span className="pp-header-label" style={{ color: meta.color }}>{meta.label}</span>
        <span className="pp-header-sub">Section properties</span>
      </div>

      <div className="pp-body">

        {/* Visibility */}
        <div className="pp-group">
          <div className="pp-group-title">Visibility</div>
          <label className="pp-switch-row">
            <span>Include in report</span>
            <div className="pp-switch">
              <input type="checkbox" checked={block.enabled}
                onChange={e => onUpdate({ ...block, enabled: e.target.checked })} />
              <span className="pp-switch-track"><span className="pp-switch-thumb" /></span>
            </div>
          </label>
        </div>

        {/* Cover page */}
        {block.type === 'cover' && (<>
          <div className="pp-group">
            <div className="pp-group-title">Labels</div>
            <div className="pp-field">
              <label className="pp-label">Cover sub-label</label>
              <input className="pp-input" value={block.label}
                placeholder="e.g. Recruitment Evidence Package"
                onChange={e => onUpdate({ ...block, label: e.target.value })} />
              <span className="pp-hint">Appears below the employer name on the cover page</span>
            </div>
          </div>
          <div className="pp-group">
            <div className="pp-group-title">Visible Fields</div>
            <div className="pp-check-grid">
              {COVER_FIELDS.map(({ key, label }) => (
                <label key={key} className="pp-check-row">
                  <input type="checkbox" checked={block.fields[key]}
                    onChange={e => onUpdate({ ...block, fields: { ...block.fields, [key]: e.target.checked } })} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>
        </>)}

        {/* Summary table */}
        {block.type === 'summary_table' && (<>
          <div className="pp-group">
            <div className="pp-group-title">Section Title</div>
            <div className="pp-field">
              <label className="pp-label">Title text</label>
              <input className="pp-input" value={block.title} placeholder="Recruitment Summary"
                onChange={e => onUpdate({ ...block, title: e.target.value })} />
            </div>
          </div>
          <div className="pp-group">
            <div className="pp-group-title">Visible Columns</div>
            <div className="pp-check-grid">
              {SUMMARY_FIELDS.map(({ key, label }) => (
                <label key={key} className="pp-check-row">
                  <input type="checkbox" checked={block.fields[key]}
                    onChange={e => onUpdate({ ...block, fields: { ...block.fields, [key]: e.target.checked } })} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>
        </>)}

        {/* Evidence */}
        {block.type === 'evidence' && (<>
          <div className="pp-group">
            <div className="pp-group-title">Section Title</div>
            <div className="pp-field">
              <label className="pp-label">Title text</label>
              <input className="pp-input" value={block.title}
                placeholder="Per-Platform Advertising Evidence"
                onChange={e => onUpdate({ ...block, title: e.target.value })} />
            </div>
          </div>
          <div className="pp-group">
            <div className="pp-group-title">Visible Fields</div>
            <div className="pp-check-grid">
              {EVIDENCE_FIELDS.map(({ key, label }) => (
                <label key={key} className="pp-check-row">
                  <input type="checkbox" checked={block.fields[key]}
                    onChange={e => onUpdate({ ...block, fields: { ...block.fields, [key]: e.target.checked } })} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>
        </>)}

        {/* Appendix / Job Match Activity */}
        {(block.type === 'appendix' || block.type === 'job_match_activity') && (
          <div className="pp-group">
            <div className="pp-group-title">Section Title</div>
            <div className="pp-field">
              <label className="pp-label">Title text</label>
              <input className="pp-input" value={block.title}
                placeholder={block.type === 'appendix' ? 'Appendix' : 'Job Match Activity'}
                onChange={e => onUpdate({ ...block, title: e.target.value })} />
            </div>
          </div>
        )}

        {/* Custom Text */}
        {block.type === 'custom_text' && (
          <div className="pp-group">
            <div className="pp-group-title">Content</div>
            <div className="pp-field">
              <label className="pp-label">Heading</label>
              <input className="pp-input" value={block.heading} placeholder="Optional heading…"
                onChange={e => onUpdate({ ...block, heading: e.target.value })} />
            </div>
            <div className="pp-field" style={{ marginTop: '0.65rem' }}>
              <label className="pp-label">Body text</label>
              <textarea className="pp-textarea" rows={6} value={block.body}
                placeholder="Enter text content…"
                onChange={e => onUpdate({ ...block, body: e.target.value })} />
              <span className="pp-hint">Plain text. Line breaks are preserved.</span>
            </div>
          </div>
        )}

        {/* Divider */}
        {block.type === 'divider' && (
          <div className="pp-group">
            <p className="pp-hint" style={{ padding: '0.25rem 0' }}>
              A horizontal rule is inserted between sections. No editable properties.
            </p>
          </div>
        )}

      </div>

      <div className="pp-footer">
        <button className="rp-btn rp-btn--primary pp-apply-btn"
          onClick={onRefresh} disabled={previewing}>
          {previewing
            ? <><Loader2 size={13} className="rp-spin" /> Updating…</>
            : <><RefreshCw size={13} /> Apply &amp; Refresh</>}
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
export default function ReportPreview() {
  const { employerId, positionId } = useParams<{ employerId: string; positionId: string }>()
  const eId = Number(employerId)
  const pId = Number(positionId)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const [blocks, setBlocks]           = useState<ReportBlock[]>([])
  const [selectedId, setSelectedId]   = useState<string | null>(null)
  const [loading, setLoading]         = useState(true)
  const [previewing, setPreviewing]   = useState(false)
  const [generating, setGenerating]   = useState(false)
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [genError, setGenError]       = useState<string | null>(null)
  const [removeBlankPages, setRemoveBlankPages] = useState(true)

  const storageKey = `immlens_report_blocks_${pId}`

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const selectedBlock = blocks.find(b => b.id === selectedId) ?? null

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (over && active.id !== over.id) {
      setBlocks(prev => {
        const from = prev.findIndex(b => b.id === active.id)
        const to   = prev.findIndex(b => b.id === over.id)
        return arrayMove(prev, from, to)
      })
    }
  }

  // Auto-save blocks to localStorage whenever they change
  useEffect(() => {
    if (blocks.length > 0) {
      localStorage.setItem(storageKey, JSON.stringify(blocks))
    }
  }, [blocks])

  useEffect(() => {
    const saved = localStorage.getItem(storageKey)
    if (saved) {
      try {
        const blks: ReportBlock[] = JSON.parse(saved)
        setBlocks(blks)
        setSelectedId(blks[0]?.id ?? null)
        loadPreview(blks).finally(() => setLoading(false))
        return
      } catch {
        localStorage.removeItem(storageKey)
      }
    }
    reportConfigApi.getForClient()
      .then(data => {
        setBlocks(data.config.blocks)
        setSelectedId(data.config.blocks[0]?.id ?? null)
        return data.config.blocks
      })
      .then(blks => loadPreview(blks))
      .catch(() => setPreviewError('Failed to load report config.'))
      .finally(() => setLoading(false))
  }, [])

  async function resetToDefaults() {
    localStorage.removeItem(storageKey)
    setLoading(true)
    setPreviewError(null)
    try {
      const data = await reportConfigApi.getForClient()
      setBlocks(data.config.blocks)
      setSelectedId(data.config.blocks[0]?.id ?? null)
      await loadPreview(data.config.blocks)
    } catch {
      setPreviewError('Failed to reset config.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!previewHtml || !iframeRef.current) return
    const doc = iframeRef.current.contentDocument
    if (doc) { doc.open(); doc.write(previewHtml); doc.close() }
  }, [previewHtml])

  async function loadPreview(blks: ReportBlock[]) {
    setPreviewing(true)
    setPreviewError(null)
    try {
      const html = await reportsApi.previewHtml(eId, pId, { blocks: blks } as ReportConfigPayload)
      setPreviewHtml(html)
    } catch (e: unknown) {
      setPreviewError(e instanceof Error ? e.message : 'Preview failed.')
    } finally {
      setPreviewing(false)
    }
  }

  async function handleDownload() {
    setGenerating(true)
    setGenError(null)
    try {
      const blob = await reportsApi.generateWithConfig(
        eId, pId,
        { blocks } as ReportConfigPayload,
        { removeBlankPages },
      )
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl; a.download = 'LMIA_Report.pdf'; a.click()
      setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000)
    } catch (e: unknown) {
      setGenError(e instanceof Error ? e.message : 'Failed to generate report.')
    } finally {
      setGenerating(false)
    }
  }

  function updateBlock(id: string, updated: ReportBlock) {
    setBlocks(prev => prev.map(b => b.id === id ? updated : b))
  }

  if (loading) return <div className="rp-full-load">Loading preview…</div>

  return (
    <div className="rp-shell">

      {/* ── Top bar ── */}
      <div className="rp-topbar">
        <Link to={`/employers/${eId}/positions/${pId}`} className="rp-back">
          <ArrowLeft size={14} /> Back to Position
        </Link>
        <span className="rp-title">
          <FileText size={14} style={{ marginRight: 6 }} />
          Report Editor
        </span>
        <div className="rp-topbar-actions">
          <button className="rp-btn rp-btn--ghost" onClick={() => loadPreview(blocks)} disabled={previewing}>
            {previewing
              ? <><Loader2 size={13} className="rp-spin" /> Refreshing…</>
              : <><RefreshCw size={13} /> Refresh Preview</>}
          </button>
          <button className="rp-btn rp-btn--ghost" onClick={resetToDefaults} disabled={previewing || loading}
            title="Discard local edits and reload the default config">
            <RotateCcw size={13} /> Reset to defaults
          </button>
          <label className="rp-blank-check">
            <input type="checkbox" checked={removeBlankPages}
              onChange={e => setRemoveBlankPages(e.target.checked)} />
            <span>Remove blank pages</span>
          </label>
          <button className="rp-btn rp-btn--primary" onClick={handleDownload} disabled={generating}>
            {generating
              ? <><Loader2 size={13} className="rp-spin" /> Generating…</>
              : <><Download size={13} /> Generate &amp; Download PDF</>}
          </button>
        </div>
      </div>

      {genError && (
        <div className="rp-error-bar"><TriangleAlert size={13} /> {genError}</div>
      )}

      {/* ── Main ── */}
      <div className="rp-body">

        {/* Sidebar */}
        <aside className="rp-sidebar">

          {/* Section list */}
          <div className="rp-pagelist">
            <div className="rp-pane-title">
              <Layers size={11} /> Sections
              <span className="rp-pane-hint">Drag to reorder</span>
            </div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
                {blocks.map(block => (
                  <PageItem
                    key={block.id}
                    block={block}
                    isSelected={block.id === selectedId}
                    onSelect={() => setSelectedId(block.id)}
                    onToggleEnabled={v => updateBlock(block.id, { ...block, enabled: v })}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </div>

          {/* Properties */}
          <div className="rp-props">
            <div className="rp-pane-title"><PenLine size={11} /> Properties</div>
            <PropsPanel
              block={selectedBlock}
              onUpdate={updated => updateBlock(updated.id, updated)}
              onRefresh={() => loadPreview(blocks)}
              previewing={previewing}
            />
          </div>

        </aside>

        {/* Preview */}
        <div className="rp-preview">
          {previewing && (
            <div className="rp-preview-overlay">
              <Loader2 size={24} className="rp-spin" />
              <span>Rendering…</span>
            </div>
          )}
          {previewError && !previewing && (
            <div className="rp-preview-err">
              <TriangleAlert size={16} /> {previewError}
            </div>
          )}
          {!previewError && (
            <iframe ref={iframeRef} className="rp-iframe" title="Report Preview" />
          )}
        </div>

      </div>

      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        .rp-shell {
          display:flex; flex-direction:column; height:100vh; overflow:hidden;
          background:#0f0f13; color:#e8e8f0;
          font-family:system-ui,Avenir,Helvetica,Arial,sans-serif; font-size:13px;
        }
        .rp-full-load {
          display:flex; align-items:center; justify-content:center;
          height:100vh; color:#666; font-size:0.88rem; background:#0f0f13;
        }

        /* top bar */
        .rp-topbar {
          display:flex; align-items:center; gap:1rem; padding:0 1.25rem;
          height:52px; flex-shrink:0; background:#12121a; border-bottom:1px solid #1e1e2e;
        }
        .rp-back {
          display:flex; align-items:center; gap:0.35rem; font-size:0.8rem;
          color:#666; text-decoration:none; white-space:nowrap; transition:color 0.15s;
        }
        .rp-back:hover { color:#646cff; }
        .rp-title {
          display:flex; align-items:center; font-weight:700;
          font-size:0.88rem; color:#e8e8f0; flex:1; white-space:nowrap;
        }
        .rp-topbar-actions { display:flex; align-items:center; gap:0.6rem; margin-left:auto; }
        .rp-blank-check {
          display:flex; align-items:center; gap:0.35rem; font-size:0.77rem;
          color:#666; cursor:pointer; white-space:nowrap;
        }
        .rp-blank-check input { accent-color:#646cff; }
        .rp-error-bar {
          display:flex; align-items:center; gap:0.4rem; padding:0.45rem 1.25rem;
          background:#1a1218; color:#f87171; font-size:0.8rem;
          border-bottom:1px solid #3e1a1a; flex-shrink:0;
        }

        /* layout */
        .rp-body { display:flex; flex:1; overflow:hidden; }

        /* sidebar */
        .rp-sidebar {
          width:300px; flex-shrink:0; display:flex; flex-direction:column;
          border-right:1px solid #1e1e2e; overflow:hidden;
        }

        /* section list */
        .rp-pagelist {
          flex-shrink:0; max-height:46%; overflow-y:auto;
          background:#0d0d12; border-bottom:1px solid #1e1e2e;
        }
        .rp-pane-title {
          display:flex; align-items:center; gap:0.4rem; padding:0.5rem 0.9rem;
          font-size:0.68rem; font-weight:700; text-transform:uppercase;
          letter-spacing:0.07em; color:#555; background:#0a0a0f;
          border-bottom:1px solid #1a1a26; position:sticky; top:0; z-index:1;
        }
        .rp-pane-hint {
          margin-left:auto; font-size:0.67rem; font-weight:400;
          text-transform:none; letter-spacing:0; color:#3a3a48;
        }

        .pi-item {
          display:flex; align-items:center; gap:0.45rem; padding:0.45rem 0.7rem;
          cursor:pointer; user-select:none; border-bottom:1px solid #161620;
          transition:background 0.1s;
        }
        .pi-item:hover { background:#141420; }
        .pi-item--active { background:#1e1e30 !important; }
        .pi-item--off { opacity:0.38; }
        .pi-item--drag { opacity:0.25; }

        .pi-handle {
          color:#2a2a38; cursor:grab; flex-shrink:0;
          display:flex; align-items:center; touch-action:none; padding:0 1px;
        }
        .pi-handle:hover { color:#555; }
        .pi-handle:active { cursor:grabbing; }

        .pi-icon-wrap {
          display:flex; align-items:center; justify-content:center;
          width:21px; height:21px; border-radius:5px; flex-shrink:0;
        }
        .pi-label {
          flex:1; font-size:0.79rem; font-weight:500; color:#999;
          white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
        }
        .pi-item--active .pi-label { color:#e8e8f0; }
        .pi-vis-btn {
          background:none; border:none; color:#333; cursor:pointer;
          display:flex; align-items:center; padding:2px; border-radius:3px;
          transition:color 0.15s; flex-shrink:0;
        }
        .pi-vis-btn:hover { color:#888; }

        /* properties panel */
        .rp-props {
          flex:1; overflow:hidden; display:flex; flex-direction:column;
          background:#0d0d12;
        }
        .rp-props .rp-pane-title { flex-shrink:0; }

        .pp-root { display:flex; flex-direction:column; flex:1; overflow:hidden; }
        .pp-empty {
          flex:1; display:flex; flex-direction:column; align-items:center;
          justify-content:center; gap:0.6rem; color:#333; padding:2rem;
          text-align:center; font-size:0.79rem;
        }
        .pp-header {
          padding:0.7rem 1rem; border-left:3px solid #646cff;
          background:#0a0a0f; flex-shrink:0; border-bottom:1px solid #1e1e2e;
        }
        .pp-header-label { display:block; font-size:0.8rem; font-weight:700; }
        .pp-header-sub { font-size:0.7rem; color:#444; }
        .pp-body { flex:1; overflow-y:auto; }
        .pp-group { padding:0.7rem 1rem; border-bottom:1px solid #161620; }
        .pp-group-title {
          font-size:0.67rem; font-weight:700; text-transform:uppercase;
          letter-spacing:0.07em; color:#444; margin-bottom:0.6rem;
        }
        .pp-field { display:flex; flex-direction:column; gap:0.25rem; }
        .pp-label { font-size:0.74rem; color:#777; font-weight:500; }
        .pp-hint { font-size:0.69rem; color:#444; line-height:1.4; }
        .pp-input {
          background:#111119; border:1px solid #2e2e44; border-radius:6px;
          color:#e8e8f0; padding:0.42rem 0.6rem; font-size:0.8rem;
          font-family:inherit; outline:none; width:100%; transition:border-color 0.2s;
        }
        .pp-input:focus { border-color:#646cff; }
        .pp-textarea {
          background:#111119; border:1px solid #2e2e44; border-radius:6px;
          color:#e8e8f0; padding:0.42rem 0.6rem; font-size:0.8rem;
          font-family:inherit; outline:none; width:100%; resize:vertical;
          transition:border-color 0.2s; line-height:1.5;
        }
        .pp-textarea:focus { border-color:#646cff; }

        /* visibility switch */
        .pp-switch-row {
          display:flex; align-items:center; justify-content:space-between;
          font-size:0.8rem; color:#999; cursor:pointer;
        }
        .pp-switch { position:relative; width:34px; height:19px; flex-shrink:0; }
        .pp-switch input { opacity:0; width:0; height:0; }
        .pp-switch-track {
          position:absolute; inset:0; background:#2e2e44;
          border-radius:20px; cursor:pointer; transition:background 0.2s;
        }
        .pp-switch input:checked + .pp-switch-track { background:#646cff; }
        .pp-switch-thumb {
          position:absolute; top:2.5px; left:2.5px;
          width:14px; height:14px; background:#fff; border-radius:50%;
          transition:transform 0.2s;
        }
        .pp-switch input:checked + .pp-switch-track .pp-switch-thumb { transform:translateX(15px); }

        /* checkbox list */
        .pp-check-grid { display:flex; flex-direction:column; gap:0.45rem; }
        .pp-check-row {
          display:flex; align-items:center; gap:0.5rem;
          font-size:0.77rem; color:#888; cursor:pointer; line-height:1.3;
        }
        .pp-check-row input { accent-color:#646cff; width:13px; height:13px; flex-shrink:0; }
        .pp-check-row:hover { color:#ccc; }

        /* footer */
        .pp-footer {
          padding:0.65rem 1rem; border-top:1px solid #1e1e2e;
          flex-shrink:0; background:#0a0a0f;
        }
        .pp-apply-btn { width:100%; justify-content:center; }

        /* buttons */
        .rp-btn {
          display:inline-flex; align-items:center; gap:0.4rem;
          padding:0.42rem 1rem; border-radius:7px; font-size:0.8rem; font-weight:600;
          cursor:pointer; border:none; font-family:inherit;
          transition:background 0.15s, opacity 0.15s; white-space:nowrap;
        }
        .rp-btn:disabled { opacity:0.45; cursor:not-allowed; }
        .rp-btn--primary { background:#646cff; color:#fff; }
        .rp-btn--primary:hover:not(:disabled) { background:#535bf2; }
        .rp-btn--ghost { background:transparent; border:1px solid #2e2e44; color:#aaa; }
        .rp-btn--ghost:hover:not(:disabled) { border-color:#646cff; color:#646cff; }

        /* preview */
        .rp-preview {
          flex:1; position:relative; display:flex; flex-direction:column;
          overflow:hidden; background:#d8d8d8;
        }
        .rp-iframe { flex:1; border:none; width:100%; height:100%; background:#fff; }
        .rp-preview-overlay {
          position:absolute; inset:0; z-index:10;
          display:flex; flex-direction:column; align-items:center; justify-content:center;
          gap:0.75rem; background:rgba(15,15,19,0.72); color:#888; font-size:0.85rem;
        }
        .rp-preview-err {
          display:flex; align-items:center; gap:0.5rem; margin:auto;
          color:#f87171; font-size:0.85rem; padding:2rem;
        }

        /* spinner */
        .rp-spin { animation:rp-rot 0.8s linear infinite; }
        @keyframes rp-rot { to { transform:rotate(360deg); } }
      `}</style>
    </div>
  )
}
