import { useEffect, useRef, useState } from 'react'

interface NominatimResult {
  display_name: string
  address: {
    house_number?: string
    road?: string
    suburb?: string
    city?: string
    town?: string
    village?: string
    municipality?: string
    state?: string
    postcode?: string
    country?: string
  }
}

interface Props {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  required?: boolean
  className?: string
  style?: React.CSSProperties
  /** 'address' = full street address (default), 'city' = "City, Province" only */
  format?: 'address' | 'city'
}

export default function AddressAutocomplete({
  value,
  onChange,
  placeholder,
  required,
  className,
  style,
  format = 'address',
}: Props) {
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function formatResult(r: NominatimResult): string {
    if (format === 'city') {
      const { city, town, village, municipality, state } = r.address
      const place = city ?? town ?? village ?? municipality ?? ''
      return [place, state].filter(Boolean).join(', ')
    }
    // full address: strip trailing ", Canada"
    return r.display_name.replace(/, Canada$/, '')
  }

  function handleInput(val: string) {
    onChange(val)
    setActiveIndex(-1)

    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (abortRef.current) abortRef.current.abort()

    if (val.trim().length < 3) {
      setSuggestions([])
      setOpen(false)
      return
    }

    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController()
      abortRef.current = controller
      setLoading(true)
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(val)}&countrycodes=ca&format=json&addressdetails=1&limit=6`,
          {
            headers: { 'Accept-Language': 'en', 'User-Agent': 'ImmigLens/1.0' },
            signal: controller.signal,
          },
        )
        const data: NominatimResult[] = await res.json()
        // deduplicate by formatted label
        const seen = new Set<string>()
        const unique = data.filter(r => {
          const label = formatResult(r)
          if (!label || seen.has(label)) return false
          seen.add(label)
          return true
        })
        setSuggestions(unique)
        setOpen(unique.length > 0)
      } catch {
        // aborted or network error — silently ignore
      } finally {
        setLoading(false)
      }
    }, 380)
  }

  function handleSelect(r: NominatimResult) {
    onChange(formatResult(r))
    setSuggestions([])
    setOpen(false)
    setActiveIndex(-1)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(i => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault()
      handleSelect(suggestions[activeIndex])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        className={className}
        style={style}
        value={value}
        onChange={e => handleInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
      />
      {loading && (
        <span
          style={{
            position: 'absolute',
            right: 10,
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: '0.7rem',
            color: '#94a3b8',
            pointerEvents: 'none',
          }}
        >
          searching…
        </span>
      )}
      {open && suggestions.length > 0 && (
        <ul
          style={{
            position: 'absolute',
            zIndex: 1000,
            top: 'calc(100% + 2px)',
            left: 0,
            right: 0,
            background: '#1a1a2e',
            border: '1px solid #2e2e44',
            borderRadius: '0.4rem',
            boxShadow: '0 4px 20px rgba(0,0,0,0.45)',
            margin: 0,
            padding: 0,
            listStyle: 'none',
            maxHeight: 230,
            overflowY: 'auto',
          }}
        >
          {suggestions.map((s, i) => (
            <li
              key={i}
              onMouseDown={() => handleSelect(s)}
              style={{
                padding: '0.5rem 0.75rem',
                cursor: 'pointer',
                fontSize: '0.84rem',
                lineHeight: 1.45,
                color: '#e8e8f0',
                background: i === activeIndex ? '#2a2a40' : '#1a1a2e',
                borderBottom: i < suggestions.length - 1 ? '1px solid #2e2e44' : 'none',
              }}
              onMouseEnter={() => setActiveIndex(i)}
              onMouseLeave={() => setActiveIndex(-1)}
            >
              {formatResult(s)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
