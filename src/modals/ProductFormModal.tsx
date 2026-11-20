import { useMemo, useRef, useState } from 'react'
import { isCombo } from '../domain/combos'
import { applyDocument, nextSku, skuMatch } from '../domain/documents'
import { localDateKey, parseMoneyInput, parseQtyInput, uid } from '../domain/format'
import { readImageAsDataUrl } from '../domain/image'
import { toIsoDateOnly } from '../excel'
import { useApp } from '../store/context'
import { Modal } from '../ui/Modal'
import { ProductPicker } from '../ui/ProductPicker'
import {
  DEFAULT_TIER_QTYS,
  type AppData,
  type ComboItem,
  type PriceTier,
  type Product,
} from '../types'

type TierState = { key: string; qty: string; price: string }
type ImageField = 'image' | 'deliverySlipImage' | 'signedSlipImage'

type Props = {
  product?: Product | null
  onClose: () => void
}

function tiersFor(product: Product | null | undefined, platformId: string): TierState[] {
  const existing = product?.salePrices?.[platformId]
  if (existing && existing.length > 0) {
    return existing.map((t) => ({ key: uid(), qty: String(t.qty), price: String(t.price) }))
  }
  return DEFAULT_TIER_QTYS.map((q) => ({ key: uid(), qty: String(q), price: '' }))
}

