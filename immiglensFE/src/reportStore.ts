let _buffer: ArrayBuffer | null = null

export function setPendingPdf(buf: ArrayBuffer) {
  _buffer = buf
}

export function consumePendingPdf(): ArrayBuffer | null {
  const buf = _buffer
  _buffer = null
  return buf
}
