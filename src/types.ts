export type PriceTier = {
  /** Số lượng của mốc (vd 1, 6, 12, 24 đôi). */
  qty: number
  price: number
}

export type ComboItem = {
  productId: string
  qty: number
}

export type Product = {
  id: string
  /** Mã SKU (duy nhất, không phân biệt hoa thường). */
  sku?: string
  name: string
  quantity: number
  unit?: string
  /** Giá nhập (tên trường giữ nguyên để backup cũ vẫn khớp). */
  unitPrice?: number
  categoryId?: string
  /** Giá bán theo sàn: platformId -> các mốc số lượng. */
  salePrices?: Record<string, PriceTier[]>
  /** Có giá trị (>0 phần tử) = SP combo, không có tồn riêng. */
  comboItems?: ComboItem[]
  /** Ảnh sản phẩm (cột hình SP trên báo cáo). */
  image?: string
  /** Ngày giao / ngày trên báo cáo BHLD — YYYY-MM-DD. */
  deliveryDate?: string
  /** Ảnh phiếu giao hàng (cột H). */
  deliverySlipImage?: string
  /** Ảnh phiếu giao đã ký (cột I). */
  signedSlipImage?: string
  note?: string
  createdAt?: string
  updatedAt: string
}

export type Category = {
  id: string
  name: string
}

export type Platform = {
  id: string
  name: string
}

export type MovementType = 'in' | 'out' | 'set'

/** Loại phiếu: nhập, xuất, khách trả hàng (tồn tăng), đặt tồn. */
export type DocType = 'in' | 'out' | 'return' | 'set'

export type StockMovement = {
  id: string
  code: string
  productId: string
  productName: string
  sku?: string
  type: MovementType
  /** Loại phiếu gốc (phân biệt xuất bán với khách trả hàng). */
  docType?: DocType
  docId?: string
  reason: string
  quantity: number
  before: number
  after: number
  /** after - before (dùng để hoàn tồn khi xoá). */
  delta?: number
  unitPrice?: number
  note?: string
  createdAt: string
}

export type DocLine = {
  id: string
  movementId: string
  productId: string
  sku?: string
  name: string
  unit?: string
  quantity: number
  unitPrice?: number
  before: number
  after: number
  /** Tên combo nếu dòng này sinh ra từ việc bán combo. */
  viaCombo?: string
}

export type StockDocument = {
  id: string
  code: string
  type: DocType
  /** Ngày chứng từ — YYYY-MM-DD. */
  date: string
  createdAt: string
  reason: string
  note?: string
  /** % VAT của phiếu (phiếu nhập / trả). */
  vatRate?: number
  /** Ảnh phiếu (vd phiếu nhập hàng ngày 20/11). */
  image?: string
  lines: DocLine[]
}

export type AppSettings = {
  /** Tồn <= ngưỡng này thì cảnh báo sắp hết. */
  lowStockThreshold: number
}

export type AppData = {
  products: Product[]
  movements: StockMovement[]
  documents: StockDocument[]
  categories: Category[]
  platforms: Platform[]
  settings: AppSettings
}

export type ExcelImportRow = {
  sku?: string
  name: string
  quantity: number
  unit?: string
  unitPrice?: number
  date?: string
}

export const DEFAULT_LOW_STOCK = 10

export const DEFAULT_PLATFORMS: Platform[] = [
  { id: 'tiktok', name: 'TikTok' },
  { id: 'shopee', name: 'Shopee' },
]

export const DEFAULT_TIER_QTYS = [1, 6, 12, 24]

export const OUT_REASON_PRESETS = [
  'Bán hàng / xuất TMĐT',
  'Lấy mẫu quay',
  'Vận hành nội bộ',
  'Hàng lỗi / hủy',
  'Khác',
] as const

export const SET_REASON_PRESETS = [
  'Kiểm kê điều chỉnh',
  'Sửa nhầm số lượng',
  'Khác',
] as const

export const DOC_LABEL: Record<DocType, string> = {
  in: 'Nhập kho',
  out: 'Xuất kho',
  return: 'Khách trả hàng',
  set: 'Đặt tồn',
}

export const DOC_PREFIX: Record<DocType, string> = {
  in: 'NK',
  out: 'XK',
  return: 'TH',
  set: 'DC',
}

export function emptyData(): AppData {
  return {
    products: [],
    movements: [],
    documents: [],
    categories: [],
    platforms: DEFAULT_PLATFORMS.map((p) => ({ ...p })),
    settings: { lowStockThreshold: DEFAULT_LOW_STOCK },
  }
}
