import type { AppData } from '../types'
import type { DataResponse, RevisionResponse, SyncRequest } from './protocol'

export class ApiError extends Error {
  status: number
  body: unknown
  constructor(status: number, message: string, body?: unknown) {
    super(message)
    this.status = status
    this.body = body
  }
}

async function request<T>(method: 'GET' | 'POST', url: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'Không kết nối được server')
  }
  const text = await res.text()
  let json: unknown = undefined
  try {
    json = text ? JSON.parse(text) : undefined
  } catch {
    /* không phải JSON */
  }
  if (!res.ok) {
    const msg =
      (json as { error?: string } | undefined)?.error ?? `Server báo lỗi ${res.status}`
    throw new ApiError(res.status, msg, json)
  }
  return json as T
}

export const api = {
  me: () => request<{ username: string }>('GET', '/api/me'),
  login: (username: string, password: string) =>
    request<{ username: string }>('POST', '/api/login', { username, password }),
  logout: () => request<{ ok: true }>('POST', '/api/logout', {}),
  loadData: () => request<DataResponse>('GET', '/api/data'),
  revision: () => request<RevisionResponse>('GET', '/api/revision'),
  sync: (body: SyncRequest) => request<RevisionResponse>('POST', '/api/sync', body),
  replace: (data: AppData) => request<RevisionResponse>('POST', '/api/replace', { data }),
}
