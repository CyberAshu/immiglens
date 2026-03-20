import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { nocCodes } from '../api/noc_codes'
import type { NocUploadResult } from '../api/noc_codes'

export interface UploadProgress {
  done: number
  total: number
}

interface UploadContextValue {
  uploading: boolean
  progress: UploadProgress | null
  result: NocUploadResult | null
  uploadError: string
  startNocUpload: (file: File) => void
  clearResult: () => void
}

const UploadContext = createContext<UploadContextValue | null>(null)

export function useUpload() {
  const ctx = useContext(UploadContext)
  if (!ctx) throw new Error('useUpload must be used inside UploadProvider')
  return ctx
}

const BATCH_SIZE = 200

function parseCSV(text: string): Array<{ code: string; title: string }> {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []
  const header = lines[0].split(',')
  const codeIdx = header.findIndex(h => h.replace(/"/g, '').trim().toLowerCase().includes('code'))
  const titleIdx = header.findIndex(h => {
    const n = h.replace(/"/g, '').trim().toLowerCase()
    return n.includes('title') || n.includes('class')
  })
  if (codeIdx === -1 || titleIdx === -1) return []

  // Deduplicate by code — keeps first occurrence (class title row)
  const seen = new Set<string>()
  const rows: Array<{ code: string; title: string }> = []
  for (const line of lines.slice(1)) {
    const cols = line.split(',')
    const code = (cols[codeIdx] ?? '').replace(/"/g, '').trim().padStart(5, '0')
    const title = (cols[titleIdx] ?? '').replace(/"/g, '').trim()
    if (!code || !title || seen.has(code)) continue
    seen.add(code)
    rows.push({ code, title })
  }
  return rows
}

function rowsToCSV(rows: Array<{ code: string; title: string }>): File {
  const content = 'code,title\n' + rows.map(r => `${r.code},"${r.title.replace(/"/g, '""')}"`).join('\n')
  return new File([content], 'batch.csv', { type: 'text/csv' })
}

export function UploadProvider({ children }: { children: ReactNode }) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState<UploadProgress | null>(null)
  const [result, setResult] = useState<NocUploadResult | null>(null)
  const [uploadError, setUploadError] = useState('')
  const abortRef = useRef(false)

  // Warn browser tab close while uploading
  useEffect(() => {
    if (!uploading) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      return (e.returnValue = 'Upload in progress. Are you sure you want to leave?')
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [uploading])

  function startNocUpload(file: File) {
    abortRef.current = false
    setUploading(true)
    setResult(null)
    setUploadError('')
    setProgress(null)

    file.text().then(text => {
      const rows = parseCSV(text)
      if (rows.length === 0) {
        setUploadError('No valid rows found. Make sure the CSV has "code" and "title" columns.')
        setUploading(false)
        return
      }

      const totals: NocUploadResult = { inserted: 0, updated: 0, skipped: 0, errors: [] }
      const batches: Array<typeof rows> = []
      for (let i = 0; i < rows.length; i += BATCH_SIZE) batches.push(rows.slice(i, i + BATCH_SIZE))
      setProgress({ done: 0, total: rows.length })

      let chain = Promise.resolve()
      batches.forEach((batch, b) => {
        chain = chain.then(async () => {
          if (abortRef.current) return
          const batchFile = rowsToCSV(batch)
          const r = await nocCodes.adminUpload(batchFile)
          totals.inserted += r.inserted
          totals.updated += r.updated
          totals.skipped += r.skipped
          totals.errors.push(...r.errors)
          setProgress({ done: Math.min((b + 1) * BATCH_SIZE, rows.length), total: rows.length })
        })
      })

      chain.then(() => {
        if (!abortRef.current) {
          setResult(totals)
          setProgress(null)
        }
        setUploading(false)
      }).catch(err => {
        setUploadError(err instanceof Error ? err.message : 'Upload failed.')
        setProgress(null)
        setUploading(false)
      })
    }).catch(err => {
      setUploadError(err instanceof Error ? err.message : 'Could not read file.')
      setUploading(false)
    })
  }

  function clearResult() {
    setResult(null)
    setUploadError('')
  }

  return (
    <UploadContext.Provider value={{ uploading, progress, result, uploadError, startNocUpload, clearResult }}>
      {children}
    </UploadContext.Provider>
  )
}
