import { describe, expect, it } from 'vitest'
import { computeAging } from './domain/aging'
import { applyDocument, previewRevert, revertMovements } from './domain/documents'
import { parsePrice } from './excel'
import { diffData } from './sync/diff'
import { emptyData, type AppData } from './types'

function seed(): AppData {
  return applyDocument(emptyData(), {
    type: 'in',
    date: '2026-11-01',
    reason: 'Nhập hàng',
    lines: [
      { sku: 'A', name: 'SP A', quantity: 20, unitPrice: 5000 },
      { sku: 'B', name: 'SP B', quantity: 10, unitPrice: 2000 },
    ],
  }).data
}

const qtyOf = (d: AppData, sku: string) => d.products.find((p) => p.sku === sku)?.quantity

describe('xóa nhiều dòng: tồn thật khớp màn xác nhận', () => {
  it('khi bị chặn ở 0 giữa chừng', () => {
    let data = seed()
    const out = applyDocument(data, {
      type: 'out', date: '2026-11-02', reason: 'x', lines: [{ sku: 'A', name: '', quantity: 3 }],
    })
    data = out.data // A = 17
    const inn = applyDocument(data, {
      type: 'in', date: '2026-11-03', reason: 'x', lines: [{ sku: 'A', name: '', quantity: 10 }],
    })
    data = inn.data // A = 27
    data = applyDocument(data, {
      type: 'set', date: '2026-11-04', reason: 'x', lines: [{ sku: 'A', name: '', quantity: 4 }],
    }).data // A = 4

    const ids = [inn.doc.lines[0].movementId, out.doc.lines[0].movementId]
    const preview = previewRevert(data, ids)
    const shown = preview[preview.length - 1].to
    expect(shown).toBe(3) // 4 - 10 -> 0, rồi 0 + 3 = 3
    expect(qtyOf(revertMovements(data, ids), 'A')).toBe(shown)
  })
})

describe('tồn lâu', () => {
  it('khách trả hàng không tính là lần nhập', () => {
    let data = seed() // nhập 01/11
    data = applyDocument(data, {
      type: 'return', date: '2026-12-01', reason: 'Khách trả', lines: [{ sku: 'A', name: '', quantity: 1 }],
    }).data
    const rows = computeAging(data.products, data.movements, new Date('2026-12-05T12:00:00'))
    const a = rows.find((r) => r.product.sku === 'A')!
    expect(a.days).toBe(34)
    expect(a.lastInQty).toBe(20)
  })
})

describe('đọc giá từ Excel', () => {
  it('bỏ dấu phân cách hàng nghìn', () => {
    expect(parsePrice('7.500')).toBe(7500)
    expect(parsePrice('1.250.000')).toBe(1250000)
    expect(parsePrice('1,250,000')).toBe(1250000)
    expect(parsePrice('100.000đ')).toBe(100000)
    expect(parsePrice(7500)).toBe(7500)
    expect(parsePrice('12,5')).toBe(12.5)
    expect(parsePrice('')).toBeUndefined()
    expect(parsePrice(0)).toBeUndefined()
  })
})

describe('đồng bộ: chỉ gửi phần thay đổi', () => {
  it('không đổi gì thì không gửi', () => {
    const data = seed()
    expect(diffData(data, data, 1)).toBeNull()
  })

  it('phiếu mới: gửi dòng nhật ký mới theo thứ tự cũ -> mới và SP bị đổi tồn', () => {
    const before = seed()
    const after = applyDocument(before, {
      type: 'out', date: '2026-11-05', reason: 'x',
      lines: [
        { sku: 'A', name: '', quantity: 1 },
        { sku: 'B', name: '', quantity: 2 },
      ],
    }).data
    const req = diffData(before, after, 7)!
    expect(req.baseRevision).toBe(7)
    expect(req.upsert.documents).toHaveLength(1)
    expect(req.upsert.movements.map((m) => m.sku)).toEqual(['A', 'B'])
    expect(req.upsert.products.map((p) => p.sku).sort()).toEqual(['A', 'B'])
    expect(req.remove.products).toEqual([])
    expect(req.categories).toBeUndefined()
    // Thứ tự gửi lên ngược với mảng (mảng xếp mới -> cũ)
    const newIds = after.movements.slice(0, 2).map((m) => m.id).reverse()
    expect(req.upsert.movements.map((m) => m.id)).toEqual(newIds)
  })

  it('xóa SP và đổi nhóm hàng', () => {
    const before = seed()
    const target = before.products[0]
    const after: AppData = {
      ...before,
      products: before.products.filter((p) => p.id !== target.id),
      categories: [{ id: 'c1', name: 'Găng tay nylon' }],
    }
    const req = diffData(before, after, 1)!
    expect(req.remove.products).toEqual([target.id])
    expect(req.upsert.products).toEqual([])
    expect(req.categories).toEqual([{ id: 'c1', name: 'Găng tay nylon' }])
  })
})
