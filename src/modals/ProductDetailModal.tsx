import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { comboAvailable, isCombo } from '../domain/combos'
import { formatDate, formatDateTime, formatMoney, formatNumber } from '../domain/format'
import { movementDelta } from '../domain/documents'
import { isLowStock, stockValue } from '../domain/valuation'
import { useApp } from '../store/context'
import { Modal } from '../ui/Modal'
import { DOC_LABEL } from '../types'

type Props = {
  productId: string
  onClose: () => void
}

export function ProductDetailModal({ productId, onClose }: Props) {
  const { data, openDocForm, openProductForm, sellCombo, deleteProduct } = useApp()
  const product = data.products.find((p) => p.id === productId)
  const [zoom, setZoom] = useState<{ src: string; label: string } | null>(null)

  const recent = useMemo(
    () => data.movements.filter((m) => m.productId === productId).slice(0, 8),
    [data.movements, productId],
  )

  if (!product) return null
  const combo = isCombo(product)
  const low = isLowStock(product, data.settings.lowStockThreshold)
  const category = data.categories.find((c) => c.id === product.categoryId)
  const byId = new Map(data.products.map((p) => [p.id, p]))
  const unit = product.unit ?? ''
  const slips = [
    { label: 'Phiếu giao', src: product.deliverySlipImage },
    { label: 'Phiếu giao đã ký', src: product.signedSlipImage },
  ].filter((i): i is { label: string; src: string } => Boolean(i.src))

  const go = (fn: () => void) => () => {
    onClose()
    fn()
  }

  const footer = (
    <>
      <button
        className="btn btn-danger"
        type="button"
        onClick={() =>
          void deleteProduct(product.id).then((ok) => {
            if (ok) onClose()
          })
        }
      >
        Xóa
      </button>
      <span className="foot-spacer" />
      <button className="btn btn-ghost" type="button" onClick={go(() => openProductForm(product))}>
        Sửa
      </button>
      {!combo ? (
        <button
          className="btn btn-ghost"
          type="button"
          onClick={go(() => openDocForm({ type: 'set', lines: [{ productId: product.id }] }))}
        >
          Đặt tồn
        </button>
      ) : null}
      <button
        className="btn btn-ghost"
        type="button"
        onClick={go(() => openDocForm({ type: 'out', lines: [{ productId: product.id }] }))}
      >
        Xuất
      </button>
      {combo ? (
        <button className="btn btn-primary" type="button" onClick={() => void sellCombo(product.id, 1)}>
          −1 combo
        </button>
      ) : (
        <button
          className="btn btn-primary"
          type="button"
          onClick={go(() => openDocForm({ type: 'in', lines: [{ productId: product.id }] }))}
        >
          Nhập
        </button>
      )}
    </>
  )

  return (
    <Modal
      title={product.name}
      sub={
        <>
          {product.sku ? `SKU ${product.sku}` : 'Chưa có SKU'}
          {category ? <span className="badge inline cat-badge">{category.name}</span> : null}
          {combo ? <span className="badge inline">Combo</span> : null}
        </>
      }
      onClose={onClose}
      wide
      footer={footer}
    >
      <div className="pd-hero">
        <button
          type="button"
          className="pd-photo"
          disabled={!product.image}
          onClick={() => product.image && setZoom({ src: product.image, label: product.name })}
          title={product.image ? 'Bấm để phóng to' : undefined}
        >
          {product.image ? (
            <img src={product.image} alt={product.name} />
          ) : (
            <span>Chưa có ảnh</span>
          )}
        </button>

        <div className="pd-summary">
          <div className="detail-stats">
            <div className={`detail-stat${low ? ' low' : ''}`}>
              <span>{combo ? 'Bán được' : 'Tồn kho'}</span>
              <strong>
                {formatNumber(combo ? comboAvailable(product, data.products) : product.quantity)}{' '}
                <small>{unit}</small>
              </strong>
              {low ? <em>Sắp hết (≤ {data.settings.lowStockThreshold})</em> : null}
            </div>
            <div className="detail-stat">
              <span>Giá nhập</span>
              <strong>{formatMoney(product.unitPrice)}</strong>
            </div>
            <div className="detail-stat">
              <span>Giá trị tồn</span>
              <strong>{combo ? '—' : formatMoney(stockValue(product))}</strong>
            </div>
          </div>

          {product.deliveryDate || product.note ? (
            <dl className="pd-meta">
              {product.deliveryDate ? (
                <div>
                  <dt>Ngày giao (BHLĐ)</dt>
                  <dd>{formatDate(product.deliveryDate)}</dd>
                </div>
              ) : null}
              {product.note ? (
                <div>
                  <dt>Ghi chú</dt>
                  <dd>{product.note}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}
        </div>
      </div>

      {combo ? (
        <section className="pd-section">
          <h3>Thành phần combo</h3>
          <ul className="plain-list">
            {(product.comboItems ?? []).map((it) => {
              const c = byId.get(it.productId)
              return (
                <li key={it.productId}>
                  <span className="muted">{c?.sku || '—'}</span> {c?.name ?? '(đã xóa)'} ×{it.qty}
                  <span className="muted"> · tồn {c?.quantity ?? 0}</span>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      {data.platforms.length > 0 ? (
        <section className="pd-section">
          <h3>Giá bán theo sàn</h3>
          <div className="platform-grid">
            {data.platforms.map((pf) => {
              const tiers = product.salePrices?.[pf.id] ?? []
              return (
                <div className="platform-card" key={pf.id}>
                  <div className="platform-name">{pf.name}</div>
                  {tiers.length === 0 ? (
                    <span className="muted small">Chưa có giá</span>
                  ) : (
                    tiers.map((t) => (
                      <div className="tier-line" key={t.qty}>
                        <span>
                          {t.qty} {unit}
                        </span>
                        <strong>{formatMoney(t.price)}</strong>
                      </div>
                    ))
                  )}
                </div>
              )
            })}
          </div>
        </section>
      ) : null}

      {slips.length > 0 ? (
        <section className="pd-section">
          <h3>Chứng từ</h3>
          <div className="detail-images">
            {slips.map((i) => (
              <button type="button" key={i.label} onClick={() => setZoom(i)}>
                <img src={i.src} alt={i.label} />
                <span>{i.label}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="pd-section">
        <h3>Biến động gần đây</h3>
        {recent.length === 0 ? (
          <p className="pd-empty">Chưa có biến động</p>
        ) : (
          <div className="table-wrap">
            <table className="stock-table mini-table">
              <thead>
                <tr>
                  <th>Thời gian</th>
                  <th>Phiếu</th>
                  <th>Loại</th>
                  <th className="col-num">Trước</th>
                  <th className="col-num">Sau</th>
                  <th className="col-num">Đổi</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((m) => {
                  const d = movementDelta(m)
                  return (
                    <tr key={m.id}>
                      <td>{formatDateTime(m.createdAt)}</td>
                      <td>{m.code}</td>
                      <td>{DOC_LABEL[m.docType ?? (m.type === 'set' ? 'set' : m.type)]}</td>
                      <td className="col-num">{m.before}</td>
                      <td className="col-num">{m.after}</td>
                      <td className={`col-num ${d >= 0 ? 'delta-up' : 'delta-down'}`}>
                        {d > 0 ? '+' : ''}
                        {d}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {zoom ? <ImageZoom src={zoom.src} label={zoom.label} onClose={() => setZoom(null)} /> : null}
    </Modal>
  )
}

function ImageZoom({ src, label, onClose }: { src: string; label: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // data-top-modal: Esc chỉ đóng ảnh, không đóng luôn popup bên dưới.
  return createPortal(
    <div className="image-zoom" data-top-modal="" onClick={onClose} role="dialog" aria-label={label}>
      <img src={src} alt={label} />
      <span>{label} · bấm để đóng</span>
    </div>,
    document.body,
  )
}
