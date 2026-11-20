import { useMemo, useState } from 'react'
import { movementDelta, previewRevert, revertMovements } from '../domain/documents'
import { formatDateTime, localDateKey, normalizeText } from '../domain/format'
import { exportMovementsToExcel } from '../excel'
import { useApp } from '../store/context'
import { RevertPreview } from '../ui/RevertPreview'
import { DOC_LABEL, type DocType, type StockMovement } from '../types'
import { Pager, usePagination } from '../ui/Pagination'

function docTypeOf(m: StockMovement): DocType {
  return m.docType ?? (m.type === 'set' ? 'set' : m.type)
}

/** Mốc nhanh: [từ, đến] dạng 'YYYY-MM-DDTHH:mm' (giờ máy). */
const PRESETS: { id: string; label: string; range: () => [string, string] }[] = [
  {
    id: 'today',
    label: 'Hôm nay',
    range: () => {
      const d = new Date()
      return [`${localDateKey(d)}T00:00`, `${localDateKey(d)}T23:59`]
    },
  },
  {
    id: 'yesterday',
    label: 'Hôm qua',
    range: () => {
      const d = new Date()
      d.setDate(d.getDate() - 1)
      return [`${localDateKey(d)}T00:00`, `${localDateKey(d)}T23:59`]
    },
  },
  {
    id: '7d',
    label: '7 ngày',
    range: () => {
      const d = new Date()
      d.setDate(d.getDate() - 6)
      return [`${localDateKey(d)}T00:00`, `${localDateKey()}T23:59`]
    },
  },
  {
    id: 'month',
    label: 'Tháng này',
    range: () => {
      const d = new Date()
      return [`${localDateKey(new Date(d.getFullYear(), d.getMonth(), 1))}T00:00`, `${localDateKey(d)}T23:59`]
    },
  },
]

/** '2026-11-20T08:00' → '20/11/2026 08:00' */
function showDateTime(v: string): string {
  const [date, time] = v.split('T')
  const [y, m, d] = date.split('-')
  return `${d}/${m}/${y} ${time}`
}

/** Mốc "đến" tính hết phút đó (08:30 → 08:30:59.999). */
function toMs(v: string, endOfMinute: boolean): number {
  const t = new Date(v).getTime()
  return endOfMinute ? t + 59_999 : t
}

export function HistoryPage() {
  const { data, getData, replaceAll, confirm, toast, openDocDetail } = useApp()
  const [query, setQuery] = useState('')
  const [type, setType] = useState<'all' | DocType>('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const skuById = useMemo(
    () => new Map(data.products.map((p) => [p.id, p.sku])),
    [data.products],
  )

  const rows = useMemo(() => {
    const q = normalizeText(query)
    // from/to: 'YYYY-MM-DDTHH:mm' theo giờ máy (VN); new Date() đọc chuỗi này theo giờ địa phương.
    const fromMs = from ? toMs(from, false) : -Infinity
    const toMsEnd = to ? toMs(to, true) : Infinity
    return data.movements.filter((m) => {
      if (type !== 'all' && docTypeOf(m) !== type) return false
      const at = new Date(m.createdAt).getTime()
      if (at < fromMs || at > toMsEnd) return false
      if (!q) return true
      const hay = normalizeText(
        `${m.code} ${m.sku ?? skuById.get(m.productId) ?? ''} ${m.productName} ${m.reason} ${m.note ?? ''}`,
      )
      return hay.includes(q)
    })
  }, [data.movements, query, type, from, to, skuById])
  const pager = usePagination(rows, 'history', `${query}|${type}|${from}|${to}`)
  const activePreset = PRESETS.find((p) => {
    const [f, t] = p.range()
    return f === from && t === to
  })?.id

  function applyPreset(id: string) {
    const p = PRESETS.find((x) => x.id === id)
    if (!p) return
    const [f, t] = p.range()
    setFrom(f)
    setTo(t)
  }

  function exportExcel() {
    const range =
      from || to
        ? {
            label: `Từ ${from ? showDateTime(from) : 'đầu'} đến ${to ? showDateTime(to) : 'nay'}`,
            fileSuffix: `${from ? from.replace('T', '_').replace(':', '') : 'dau'} den ${
              to ? to.replace('T', '_').replace(':', '') : localDateKey()
            }`,
          }
        : undefined
    void exportMovementsToExcel(rows, data.products, range)
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

      <div className="range-bar">
        <div className="range-presets">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`chip${activePreset === p.id ? ' active' : ''}`}
              onClick={() => applyPreset(p.id)}
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            className={`chip${!from && !to ? ' active' : ''}`}
            onClick={() => {
              setFrom('')
              setTo('')
            }}
          >
            Tất cả
          </button>
        </div>
        <div className="date-filter">
          <label>
            <span>Từ</span>
            <input
              className="select"
              type="datetime-local"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <span>→</span>
          <label>
            <span>Đến</span>
            <input
              className="select"
              type="datetime-local"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="empty">
          <div className="empty-ico">＋</div>
          <h3>Chưa có lịch sử</h3>
          <p>Lập phiếu nhập / xuất / đặt tồn để thấy nhật ký ở đây.</p>
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
