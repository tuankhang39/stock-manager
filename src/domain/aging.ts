import type { Product, StockMovement } from '../types'
import { isCombo } from './combos'
import { daysBetween } from './format'
import { stockValue } from './valuation'

export type AgingRow = {
  product: Product
  /** Ngày nhập đầu tiên (ISO). */
  firstIn: string
  /** Lần nhập gần nhất (ISO). */
  lastIn: string
  lastInQty: number
  /** Số ngày kể từ lần nhập gần nhất. */
  days: number
  /** Có phiếu nhập thật hay chỉ lấy ngày tạo SP. */
  hasImport: boolean
  value: number
}

/**
 * Hàng tồn lâu: SP còn tồn > 0, tính số ngày từ lần nhập gần nhất.
 * SP chưa có phiếu nhập thì lấy ngày tạo (hoặc cập nhật) làm mốc.
 */
export function computeAging(
  products: Product[],
  movements: StockMovement[],
  now = new Date(),
): AgingRow[] {
  const insByProduct = new Map<string, StockMovement[]>()
  for (const m of movements) {
    // Chỉ tính phiếu nhập hàng; khách trả hàng cũng làm tồn tăng nhưng không phải lần nhập
    if (m.type !== 'in' || m.docType === 'return') continue
    const list = insByProduct.get(m.productId) ?? []
    list.push(m)
    insByProduct.set(m.productId, list)
  }

  const rows: AgingRow[] = []
  for (const product of products) {
    if (isCombo(product) || product.quantity <= 0) continue
    const ins = (insByProduct.get(product.id) ?? []).sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    )
    if (ins.length > 0) {
      const first = ins[0]
      const last = ins[ins.length - 1]
      rows.push({
        product,
        firstIn: first.createdAt,
        lastIn: last.createdAt,
        lastInQty: last.quantity,
        days: daysBetween(last.createdAt, now),
        hasImport: true,
        value: stockValue(product),
      })
    } else {
      const base = product.createdAt ?? product.updatedAt
      rows.push({
        product,
        firstIn: base,
        lastIn: base,
        lastInQty: 0,
        days: daysBetween(base, now),
        hasImport: false,
        value: stockValue(product),
      })
    }
  }
  return rows.sort((a, b) => b.days - a.days)
}
