import { applyDocument } from '../domain/documents'
import { localDateKey } from '../domain/format'
import { parseProductsFromExcel, toIsoDateOnly } from '../excel'
import type { AppData } from '../types'
import type { AppCtx } from './context'

export function isExcelFile(file: File) {
  const name = file.name.toLowerCase()
  return (
    name.endsWith('.xlsx') ||
    name.endsWith('.xls') ||
    name.endsWith('.csv') ||
    file.type.includes('sheet') ||
    file.type.includes('excel') ||
    file.type === 'text/csv'
  )
}

/** Nhập Excel: mỗi ngày trong file thành 1 phiếu nhập (SP chưa có sẽ tự tạo). */
export async function importExcelFile(ctx: AppCtx, file: File): Promise<void> {
  try {
    const buffer = await file.arrayBuffer()
    const rows = parseProductsFromExcel(buffer)
    if (rows.length === 0) {
      ctx.toast('Không đọc được sản phẩm từ Excel')
      return
    }

    const today = localDateKey()
    const byDate = new Map<string, typeof rows>()
    for (const row of rows) {
      // Dòng không có ngày: phiếu lập hôm nay, nhưng KHÔNG đổi ngày giao của SP
      const date = toIsoDateOnly(row.date) ?? today
      const list = byDate.get(date) ?? []
      list.push(row)
      byDate.set(date, list)
    }

    // Lấy dữ liệu mới nhất sau khi đọc file xong (tránh đè thay đổi xảy ra trong lúc đọc)
    let next: AppData = ctx.getData()
    let qty = 0
    for (const [date, list] of [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const result = applyDocument(next, {
        type: 'in',
        date,
        reason: 'Nhập hàng',
        note: `Nhập từ Excel (${file.name})`,
        lines: list.map((r) => ({
          sku: r.sku,
          name: r.name,
          unit: r.unit,
          quantity: r.quantity,
          unitPrice: r.unitPrice,
          deliveryDate: toIsoDateOnly(r.date),
        })),
      })
      next = result.data
      qty += list.reduce((s, r) => s + r.quantity, 0)
    }
    ctx.replaceAll(next)
    ctx.toast(`Nhập Excel: ${rows.length} dòng · ${byDate.size} phiếu · +${qty} vào tồn`)
  } catch (err) {
    ctx.toast(err instanceof Error ? err.message : 'Không đọc được file Excel')
  }
}
