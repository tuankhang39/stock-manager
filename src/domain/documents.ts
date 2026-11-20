import {
  DOC_PREFIX,
  type AppData,
  type DocLine,
  type DocType,
  type MovementType,
  type Product,
  type StockDocument,
  type StockMovement,
} from '../types'
import { expandCombo, isCombo } from './combos'
import { localDateKey, uid } from './format'

export type DocLineInput = {
  productId?: string
  sku?: string
  name: string
  unit?: string
  /** Với phiếu đặt tồn: đây là tồn MỚI. */
  quantity: number
  unitPrice?: number
  /** Ngày giao (báo cáo BHLĐ) — chỉ dùng khi xuất / nhập Excel. */
  deliveryDate?: string
  categoryId?: string
}

export type DocInput = {
  type: DocType
  /** YYYY-MM-DD */
  date: string
  reason: string
  note?: string
  vatRate?: number
  image?: string
  lines: DocLineInput[]
}

export function namesMatch(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

export function skuMatch(a?: string, b?: string) {
  if (!a || !b) return false
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

export function findProduct(
  products: Product[],
  ref: { productId?: string; sku?: string; name?: string },
): Product | undefined {
  if (ref.productId) {
    const byId = products.find((p) => p.id === ref.productId)
    if (byId) return byId
  }
  if (ref.sku?.trim()) {
    const bySku = products.find((p) => skuMatch(p.sku, ref.sku))
    if (bySku) return bySku
  }
  if (ref.name?.trim()) {
    return products.find((p) => namesMatch(p.name, ref.name!))
  }
  return undefined
}

/** SKU kế tiếp dạng SP0001, SP0002... */
export function nextSku(products: Product[]): string {
  let max = 0
  for (const p of products) {
    const m = p.sku?.match(/^SP(\d+)$/i)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `SP${String(max + 1).padStart(4, '0')}`
}

function pad(n: number, size = 3) {
  return String(n).padStart(size, '0')
}

export function makeDocCode(type: DocType, date: string, data: AppData): string {
  const head = `${DOC_PREFIX[type]}-${date.replaceAll('-', '')}-`
  let max = 0
  const scan = (code: string) => {
    if (!code.startsWith(head)) return
    const n = Number(code.slice(head.length))
    if (Number.isFinite(n)) max = Math.max(max, n)
  }
  data.documents.forEach((d) => scan(d.code))
  data.movements.forEach((m) => scan(m.code))
  return `${head}${pad(max + 1)}`
}

function movementTypeOf(type: DocType): MovementType {
  if (type === 'in' || type === 'return') return 'in'
  if (type === 'set') return 'set'
  return 'out'
}

function movementTime(date: string, now: Date): string {
  if (date === localDateKey(now)) return now.toISOString()
  const at = new Date(`${date}T12:00:00`)
  return Number.isNaN(at.getTime()) ? now.toISOString() : at.toISOString()
}

/**
 * Áp 1 phiếu nhiều dòng: cập nhật tồn, ghi nhật ký (kèm delta), lưu phiếu.
 * Ném Error nếu dữ liệu sai (vd xuất SP không tồn tại).
 */
export function applyDocument(
  data: AppData,
  input: DocInput,
  now = new Date(),
): { data: AppData; doc: StockDocument } {
  const nowIso = now.toISOString()
  const at = movementTime(input.date, now)
  const code = makeDocCode(input.type, input.date, data)
  const docId = uid()
  const movType = movementTypeOf(input.type)

  let products = [...data.products]
  const newMovements: StockMovement[] = []
  const docLines: DocLine[] = []

  type Resolved = DocLineInput & { viaCombo?: string }
  const resolved: Resolved[] = []

  for (const line of input.lines) {
    const found = findProduct(products, line)
    if (found && isCombo(found)) {
      if (input.type !== 'out') {
        throw new Error(`"${found.name}" là combo, chỉ dùng được ở phiếu xuất`)
      }
      if (line.quantity <= 0) continue
      for (const comp of expandCombo(found, line.quantity, products)) {
        resolved.push({
          productId: comp.productId,
          name: '',
          quantity: comp.quantity,
          viaCombo: comp.viaCombo,
          deliveryDate: line.deliveryDate,
        })
      }
      continue
    }
    resolved.push(line)
  }

  for (const line of resolved) {
    const qty = Math.max(0, Math.floor(line.quantity))
    if (input.type !== 'set' && qty <= 0) continue

    let product = findProduct(products, line)
    if (!product) {
      if (input.type !== 'in') {
        throw new Error(`Không tìm thấy sản phẩm "${line.name}"`)
      }
      const name = line.name.trim()
      if (!name) throw new Error('Có dòng chưa có tên sản phẩm')
      product = {
        id: uid(),
        sku: line.sku?.trim() || undefined,
        name,
        quantity: 0,
        unit: line.unit?.trim() || undefined,
        unitPrice: line.unitPrice,
        categoryId: line.categoryId,
        deliveryDate: line.deliveryDate,
        createdAt: nowIso,
        updatedAt: nowIso,
      }
      products = [product, ...products]
    }

    const before = product.quantity
    let after = before
    if (input.type === 'in' || input.type === 'return') after = before + qty
    else if (input.type === 'set') after = qty
    else after = Math.max(0, before - qty)

    const movementId = uid()
    const productId = product.id
    const updated: Product = {
      ...product,
      quantity: after,
      unit: line.unit?.trim() || product.unit,
      unitPrice:
        input.type === 'in' && line.unitPrice != null ? line.unitPrice : product.unitPrice,
      deliveryDate:
        (input.type === 'out' || input.type === 'in') && line.deliveryDate
          ? line.deliveryDate
          : product.deliveryDate,
      updatedAt: nowIso,
    }
    products = products.map((p) => (p.id === productId ? updated : p))

    newMovements.push({
      id: movementId,
      code,
      productId,
      productName: updated.name,
      sku: updated.sku,
      type: movType,
      docType: input.type,
      docId,
      reason: input.reason,
      quantity: input.type === 'set' ? after : qty,
      before,
      after,
      delta: after - before,
      unitPrice: input.type === 'in' ? line.unitPrice : undefined,
      note: input.note,
      createdAt: at,
    })

    docLines.push({
      id: uid(),
      movementId,
      productId,
      sku: updated.sku,
      name: updated.name,
      unit: updated.unit,
      quantity: input.type === 'set' ? after : qty,
      unitPrice: input.type === 'in' ? line.unitPrice : undefined,
      before,
      after,
      viaCombo: line.viaCombo,
    })
  }

  if (docLines.length === 0) {
    throw new Error('Phiếu chưa có dòng hợp lệ (số lượng phải lớn hơn 0)')
  }

  const doc: StockDocument = {
    id: docId,
    code,
    type: input.type,
    date: input.date,
    createdAt: at,
    reason: input.reason,
    note: input.note,
    vatRate: input.vatRate,
    image: input.image,
    lines: docLines,
  }

  return {
    doc,
    data: {
      ...data,
      products,
      movements: [...newMovements.reverse(), ...data.movements],
      documents: [doc, ...data.documents],
    },
  }
}

export function movementDelta(m: StockMovement): number {
  return m.delta ?? m.after - m.before
}

export type RevertPreviewItem = {
  movementId: string
  productId: string
  productName: string
  sku?: string
  from: number
  to: number
  /** Tồn bị chặn ở 0 (không thể hoàn đủ). */
  clamped: boolean
  /** SP đã bị xóa — chỉ xóa bản ghi, không đổi tồn. */
  missing: boolean
}

/** Xem trước tác động khi xoá các dòng nhật ký (hoàn tồn bằng cách trừ delta). */
export function previewRevert(data: AppData, movementIds: string[]): RevertPreviewItem[] {
  const ids = new Set(movementIds)
  const qtyByProduct = new Map(data.products.map((p) => [p.id, p.quantity]))
  const items: RevertPreviewItem[] = []
  for (const m of data.movements) {
    if (!ids.has(m.id)) continue
    if (!qtyByProduct.has(m.productId)) {
      items.push({
        movementId: m.id,
        productId: m.productId,
        productName: m.productName,
        sku: m.sku,
        from: 0,
        to: 0,
        clamped: false,
        missing: true,
      })
      continue
    }
    const from = qtyByProduct.get(m.productId) ?? 0
    const raw = from - movementDelta(m)
    const to = Math.max(0, raw)
    qtyByProduct.set(m.productId, to)
    items.push({
      movementId: m.id,
      productId: m.productId,
      productName: m.productName,
      sku: m.sku,
      from,
      to,
      clamped: raw < 0,
      missing: false,
    })
  }
  return items
}

/** Xoá dòng nhật ký + hoàn tồn; dòng phiếu tương ứng cũng bị bỏ, phiếu rỗng thì xoá luôn. */
export function revertMovements(data: AppData, movementIds: string[]): AppData {
  const ids = new Set(movementIds)
  const nowIso = new Date().toISOString()
  // Dùng đúng cách tính của màn xem trước (hoàn từng dòng, mới -> cũ, chặn ở 0)
  // để tồn sau khi xóa khớp với số đã hiện cho người dùng.
  const finalQty = new Map<string, number>()
  for (const item of previewRevert(data, movementIds)) {
    if (!item.missing) finalQty.set(item.productId, item.to)
  }

  const products = data.products.map((p) => {
    const to = finalQty.get(p.id)
    if (to === undefined || to === p.quantity) return p
    return { ...p, quantity: to, updatedAt: nowIso }
  })

  const documents = data.documents
    .map((doc) => ({
      ...doc,
      lines: doc.lines.filter((l) => !ids.has(l.movementId)),
    }))
    .filter((doc) => doc.lines.length > 0)

  return {
    ...data,
    products,
    movements: data.movements.filter((m) => !ids.has(m.id)),
    documents,
  }
}

export function movementIdsOfDocument(data: AppData, docId: string): string[] {
  const ids = new Set<string>()
  data.movements.filter((m) => m.docId === docId).forEach((m) => ids.add(m.id))
  data.documents
    .find((d) => d.id === docId)
    ?.lines.forEach((l) => ids.add(l.movementId))
  return [...ids]
}

/** Xoá cả phiếu: hoàn tồn tất cả dòng. */
export function deleteDocument(data: AppData, docId: string): AppData {
  const next = revertMovements(data, movementIdsOfDocument(data, docId))
  return { ...next, documents: next.documents.filter((d) => d.id !== docId) }
}
