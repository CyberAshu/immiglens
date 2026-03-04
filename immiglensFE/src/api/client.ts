// In development the Vite proxy forwards /api → backend, so BASE is ''
// In production set VITE_API_BASE=https://your-backend.com in the environment
export const BASE: string = import.meta.env.VITE_API_BASE ?? ''

export function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...((init.headers as Record<string, string>) ?? {}),
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const detail = body?.detail
    const message =
      typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
          ? detail.map((d: { msg: string }) => d.msg).join(', ')
          : `Request failed: ${res.status}`
    throw new Error(message)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}
