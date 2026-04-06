import { useEffect, useRef, useState } from 'react'
import { useConfirm } from '../../components/ConfirmModal'
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  FileText,
  GripVertical,
  Layout,
  Loader2,
  Minus,
  Paperclip,
  PenLine,
  RefreshCw,
  Save,
  Search,
  Table2,
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
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { reportConfigApi } from '../../api/report_config'
import type {
  CoverFields,
  EvidenceFields,
  ReportBlock,
  SummaryFields,
} from '../../types/report_config'

// -- constants --

const BLOCK_META: Record<string, { label: string; Icon: React.ElementType; color: string; desc: string }> = {
  cover:              { label: 'Cover Page',                Icon: Layout,    color: '#0B1F3B', desc: 'Employer info, position details and report header' },
  summary_table:      { label: 'Recruitment Summary Table', Icon: Table2,    color: '#0369a1', desc: 'Table showing all platforms, dates and capture counts' },
  evidence:           { label: 'Per-Platform Evidence',     Icon: Search,    color: '#047857', desc: 'Individual capture logs per job posting platform' },
  job_match_activity: { label: 'Job Match Activity',        Icon: FileText,  color: '#0369a1', desc: 'Job match document listing — drag to reposition' },
  appendix:           { label: 'Appendix',                  Icon: Paperclip, color: '#C8A24A', desc: 'List of uploaded supporting documents' },
  custom_text:        { label: 'Custom Text',               Icon: PenLine,   color: '#7c3aed', desc: 'Your own heading and body text' },
  divider:            { label: 'Divider Line',              Icon: Minus,     color: '#6b7280', desc: 'Visual separator between sections' },
}

const COVER_FIELD_LABELS: Record<keyof CoverFields, string> = {
  show_address:           'Employer Address',
  show_contact_person:    'Contact Person',
  show_contact_email:     'Contact Email',
  show_contact_phone:     'Contact Phone',
  show_noc_code:          'NOC Code / TEER',
  show_wage_stream:       'Wage Stream',
  show_wage:              'Advertised Wage',
  show_work_location:     'Work Location',
  show_positions_sought:  'Positions Sought',
  show_start_date:        'Recruitment Start Date',
  show_capture_frequency: 'Capture Frequency',
  show_total_rounds:      'Total Capture Rounds',
  show_generated_at:      'Report Generated Timestamp',
}

const SUMMARY_FIELD_LABELS: Record<keyof SummaryFields, string> = {
  show_url:           'Job Posting URL column',
  show_start_date:    'Posting Start Date column',
  show_capture_count: '# Successful Captures column',
  show_ongoing:       'Ongoing (still active) column',
}

const EVIDENCE_FIELD_LABELS: Record<keyof EvidenceFields, string> = {
  show_capture_datetime: 'Capture Date & Time',
}

function uid() {
  return Math.random().toString(36).slice(2, 9)
}

// -- block card --

