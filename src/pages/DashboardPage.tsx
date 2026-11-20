import { useMemo, useState } from 'react'
import { isCombo } from '../domain/combos'
import { formatMoney, formatNumber } from '../domain/format'
import { isLowStock, stockProducts, stockValue, summarize } from '../domain/valuation'
import { useApp } from '../store/context'
import { ProductNameCell } from '../ui/ProductThumb'

type Panel = 'products' | 'qty' | 'low' | 'value'

const PANEL_TITLE: Record<Panel, string> = {
  products: 'Tất cả sản phẩm',
  qty: 'Tồn kho theo sản phẩm',
  low: 'Sản phẩm sắp hết',
  value: 'Giá trị tồn theo sản phẩm',
}

export function DashboardPage({ onOpenProducts }: { onOpenProducts: (lowOnly: boolean) => void }) {
  const { data, openProduct } = useApp()
  const [panel, setPanel] = useState<Panel>('value')
  const threshold = data.settings.lowStockThreshold
  const sum = useMemo(() => summarize(data), [data])

  const categoryName = useMemo(
    () => new Map(data.categories.map((c) => [c.id, c.name])),
    [data.categories],
  )

  const rows = useMemo(() => {
    const real = stockProducts(data.products)
    if (panel === 'products') {
      return data.products.filter((p) => !isCombo(p)).sort((a, b) => a.name.localeCompare(b.name, 'vi'))
    }
    if (panel === 'low') {
      return real.filter((p) => isLowStock(p, threshold)).sort((a, b) => a.quantity - b.quantity)
    }
    if (panel === 'qty') return [...real].sort((a, b) => b.quantity - a.quantity)
    return [...real].sort((a, b) => stockValue(b) - stockValue(a))
  }, [data.products, panel, threshold])

  const byCategory = useMemo(() => {
    const map = new Map<string, { name: string; count: number; qty: number; value: number }>()
    for (const p of stockProducts(data.products)) {
      const key = p.categoryId ?? '_none'
      const name = p.categoryId ? (categoryName.get(p.categoryId) ?? 'Nhóm đã xóa') : 'Chưa phân nhóm'
      const cur = map.get(key) ?? { name, count: 0, qty: 0, value: 0 }
      cur.count += 1
      cur.qty += p.quantity
      cur.value += stockValue(p)
      map.set(key, cur)
    }
    return [...map.values()].sort((a, b) => b.value - a.value)
  }, [data.products, categoryName])

  const stats: Array<{ id: Panel; label: string; value: string; warn?: boolean }> = [
    { id: 'products', label: 'Tổng sản phẩm', value: formatNumber(sum.totalProducts) },
    { id: 'qty', label: 'Tổng số lượng tồn', value: `${formatNumber(sum.totalQty)} đơn vị` },
    { id: 'low', label: 'Sản phẩm sắp hết', value: formatNumber(sum.lowCount), warn: sum.lowCount > 0 },
    { id: 'value', label: 'Tổng giá trị tồn kho', value: `${formatNumber(sum.totalValue)} VNĐ` },
  ]

  return (
    <>
      <header className="topbar">
        <div className="page-title">
          <h1>Tổng quan</h1>
          <p>Bấm vào từng ô để xem chi tiết tồn kho và giá trị tồn của từng sản phẩm.</p>
        </div>
      </header>

      <div className="stats stats-4">
        {stats.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`stat stat-btn${s.warn ? ' warn' : ''}${panel === s.id ? ' selected' : ''}`}
            onClick={() => setPanel(s.id)}
          >
            <span>{s.label}</span>
            <strong>{s.value}</strong>
          </button>
        ))}
      </div>

      <section className="panel-block">
        <div className="panel-head">
          <h2>{PANEL_TITLE[panel]}</h2>
          {panel === 'low' ? (
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => onOpenProducts(true)}>
              Mở trong Sản phẩm
            </button>
          ) : null}
        </div>
        {rows.length === 0 ? (
          <div className="empty compact">
            <p>{panel === 'low' ? 'Không có sản phẩm nào sắp hết.' : 'Chưa có sản phẩm.'}</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="stock-table">
              <thead>
                <tr>
                  <th>Mã SKU</th>
                  <th>Tên SP</th>
                  <th>Nhóm</th>
                  <th className="col-num">Tồn</th>
                  <th className="col-num">Giá nhập</th>
                  <th className="col-num">Giá trị tồn</th>
                  <th className="col-num">% giá trị</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const low = isLowStock(p, threshold)
                  const v = stockValue(p)
                  return (
                    <tr
                      key={p.id}
                      className={`row-click${low ? ' row-low' : ''}`}
                      onClick={() => openProduct(p.id)}
                    >
                      <td className="muted">{p.sku || '—'}</td>
                      <td>
                        <ProductNameCell product={p} />
                      </td>
                      <td className="muted">
                        {p.categoryId ? (categoryName.get(p.categoryId) ?? '—') : '—'}
                      </td>
                      <td className="col-num">
                        <span className={`table-qty${low ? ' qty-low' : ''}`}>
                          {formatNumber(p.quantity)}
                        </span>{' '}
                        <span className="muted small">{p.unit ?? ''}</span>
                      </td>
                      <td className="col-num">{formatMoney(p.unitPrice)}</td>
                      <td className="col-num">{formatMoney(v)}</td>
                      <td className="col-num">
                        {sum.totalValue > 0 ? `${((v / sum.totalValue) * 100).toFixed(1)}%` : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {byCategory.length > 0 ? (
        <section className="panel-block">
          <div className="panel-head">
            <h2>Theo nhóm hàng</h2>
          </div>
          <div className="table-wrap">
            <table className="stock-table">
              <thead>
                <tr>
                  <th>Nhóm</th>
                  <th className="col-num">Số SP</th>
                  <th className="col-num">Tồn</th>
                  <th className="col-num">Giá trị tồn</th>
                </tr>
              </thead>
              <tbody>
                {byCategory.map((c) => (
                  <tr key={c.name}>
                    <td>
                      <strong>{c.name}</strong>
                    </td>
                    <td className="col-num">{c.count}</td>
                    <td className="col-num">{formatNumber(c.qty)}</td>
                    <td className="col-num">{formatMoney(c.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  )
}
