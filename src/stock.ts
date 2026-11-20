import type { MovementType, Product, StockMovement } from './types'

function pad(n: number, size = 3) {
  return String(n).padStart(size, '0')
}

export function makeMovementCode(type: MovementType, existing: StockMovement[], at = new Date()) {
  const prefix = type === 'in' ? 'NK' : type === 'out' ? 'XK' : 'DC'
  const day = at.toISOString().slice(0, 10).replaceAll('-', '')
  const head = `${prefix}-${day}-`
  const sameDay = existing.filter((m) => m.code.startsWith(head)).length
  return `${head}${pad(sameDay + 1)}`
}

export function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function namesMatch(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

export function applyStockChange(params: {
  products: Product[]
  movements: StockMovement[]
  productId?: string
  name: string
  type: MovementType
  quantity: number
  reason: string
  note?: string
  unit?: string
  unitPrice?: number
  image?: string
  deliveryDate?: string
  deliverySlipImage?: string
  signedSlipImage?: string
}): { products: Product[]; movements: StockMovement[]; movement: StockMovement } {
  const {
    products,
    movements,
    productId,
    name,
    type,
    quantity,
    reason,
    note,
    unit,
    unitPrice,
    image,
    deliveryDate,
    deliverySlipImage,
    signedSlipImage,
  } = params

  const now = new Date()
  const nowIso = now.toISOString()
  const qty = Math.max(0, Math.floor(quantity))

  let nextProducts = [...products]
  let product = productId
    ? nextProducts.find((p) => p.id === productId)
    : nextProducts.find((p) => namesMatch(p.name, name))

  if (!product) {
    product = {
      id: uid(),
      name: name.trim(),
      quantity: 0,
      unit,
      unitPrice,
      image,
      deliveryDate,
      deliverySlipImage,
      signedSlipImage,
      updatedAt: nowIso,
    }
    nextProducts = [product, ...nextProducts]
  }

  const before = product.quantity
  let after = before

  if (type === 'in') after = before + qty
  else if (type === 'out') after = Math.max(0, before - qty)
  else after = qty

  nextProducts = nextProducts.map((p) =>
    p.id === product!.id
      ? {
          ...p,
          name: name.trim() || p.name,
          quantity: after,
          unit: unit ?? p.unit,
          unitPrice: unitPrice ?? p.unitPrice,
          image: image ?? p.image,
          deliveryDate: deliveryDate ?? p.deliveryDate,
          deliverySlipImage: deliverySlipImage ?? p.deliverySlipImage,
          signedSlipImage: signedSlipImage ?? p.signedSlipImage,
          updatedAt: nowIso,
        }
      : p,
  )

  const movement: StockMovement = {
    id: uid(),
    code: makeMovementCode(type, movements, now),
    productId: product.id,
    productName: name.trim() || product.name,
    type,
    reason,
    quantity: type === 'set' ? after : qty,
    before,
    after,
    note,
    createdAt: nowIso,
  }

  return {
    products: nextProducts,
    movements: [movement, ...movements],
    movement,
  }
}
