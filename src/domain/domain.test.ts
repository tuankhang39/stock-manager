import { describe, expect, it } from 'vitest'
import { parseBackupJson } from '../storage'
import { emptyData, type AppData } from '../types'
import { computeAging } from './aging'
import { comboAvailable } from './combos'
import {
  applyDocument,
  deleteDocument,
  previewRevert,
  revertMovements,
  type DocInput,
} from './documents'
import { docTotals, summarize } from './valuation'

function qty(data: AppData, sku: string) {
  return data.products.find((p) => p.sku === sku)?.quantity
}

function seed(): AppData {
  return applyDocument(emptyData(), {
    type: 'in',
    date: '2026-11-01',
    reason: 'Nhập hàng',
    vatRate: 10,
    lines: [
      { sku: 'A', name: 'SP A', unit: 'ĐÔI', quantity: 20, unitPrice: 5000 },
      { sku: 'B', name: 'SP B', unit: 'ĐÔI', quantity: 10, unitPrice: 2000 },
    ],
  }).data
}

function doc(data: AppData, input: Omit<DocInput, 'date' | 'reason'> & { reason?: string }) {
  return applyDocument(data, { date: '2026-11-05', reason: 'Test', ...input })
}

describe('applyDocument', () => {
  it('nhập 1 phiếu nhiều dòng, SP mới tự tạo, tính VAT', () => {
    const result = applyDocument(emptyData(), {
      type: 'in',
      date: '2026-11-20',
      reason: 'Nhập hàng',
      vatRate: 10,
      lines: [
        { sku: 'A', name: 'SP A', quantity: 20, unitPrice: 5000 },
        { sku: 'B', name: 'SP B', quantity: 10, unitPrice: 2000 },
      ],
    })
    expect(result.data.products).toHaveLength(2)
    expect(result.data.documents).toHaveLength(1)
    expect(result.data.movements).toHaveLength(2)
    expect(result.doc.code).toBe('NK-20261120-001')
    const t = docTotals(result.doc)
    expect(t.qty).toBe(30)
    expect(t.subtotal).toBe(120000)
    expect(t.vat).toBe(12000)
    expect(t.total).toBe(132000)
    expect(result.data.movements.every((m) => m.delta === m.after - m.before)).toBe(true)
  })

  it('xuất làm giảm tồn; khách trả hàng làm tăng tồn; SP không tồn tại thì báo lỗi', () => {
    const data = seed()
    const out = doc(data, { type: 'out', lines: [{ sku: 'A', name: '', quantity: 5 }] }).data
    expect(qty(out, 'A')).toBe(15)
    const ret = doc(out, { type: 'return', lines: [{ sku: 'A', name: '', quantity: 4 }] }).data
    expect(qty(ret, 'A')).toBe(19)
    expect(ret.movements[0].docType).toBe('return')
    expect(ret.movements[0].delta).toBe(4)
    expect(() => doc(data, { type: 'out', lines: [{ name: 'Không có', quantity: 1 }] })).toThrow()
    expect(() => doc(data, { type: 'return', lines: [{ name: 'Không có', quantity: 1 }] })).toThrow()
  })

  it('xóa phiếu khách trả hàng thì trừ lại tồn', () => {
    const data = seed()
    const ret = doc(data, { type: 'return', lines: [{ sku: 'A', name: '', quantity: 3 }] })
    expect(qty(ret.data, 'A')).toBe(23)
    const after = deleteDocument(ret.data, ret.doc.id)
    expect(qty(after, 'A')).toBe(20)
  })

  it('mã phiếu tăng dần trong ngày', () => {
    const data = seed()
    const a = doc(data, { type: 'out', lines: [{ sku: 'A', name: '', quantity: 1 }] })
    const b = doc(a.data, { type: 'out', lines: [{ sku: 'A', name: '', quantity: 1 }] })
    expect(a.doc.code).toBe('XK-20261105-001')
    expect(b.doc.code).toBe('XK-20261105-002')
  })
})

