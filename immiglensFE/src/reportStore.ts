let _buffer: ArrayBuffer | null = null
let _watermarked = false

export function setPendingPdf(buf: ArrayBuffer) {
  _buffer = buf
}

export function consumePendingPdf(): ArrayBuffer | null {
  const buf = _buffer
  _buffer = null
  return buf
}

export function setPendingWatermarked(value: boolean) {
  _watermarked = value
}

export function consumePendingWatermarked(): boolean {
  const value = _watermarked
  _watermarked = false
  return value
}