function BlockCard({
  block,
  onChange,
  onRemove,
}: {
  block: ReportBlock
  onChange: (updated: ReportBlock) => void
  onRemove: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: block.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const meta = BLOCK_META[block.type] ?? { label: block.type, Icon: FileText, color: '#6b7280', desc: '' }
  const canRemove   = block.type === 'custom_text' || block.type === 'divider'
  const hasSettings = block.type !== 'divider'

  function setField(key: string, value: boolean) {
    if ('fields' in block) {
      const updated = {
        ...block,
        fields: { ...(block as unknown as { fields: Record<string, boolean> }).fields, [key]: value },
      }
      onChange(updated as unknown as ReportBlock)
    }
  }

  function renderFields(labels: Record<string, string>, fields: Record<string, unknown>) {
    return (
      <div className="rd-checkbox-grid">
        {Object.entries(labels).map(([k, label]) => (
          <label key={k} className="rd-checkbox-label">
            <input type="checkbox" checked={!!fields[k]} onChange={e => setField(k, e.target.checked)} />
            <span>{label}</span>
          </label>
        ))}
      </div>
    )
  }

  function renderSettings() {
    if (block.type === 'cover') {
      return (
        <>
          <Field label="Cover Label Text">
            <input className="rd-input" value={block.label}
              onChange={e => onChange({ ...block, label: e.target.value })} />
          </Field>
          <div className="rd-section-label">Visible Fields</div>
          {renderFields(COVER_FIELD_LABELS, block.fields as unknown as Record<string, unknown>)}
        </>
      )
    }
    if (block.type === 'summary_table') {
      return (
        <>
          <Field label="Section Title">
            <input className="rd-input" value={block.title}
              onChange={e => onChange({ ...block, title: e.target.value })} />
          </Field>
          <div className="rd-section-label">Visible Columns</div>
          {renderFields(SUMMARY_FIELD_LABELS, block.fields as unknown as Record<string, unknown>)}
        </>
      )
    }
    if (block.type === 'evidence') {
      return (
        <>
          <Field label="Section Title">
            <input className="rd-input" value={block.title}
              onChange={e => onChange({ ...block, title: e.target.value })} />
          </Field>
          <div className="rd-section-label">Visible Fields</div>
          {renderFields(EVIDENCE_FIELD_LABELS, block.fields as unknown as Record<string, unknown>)}
        </>
      )
    }
    if (block.type === 'appendix' || block.type === 'job_match_activity') {
      return (
        <Field label="Section Title">
          <input className="rd-input" value={block.title}
            onChange={e => onChange({ ...block, title: e.target.value })} />
        </Field>
      )
    }
    if (block.type === 'custom_text') {
      return (
        <>
          <Field label="Heading">
            <input className="rd-input" value={block.heading} placeholder="Optional heading"
              onChange={e => onChange({ ...block, heading: e.target.value })} />
          </Field>
          <Field label="Body Text">
            <textarea className="rd-textarea" rows={4} value={block.body} placeholder="Enter your text here..."
              onChange={e => onChange({ ...block, body: e.target.value })} />
          </Field>
        </>
      )
    }
    return null
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rd-card${isDragging ? ' rd-card--dragging' : ''}${!block.enabled ? ' rd-card--disabled' : ''}`}
    >
      {/* header row */}
      <div className="rd-card-header" onClick={() => hasSettings && setExpanded(x => !x)}>

        {/* drag grip - stop propagation so header click doesn't also trigger */}
        <span
          className="rd-grip"
          {...attributes}
          {...listeners}
          onClick={e => e.stopPropagation()}
          title="Drag to reorder"
        >
          <GripVertical size={16} strokeWidth={2} />
        </span>

        {/* coloured block type icon */}
        <span className="rd-type-icon" style={{ background: meta.color + '22', color: meta.color }}>
          <meta.Icon size={15} strokeWidth={2} />
        </span>

        <div className="rd-card-info">
          <span className="rd-card-name">{meta.label}</span>
          <span className="rd-card-desc">{meta.desc}</span>
        </div>

        <div className="rd-card-right">
          {/* on/off toggle */}
          <label
            className="rd-toggle"
            title={block.enabled ? 'Visible in report' : 'Hidden from report'}
            onClick={e => e.stopPropagation()}
          >
            <input type="checkbox" checked={block.enabled}
              onChange={e => onChange({ ...block, enabled: e.target.checked })} />
            <span className="rd-toggle-track">
              <span className="rd-toggle-thumb" />
            </span>
            <span className="rd-toggle-text">{block.enabled ? 'On' : 'Off'}</span>
          </label>

          {canRemove && (
            <button
              className="rd-icon-btn rd-icon-btn--danger"
              onClick={e => { e.stopPropagation(); onRemove() }}
              title="Remove block"
            >
              <X size={13} strokeWidth={2.5} />
            </button>
          )}

          {hasSettings && (
            <span className="rd-chevron">
              {expanded
                ? <ChevronUp size={14} strokeWidth={2} />
                : <ChevronDown size={14} strokeWidth={2} />}
            </span>
          )}
        </div>
      </div>

      {/* settings panel */}
      {expanded && hasSettings && (
        <div className="rd-card-body">
          {renderSettings()}
        </div>
      )}
    </div>
  )
}

// -- helpers --

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rd-field">
      <label className="rd-field-label">{label}</label>
      {children}
    </div>
  )
}

function Toast({ message, type }: { message: string; type: 'success' | 'error' }) {
  return (
    <div className={`rd-toast rd-toast--${type}`}>
      {type === 'success'
        ? <Check size={14} strokeWidth={2.5} style={{ flexShrink: 0 }} />
        : <TriangleAlert size={14} strokeWidth={2.5} style={{ flexShrink: 0 }} />}
      {message}
    </div>
  )
}

// -- main page --

export default function AdminReportDesigner() {
  const [blocks,      setBlocks]      = useState<ReportBlock[]>([])
  const [original,    setOriginal]    = useState('')
  const [loading,     setLoading]     = useState(true)
  const [saving,      setSaving]      = useState(false)
  const [previewing,  setPreviewing]  = useState(false)
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [toast,       setToast]       = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const previewRef = useRef<HTMLIFrameElement>(null)
  const sensors    = useSensors(useSensor(PointerSensor))

  const serialized = JSON.stringify(blocks)
  const hasChanges = serialized !== original

  useEffect(() => {
    reportConfigApi.get()
      .then(data => {
        setBlocks(data.config.blocks)
        setOriginal(JSON.stringify(data.config.blocks))
      })
      .catch(() => showToast('Failed to load config.', 'error'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!previewHtml || !previewRef.current) return
    const doc = previewRef.current.contentDocument
    if (doc) { doc.open(); doc.write(previewHtml); doc.close() }
  }, [previewHtml])

  const { confirmModal, askConfirm } = useConfirm()

  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setBlocks(prev => {
        const from = prev.findIndex(b => b.id === active.id)
        const to   = prev.findIndex(b => b.id === over.id)
        return arrayMove(prev, from, to)
      })
    }
  }

  function updateBlock(id: string, updated: ReportBlock) {
    setBlocks(prev => prev.map(b => b.id === id ? updated : b))
  }

  function removeBlock(id: string) {
    setBlocks(prev => prev.filter(b => b.id !== id))
  }

  function addBlock(type: 'custom_text' | 'divider') {
    const id = uid()
    const nb: ReportBlock = type === 'divider'
      ? { id, type: 'divider', enabled: true }
      : { id, type: 'custom_text', enabled: true, heading: '', body: '' }
    setBlocks(prev => [...prev, nb])
  }

  async function handleSave() {
    setSaving(true)
    try {
      await reportConfigApi.update({ blocks })
      setOriginal(JSON.stringify(blocks))
      showToast('Layout saved. Reports will use this config.', 'success')
    } catch {
      showToast('Save failed. Please try again.', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleReset() {
    if (!await askConfirm({ title: 'Reset Layout', message: 'Reset to factory default layout? All customizations will be lost.', confirmLabel: 'Reset', variant: 'primary' })) return
    setLoading(true)
    try {
      const data = await reportConfigApi.reset()
      setBlocks(data.config.blocks)
      setOriginal(JSON.stringify(data.config.blocks))
      setPreviewHtml(null)
      showToast('Reset to default layout.', 'success')
    } catch {
      showToast('Reset failed.', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function handlePreview() {
    setPreviewing(true)
    try {
      const html = await reportConfigApi.preview({ blocks })
      setPreviewHtml(html)
    } catch {
      showToast('Preview failed. Make sure the backend is running.', 'error')
    } finally {
      setPreviewing(false)
    }
  }

  if (loading) return <div className="loading">Loading report designer...</div>

  const enabledCount = blocks.filter(b => b.enabled).length

  return (
    <div className="rd">
      {confirmModal}
      {toast && <Toast message={toast.msg} type={toast.type} />}

      {/* page header */}
      <div className="rd-header">
        <div>
          <h2 className="rd-h2">Report Designer</h2>
          <p className="rd-hint">
            Drag to reorder &middot; toggle on/off &middot; click a block to configure
            <span className={`rd-save-status${hasChanges ? ' rd-save-status--dirty' : ''}`}>
              {hasChanges
                ? <><span className="rd-dot" />Unsaved changes</>
                : <><Check size={11} strokeWidth={3} />All saved</>}
            </span>
          </p>
        </div>
        <div className="rd-header-actions">
          <button className="rd-btn rd-btn--ghost" onClick={handleReset} title="Reset to factory defaults">
            <RefreshCw size={14} strokeWidth={2} />Reset
          </button>
          <button className="rd-btn rd-btn--outline" onClick={handlePreview} disabled={previewing}>
            {previewing
              ? <><Loader2 size={14} strokeWidth={2} className="rd-spin" />Generating...</>
              : <><Eye size={14} strokeWidth={2} />Preview</>}
          </button>
          <button
            className={`rd-btn rd-btn--primary${hasChanges ? ' rd-btn--pulse' : ''}`}
            onClick={handleSave}
            disabled={saving || !hasChanges}
          >
            {saving
              ? <><Loader2 size={14} strokeWidth={2} className="rd-spin" />Saving...</>
              : <><Save size={14} strokeWidth={2} />Save Layout</>}
          </button>
        </div>
      </div>

      {/* two-column body */}
      <div className="rd-cols">

        {/* LEFT - block list */}
        <div className="rd-panel-left">
          <div className="rd-panel-label">
            <span>Blocks</span>
            <span className="rd-badge">{enabledCount} of {blocks.length} visible</span>
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
              {blocks.map(block => (
                <BlockCard
                  key={block.id}
                  block={block}
                  onChange={u => updateBlock(block.id, u)}
                  onRemove={() => removeBlock(block.id)}
                />
              ))}
            </SortableContext>
          </DndContext>

          {/* add block section */}
          <div className="rd-add-section">
            <div className="rd-add-label">Add custom block</div>
            <div className="rd-add-row">
              <button className="rd-add-card" onClick={() => addBlock('custom_text')}>
                <span className="rd-add-icon"><PenLine size={18} strokeWidth={1.75} /></span>
                <div>
                  <div className="rd-add-title">Custom Text</div>
                  <div className="rd-add-sub">Heading + body paragraph</div>
                </div>
              </button>
              <button className="rd-add-card" onClick={() => addBlock('divider')}>
                <span className="rd-add-icon"><Minus size={18} strokeWidth={1.75} /></span>
                <div>
                  <div className="rd-add-title">Divider</div>
                  <div className="rd-add-sub">Horizontal separator line</div>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT - sticky preview */}
        <div className="rd-panel-right">
          <div className="rd-panel-label">
            <span>Preview</span>
            {previewHtml && (
              <button className="rd-btn rd-btn--ghost rd-btn--xs" onClick={() => setPreviewHtml(null)}>Clear</button>
            )}
          </div>

          {previewHtml ? (
            <div className="rd-preview-wrap">
              <iframe
                ref={previewRef}
                className="rd-preview-frame"
                title="Report Preview"
                sandbox="allow-same-origin"
              />
              <p className="rd-preview-note">
                Sample preview with placeholder data . actual names and dates will differ.
              </p>
            </div>
          ) : (
            <div className="rd-preview-empty">
              <div className="rd-preview-empty-icon"><BookOpen size={40} strokeWidth={1.25} /></div>
              <p>Click <strong>Preview</strong> to see a sample render of your layout using placeholder data.</p>
              <button className="rd-btn rd-btn--outline" onClick={handlePreview} disabled={previewing}>
                {previewing
                  ? <><Loader2 size={14} strokeWidth={2} className="rd-spin" />Generating...</>
                  : <><Eye size={14} strokeWidth={2} />Generate Preview</>}
              </button>
            </div>
          )}
        </div>
      </div>

      <style>{`
        /* layout */
        .rd { display: flex; flex-direction: column; gap: 0; }

        .rd-header {
          display: flex; align-items: flex-start; justify-content: space-between;
          flex-wrap: wrap; gap: 12px; padding-bottom: 20px;
          border-bottom: 1px solid #e5e7eb; margin-bottom: 20px;
        }
        .rd-h2 { font-size: 1.35rem; font-weight: 700; color: #0B1F3B; margin: 0 0 4px; }
        .rd-hint { font-size: 0.78rem; color: #6b7280; margin: 0; display: flex; align-items: center; gap: 0; flex-wrap: wrap; }
        .rd-header-actions { display: flex; gap: 8px; flex-shrink: 0; flex-wrap: wrap; }

        .rd-save-status {
          display: inline-flex; align-items: center; gap: 5px;
          margin-left: 8px; color: #6b7280; font-size: 0.75rem;
        }
        .rd-save-status--dirty { color: #d97706; }
        .rd-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; flex-shrink: 0; }

        .rd-cols { display: flex; gap: 20px; align-items: flex-start; }
        .rd-panel-left  { flex: 0 0 460px; min-width: 0; }
        .rd-panel-right { flex: 1; min-width: 0; position: sticky; top: 1rem; }

        .rd-panel-label {
          display: flex; align-items: center; justify-content: space-between;
          font-size: 0.75rem; font-weight: 700; color: #9ca3af; text-transform: uppercase;
          letter-spacing: .06em; padding: 0 2px 10px; margin-bottom: 10px;
          border-bottom: 1px solid #e5e7eb;
        }

        /* block card */
        .rd-card {
          background: #fff; border: 1px solid #e5e7eb; border-radius: 8px;
          margin-bottom: 8px; overflow: hidden;
          transition: border-color .15s, opacity .15s;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }
        .rd-card:hover { border-color: #c7d2e0; }
        .rd-card--dragging { border-color: #C8A24A; box-shadow: 0 8px 24px rgba(200,162,74,.2); z-index: 999; }
        .rd-card--disabled { opacity: 0.5; }

        .rd-card-header {
          display: flex; align-items: center; gap: 10px; padding: 12px 14px;
          cursor: pointer; user-select: none;
        }
        .rd-card-header:hover { background: #f9fafb; }

        .rd-grip {
          display: flex; align-items: center;
          color: #9ca3af; cursor: grab; flex-shrink: 0; padding: 2px 0;
        }
        .rd-grip:active { cursor: grabbing; }

        .rd-type-icon {
          width: 30px; height: 30px; border-radius: 6px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
        }

        .rd-card-info { flex: 1; min-width: 0; }
        .rd-card-name { display: block; font-size: 0.88rem; font-weight: 600; color: #0B1F3B; }
        .rd-card-desc {
          display: block; font-size: 0.75rem; color: #6b7280; margin-top: 1px;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }

        .rd-card-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

        /* toggle */
        .rd-toggle { display: flex; align-items: center; gap: 6px; cursor: pointer; flex-shrink: 0; }
        .rd-toggle input { display: none; }
        .rd-toggle-track {
          position: relative; width: 36px; height: 20px; background: #d1d5db;
          border-radius: 999px; transition: background .2s; flex-shrink: 0;
        }
        .rd-toggle-thumb {
          position: absolute; top: 3px; left: 3px; width: 14px; height: 14px;
          background: #fff; border-radius: 50%; transition: transform .2s;
          box-shadow: 0 1px 3px rgba(0,0,0,0.2);
        }
        .rd-toggle input:checked ~ .rd-toggle-track { background: #C8A24A; }
        .rd-toggle input:checked ~ .rd-toggle-track .rd-toggle-thumb {
          transform: translateX(16px);
        }
        .rd-toggle-text { font-size: 0.73rem; font-weight: 600; color: #9ca3af; width: 22px; }

        .rd-icon-btn {
          display: flex; align-items: center; justify-content: center;
          background: none; border: none; padding: 4px; border-radius: 4px;
          cursor: pointer; color: #9ca3af; transition: all .15s;
        }
        .rd-icon-btn:hover { background: #f3f4f6; color: #374151; }
        .rd-icon-btn--danger:hover { background: #fee2e2; color: #dc2626; }

        .rd-chevron { display: flex; align-items: center; color: #9ca3af; }

        /* card body / settings */
        .rd-card-body {
          padding: 14px 16px 16px; border-top: 1px solid #f3f4f6;
          background: #f9fafb; display: flex; flex-direction: column; gap: 14px;
        }
        .rd-section-label {
          font-size: 0.72rem; font-weight: 700; color: #9ca3af;
          text-transform: uppercase; letter-spacing: .06em;
          padding-bottom: 6px; border-bottom: 1px solid #e5e7eb; margin-bottom: 2px;
        }
        .rd-field { display: flex; flex-direction: column; gap: 5px; }
        .rd-field-label { font-size: 0.78rem; font-weight: 600; color: #374151; }
        .rd-input {
          background: #fff; border: 1px solid #d1d5db; border-radius: 5px;
          color: #0B1F3B; padding: 7px 10px; font-size: 0.875rem; width: 100%;
          box-sizing: border-box; transition: border-color .15s;
        }
        .rd-input:focus { outline: none; border-color: #0B1F3B; box-shadow: 0 0 0 3px rgba(11,31,59,0.08); }
        .rd-textarea {
          background: #fff; border: 1px solid #d1d5db; border-radius: 5px;
          color: #0B1F3B; padding: 7px 10px; font-size: 0.875rem; width: 100%;
          box-sizing: border-box; resize: vertical; transition: border-color .15s;
        }
        .rd-textarea:focus { outline: none; border-color: #0B1F3B; box-shadow: 0 0 0 3px rgba(11,31,59,0.08); }
        .rd-checkbox-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 7px 16px; }
        .rd-checkbox-label {
          display: flex; align-items: center; gap: 7px;
          font-size: 0.82rem; color: #374151; cursor: pointer;
        }
        .rd-checkbox-label input { accent-color: #C8A24A; width: 14px; height: 14px; cursor: pointer; }

        /* add block */
        .rd-add-section { margin-top: 16px; padding-top: 14px; border-top: 1px solid #e5e7eb; }
        .rd-add-label {
          font-size: 0.72rem; font-weight: 700; color: #9ca3af;
          text-transform: uppercase; letter-spacing: .06em; margin-bottom: 10px;
        }
        .rd-add-row { display: flex; gap: 10px; }
        .rd-add-card {
          flex: 1; display: flex; align-items: center; gap: 10px; padding: 10px 12px;
          background: #fff; border: 1px dashed #d1d5db; border-radius: 7px;
          cursor: pointer; text-align: left; transition: all .15s; font-family: inherit;
        }
        .rd-add-card:hover { border-color: #C8A24A; background: #fffdf5; }
        .rd-add-icon { display: flex; flex-shrink: 0; color: #9ca3af; }
        .rd-add-title { font-size: 0.82rem; font-weight: 600; color: #0B1F3B; }
        .rd-add-sub { font-size: 0.73rem; color: #6b7280; margin-top: 1px; }

        /* buttons */
        .rd-btn {
          display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px;
          border-radius: 6px; font-size: 0.84rem; font-weight: 600; cursor: pointer;
          border: 1px solid transparent; transition: all .15s; white-space: nowrap;
          font-family: inherit;
        }
        .rd-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .rd-btn--ghost  { background: transparent; border-color: #d1d5db; color: #6b7280; }
        .rd-btn--ghost:hover:not(:disabled) { background: #f3f4f6; color: #374151; border-color: #9ca3af; }
        .rd-btn--outline { background: transparent; border-color: rgba(200,162,74,0.5); color: #b8922a; }
        .rd-btn--outline:hover:not(:disabled) { background: rgba(200,162,74,0.08); border-color: #C8A24A; color: #9a7a22; }
        .rd-btn--primary { background: #0B1F3B; border-color: #0B1F3B; color: #fff; }
        .rd-btn--primary:hover:not(:disabled) { background: #1a3352; }
        .rd-btn--pulse   { box-shadow: 0 0 0 3px rgba(200,162,74,0.25); }
        .rd-btn--xs      { padding: 3px 8px; font-size: 0.76rem; }

        .rd-spin { animation: rd-spin-anim .7s linear infinite; }
        @keyframes rd-spin-anim { to { transform: rotate(360deg); } }

        /* badge */
        .rd-badge {
          font-size: 0.72rem; font-weight: 600; padding: 2px 8px;
          background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 999px; color: #6b7280;
        }

        /* preview */
        .rd-preview-wrap { display: flex; flex-direction: column; gap: 8px; }
        .rd-preview-frame {
          width: 100%; height: 680px; border: 1px solid #e5e7eb; border-radius: 8px;
          background: #fff;
        }
        .rd-preview-note { font-size: 0.75rem; color: #6b7280; text-align: center; margin: 0; }

        .rd-preview-empty {
          min-height: 340px; display: flex; flex-direction: column; align-items: center;
          justify-content: center; gap: 14px;
          border: 1px dashed #d1d5db; border-radius: 8px; padding: 40px 30px;
          background: #f9fafb;
        }
        .rd-preview-empty-icon { opacity: .4; color: #9ca3af; }
        .rd-preview-empty p {
          font-size: 0.88rem; color: #6b7280; text-align: center;
          margin: 0; max-width: 280px;
        }
        .rd-preview-empty strong { color: #374151; }

        /* toast */
        .rd-toast {
          position: fixed; bottom: 24px; right: 24px; z-index: 9999;
          display: flex; align-items: center; gap: 8px;
          padding: 12px 18px; border-radius: 8px; font-size: 0.875rem; font-weight: 600;
          box-shadow: 0 8px 24px rgba(0,0,0,.12); animation: rd-slide-in .25s ease;
        }
        .rd-toast--success { background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; }
        .rd-toast--error   { background: #fff0f0; color: #dc2626; border: 1px solid #fca5a5; }
        @keyframes rd-slide-in {
          from { transform: translateY(12px); opacity: 0; }
          to   { opacity: 1; transform: none; }
        }

        /* responsive */
        @media (max-width: 900px) {
          .rd-cols { flex-direction: column; }
          .rd-panel-right { position: static; }
          .rd-panel-left  { flex: unset; width: 100%; }
        }
      `}</style>
    </div>
  )
}