describe('xóa phiếu / dòng nhật ký hoàn tồn', () => {
  it('ví dụ đặt tồn nhầm: A tồn 20, đặt 5, xóa điều chỉnh -> về 20', () => {
    const data = seed()
    const set = doc(data, { type: 'set', lines: [{ sku: 'A', name: '', quantity: 5 }] })
    expect(qty(set.data, 'A')).toBe(5)
    const back = deleteDocument(set.data, set.doc.id)
    expect(qty(back, 'A')).toBe(20)
    expect(back.documents).toHaveLength(1)
    expect(back.movements).toHaveLength(2)
  })

  it('xóa phiếu xuất thì tồn về như cũ', () => {
    const data = seed()
    const out = doc(data, {
      type: 'out',
      lines: [
        { sku: 'A', name: '', quantity: 7 },
        { sku: 'B', name: '', quantity: 3 },
      ],
    })
    expect(qty(out.data, 'A')).toBe(13)
    const back = deleteDocument(out.data, out.doc.id)
    expect(qty(back, 'A')).toBe(20)
    expect(qty(back, 'B')).toBe(10)
  })

  it('xóa 1 dòng nhật ký không đè lên thay đổi xảy ra sau đó', () => {
    const data = seed()
    const out = doc(data, { type: 'out', lines: [{ sku: 'A', name: '', quantity: 5 }] })
    const set = doc(out.data, { type: 'set', lines: [{ sku: 'A', name: '', quantity: 10 }] })
    // 20 -> 15 (xuất 5) -> 10 (đặt tồn). Xóa phiếu xuất: tồn 10 + 5 = 15.
    const movementId = out.data.movements.find((m) => m.docId === out.doc.id)!.id
    const next = revertMovements(set.data, [movementId])
    expect(qty(next, 'A')).toBe(15)
    expect(next.documents.find((d) => d.id === out.doc.id)).toBeUndefined()
  })

  it('xóa 1 dòng của phiếu nhiều dòng thì phiếu còn các dòng khác', () => {
    const data = seed()
    const out = doc(data, {
      type: 'out',
      lines: [
        { sku: 'A', name: '', quantity: 2 },
        { sku: 'B', name: '', quantity: 2 },
      ],
    })
    const lineA = out.doc.lines.find((l) => l.sku === 'A')!
    const next = revertMovements(out.data, [lineA.movementId])
    expect(qty(next, 'A')).toBe(20)
    expect(qty(next, 'B')).toBe(8)
    expect(next.documents.find((d) => d.id === out.doc.id)?.lines).toHaveLength(1)
  })

  it('cảnh báo khi không đủ tồn để hoàn (chặn ở 0)', () => {
    const data = seed()
    const nhapThem = doc(data, { type: 'in', lines: [{ sku: 'B', name: '', quantity: 5 }] })
    const xuatHet = doc(nhapThem.data, { type: 'out', lines: [{ sku: 'B', name: '', quantity: 15 }] })
    expect(qty(xuatHet.data, 'B')).toBe(0)
    const preview = previewRevert(xuatHet.data, [
      nhapThem.data.movements.find((m) => m.docId === nhapThem.doc.id)!.id,
    ])
    expect(preview[0].clamped).toBe(true)
    expect(preview[0].to).toBe(0)
  })
})

