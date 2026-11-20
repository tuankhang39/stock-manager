import type { Product, StockMovement } from './types'

const PRODUCTS_KEY = 'riland-products-v2'
const MOVEMENTS_KEY = 'riland-movements-v2'
const LEGACY_PRODUCTS_KEY = 'riland-products-v1'
const THEME_KEY = 'riland-theme'

export const BACKUP_FORMAT = 'riland-backup' as const
export const BACKUP_VERSION = 1 as const

export type RilandBackup = {
  format: typeof BACKUP_FORMAT
  version: number
  exportedAt: string
  products: Product[]
  movements: StockMovement[]
  theme?: string
}

export function loadProducts(): Product[] {
  try {
    const raw = localStorage.getItem(PRODUCTS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Product[]
      return Array.isArray(parsed) ? parsed : []
    }

    const legacy = localStorage.getItem(LEGACY_PRODUCTS_KEY)
    if (legacy) {
      const parsed = JSON.parse(legacy) as Product[]
      if (Array.isArray(parsed)) {
        saveProducts(parsed)
        return parsed
      }
    }
    return []
  } catch {
    return []
  }
}

export function saveProducts(products: Product[]): void {
  localStorage.setItem(PRODUCTS_KEY, JSON.stringify(products))
}

export function loadMovements(): StockMovement[] {
  try {
    const raw = localStorage.getItem(MOVEMENTS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as StockMovement[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveMovements(movements: StockMovement[]): void {
  localStorage.setItem(MOVEMENTS_KEY, JSON.stringify(movements))
}

/** Ghi chú nơi lưu dữ liệu (web). */
export function getStorageLocationNote(): string {
  return (
    'Dữ liệu nằm trong localStorage của đúng trình duyệt + máy này ' +
    '(Chrome và Edge là 2 kho riêng). Xóa cache / đổi trình duyệt / đổi máy = mất dữ liệu nếu chưa backup.'
  )
}

export function buildBackup(
  products: Product[],
  movements: StockMovement[],
  theme?: string,
): RilandBackup {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    products,
    movements,
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
  const stamp = new Date().toISOString().slice(0, 10)
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

  // Backup chuẩn Riland
  if (obj.format === BACKUP_FORMAT) {
    if (!Array.isArray(obj.products) || !Array.isArray(obj.movements)) {
      throw new Error('Backup thiếu products / movements')
    }
    if (!obj.products.every(isProduct)) {
      throw new Error('Danh sách sản phẩm trong backup bị lỗi')
    }
    if (!obj.movements.every(isMovement)) {
      throw new Error('Lịch sử trong backup bị lỗi')
    }
    return {
      format: BACKUP_FORMAT,
      version: typeof obj.version === 'number' ? obj.version : BACKUP_VERSION,
      exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : new Date().toISOString(),
      products: obj.products,
      movements: obj.movements,
      theme: typeof obj.theme === 'string' ? obj.theme : undefined,
    }
  }

  // Nhận luôn file dạng { products, movements } (không có format)
  if (Array.isArray(obj.products) && Array.isArray(obj.movements)) {
    if (!obj.products.every(isProduct) || !obj.movements.every(isMovement)) {
      throw new Error('Nội dung products / movements không hợp lệ')
    }
    return {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      products: obj.products,
      movements: obj.movements,
      theme: typeof obj.theme === 'string' ? obj.theme : undefined,
    }
  }

  throw new Error('Không nhận ra file backup XiaoxinStock (.json)')
}

export async function readBackupFile(file: File): Promise<RilandBackup> {
  const text = await file.text()
  return parseBackupJson(text)
}
