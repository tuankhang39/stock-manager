import { useMemo, useState } from 'react'
import { computeAging } from '../domain/aging'
import { formatDate, formatMoney, formatNumber } from '../domain/format'
import { useApp } from '../store/context'
import { ProductNameCell } from '../ui/ProductThumb'
import { Pager, usePagination } from '../ui/Pagination'

const THRESHOLDS = [15, 30, 60, 90] as const

export function ReportsPage() {
  const { data, openProduct } = useApp()
  const [days, setDays] = useState<(typeof THRESHOLDS)[number]>(15)

  const all = useMemo(() => computeAging(data.products, data.movements), [data.products, data.movements])
  const rows = useMemo(() => all.filter((r) => r.days >= days), [all, days])
  const pager = usePagination(rows, 'reports', String(days))
  const totalValue = rows.reduce((s, r) => s + r.value, 0)
  const totalQty = rows.reduce((s, r) => s + r.product.quantity, 0)

  return (
    <>
      <header className="topbar">
        <div className="page-title">
          <h1>Báo cáo hàng tồn lâu</h1>
          <p>SP còn tồn mà lần nhập gần nhất đã quá số ngày đã chọn.</p>
        </div>
      </header>

      <div className="toolbar">
        <div className="segment">
          {THRESHOLDS.map((d) => (
            <button
              key={d}
              type="button"
              className={days === d ? 'active' : ''}
              onClick={() => setDays(d)}
            >
              Trên {d} ngày ({all.filter((r) => r.days >= d).length})
            </button>
          ))}
        </div>
      </div>

      {rows.length > 0 ? (
        <div className="sum-bar">
          <span>{rows.length} sản phẩm</span>
          <span>
            Tồn: <strong>{formatNumber(totalQty)}</strong>
          </span>
          <span>
            Giá trị tồn lâu: <strong>{formatMoney(totalValue)}</strong>
          </span>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="empty">
          <div className="empty-ico">✓</div>
          <h3>Không có hàng tồn trên {days} ngày</h3>
          <p>Mọi sản phẩm còn tồn đều có nhập hàng gần đây.</p>
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="stock-table">
              <thead>
                <tr>
                  <th>Mã SKU</th>
                  <th>Tên SP</th>
                  <th>Nhập đầu tiên</th>
                  <th>Nhập gần nhất</th>
                  <th className="col-num">SL lần nhập gần nhất</th>
                  <th className="col-num">Tồn hiện tại</th>
                  <th className="col-num">Giá nhập</th>
                  <th className="col-num">Giá trị tồn</th>
                  <th className="col-num">Số ngày</th>
                </tr>
              </thead>
              <tbody>
                {pager.pageItems.map((r) => (
                  <tr key={r.product.id} className="row-click" onClick={() => openProduct(r.product.id)}>
                    <td className="muted">{r.product.sku || '—'}</td>
                    <td>
                      <ProductNameCell product={r.product} />
                    </td>
                    <td>{formatDate(r.firstIn)}</td>
                    <td>
                      {formatDate(r.lastIn)}
                      {r.hasImport ? null : <div className="muted small">(ngày tạo SP)</div>}
                    </td>
                    <td className="col-num">{r.hasImport ? formatNumber(r.lastInQty) : '—'}</td>
                    <td className="col-num">
                      <span className="table-qty">{formatNumber(r.product.quantity)}</span>{' '}
                      <span className="muted small">{r.product.unit ?? ''}</span>
                    </td>
                    <td className="col-num">{formatMoney(r.product.unitPrice)}</td>
                    <td className="col-num">{formatMoney(r.value)}</td>
                    <td className="col-num">
                      <span className={`age-pill${r.days >= 90 ? ' age-90' : r.days >= 60 ? ' age-60' : ''}`}>
                        {r.days}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager {...pager} />
        </>
      )}
    </>
  )
}
