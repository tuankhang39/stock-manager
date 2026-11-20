import type { Product, StockMovement } from './types'

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function isoHoursAgo(hours: number) {
  return new Date(Date.now() - hours * 3600 * 1000).toISOString()
}

/** Dữ liệu mẫu BHLD để dùng thử trên mọi trình duyệt. */
export function createSampleData(): { products: Product[]; movements: StockMovement[] } {
  const now = new Date().toISOString()
  const samples: Array<{
    name: string
    unit: string
    unitPrice: number
    initial: number
    adjustments: Array<{
      type: 'in' | 'out'
      qty: number
      reason: string
      note: string
      hoursAgo: number
    }>
  }> = [
    {
      name: 'GĂNG TAY DA HÀN DÀI MÀU VÀNG (40CM)',
      unit: 'ĐÔI',
      unitPrice: 55000,
      initial: 120,
      adjustments: [
        {
          type: 'in',
          qty: 30,
          reason: 'Nhập hàng',
          note: 'Excel ngày 29/10/2026',
          hoursAgo: 20,
        },
      ],
    },
    {
      name: 'GĂNG TAY CAO SU XÁM CHỐNG MÀI MÒN',
      unit: 'ĐÔI',
      unitPrice: 6000,
      initial: 120,
      adjustments: [
        {
          type: 'out',
          qty: 20,
          reason: 'Bán hàng / xuất TMĐT',
          note: 'Xuất TMĐT',
          hoursAgo: 30,
        },
        {
          type: 'out',
          qty: 3,
          reason: 'Lấy mẫu quay',
          note: 'Lấy mẫu quay video',
          hoursAgo: 5,
        },
      ],
    },
    {
      name: 'Kính chống sương',
      unit: 'CÁI',
      unitPrice: 8700,
      initial: 36,
      adjustments: [
        { type: 'in', qty: 24, reason: 'Nhập hàng', note: 'Bổ sung tồn', hoursAgo: 18 },
        {
          type: 'in',
          qty: 60,
          reason: 'Nhập hàng',
          note: 'Excel ngày 31/10/2026',
          hoursAgo: 4,
        },
      ],
    },
    {
      name: 'GĂNG TAY BỌT CAO SU XANH ĐEN',
      unit: 'ĐÔI',
      unitPrice: 6000,
      initial: 120,
      adjustments: [
        {
          type: 'in',
          qty: 120,
          reason: 'Nhập hàng',
          note: 'Excel ngày 31/10/2026',
          hoursAgo: 3,
        },
      ],
    },
    {
      name: '24 Găng Tay Vãi Canvas Nguyên Chất',
      unit: 'ĐÔI',
      unitPrice: 7500,
      initial: 100,
      adjustments: [],
    },
    {
      name: 'Kính chống sương có đệm mút',
      unit: 'CÁI',
      unitPrice: 14000,
      initial: 120,
      adjustments: [],
    },
  ]

  const products: Product[] = []
  const movements: StockMovement[] = []
  let nk = 1
  let xk = 1

  for (const sample of samples) {
    const id = uid()
    let qty = sample.initial

    movements.push({
      id: uid(),
      code: `NK-20261029-${String(nk).padStart(3, '0')}`,
      productId: id,
      productName: sample.name,
      type: 'in',
      reason: 'Nhập hàng',
      quantity: sample.initial,
      before: 0,
      after: sample.initial,
      note: 'Dữ liệu mẫu BHLD',
      createdAt: isoHoursAgo(48),
    })
    nk += 1

    for (const adj of sample.adjustments) {
      const before = qty
      const after = adj.type === 'in' ? before + adj.qty : Math.max(0, before - adj.qty)
      const codePrefix = adj.type === 'in' ? 'NK' : 'XK'
      const seq = adj.type === 'in' ? nk : xk
      if (adj.type === 'in') nk += 1
      else xk += 1

      movements.push({
        id: uid(),
        code: `${codePrefix}-20261031-${String(seq).padStart(3, '0')}`,
        productId: id,
        productName: sample.name,
        type: adj.type,
        reason: adj.reason,
        quantity: adj.qty,
        before,
        after,
        note: adj.note,
        createdAt: isoHoursAgo(adj.hoursAgo),
      })
      qty = after
    }

    products.push({
      id,
      name: sample.name,
      quantity: qty,
      unit: sample.unit,
      unitPrice: sample.unitPrice,
      deliveryDate: now.slice(0, 10),
      updatedAt: now,
    })
  }

  movements.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return { products, movements }
}
