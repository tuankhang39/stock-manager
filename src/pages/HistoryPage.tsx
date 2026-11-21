import { useMemo, useState } from 'react'
import { movementDelta, previewRevert, revertMovements } from '../domain/documents'
import { formatDateTime, normalizeText } from '../domain/format'
import { exportMovementsToExcel } from '../excel'
import { useApp } from '../store/context'
import { RevertPreview } from '../ui/RevertPreview'
import { DOC_LABEL, type DocType, type StockMovement } from '../types'
import { Pager, usePagination } from '../ui/Pagination'
import { DateRangePicker, describeRange, inRange, rangeLabel, todayRange, type DateTimeRange } from '../ui/DateRangePicker'

function docTypeOf(m: StockMovement): DocType {
  return m.docType ?? (m.type === 'set' ? 'set' : m.type)
}

export function HistoryPage() {
  const { data, getData, replaceAll, confirm, toast, openDocDetail } = useApp()
  const [query, setQuery] = useState('')
  const [type, setType] = useState<'all' | DocType>('all')
  // Mặc định lọc hôm nay.
  const [range, setRange] = useState<DateTimeRange>(todayRange)
  const { from, to } = range

  const skuById = useMemo(
    () => new Map(data.products.map((p) => [p.id, p.sku])),
    [data.products],
  )

  const rows = useMemo(() => {
    const q = normalizeText(query)
    return data.movements.filter((m) => {
      if (type !== 'all' && docTypeOf(m) !== type) return false
      if (!inRange(m.createdAt, range)) return false
      if (!q) return true
      const hay = normalizeText(
        `${m.code} ${m.sku ?? skuById.get(m.productId) ?? ''} ${m.productName} ${m.reason} ${m.note ?? ''}`,
      )
      return hay.includes(q)
    })
  }, [data.movements, query, type, range, skuById])
  const pager = usePagination(rows, 'history', `${query}|${type}|${from}|${to}`)
  function exportExcel() {
    void exportMovementsToExcel(rows, data.products, rangeLabel(range))
  }

  async function remove(m: StockMovement) {
    const preview = previewRevert(data, [m.id])
    const ok = await confirm({
      title: 'Xóa lần điều chỉnh này?',
      message: (
        <>
          <p>
            Xóa <strong>{m.code}</strong> · {m.productName} và hoàn lại tồn kho:
          </p>
          <RevertPreview items={preview} />
        </>
      ),
      confirmLabel: 'Xóa và hoàn tồn',
      danger: true,
    })
    if (!ok) return
    const latest = getData()
    if (!latest.movements.some((x) => x.id === m.id)) return
    replaceAll(revertMovements(latest, [m.id]))
    toast('Đã xóa điều chỉnh, tồn đã hoàn lại')
  }

  return (
    <>
      <header className="topbar">
        <div className="page-title">
          <h1>Lịch sử giao dịch</h1>
          <p>Nhật ký biến động tồn kho · {data.movements.length} dòng</p>
        </div>
        <div className="top-actions">
          <button
            className="btn btn-ghost"
            type="button"
            disabled={rows.length === 0}
            onClick={exportExcel}
            title="Xuất đúng các dòng đang lọc (loại, từ khoá, khoảng ngày giờ)"
          >
            Xuất Excel ({rows.length} dòng)
          </button>
        </div>
      </header>

      <div className="toolbar toolbar-history">
        <div className="search-wrap">
          <input
            className="search"
            type="search"
            placeholder="Tìm mã phiếu, SKU, tên SP, nội dung..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          className="select"
          value={type}
          onChange={(e) => setType(e.target.value as 'all' | DocType)}
        >
          <option value="all">Tất cả loại</option>
          <option value="in">Nhập kho</option>
          <option value="out">Xuất kho</option>
          <option value="return">Khách trả hàng</option>
          <option value="set">Đặt tồn</option>
        </select>
      </div>

      <DateRangePicker value={range} onChange={setRange} />

      {rows.length === 0 ? (
        <div className="empty">
          <div className="empty-ico">＋</div>
          {data.movements.length === 0 ? (
            <>
              <h3>Chưa có lịch sử</h3>
              <p>Lập phiếu nhập / xuất / đặt tồn để thấy nhật ký ở đây.</p>
            </>
          ) : (
            <>
              <h3>Chưa có lịch sử cho {describeRange(range)}</h3>
              <p>Thử chọn khoảng ngày khác (hoặc "Tất cả") hay đổi bộ lọc.</p>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="stock-table history-table">
              <thead>
                <tr>
                  <th>Thời gian</th>
                  <th>Mã phiếu</th>
                  <th>SKU</th>
                  <th>Tên SP</th>
                  <th className="col-num">Trước</th>
                  <th className="col-num">Sau</th>
                  <th className="col-num">Thay đổi</th>
                  <th>Nội dung điều chỉnh</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pager.pageItems.map((m) => {
                  const d = movementDelta(m)
                  const dt = docTypeOf(m)
                  return (
                    <tr key={m.id}>
                      <td>{formatDateTime(m.createdAt)}</td>
                      <td>
                        {m.docId && data.documents.some((x) => x.id === m.docId) ? (
                          <button
                            type="button"
                            className="link-btn"
                            onClick={() => openDocDetail(m.docId!)}
                          >
                            {m.code}
                          </button>
                        ) : (
                          m.code
                        )}
                      </td>
                      <td className="muted">{m.sku ?? skuById.get(m.productId) ?? '—'}</td>
                      <td>
                        <div className="table-name">{m.productName}</div>
                      </td>
                      <td className="col-num">{m.before}</td>
                      <td className="col-num">{m.after}</td>
                      <td className={`col-num ${d >= 0 ? 'delta-up' : 'delta-down'}`}>
                        {d > 0 ? '+' : ''}
                        {d}
                      </td>
                      <td>
                        <span className={`pill pill-${dt === 'in' ? 'in' : dt === 'set' ? 'set' : 'out'}`}>
                          {DOC_LABEL[dt]}
                        </span>{' '}
                        {m.reason}
                        {m.note ? <div className="muted small">{m.note}</div> : null}
                      </td>
                      <td>
                        <button
                          className="btn btn-danger btn-sm"
                          type="button"
                          onClick={() => void remove(m)}
                        >
                          Xóa
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Pager {...pager} />
        </>
      )}
    </>
  )
}
