import type { Product } from '../types'

export function isCombo(product: Product): boolean {
  return Boolean(product.comboItems && product.comboItems.length > 0)
}

/** Số combo có thể bán = min(tồn thành phần / số lượng cần). */
export function comboAvailable(combo: Product, products: Product[]): number {
  if (!isCombo(combo)) return combo.quantity
  const byId = new Map(products.map((p) => [p.id, p]))
  let min = Infinity
  for (const item of combo.comboItems ?? []) {
    const comp = byId.get(item.productId)
    if (!comp || item.qty <= 0) return 0
    min = Math.min(min, Math.floor(comp.quantity / item.qty))
  }
  return Number.isFinite(min) ? min : 0
}

export type ExpandedComboLine = {
  productId: string
  quantity: number
  viaCombo: string
}

export function expandCombo(
  combo: Product,
  comboQty: number,
  products: Product[],
): ExpandedComboLine[] {
  const byId = new Map(products.map((p) => [p.id, p]))
  const lines: ExpandedComboLine[] = []
  for (const item of combo.comboItems ?? []) {
    if (!byId.has(item.productId)) {
      throw new Error(`Combo "${combo.name}" có SP thành phần đã bị xóa`)
    }
    lines.push({
      productId: item.productId,
      quantity: item.qty * comboQty,
      viaCombo: combo.name,
    })
  }
  return lines
}
