import {
  DEFAULT_LOW_STOCK,
  DEFAULT_PLATFORMS,
  type AppData,
  type Product,
  type StockDocument,
  type StockMovement,
} from './types'

const LEGACY_PRODUCTS_KEY = 'riland-products-v2'
const LEGACY_MOVEMENTS_KEY = 'riland-movements-v2'
const LEGACY_PRODUCTS_V1_KEY = 'riland-products-v1'
const FALLBACK_KEY = 'xiaoxin-appdata-v3'
const THEME_KEY = 'riland-theme'

export const BACKUP_FORMAT = 'riland-backup' as const
export const BACKUP_VERSION = 2 as const

export type RilandBackup = AppData & {
  format: typeof BACKUP_FORMAT
  version: number
  exportedAt: string
  theme?: string
}

/* ---------- Dữ liệu cũ trong trình duyệt (trước khi chuyển sang PostgreSQL) ---------- */

const DB_NAME = 'xiaoxin-stock'
const STORE = 'kv'
const DATA_KEY = 'appdata'
const MIGRATED_KEY = 'xiaoxin-migrated-to-server-v1'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB không khả dụng'))
      return
    }
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('Không mở được IndexedDB'))
  })
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(key)
    req.onsuccess = () => resolve(req.result as T | undefined)
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => db.close()
  })
}

/** Điền mặc định cho các trường mới (dữ liệu / backup cũ không có). */
export function normalizeData(raw: Partial<AppData>): AppData {
  const settings = {
    lowStockThreshold:
      typeof raw.settings?.lowStockThreshold === 'number' &&
      raw.settings.lowStockThreshold >= 0
        ? Math.floor(raw.settings.lowStockThreshold)
        : DEFAULT_LOW_STOCK,
  }
  const platforms =
    Array.isArray(raw.platforms) && raw.platforms.length > 0
      ? raw.platforms
      : DEFAULT_PLATFORMS.map((p) => ({ ...p }))
  return {
    products: Array.isArray(raw.products) ? raw.products : [],
    movements: Array.isArray(raw.movements) ? raw.movements : [],
    documents: Array.isArray(raw.documents) ? raw.documents : [],
    categories: Array.isArray(raw.categories) ? raw.categories : [],
    platforms,
    settings,
  }
}

function loadLegacyLocal(): AppData | null {
  try {
    const rawProducts =
      localStorage.getItem(LEGACY_PRODUCTS_KEY) ?? localStorage.getItem(LEGACY_PRODUCTS_V1_KEY)
    const rawMovements = localStorage.getItem(LEGACY_MOVEMENTS_KEY)
    if (!rawProducts && !rawMovements) return null
    const products = rawProducts ? (JSON.parse(rawProducts) as Product[]) : []
    const movements = rawMovements ? (JSON.parse(rawMovements) as StockMovement[]) : []
    return normalizeData({
      products: Array.isArray(products) ? products : [],
      movements: Array.isArray(movements) ? movements : [],
    })
  } catch {
    return null
  }
}

function hasContent(data: AppData | null | undefined): data is AppData {
  return Boolean(data && (data.products.length > 0 || data.movements.length > 0))
}

/** Thời điểm thay đổi gần nhất trong bộ dữ liệu (để chọn bản mới nhất). */
export function lastChangeAt(data: AppData): string {
  let latest = ''
  for (const p of data.products) if (p.updatedAt > latest) latest = p.updatedAt
  for (const m of data.movements) if (m.createdAt > latest) latest = m.createdAt
  for (const d of data.documents) if (d.createdAt > latest) latest = d.createdAt
  return latest
}

/**
 * Đọc dữ liệu bản cũ còn trong trình duyệt (IndexedDB, bản dự phòng localStorage,
 * hoặc khóa cũ riland-*). Có nhiều bản thì lấy bản có thay đổi mới nhất.
 */
export async function loadBrowserData(): Promise<AppData | null> {
  const candidates: AppData[] = []
  try {
    const stored = await idbGet<Partial<AppData>>(DATA_KEY)
    if (stored) candidates.push(normalizeData(stored))
  } catch {
    /* ignore */
  }
  try {
    const fallback = localStorage.getItem(FALLBACK_KEY)
    if (fallback) candidates.push(normalizeData(JSON.parse(fallback) as Partial<AppData>))
  } catch {
    /* ignore */
  }
  const legacy = loadLegacyLocal()
  if (legacy) candidates.push(legacy)

  const withData = candidates.filter(hasContent)
  if (withData.length === 0) return null
  return withData.reduce((best, c) => (lastChangeAt(c) > lastChangeAt(best) ? c : best))
}

export function isBrowserDataMigrated(): boolean {
  try {
    return localStorage.getItem(MIGRATED_KEY) !== null
  } catch {
    return false
  }
}

export function markBrowserDataMigrated() {
  try {
    localStorage.setItem(MIGRATED_KEY, new Date().toISOString())
  } catch {
    /* ignore */
  }
}

/* ---------- Backup ---------- */

