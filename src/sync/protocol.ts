import type {
  AppData,
  AppSettings,
  Category,
  Platform,
  Product,
  StockDocument,
  StockMovement,
} from '../types'

/** Dữ liệu dùng chung giữa trình duyệt và server (API /api/*). */

export type DataResponse = {
  /** Tăng 1 sau mỗi lần ghi. 0 = DB chưa từng được ghi. */
  revision: number
  data: AppData
}

export type RevisionResponse = { revision: number }

export type EntityRows = {
  products: Product[]
  movements: StockMovement[]
  documents: StockDocument[]
}

export type EntityIds = {
  products: string[]
  movements: string[]
  documents: string[]
}

/**
 * Gửi phần thay đổi so với lần lưu trước.
 * Bản ghi mới nằm theo thứ tự cũ → mới để server giữ đúng thứ tự trên màn hình.
 */
export type SyncRequest = {
  baseRevision: number
  upsert: EntityRows
  remove: EntityIds
  /** Gửi cả danh sách khi có thay đổi (danh sách nhỏ). */
  categories?: Category[]
  platforms?: Platform[]
  settings?: AppSettings
}

/** Ghi đè toàn bộ (khôi phục backup, nạp dữ liệu cũ của trình duyệt). */
export type ReplaceRequest = {
  data: AppData
}

export type ConflictResponse = {
  error: 'conflict'
  revision: number
}

export const ENTITY_TABLES = ['products', 'movements', 'documents'] as const
export type EntityTable = (typeof ENTITY_TABLES)[number]
