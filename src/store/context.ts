import { createContext, useContext, type ReactNode } from 'react'
import type { SyncStatus } from '../sync/engine'
import type { AppData, DocType, Product } from '../types'

export type DocFormInit = {
  type: DocType
  lines?: Array<{ productId: string; quantity?: number }>
  reason?: string
}

export type ConfirmOptions = {
  title: string
  message: ReactNode
  confirmLabel?: string
  danger?: boolean
}

export type AppCtx = {
  data: AppData
  /** Dữ liệu mới nhất (kể cả thay đổi chưa render) — dùng sau các bước await. */
  getData: () => AppData
  update: (fn: (d: AppData) => AppData) => void
  replaceAll: (d: AppData) => void
  /** Ghi đè toàn bộ dữ liệu trên server (khôi phục backup, nạp mẫu). */
  restoreAll: (d: AppData) => void
  syncStatus: SyncStatus
  username: string
  logout: () => Promise<void>
  toast: (message: string) => void
  confirm: (opts: ConfirmOptions) => Promise<boolean>
  openProduct: (id: string) => void
  openProductForm: (product?: Product | null) => void
  openDocForm: (init: DocFormInit) => void
  openDocDetail: (id: string) => void
  /** Bán combo: xác nhận rồi trừ tồn các SP thành phần. */
  sellCombo: (productId: string, qty?: number) => Promise<void>
  /** Xóa SP (có xác nhận). Trả true nếu đã xóa. */
  deleteProduct: (productId: string) => Promise<boolean>
}

export const AppContext = createContext<AppCtx | null>(null)

export function useApp(): AppCtx {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp phải nằm trong AppProvider')
  return ctx
}