export function buildBackup(data: AppData, theme?: string): RilandBackup {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    ...data,
    theme: theme ?? localStorage.getItem(THEME_KEY) ?? undefined,
  }
}

type SaveFilePickerOptions = {
  suggestedName?: string
  types?: Array<{
    description?: string
    accept: Record<string, string[]>
  }>
}

type WindowWithSavePicker = Window & {
  showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>
}

/** Cho user chọn chỗ lưu; fallback tải về Downloads nếu trình duyệt không hỗ trợ. */
export async function downloadBackupJson(backup: RilandBackup): Promise<'saved' | 'cancelled'> {
  const d = new Date()
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const suggestedName = `XIAOXINSTOCK-BACKUP-${stamp}.json`
  const contents = JSON.stringify(backup, null, 2)
  const blob = new Blob([contents], {
    type: 'application/json;charset=utf-8',
  })

  const win = window as WindowWithSavePicker
  if (typeof win.showSaveFilePicker === 'function') {
    try {
      const handle = await win.showSaveFilePicker({
        suggestedName,
        types: [
          {
            description: 'Backup XiaoxinStock JSON',
            accept: { 'application/json': ['.json'] },
          },
        ],
      })
      const writable = await handle.createWritable()
      await writable.write(blob)
      await writable.close()
      return 'saved'
    } catch (err) {
      // User bấm Cancel / Esc
      if (err instanceof DOMException && err.name === 'AbortError') {
        return 'cancelled'
      }
      throw err
    }
  }

  // Fallback (trình duyệt cũ / không Chromium)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = suggestedName
  a.click()
  URL.revokeObjectURL(url)
  return 'saved'
}

function isProduct(value: unknown): value is Product {
  if (!value || typeof value !== 'object') return false
  const p = value as Partial<Product>
  return (
    typeof p.id === 'string' &&
    typeof p.name === 'string' &&
    typeof p.quantity === 'number' &&
    Number.isFinite(p.quantity) &&
    typeof p.updatedAt === 'string'
  )
}

function isMovement(value: unknown): value is StockMovement {
  if (!value || typeof value !== 'object') return false
  const m = value as Partial<StockMovement>
  return (
    typeof m.id === 'string' &&
    typeof m.code === 'string' &&
    typeof m.productId === 'string' &&
    typeof m.productName === 'string' &&
    (m.type === 'in' || m.type === 'out' || m.type === 'set') &&
    typeof m.reason === 'string' &&
    typeof m.quantity === 'number' &&
    typeof m.before === 'number' &&
    typeof m.after === 'number' &&
    typeof m.createdAt === 'string'
  )
}

function isDocument(value: unknown): value is StockDocument {
  if (!value || typeof value !== 'object') return false
  const d = value as Partial<StockDocument>
  return (
    typeof d.id === 'string' &&
    typeof d.code === 'string' &&
    (d.type === 'in' || d.type === 'out' || d.type === 'return' || d.type === 'set') &&
    typeof d.date === 'string' &&
    Array.isArray(d.lines)
  )
}

export function parseBackupJson(raw: string): RilandBackup {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    throw new Error('File không phải JSON hợp lệ')
  }

  if (!data || typeof data !== 'object') {
    throw new Error('File backup không đúng định dạng')
  }

  const obj = data as Record<string, unknown>
  const isRiland = obj.format === BACKUP_FORMAT
  const looksLikeData = Array.isArray(obj.products) && Array.isArray(obj.movements)

  if (!isRiland && !looksLikeData) {
    throw new Error('Không nhận ra file backup XiaoxinStock (.json)')
  }
  if (!Array.isArray(obj.products) || !Array.isArray(obj.movements)) {
    throw new Error('Backup thiếu products / movements')
  }
  if (!obj.products.every(isProduct)) {
    throw new Error('Danh sách sản phẩm trong backup bị lỗi')
  }
  if (!obj.movements.every(isMovement)) {
    throw new Error('Lịch sử trong backup bị lỗi')
  }
  if (obj.documents !== undefined) {
    if (!Array.isArray(obj.documents) || !obj.documents.every(isDocument)) {
      throw new Error('Danh sách phiếu trong backup bị lỗi')
    }
  }

  const normalized = normalizeData({
    products: obj.products as Product[],
    movements: obj.movements as StockMovement[],
    documents: (obj.documents as StockDocument[] | undefined) ?? [],
    categories: Array.isArray(obj.categories) ? (obj.categories as AppData['categories']) : [],
    platforms: Array.isArray(obj.platforms) ? (obj.platforms as AppData['platforms']) : [],
    settings: (obj.settings as AppData['settings'] | undefined) ?? undefined,
  })

  return {
    ...normalized,
    format: BACKUP_FORMAT,
    version: typeof obj.version === 'number' ? obj.version : 1,
    exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : new Date().toISOString(),
    theme: typeof obj.theme === 'string' ? obj.theme : undefined,
  }
}

export async function readBackupFile(file: File): Promise<RilandBackup> {
  const text = await file.text()
  return parseBackupJson(text)
}
