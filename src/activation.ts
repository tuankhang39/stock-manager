import licenseKeys from './license-keys.json'

export type ActivationStatus = {
  activated: boolean
  activatedAt?: string | null
  hasKeys: boolean
}

const ACTIVATION_KEY = 'xiaoxin-activation-v1'

type StoredActivation = {
  activated: boolean
  keyHash: string
  activatedAt: string
}

const validHashes: string[] = Array.isArray(licenseKeys.hashes)
  ? licenseKeys.hashes.map(String)
  : []

function normalizeKey(key: string): string {
  return key.trim().toUpperCase().replace(/\s+/g, '')
}

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function readStored(): StoredActivation | null {
  try {
    const raw = localStorage.getItem(ACTIVATION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredActivation>
    if (
      parsed.activated &&
      typeof parsed.keyHash === 'string' &&
      validHashes.includes(parsed.keyHash)
    ) {
      return parsed as StoredActivation
    }
    return null
  } catch {
    return null
  }
}

/** Chạy thử khi `npm run dev`: hiện nút nạp dữ liệu mẫu. Bản build production thì ẩn. */
export function isDevTestUi(): boolean {
  return import.meta.env.DEV
}

export async function getActivationStatus(): Promise<ActivationStatus> {
  const stored = readStored()
  return {
    activated: Boolean(stored),
    activatedAt: stored?.activatedAt ?? null,
    hasKeys: validHashes.length > 0,
  }
}

export async function activateApp(
  rawKey: string,
): Promise<{ ok: boolean; error?: string; activatedAt?: string }> {
  const key = normalizeKey(rawKey)
  if (!key) return { ok: false, error: 'Nhập mã kích hoạt' }

  if (validHashes.length === 0) {
    return {
      ok: false,
      error: 'Bản build chưa có mã (chạy npm run keys:gen rồi build lại)',
    }
  }

  if (!crypto?.subtle) {
    return {
      ok: false,
      error: 'Trình duyệt cần chạy qua HTTPS (hoặc localhost) để kích hoạt',
    }
  }

  const keyHash = await sha256Hex(key)
  if (!validHashes.includes(keyHash)) {
    return { ok: false, error: 'Mã không đúng' }
  }

  const activatedAt = new Date().toISOString()
  try {
    const payload: StoredActivation = { activated: true, keyHash, activatedAt }
    localStorage.setItem(ACTIVATION_KEY, JSON.stringify(payload))
  } catch {
    return { ok: false, error: 'Không lưu được kích hoạt trên trình duyệt này' }
  }
  return { ok: true, activatedAt }
}
