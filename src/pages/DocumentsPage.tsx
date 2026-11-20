import { useMemo, useState } from 'react'
import { formatDate, formatMoney, formatNumber, normalizeText } from '../domain/format'
import { docTotals } from '../domain/valuation'
import { useApp } from '../store/context'
import { DOC_LABEL, type DocType } from '../types'
import { Pager, usePagination } from '../ui/Pagination'

const INTRO: Record<DocType, string> = {
  in: 'Nhập nhiều sản phẩm trong 1 phiếu, kèm ảnh phiếu, VAT và tổng tiền.',
  out: 'Xuất bán / xuất dùng nhiều sản phẩm trong 1 phiếu. Xóa phiếu sẽ hoàn lại tồn.',
  return: 'Khách đặt rồi trả lại / hàng hoàn về kho (tồn tăng). Xóa phiếu sẽ trừ lại tồn.',
  set: 'Đặt (kiểm kê) tồn hàng loạt: nội dung, tồn cũ → tồn mới.',
}

export function DocumentsPage({ type }: { type: DocType }) {
  const { data, openDocForm, openDocDetail } = useApp()
  const [query, setQuery] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const showMoney = type === 'in'

  const docs = useMemo(() => {
    const q = normalizeText(query)
    return data.documents
      .filter((d) => d.type === type)
      .filter((d) => {
        if (from && d.date < from) return false
        if (to && d.date > to) return false
        if (!q) return true
        const hay = normalizeText(
          `${d.code} ${d.reason} ${d.note ?? ''} ${d.lines.map((l) => `${l.sku ?? ''} ${l.name}`).join(' ')}`,
        )
        return hay.includes(q)
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
  }, [data.documents, type, query, from, to])
  const pager = usePagination(docs, `docs-${type}`, `${query}|${from}|${to}`)

  const sumTotal = docs.reduce((s, d) => s + docTotals(d).total, 0)
  const sumSub = docs.reduce((s, d) => s + docTotals(d).subtotal, 0)

  return (
    <>
      <header className="topbar">
        <div className="page-title">
          <h1>{type === 'set' ? 'Kiểm kê (Đặt tồn)' : DOC_LABEL[type]}</h1>
          <p>{INTRO[type]}</p>
        </div>
        <div className="top-actions">
          <button className="btn btn-primary" type="button" onClick={() => openDocForm({ type })}>
            + Lập phiếu {type === 'set' ? 'đặt tồn' : DOC_LABEL[type].toLowerCase()}
          </button>
        </div>
      </header>

      <div className="toolbar">
        <div className="search-wrap">
          <input
            className="search"
            type="search"
            placeholder="Tìm mã phiếu, SKU, tên SP, nội dung..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="date-filter">
          <input className="select" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span>→</span>
          <input className="select" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      {showMoney && docs.length > 0 ? (
        <div className="sum-bar">
          <span>{docs.length} phiếu</span>
          <span>
            Chưa VAT: <strong>{formatMoney(sumSub)}</strong>
          </span>
          <span>
            Có VAT: <strong>{formatMoney(sumTotal)}</strong>
          </span>
        </div>
      ) : null}

      {docs.length === 0 ? (
        <div className="empty">
          <div className="empty-ico">＋</div>
          <h3>Chưa có phiếu</h3>
          <p>Bấm “Lập phiếu” để tạo phiếu đầu tiên.</p>
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="stock-table">
              <thead>
                <tr>
                  <th>Mã phiếu</th>
                  <th>Ngày</th>
                  <th>Nội dung</th>
                  <th>Sản phẩm</th>
                  <th className="col-num">Số dòng</th>
                  <th className="col-num">Tổng SL</th>
                  {showMoney ? <th className="col-num">Chưa VAT</th> : null}
                  {showMoney ? <th className="col-num">Có VAT</th> : null}
                  <th>Ảnh</th>
                </tr>
              </thead>
              <tbody>
                {pager.pageItems.map((d) => {
                  const t = docTotals(d)
                  return (
                    <tr key={d.id} className="row-click" onClick={() => openDocDetail(d.id)}>
                      <td>
                        <strong>{d.code}</strong>
                      </td>
                      <td>{formatDate(d.date)}</td>
                      <td>{d.reason}</td>
                      <td className="doc-items">
                        {d.lines
                          .slice(0, 2)
                          .map((l) => l.name)
                          .join(', ')}
                        {d.lines.length > 2 ? ` +${d.lines.length - 2}` : ''}
                      </td>
                      <td className="col-num">{d.lines.length}</td>
                      <td className="col-num">{formatNumber(t.qty)}</td>
                      {showMoney ? <td className="col-num">{formatMoney(t.subtotal)}</td> : null}
                      {showMoney ? <td className="col-num">{formatMoney(t.total)}</td> : null}
                      <td>{d.image ? <span className="badge inline">Có ảnh</span> : '—'}</td>
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
