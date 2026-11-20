import { useMemo, useState } from 'react'
import { comboAvailable, isCombo } from '../domain/combos'
import { formatMoney, formatNumber, normalizeText } from '../domain/format'
import { isLowStock } from '../domain/valuation'
import { useApp } from '../store/context'
import { ExcelButtons } from '../ui/ExcelButtons'
import { SalePriceCell } from '../ui/prices'
import { ProductNameCell } from '../ui/ProductThumb'

type SortKey = 'updated' | 'name' | 'sku' | 'qty-asc' | 'qty-desc'

type Props = {
  lowOnly: boolean
  setLowOnly: (v: boolean) => void
  onLoadSample?: () => void
}

export function ProductsPage({ lowOnly, setLowOnly, onLoadSample }: Props) {
  const { data, openProduct, openProductForm, openDocForm, sellCombo } = useApp()
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [sort, setSort] = useState<SortKey>('updated')
  const threshold = data.settings.lowStockThreshold

  const lowCount = data.products.filter((p) => isLowStock(p, threshold)).length
  const categoryById = useMemo(
    () => new Map(data.categories.map((c) => [c.id, c.name])),
    [data.categories],
  )

  const list = useMemo(() => {
    const tokens = normalizeText(query).split(/\s+/).filter(Boolean)
    let rows = data.products.filter((p) => {
      if (lowOnly && !isLowStock(p, threshold)) return false
      if (categoryFilter === 'none' && p.categoryId) return false
      if (categoryFilter !== 'all' && categoryFilter !== 'none' && p.categoryId !== categoryFilter) {
        return false
      }
      if (tokens.length === 0) return true
      const hay = normalizeText(
        `${p.sku ?? ''} ${p.name} ${p.unit ?? ''} ${p.note ?? ''} ${categoryById.get(p.categoryId ?? '') ?? ''}`,
      )
      return tokens.every((t) => hay.includes(t))
    })
    rows = [...rows]
    rows.sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name, 'vi')
      if (sort === 'sku') return (a.sku ?? '~').localeCompare(b.sku ?? '~', 'vi')
      if (sort === 'qty-asc') return a.quantity - b.quantity
      if (sort === 'qty-desc') return b.quantity - a.quantity
      return b.updatedAt.localeCompare(a.updatedAt)
    })
    return rows
  }, [data.products, query, lowOnly, categoryFilter, sort, threshold, categoryById])

  return (
    <>
      <header className="topbar">
        <div className="page-title">
          <h1>Sản phẩm</h1>
          <p>
            {data.products.length} sản phẩm · cảnh báo đỏ khi tồn ≤ {threshold}
          </p>
        </div>
        <div className="top-actions">
          <ExcelButtons />
          {onLoadSample ? (
            <button className="btn btn-ghost btn-sm" type="button" onClick={onLoadSample}>
              Nạp mẫu
            </button>
          ) : null}
          <button className="btn btn-primary" type="button" onClick={() => openProductForm(null)}>
            + Thêm sản phẩm
          </button>
        </div>
      </header>

      <div className="toolbar">
        <div className="search-wrap">
          <input
            className="search"
            type="search"
            placeholder="Tìm theo SKU, tên, nhóm..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          className="select"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="all">Tất cả nhóm</option>
          {data.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value="none">Chưa phân nhóm</option>
        </select>
        <select className="select" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          <option value="updated">Mới cập nhật</option>
          <option value="sku">SKU A-Z</option>
          <option value="name">Tên A-Z</option>
          <option value="qty-asc">Tồn tăng dần</option>
          <option value="qty-desc">Tồn giảm dần</option>
        </select>
        <button
          className={`btn btn-sm ${lowOnly ? 'btn-danger-solid' : 'btn-danger'}`}
          type="button"
          onClick={() => setLowOnly(!lowOnly)}
        >
          Sắp hết ({lowCount})
        </button>
      </div>

      {list.length === 0 ? (
        <div className="empty">
          <div className="empty-ico">＋</div>
          <h3>{data.products.length === 0 ? 'Chưa có sản phẩm' : 'Không có sản phẩm phù hợp'}</h3>
          <p>
            {data.products.length === 0
              ? 'Thêm sản phẩm, lập phiếu nhập kho, nhập Excel hoặc khôi phục backup.'
              : 'Thử đổi từ khoá hoặc bỏ lọc.'}
          </p>
          <div className="empty-actions">
            <button className="btn btn-primary" type="button" onClick={() => openProductForm(null)}>
              + Thêm sản phẩm
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => openDocForm({ type: 'in' })}
            >
              Lập phiếu nhập
            </button>
          </div>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="stock-table products-table">
            <thead>
              <tr>
                <th>Mã SKU</th>
                <th>Tên SP</th>
                <th className="col-num">Tồn</th>
                <th className="col-unit">Đơn vị</th>
                <th className="col-num">Giá nhập</th>
                <th>Giá bán</th>
                <th className="col-actions">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => {
                const combo = isCombo(p)
                const low = isLowStock(p, threshold)
                const qty = combo ? comboAvailable(p, data.products) : p.quantity
                const cat = p.categoryId ? categoryById.get(p.categoryId) : undefined
                return (
                  <tr
                    key={p.id}
                    className={`row-click${low ? ' row-low' : ''}`}
                    onClick={() => openProduct(p.id)}
                  >
                    <td className="muted">{p.sku || '—'}</td>
                    <td>
                      <ProductNameCell product={p}>
                        {combo ? <span className="badge inline">Combo</span> : null}
                        {cat ? <span className="badge inline cat-badge">{cat}</span> : null}
                        {low ? <span className="badge inline low-badge">Sắp hết</span> : null}
                      </ProductNameCell>
                    </td>
                    <td className="col-num">
                      <span className={`table-qty${low ? ' qty-low' : ''}`}>{formatNumber(qty)}</span>
                      {combo ? <div className="muted small">bán được</div> : null}
                    </td>
                    <td className="col-unit">{p.unit || '—'}</td>
                    <td className="col-num">{formatMoney(p.unitPrice)}</td>
                    <td>
                      <SalePriceCell product={p} platforms={data.platforms} />
                    </td>
                    <td className="col-actions" onClick={(e) => e.stopPropagation()}>
                      <div className="table-actions">
                        {combo ? (
                          <button
                            className="btn btn-primary"
                            type="button"
                            onClick={() => void sellCombo(p.id, 1)}
                          >
                            −1 combo
                          </button>
                        ) : (
                          <button
                            className="btn btn-ghost"
                            type="button"
                            onClick={() => openDocForm({ type: 'in', lines: [{ productId: p.id }] })}
                          >
                            Nhập
                          </button>
                        )}
                        <button
                          className="btn btn-ghost"
                          type="button"
                          onClick={() => openDocForm({ type: 'out', lines: [{ productId: p.id }] })}
                        >
                          Xuất
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