export function ProductFormModal({ product, onClose }: Props) {
  const { data, update, replaceAll, toast, confirm } = useApp()
  const editing = Boolean(product)

  const [sku, setSku] = useState(product?.sku ?? '')
  const [name, setName] = useState(product?.name ?? '')
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? '')
  const [unit, setUnit] = useState(product?.unit ?? '')
  const [price, setPrice] = useState(product?.unitPrice != null ? String(product.unitPrice) : '')
  const [initialQty, setInitialQty] = useState('')
  const [note, setNote] = useState(product?.note ?? '')
  const [deliveryDate, setDeliveryDate] = useState(toIsoDateOnly(product?.deliveryDate) ?? '')
  const [images, setImages] = useState<Record<ImageField, string | undefined>>({
    image: product?.image,
    deliverySlipImage: product?.deliverySlipImage,
    signedSlipImage: product?.signedSlipImage,
  })
  const [combo, setCombo] = useState(product ? isCombo(product) : false)
  const [comboItems, setComboItems] = useState<Array<{ productId: string; qty: string }>>(
    (product?.comboItems ?? []).map((c) => ({ productId: c.productId, qty: String(c.qty) })),
  )
  const [sales, setSales] = useState<Record<string, TierState[]>>(() =>
    Object.fromEntries(data.platforms.map((p) => [p.id, tiersFor(product, p.id)])),
  )
  const [newCategory, setNewCategory] = useState('')

  const imageRef = useRef<HTMLInputElement>(null)
  const imageFieldRef = useRef<ImageField>('image')

  const productById = useMemo(
    () => new Map(data.products.map((p) => [p.id, p])),
    [data.products],
  )

  function pickImage(field: ImageField) {
    imageFieldRef.current = field
    imageRef.current?.click()
  }

  async function onImageChange(file?: File | null) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast('Chỉ nhận file ảnh')
      return
    }
    try {
      const url = await readImageAsDataUrl(file, 900)
      const field = imageFieldRef.current
      setImages((prev) => ({ ...prev, [field]: url }))
    } catch {
      toast('Không đọc được ảnh')
    } finally {
      if (imageRef.current) imageRef.current.value = ''
    }
  }

  function addCategory() {
    const label = newCategory.trim()
    if (!label) return
    const dup = data.categories.find((c) => c.name.toLowerCase() === label.toLowerCase())
    if (dup) {
      setCategoryId(dup.id)
      setNewCategory('')
      return
    }
    const id = uid()
    update((d) => ({ ...d, categories: [...d.categories, { id, name: label }] }))
    setCategoryId(id)
    setNewCategory('')
    toast(`Đã tạo nhóm "${label}"`)
  }

  function patchTier(platformId: string, key: string, patch: Partial<TierState>) {
    setSales((prev) => ({
      ...prev,
      [platformId]: (prev[platformId] ?? []).map((t) => (t.key === key ? { ...t, ...patch } : t)),
    }))
  }

  function addTier(platformId: string) {
    setSales((prev) => ({
      ...prev,
      [platformId]: [...(prev[platformId] ?? []), { key: uid(), qty: '', price: '' }],
    }))
  }

  function removeTier(platformId: string, key: string) {
    setSales((prev) => ({
      ...prev,
      [platformId]: (prev[platformId] ?? []).filter((t) => t.key !== key),
    }))
  }

  function buildSalePrices(): Product['salePrices'] {
    const out: Record<string, PriceTier[]> = {}
    for (const [platformId, tiers] of Object.entries(sales)) {
      const clean = tiers
        .map((t) => ({ qty: parseQtyInput(t.qty), price: parseMoneyInput(t.price) ?? 0 }))
        .filter((t) => t.qty > 0 && t.price > 0)
        .sort((a, b) => a.qty - b.qty)
      if (clean.length > 0) out[platformId] = clean
    }
    return Object.keys(out).length > 0 ? out : undefined
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const cleanName = name.trim()
    if (!cleanName) {
      toast('Nhập tên sản phẩm')
      return
    }
    let cleanSku = sku.trim()
    if (!cleanSku && !editing) cleanSku = nextSku(data.products)
    if (cleanSku && data.products.some((p) => p.id !== product?.id && skuMatch(p.sku, cleanSku))) {
      toast(`SKU "${cleanSku}" đã tồn tại`)
      return
    }

    let items: ComboItem[] | undefined
    if (combo) {
      items = comboItems
        .map((c) => ({ productId: c.productId, qty: parseQtyInput(c.qty) }))
        .filter((c) => c.qty > 0)
      if (items.length === 0) {
        toast('Combo cần ít nhất 1 sản phẩm thành phần')
        return
      }
      if (product && items.some((c) => c.productId === product.id)) {
        toast('Combo không thể chứa chính nó')
        return
      }
      const nested = items
        .map((c) => productById.get(c.productId))
        .find((p) => p && isCombo(p))
      if (nested) {
        toast(`"${nested.name}" đã là combo, không bỏ combo vào trong combo được`)
        return
      }
      if (product && !isCombo(product)) {
        // Chuyển SP thường thành combo: combo không có tồn riêng.
        if (product.quantity > 0) {
          toast(
            `"${product.name}" còn tồn ${product.quantity}. Đặt tồn về 0 (để có lịch sử) rồi mới chuyển thành combo.`,
          )
          return
        }
        const usedIn = data.products.find((p) => p.comboItems?.some((c) => c.productId === product.id))
        if (usedIn) {
          toast(`"${product.name}" đang là thành phần của combo "${usedIn.name}", không chuyển thành combo được`)
          return
        }
      }
    }

    const now = new Date().toISOString()
    const fields = {
      sku: cleanSku || undefined,
      name: cleanName,
      unit: unit.trim() || undefined,
      unitPrice: parseMoneyInput(price),
      categoryId: categoryId || undefined,
      salePrices: buildSalePrices(),
      comboItems: items,
      note: note.trim() || undefined,
      deliveryDate: toIsoDateOnly(deliveryDate),
      image: images.image,
      deliverySlipImage: images.deliverySlipImage,
      signedSlipImage: images.signedSlipImage,
    }

    if (product) {
      const ok = await confirm({
        title: 'Xác nhận sửa sản phẩm',
        message: (
          <p>
            Lưu thay đổi cho <strong>{product.name}</strong>?
          </p>
        ),
        confirmLabel: 'Lưu thay đổi',
      })
      if (!ok) return
      update((d: AppData) => ({
        ...d,
        products: d.products.map((p) =>
          p.id === product.id
            ? { ...p, ...fields, updatedAt: now }
            : p,
        ),
      }))
      toast('Đã cập nhật sản phẩm')
      onClose()
      return
    }

    const created: Product = {
      id: uid(),
      quantity: 0,
      createdAt: now,
      updatedAt: now,
      ...fields,
    }
    let next: AppData = { ...data, products: [created, ...data.products] }
    const qty = parseQtyInput(initialQty)
    if (!combo && qty > 0) {
      next = applyDocument(next, {
        type: 'in',
        date: localDateKey(),
        reason: 'Tồn đầu kỳ',
        lines: [
          {
            productId: created.id,
            name: created.name,
            quantity: qty,
            unitPrice: created.unitPrice,
          },
        ],
      }).data
    }
    replaceAll(next)
    toast(`Đã thêm "${cleanName}"`)
    onClose()
  }

  return (
    <Modal
      title={editing ? 'Sửa sản phẩm' : 'Thêm sản phẩm'}
      onClose={onClose}
      wide
      sub={editing ? 'Muốn đổi tồn, dùng nút Đặt tồn trong chi tiết sản phẩm.' : undefined}
      footer={
        <>
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            Hủy
          </button>
          <button className="btn btn-primary" type="submit" form="product-form">
            {editing ? 'Lưu thay đổi' : 'Thêm sản phẩm'}
          </button>
        </>
      }
    >
      <form id="product-form" className="form" onSubmit={(e) => void submit(e)}>
        <div className="field-row-2">
          <div className="field">
            <label>Mã SKU</label>
            <div className="inline-field">
              <input
                value={sku}
                placeholder={editing ? 'Chưa có SKU' : 'Để trống = tự tạo'}
                onChange={(e) => setSku(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setSku(nextSku(data.products))}
              >
                Tự tạo
              </button>
            </div>
          </div>
          <div className="field">
            <label>Tên sản phẩm *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>

        <div className="field-row-2">
          <div className="field">
            <label>Nhóm hàng</label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">— Chưa phân nhóm —</option>
              {data.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Tạo nhóm mới</label>
            <div className="inline-field">
              <input
                value={newCategory}
                placeholder="vd Găng tay nylon"
                onChange={(e) => setNewCategory(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addCategory()
                  }
                }}
              />
              <button type="button" className="btn btn-ghost btn-sm" onClick={addCategory}>
                Thêm
              </button>
            </div>
          </div>
        </div>

        <div className="field-row-2">
          <div className="field">
            <label>Đơn vị</label>
            <input value={unit} placeholder="ĐÔI, CÁI..." onChange={(e) => setUnit(e.target.value)} />
          </div>
          <div className="field">
            <label>Giá nhập (VND)</label>
            <input
              inputMode="numeric"
              value={price}
              placeholder="0"
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>
          {!editing && !combo ? (
            <div className="field">
              <label>Tồn ban đầu</label>
              <input
                inputMode="numeric"
                value={initialQty}
                placeholder="0"
                onChange={(e) => setInitialQty(e.target.value)}
              />
            </div>
          ) : null}
        </div>

        <div className="form-section">
          <label className="check-row">
            <input type="checkbox" checked={combo} onChange={(e) => setCombo(e.target.checked)} />
            <span>Đây là combo (bán combo sẽ trừ tồn các SP thành phần)</span>
          </label>
          {combo ? (
            <div className="combo-box">
              <ProductPicker
                products={data.products}
                filter={(p) => !isCombo(p) && p.id !== product?.id}
                placeholder="Thêm SP thành phần (gõ SKU / tên)..."
                onPick={(p) =>
                  setComboItems((prev) =>
                    prev.some((c) => c.productId === p.id)
                      ? prev
                      : [...prev, { productId: p.id, qty: '1' }],
                  )
                }
              />
              {comboItems.map((c) => {
                const p = productById.get(c.productId)
                return (
                  <div className="combo-row" key={c.productId}>
                    <span className="muted">{p?.sku || '—'}</span>
                    <span className="combo-name">{p?.name ?? '(đã xóa)'}</span>
                    <span className="muted">×</span>
                    <input
                      className="cell-input cell-num"
                      inputMode="numeric"
                      value={c.qty}
                      onChange={(e) =>
                        setComboItems((prev) =>
                          prev.map((x) =>
                            x.productId === c.productId ? { ...x, qty: e.target.value } : x,
                          ),
                        )
                      }
                    />
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() =>
                        setComboItems((prev) => prev.filter((x) => x.productId !== c.productId))
                      }
                    >
                      ✕
                    </button>
                  </div>
                )
              })}
            </div>
          ) : null}
        </div>

        <div className="form-section">
          <strong className="section-title">Giá bán theo sàn</strong>
          <span className="hint">
            Ngoài danh sách chỉ hiện giá mốc 1. Tự thêm / sửa các mốc số lượng (6, 12, 24...).
          </span>
          <div className="platform-grid">
            {data.platforms.map((pf) => (
              <div className="platform-card" key={pf.id}>
                <div className="platform-name">{pf.name}</div>
                {(sales[pf.id] ?? []).map((t) => (
                  <div className="tier-row" key={t.key}>
                    <input
                      className="cell-input cell-small"
                      inputMode="numeric"
                      value={t.qty}
                      placeholder="SL"
                      onChange={(e) => patchTier(pf.id, t.key, { qty: e.target.value })}
                    />
                    <span className="muted">{unit.trim() || 'đơn vị'} =</span>
                    <input
                      className="cell-input cell-num"
                      inputMode="numeric"
                      value={t.price}
                      placeholder="Giá bán"
                      onChange={(e) => patchTier(pf.id, t.key, { price: e.target.value })}
                    />
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => removeTier(pf.id, t.key)}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => addTier(pf.id)}
                >
                  + Thêm mốc
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="field-row-2">
          <div className="field">
            <label>Ngày giao (báo cáo BHLĐ)</label>
            <input
              type="date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Ghi chú</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        <input
          ref={imageRef}
          className="hidden-input"
          type="file"
          accept="image/*"
          onChange={(e) => void onImageChange(e.target.files?.[0])}
        />
        <div className="media-grid">
          {(
            [
              ['image', 'Ảnh sản phẩm'],
              ['deliverySlipImage', 'Ảnh phiếu giao hàng'],
              ['signedSlipImage', 'Ảnh phiếu giao đã ký'],
            ] as Array<[ImageField, string]>
          ).map(([field, label]) => (
            <div className={`media-card${images[field] ? ' has-image' : ''}`} key={field}>
              <button type="button" className="media-preview" onClick={() => pickImage(field)}>
                {images[field] ? (
                  <img src={images[field]} alt={label} />
                ) : (
                  <span className="media-empty">
                    <em>＋</em>
                    {label}
                  </span>
                )}
              </button>
              {images[field] ? (
                <div className="media-actions">
                  <button type="button" onClick={() => pickImage(field)}>
                    Đổi ảnh
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => setImages((prev) => ({ ...prev, [field]: undefined }))}
                  >
                    Xóa
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </form>
    </Modal>
  )
}
