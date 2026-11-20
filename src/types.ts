export type Product = {
  id: string
  name: string
  quantity: number
  unit?: string
  unitPrice?: number
  /** Ảnh sản phẩm (cột hình SP trên báo cáo). */
  image?: string
  /** Ngày giao / ngày trên báo cáo BHLD — YYYY-MM-DD. */
  deliveryDate?: string
  /** Ảnh phiếu giao hàng (cột H). */
  deliverySlipImage?: string
  /** Ảnh phiếu giao đã ký (cột I). */
  signedSlipImage?: string
  note?: string
  updatedAt: string
}

export type MovementType = 'in' | 'out' | 'set'

export type StockMovement = {
  id: string
  code: string
  productId: string
  productName: string
  type: MovementType
  reason: string
  quantity: number
  before: number
  after: number
  note?: string
  createdAt: string
}

export type ExcelImportRow = {
  name: string
  quantity: number
  unit?: string
  unitPrice?: number
  date?: string
}

export const REASON_PRESETS = [
  'Nhập hàng',
  'Bán hàng / xuất TMĐT',
  'Lấy mẫu quay',
  'Vận hành nội bộ',
  'Kiểm kê điều chỉnh',
  'Hàng lỗi / hủy',
  'Khác',
] as const
