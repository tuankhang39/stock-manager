import { useMemo, useRef, useState } from 'react'
import { comboAvailable, isCombo } from '../domain/combos'
import { applyDocument, type DocLineInput } from '../domain/documents'
import {
  formatMoney,
  formatNumber,
  localDateKey,
  parseMoneyInput,
  parseQtyInput,
  uid,
} from '../domain/format'
import { readImageAsDataUrl } from '../domain/image'
import { useApp, type DocFormInit } from '../store/context'
import { Modal } from '../ui/Modal'
import { ProductPicker } from '../ui/ProductPicker'
import { DOC_LABEL, OUT_REASON_PRESETS, SET_REASON_PRESETS, type Product } from '../types'

type LineState = {
  key: string
  productId?: string
  sku: string
  name: string
  unit: string
  qty: string
  price: string
}

type Props = {
  init: DocFormInit
  onClose: () => void
}

export function DocumentFormModal({ init, onClose }: Props) {
  const { data, replaceAll, toast, confirm } = useApp()
  const type = init.type
  const showPrice = type === 'in'

  const [date, setDate] = useState(localDateKey())
  const presets =
    type === 'out' ? OUT_REASON_PRESETS : type === 'set' ? SET_REASON_PRESETS : null
  const [reasonPreset, setReasonPreset] = useState<string>(init.reason ?? presets?.[0] ?? '')
  const [customReason, setCustomReason] = useState('')
  const [note, setNote] = useState('')
  const [vat, setVat] = useState('0')
  const [image, setImage] = useState<string | undefined>()
  const [submitting, setSubmitting] = useState(false)
  const imageRef = useRef<HTMLInputElement>(null)

  const [lines, setLines] = useState<LineState[]>(() =>
    (init.lines ?? []).flatMap((l) => {
      const p = data.products.find((x) => x.id === l.productId)
      if (!p) return []
      return [
        {
          key: uid(),
          productId: p.id,
          sku: p.sku ?? '',
          name: p.name,
          unit: p.unit ?? '',
          qty:
            type === 'set'
              ? String(p.quantity)
              : l.quantity != null
                ? String(l.quantity)
                : '',
          price: p.unitPrice != null && showPrice ? String(p.unitPrice) : '',
        },
      ]
    }),
  )

  const productById = useMemo(
    () => new Map(data.products.map((p) => [p.id, p])),
    [data.products],
  )

  function addProduct(productId: string) {
    const p = productById.get(productId)
    if (!p) return
    const existing = lines.find((l) => l.productId === p.id)
    if (existing) {
      if (type === 'set') {
        toast('SP này đã có trong phiếu')
        return
      }
      setLines((prev) =>
        prev.map((l) =>
          l.key === existing.key ? { ...l, qty: String(parseQtyInput(l.qty) + 1) } : l,
        ),
      )
      return
    }
    setLines((prev) => [
      ...prev,
      {
        key: uid(),
        productId: p.id,
        sku: p.sku ?? '',
        name: p.name,
        unit: p.unit ?? '',
        qty: type === 'set' ? String(p.quantity) : '1',
        price: p.unitPrice != null && showPrice ? String(p.unitPrice) : '',
      },
    ])
  }

  function addNew(text: string) {
    setLines((prev) => [
      ...prev,
      { key: uid(), sku: '', name: text, unit: '', qty: '1', price: '' },
    ])
  }

  function addAllProducts() {
    setLines((prev) => {
      const have = new Set(prev.map((l) => l.productId))
      const extra = data.products
        .filter((p) => !isCombo(p) && !have.has(p.id))
        .map<LineState>((p) => ({
          key: uid(),
          productId: p.id,
          sku: p.sku ?? '',
          name: p.name,
          unit: p.unit ?? '',
          qty: String(p.quantity),
          price: '',
        }))
      return [...prev, ...extra]
    })
  }

  function patchLine(key: string, patch: Partial<LineState>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key))
  }

  async function onImageChange(file?: File | null) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast('Chỉ nhận file ảnh')
      return
    }
    try {
      setImage(await readImageAsDataUrl(file, 1600))
    } catch {
      toast('Không đọc được ảnh')
    } finally {
      if (imageRef.current) imageRef.current.value = ''
    }
  }

  const totals = useMemo(() => {
    const qty = lines.reduce((s, l) => s + parseQtyInput(l.qty), 0)
    const subtotal = lines.reduce(
      (s, l) => s + parseQtyInput(l.qty) * (parseMoneyInput(l.price) ?? 0),
      0,
    )
    const rate = Math.max(0, Number(vat.replace(',', '.')) || 0)
    const vatAmount = Math.round((subtotal * rate) / 100)
    return { qty, subtotal, rate, vatAmount, total: subtotal + vatAmount }
  }, [lines, vat])

  function resolveReason(): string | null {
    if (type === 'in') return 'Nhập hàng'
    if (type === 'return') return 'Khách trả hàng'
    if (reasonPreset === 'Khác') {
      const c = customReason.trim()
      return c || null
    }
    return reasonPreset || null
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    if (lines.length === 0) {
      toast('Thêm ít nhất 1 sản phẩm vào phiếu')
      return
    }
    const reason = resolveReason()
    if (!reason) {
      toast('Chọn Khác thì phải nhập nội dung cụ thể')
      return
    }

    const input: DocLineInput[] = []
    const overs: string[] = []
    for (const l of lines) {
      const p = l.productId ? productById.get(l.productId) : undefined
      if (!l.productId && !l.name.trim()) {
        toast('Có dòng SP mới chưa nhập tên')
        return
      }
      if (type === 'set' && l.qty.trim() === '') {
        toast(`Nhập tồn mới cho "${l.name}"`)
        return
      }
      const qty = parseQtyInput(l.qty)
      if (type !== 'set' && qty <= 0) {
        toast(`Số lượng "${l.name}" phải lớn hơn 0`)
        return
      }
      if (type === 'out' && p) {
        const avail = isCombo(p) ? comboAvailable(p, data.products) : p.quantity
        if (qty > avail) overs.push(`${p.name} (cần ${qty}, tồn ${avail})`)
      }
      input.push({
        productId: l.productId,
        sku: l.sku || undefined,
        name: l.name,
        unit: l.unit || undefined,
        quantity: qty,
        unitPrice: showPrice ? parseMoneyInput(l.price) : undefined,
        deliveryDate: type === 'out' ? date : undefined,
      })
    }

    if (overs.length > 0) {
      const ok = await confirm({
        title: 'Số lượng vượt tồn',
        message: (
          <>
            <p>Các SP sau vượt tồn hiện có, tồn sẽ về 0:</p>
            <ul className="confirm-list">
              {overs.map((o) => (
                <li key={o}>{o}</li>
              ))}
            </ul>
          </>
        ),
        confirmLabel: 'Vẫn lập phiếu',
        danger: true,
      })
      if (!ok) return
    }

    if (type === 'set') {
      const ok = await confirm({
        title: 'Xác nhận đặt tồn',
        message: (
          <>
            <p>Đặt lại tồn cho {lines.length} sản phẩm:</p>
            <ul className="confirm-list">
              {lines.slice(0, 12).map((l) => {
                const p = l.productId ? productById.get(l.productId) : undefined
                return (
                  <li key={l.key}>
                    {l.name}: {p ? p.quantity : 0} → <strong>{parseQtyInput(l.qty)}</strong>
                  </li>
                )
              })}
              {lines.length > 12 ? <li>... và {lines.length - 12} SP khác</li> : null}
            </ul>
          </>
        ),
        confirmLabel: 'Đặt tồn',
      })
      if (!ok) return
    }

    setSubmitting(true)
    try {
      const result = applyDocument(data, {
        type,
        date,
        reason,
        note: note.trim() || undefined,
        vatRate: showPrice ? totals.rate : undefined,
        image,
        lines: input,
      })
      replaceAll(result.data)
      toast(`Đã lập phiếu ${result.doc.code} · ${result.doc.lines.length} dòng`)
      onClose()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Không lập được phiếu')
    } finally {
      setSubmitting(false)
    }
  }

  const pickerFilter = (p: Product) => (type === 'out' ? true : !isCombo(p))

  return (
    <Modal
      title={`Phiếu ${DOC_LABEL[type].toLowerCase()}`}
      sub={
        type === 'set'
          ? 'Nhập TỒN MỚI cho từng sản phẩm. Xóa phiếu sau này sẽ hoàn lại tồn.'
          : type === 'out'
            ? 'Combo sẽ tự trừ tồn các sản phẩm thành phần.'
            : type === 'return'
              ? 'Khách đặt rồi trả lại / hàng hoàn về: tồn kho tăng.'
              : 'Nhập nhiều sản phẩm cùng lúc; SP chưa có sẽ tự tạo và vào tồn kho.'
      }
      onClose={onClose}
      xwide
      footer={
        <>
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            Hủy
          </button>
          <button className="btn btn-primary" type="submit" form="doc-form" disabled={submitting}>
            Lưu phiếu
          </button>
        </>
      }
    >
      <form id="doc-form" className="doc-form" onSubmit={(e) => void submit(e)}>
        <div className="doc-head">
          <div className="field">
            <label>Ngày</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          {presets ? (
            <div className="field">
              <label>Nội dung</label>
              <select value={reasonPreset} onChange={(e) => setReasonPreset(e.target.value)}>
                {presets.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {presets && reasonPreset === 'Khác' ? (
            <div className="field">
              <label>Nội dung cụ thể</label>
              <input value={customReason} onChange={(e) => setCustomReason(e.target.value)} />
            </div>
          ) : null}
          {showPrice ? (
            <div className="field doc-vat">
              <label>VAT (%)</label>
              <input
                inputMode="decimal"
                value={vat}
                onChange={(e) => setVat(e.target.value)}
                placeholder="0"
              />
            </div>
          ) : null}
          <div className="field doc-note">
            <label>Ghi chú</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        <div className="doc-picker-row">
          <ProductPicker
            products={data.products}
            filter={pickerFilter}
            onPick={(p) => addProduct(p.id)}
            onCreate={type === 'in' ? addNew : undefined}
            autoFocus={lines.length === 0}
          />
          {type === 'set' ? (
            <button className="btn btn-ghost btn-sm" type="button" onClick={addAllProducts}>
              Thêm tất cả SP
            </button>
          ) : null}
        </div>

        <div className="table-wrap doc-table-wrap">
          <table className="stock-table doc-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Sản phẩm</th>
                <th>ĐVT</th>
                <th className="col-num">Tồn</th>
                <th className="col-num">{type === 'set' ? 'Tồn mới' : 'Số lượng'}</th>
                {showPrice ? <th className="col-num">Đơn giá</th> : null}
                {showPrice ? <th className="col-num">Thành tiền</th> : null}
                <th />
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const p = l.productId ? productById.get(l.productId) : undefined
                const combo = p ? isCombo(p) : false
                const stock = p ? (combo ? comboAvailable(p, data.products) : p.quantity) : 0
                const qty = parseQtyInput(l.qty)
                const price = parseMoneyInput(l.price) ?? 0
                const over = type === 'out' && p && qty > stock
                return (
                  <tr key={l.key}>
                    <td>
                      {p ? (
                        <span className="muted">{l.sku || '—'}</span>
                      ) : (
                        <input
                          className="cell-input"
                          value={l.sku}
                          placeholder="SKU"
                          onChange={(e) => patchLine(l.key, { sku: e.target.value })}
                        />
                      )}
                    </td>
                    <td>
                      {p ? (
                        <div className="table-name">
                          {l.name}
                          {combo ? <span className="badge inline">Combo</span> : null}
                        </div>
                      ) : (
                        <input
                          className="cell-input"
                          value={l.name}
                          placeholder="Tên SP mới"
                          onChange={(e) => patchLine(l.key, { name: e.target.value })}
                        />
                      )}
                      {!p ? <span className="badge inline new-badge">SP mới</span> : null}
                      {combo && p ? (
                        <div className="muted small">
                          Trừ:{' '}
                          {(p.comboItems ?? [])
                            .map((it) => {
                              const c = productById.get(it.productId)
                              return `${c?.name ?? '?'} ×${it.qty * Math.max(qty, 1)}`
                            })
                            .join(', ')}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      {p ? (
                        <span className="muted">{l.unit || '—'}</span>
                      ) : (
                        <input
                          className="cell-input cell-small"
                          value={l.unit}
                          placeholder="ĐVT"
                          onChange={(e) => patchLine(l.key, { unit: e.target.value })}
                        />
                      )}
                    </td>
                    <td className="col-num">{p ? formatNumber(stock) : 0}</td>
                    <td className="col-num">
                      <input
                        className={`cell-input cell-num${over ? ' cell-over' : ''}`}
                        inputMode="numeric"
                        value={l.qty}
                        onChange={(e) => patchLine(l.key, { qty: e.target.value })}
                      />
                      {over ? <div className="over-note">vượt tồn</div> : null}
                      {type === 'set' && p ? (
                        <div className="muted small">
                          {qty - p.quantity >= 0 ? '+' : ''}
                          {qty - p.quantity}
                        </div>
                      ) : null}
                    </td>
                    {showPrice ? (
                      <td className="col-num">
                        <input
                          className="cell-input cell-num"
                          inputMode="numeric"
                          value={l.price}
                          placeholder="0"
                          onChange={(e) => patchLine(l.key, { price: e.target.value })}
                        />
                      </td>
                    ) : null}
                    {showPrice ? <td className="col-num">{formatMoney(qty * price)}</td> : null}
                    <td>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => removeLine(l.key)}
                        aria-label="Bỏ dòng"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                )
              })}
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={showPrice ? 8 : 6} className="doc-empty">
                    Chưa có dòng nào — gõ SKU / tên ở ô phía trên để thêm.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="doc-foot">
          <div className="doc-image">
            <input
              ref={imageRef}
              className="hidden-input"
              type="file"
              accept="image/*"
              onChange={(e) => void onImageChange(e.target.files?.[0])}
            />
            {image ? (
              <div className="doc-image-preview">
                <img src={image} alt="Ảnh phiếu" />
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setImage(undefined)}
                >
                  Bỏ ảnh
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => imageRef.current?.click()}
              >
                + Đính ảnh phiếu {type === 'in' ? 'nhập hàng' : ''}
              </button>
            )}
          </div>
          <div className="doc-totals">
            <div>
              <span>Tổng số lượng</span>
              <strong>{formatNumber(totals.qty)}</strong>
            </div>
            {showPrice ? (
              <>
                <div>
                  <span>Tổng tiền (chưa VAT)</span>
                  <strong>{formatMoney(totals.subtotal)}</strong>
                </div>
                <div>
                  <span>VAT {totals.rate}%</span>
                  <strong>{formatMoney(totals.vatAmount)}</strong>
                </div>
                <div className="doc-grand">
                  <span>Tổng tiền (có VAT)</span>
                  <strong>{formatMoney(totals.total)}</strong>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </form>
    </Modal>
  )
}
