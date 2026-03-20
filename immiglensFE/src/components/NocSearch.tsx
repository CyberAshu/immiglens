import { useEffect, useRef, useState } from 'react'
import { nocCodes } from '../api/noc_codes'
import type { NocCodeOut } from '../api/noc_codes'

interface Props {
  value: string          // current noc_code value
  onSelect: (code: string, title: string) => void
  placeholder?: string
  required?: boolean
  className?: string
}

export function NocSearch({ value, onSelect, placeholder = 'Search NOC code or title…', required, className }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<NocCodeOut[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [selectedLabel, setSelectedLabel] = useState(value ? value : '')
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // When the parent resets value (e.g. form clear), sync display
  useEffect(() => {
    if (!value) setSelectedLabel('')
  }, [value])

  function handleInput(q: string) {
    setQuery(q)
    setOpen(true)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!q.trim()) {
      setResults([])
      return
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const data = await nocCodes.search(q, 15)
        setResults(data)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 250)
  }

  function handleSelect(noc: NocCodeOut) {
    const label = `${noc.code} — ${noc.title}`
    setSelectedLabel(label)
    setQuery('')
    setResults([])
    setOpen(false)
    onSelect(noc.code, noc.title)
  }

  function handleBlur(e: React.FocusEvent) {
    if (!containerRef.current?.contains(e.relatedTarget as Node)) {
      setOpen(false)
      setQuery('')
    }
  }

  const displayValue = open ? query : (selectedLabel || query)

  return (
    <div ref={containerRef} style={{ position: 'relative' }} onBlur={handleBlur}>
      <input
        className={className ?? 'admin-input'}
        value={displayValue}
        onChange={e => handleInput(e.target.value)}
        onFocus={() => { if (selectedLabel && !query) { setQuery(''); setOpen(false) } }}
        placeholder={selectedLabel ? selectedLabel : placeholder}
        required={required && !value}
        autoComplete="off"
      />
      {open && (loading || results.length > 0) && (
        <ul style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 9999,
          background: '#fff', border: '1px solid #d1d5db', borderRadius: 6,
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)', margin: 0, padding: 0,
          listStyle: 'none', maxHeight: 260, overflowY: 'auto',
        }}>
          {loading && (
            <li style={{ padding: '0.6rem 1rem', color: '#9ca3af', fontSize: '0.82rem' }}>Searching…</li>
          )}
          {!loading && results.map(noc => (
            <li
              key={noc.id}
              onMouseDown={() => handleSelect(noc)}
              style={{
                padding: '0.55rem 1rem', cursor: 'pointer', fontSize: '0.85rem',
                borderBottom: '1px solid #f3f4f6', display: 'flex', gap: '0.75rem', alignItems: 'baseline',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}
            >
              <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#1a3352', minWidth: 52 }}>{noc.code}</span>
              <span style={{ color: '#374151' }}>{noc.title}</span>
              <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: '#9ca3af', whiteSpace: 'nowrap' }}>TEER {noc.teer}</span>
            </li>
          ))}
          {!loading && results.length === 0 && query.trim() && (
            <li style={{ padding: '0.6rem 1rem', color: '#9ca3af', fontSize: '0.82rem' }}>No results for "{query}"</li>
          )}
        </ul>
      )}
    </div>
  )
}
