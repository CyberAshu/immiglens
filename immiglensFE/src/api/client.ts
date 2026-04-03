// In development the Vite proxy forwards /api → backend, so BASE is ''
// In production set VITE_API_BASE=https://your-backend.com in the environment
export const BASE: string = import.meta.env.VITE_API_BASE ?? ''

export function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/** Standard JSON response — use for most endpoints. */
export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...((init.headers as Record<string, string>) ?? {}),
    },
  })
  if (!res.ok) {
    if (res.status === 401 && localStorage.getItem('token')) {
      localStorage.removeItem('token')
      window.location.href = '/login'
      return undefined as T
    }
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

/** Like request<T> but also returns the X-Total-Count response header. */
export async function requestWithCount<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ data: T; total: number }> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...((init.headers as Record<string, string>) ?? {}),
    },
  })
  if (!res.ok) {
    if (res.status === 401 && localStorage.getItem('token')) {
      localStorage.removeItem('token')
      window.location.href = '/login'
      return { data: undefined as T, total: 0 }
    }
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
  const total = parseInt(res.headers.get('X-Total-Count') ?? '0', 10)
  const data: T = res.status === 204 ? (undefined as T) : await res.json()
  return { data, total }
}
