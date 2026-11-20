import type { AppData, DocLine, Product, StockDocument } from '../types'
import { isCombo } from './combos'

/** Giá trị tồn của 1 SP = tồn x giá nhập. */
export function stockValue(product: Product): number {
  if (isCombo(product)) return 0
  return product.quantity * (product.unitPrice ?? 0)
}

export function stockProducts(products: Product[]): Product[] {
  return products.filter((p) => !isCombo(p))
}

export function isLowStock(product: Product, threshold: number): boolean {
  return !isCombo(product) && product.quantity <= threshold
}

export function summarize(data: AppData) {
  const real = stockProducts(data.products)
  const threshold = data.settings.lowStockThreshold
  return {
    totalProducts: data.products.length,
    totalQty: real.reduce((s, p) => s + p.quantity, 0),
    lowCount: real.filter((p) => isLowStock(p, threshold)).length,
    totalValue: real.reduce((s, p) => s + stockValue(p), 0),
  }
}

export function lineAmount(line: Pick<DocLine, 'quantity' | 'unitPrice'>): number {
  return line.quantity * (line.unitPrice ?? 0)
}

/** Tổng phiếu: số lượng, tiền chưa VAT, VAT, tiền có VAT. */
export function docTotals(doc: Pick<StockDocument, 'lines' | 'vatRate'>) {
  const qty = doc.lines.reduce((s, l) => s + l.quantity, 0)
  const subtotal = doc.lines.reduce((s, l) => s + lineAmount(l), 0)
  const rate = doc.vatRate ?? 0
  const vat = Math.round((subtotal * rate) / 100)
  return { qty, subtotal, vat, total: subtotal + vat }
}
