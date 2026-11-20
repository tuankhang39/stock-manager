import { applyDocument, type DocLineInput } from './domain/documents'
import { localDateKey } from './domain/format'
import { emptyData, type AppData } from './types'

function dayOffset(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return localDateKey(d)
}

/** Dữ liệu mẫu để dùng thử (chỉ hiện ở chế độ dev). */
export function createSampleData(): AppData {
  let data = emptyData()
  data.categories = [
    { id: 'cat-da', name: 'Găng tay hàn da bò' },
    { id: 'cat-cs', name: 'Găng tay cao su' },
    { id: 'cat-ny', name: 'Găng tay nylon' },
    { id: 'cat-kinh', name: 'Kính bảo hộ' },
  ]

  const items: Array<DocLineInput & { qty: number }> = [
    {
      sku: 'GT-DA-40V',
      name: 'GĂNG TAY DA HÀN DÀI MÀU VÀNG (40CM)',
      unit: 'ĐÔI',
      unitPrice: 55000,
      categoryId: 'cat-da',
      qty: 120,
      quantity: 120,
    },
    {
      sku: 'GT-CS-XAM',
      name: 'GĂNG TAY CAO SU XÁM CHỐNG MÀI MÒN',
      unit: 'ĐÔI',
      unitPrice: 6000,
      categoryId: 'cat-cs',
      qty: 120,
      quantity: 120,
    },
    {
      sku: 'GT-NY-DEN',
      name: 'Găng tay Nylon đen',
      unit: 'ĐÔI',
      unitPrice: 1500,
      categoryId: 'cat-ny',
      qty: 100,
      quantity: 100,
    },
    {
      sku: 'GT-NY-XAM',
      name: 'Găng tay Nylon xám',
      unit: 'ĐÔI',
      unitPrice: 1600,
      categoryId: 'cat-ny',
      qty: 50,
      quantity: 50,
    },
    {
      sku: 'K-SUONG',
      name: 'Kính chống sương',
      unit: 'CÁI',
      unitPrice: 8700,
      categoryId: 'cat-kinh',
      qty: 8,
      quantity: 8,
    },
    {
      sku: 'GT-CANVAS',
      name: 'Găng Tay Vãi Canvas Nguyên Chất',
      unit: 'ĐÔI',
      unitPrice: 7500,
      qty: 100,
      quantity: 100,
    },
  ]

  data = applyDocument(data, {
    type: 'in',
    date: dayOffset(40),
    reason: 'Nhập hàng',
    note: 'Dữ liệu mẫu',
    vatRate: 8,
    lines: items,
  }).data

  data = applyDocument(data, {
    type: 'out',
    date: dayOffset(3),
    reason: 'Bán hàng / xuất TMĐT',
    note: 'Xuất TMĐT',
    lines: [
      { sku: 'GT-CS-XAM', name: '', quantity: 20 },
      { sku: 'GT-NY-DEN', name: '', quantity: 30 },
    ],
  }).data

  data = applyDocument(data, {
    type: 'in',
    date: dayOffset(1),
    reason: 'Nhập hàng',
    lines: [
      { sku: 'GT-NY-DEN', name: '', quantity: 60, unitPrice: 1500 },
      { sku: 'K-SUONG', name: '', quantity: 2, unitPrice: 8700 },
    ],
  }).data

  const tiers = (base: number) => [
    { qty: 1, price: base },
    { qty: 6, price: Math.round(base * 5.4) },
    { qty: 12, price: Math.round(base * 10.2) },
    { qty: 24, price: Math.round(base * 19.2) },
  ]
  data.products = data.products.map((p) => {
    const base = Math.round((p.unitPrice ?? 0) * 1.6)
    if (!base) return p
    return {
      ...p,
      salePrices: { tiktok: tiers(base), shopee: tiers(Math.round(base * 1.05)) },
    }
  })

  const denId = data.products.find((p) => p.sku === 'GT-NY-DEN')?.id
  const xamId = data.products.find((p) => p.sku === 'GT-NY-XAM')?.id
  if (denId && xamId) {
    const nowIso = new Date().toISOString()
    data.products = [
      {
        id: 'combo-ny-1',
        sku: 'CB-NY-2',
        name: 'Combo 2 đôi găng tay Nylon (1 đen + 1 xám)',
        quantity: 0,
        unit: 'COMBO',
        categoryId: 'cat-ny',
        comboItems: [
          { productId: denId, qty: 1 },
          { productId: xamId, qty: 1 },
        ],
        salePrices: { tiktok: [{ qty: 1, price: 9900 }], shopee: [{ qty: 1, price: 10500 }] },
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      ...data.products,
    ]
  }

  return data
}