describe('combo', () => {
  function withCombo() {
    const data = seed()
    const a = data.products.find((p) => p.sku === 'A')!
    const b = data.products.find((p) => p.sku === 'B')!
    data.products = [
      {
        id: 'combo',
        sku: 'CB',
        name: 'Combo A+B',
        quantity: 0,
        comboItems: [
          { productId: a.id, qty: 1 },
          { productId: b.id, qty: 2 },
        ],
        updatedAt: new Date().toISOString(),
      },
      ...data.products,
    ]
    return data
  }

  it('tồn khả dụng = min(tồn thành phần / số lượng cần)', () => {
    const data = withCombo()
    const combo = data.products.find((p) => p.id === 'combo')!
    expect(comboAvailable(combo, data.products)).toBe(5) // B: 10 / 2
  })

  it('bán combo trừ các thành phần, xóa phiếu hoàn lại', () => {
    const data = withCombo()
    const sold = doc(data, { type: 'out', lines: [{ productId: 'combo', name: '', quantity: 3 }] })
    expect(qty(sold.data, 'A')).toBe(17)
    expect(qty(sold.data, 'B')).toBe(4)
    expect(sold.doc.lines.every((l) => l.viaCombo === 'Combo A+B')).toBe(true)
    expect(sold.data.products.find((p) => p.id === 'combo')?.quantity).toBe(0)
    const back = deleteDocument(sold.data, sold.doc.id)
    expect(qty(back, 'A')).toBe(20)
    expect(qty(back, 'B')).toBe(10)
  })

  it('combo không dùng được ở phiếu nhập', () => {
    expect(() =>
      doc(withCombo(), { type: 'in', lines: [{ productId: 'combo', name: '', quantity: 1 }] }),
    ).toThrow()
  })
})

describe('giá trị tồn + tồn lâu', () => {
  it('tổng giá trị = tồn x giá nhập, không tính combo', () => {
    const data = seed()
    const s = summarize(data)
    expect(s.totalQty).toBe(30)
    expect(s.totalValue).toBe(20 * 5000 + 10 * 2000)
    expect(s.lowCount).toBe(1) // B còn đúng 10 = ngưỡng sắp hết
  })

  it('tồn lâu tính từ lần nhập gần nhất', () => {
    let data = seed() // nhập 01/11
    data = doc(data, { type: 'in', lines: [{ sku: 'B', name: '', quantity: 5 }] }).data // 05/11
    const now = new Date('2026-12-05T12:00:00')
    const rows = computeAging(data.products, data.movements, now)
    const a = rows.find((r) => r.product.sku === 'A')!
    const b = rows.find((r) => r.product.sku === 'B')!
    expect(a.days).toBe(34)
    expect(b.days).toBe(30)
    expect(b.lastInQty).toBe(5)
    expect(a.firstIn.slice(0, 10)).toBe('2026-11-01')
  })
})

describe('backup cũ (v1)', () => {
  it('nhận file v1 chỉ có products + movements, điền mặc định cho trường mới', () => {
    const now = new Date().toISOString()
    const v1 = {
      format: 'riland-backup',
      version: 1,
      exportedAt: now,
      products: [{ id: 'p1', name: 'Găng tay', quantity: 12, unitPrice: 5000, updatedAt: now }],
      movements: [
        {
          id: 'm1',
          code: 'NK-20261001-001',
          productId: 'p1',
          productName: 'Găng tay',
          type: 'in',
          reason: 'Nhập hàng',
          quantity: 12,
          before: 0,
          after: 12,
          createdAt: now,
        },
      ],
      theme: 'dark',
    }
    const parsed = parseBackupJson(JSON.stringify(v1))
    expect(parsed.products).toHaveLength(1)
    expect(parsed.documents).toEqual([])
    expect(parsed.categories).toEqual([])
    expect(parsed.platforms.map((p) => p.name)).toEqual(['TikTok', 'Shopee'])
    expect(parsed.settings.lowStockThreshold).toBe(10)
    expect(parsed.theme).toBe('dark')

    // Dòng nhật ký cũ (không có delta) vẫn xóa & hoàn tồn được.
    const data: AppData = { ...parsed }
    const next = revertMovements(data, ['m1'])
    expect(next.products[0].quantity).toBe(0)
    expect(next.movements).toHaveLength(0)
  })

  it('nhận file chỉ có { products, movements } không có format', () => {
    const now = new Date().toISOString()
    const parsed = parseBackupJson(
      JSON.stringify({
        products: [{ id: 'p', name: 'X', quantity: 1, updatedAt: now }],
        movements: [],
      }),
    )
    expect(parsed.products).toHaveLength(1)
  })

  it('từ chối file không phải backup', () => {
    expect(() => parseBackupJson('{"hello":1}')).toThrow()
  })
})
