import { useRef, useState } from 'react'
import { isCombo } from '../domain/combos'
import { downloadExcelTemplate, exportProductsToExcel } from '../excel'
import { useApp } from '../store/context'
import { importExcelFile } from '../store/excelImport'
import { DateRangePicker, inRange, rangeLabel, todayRange, type DateTimeRange } from './DateRangePicker'

/** Nội dung hộp thoại xuất: chọn khoảng ngày cho phần lịch sử chỉnh tồn. */
function ExportRangeForm({ onChange }: { onChange: (r: DateTimeRange) => void }) {
  const [range, setRange] = useState<DateTimeRange>(todayRange)
  return (
    <>
      <p>Chọn khoảng ngày giờ cho phần lịch sử chỉnh tồn trong file (mặc định hôm nay).</p>
      <DateRangePicker
        value={range}
        onChange={(r) => {
          setRange(r)
          onChange(r)
        }}
      />
    </>
  )
}

/** Nhập / xuất Excel (mẫu BHLĐ). */
export function ExcelButtons({ compact }: { compact?: boolean }) {
  const ctx = useApp()
  const inputRef = useRef<HTMLInputElement>(null)

  async function exportWithRange() {
    let range = todayRange()
    const ok = await ctx.confirm({
      title: 'Xuất Excel sản phẩm',
      message: <ExportRangeForm onChange={(r) => (range = r)} />,
      confirmLabel: 'Xuất Excel',
    })
    if (!ok) return
    const all = ctx.getData()
    await exportProductsToExcel(
      all.products.filter((p) => !isCombo(p)),
      all.movements,
      {
        movements: all.movements.filter((m) => inRange(m.createdAt, range)),
        fileSuffix: rangeLabel(range)?.fileSuffix,
      },
    )
  }

  return (
    <>
      <input
        ref={inputRef}
        className="hidden-input"
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void importExcelFile(ctx, file)
          if (inputRef.current) inputRef.current.value = ''
        }}
      />
      <button className="btn btn-ghost btn-sm" type="button" onClick={() => inputRef.current?.click()}>
        Nhập Excel
      </button>
      <button
        className="btn btn-ghost btn-sm"
        type="button"
        onClick={() => void exportWithRange()}
      >
        Xuất Excel
      </button>
      {compact ? null : (
        <button
          className="btn btn-ghost btn-sm"
          type="button"
          onClick={() => void downloadExcelTemplate()}
        >
          Tải mẫu Excel
        </button>
      )}
    </>
  )
}
