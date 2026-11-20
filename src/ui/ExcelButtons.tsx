import { useRef } from 'react'
import { isCombo } from '../domain/combos'
import { downloadExcelTemplate, exportProductsToExcel } from '../excel'
import { useApp } from '../store/context'
import { importExcelFile } from '../store/excelImport'

/** Nhập / xuất Excel (mẫu BHLĐ). */
export function ExcelButtons({ compact }: { compact?: boolean }) {
  const ctx = useApp()
  const inputRef = useRef<HTMLInputElement>(null)

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
        onClick={() =>
          void exportProductsToExcel(
            ctx.data.products.filter((p) => !isCombo(p)),
            ctx.data.movements,
          )
        }
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
