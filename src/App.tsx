import { useEffect, useMemo, useRef, useState } from 'react'
import {
  downloadExcelTemplate,
  exportMovementsToExcel,
  exportProductsToExcel,
  parseProductsFromExcel,
  toIsoDateOnly,
} from './excel'
import {
  buildBackup,
  downloadBackupJson,
  getStorageLocationNote,
  loadMovements,
  loadProducts,
  readBackupFile,
  saveMovements,
  saveProducts,
} from './storage'
import {
  activateApp,
  getActivationStatus,
  isDevTestUi,
} from './activation'
import { APP_LOGO_SRC, APP_NAME, APP_TAGLINE } from './brand'
import { applyStockChange } from './stock'
import { createSampleData } from './seed'
import { applyTheme, loadTheme, saveTheme, THEMES, type ThemeId } from './theme'
import type { MovementType, Product, StockMovement } from './types'
import { REASON_PRESETS } from './types'

type Tab = 'stock' | 'history'
type SortKey = 'updated' | 'name' | 'qty-asc' | 'qty-desc'
type ViewMode = 'grid' | 'list'

type ProductImageField = 'image' | 'deliverySlipImage' | 'signedSlipImage'

type ProductForm = {
  name: string
  quantity: string
  unit: string
  unitPrice: string
  deliveryDate: string
  note: string
  image?: string
  deliverySlipImage?: string
  signedSlipImage?: string
  mode: 'in' | 'set'
  reason: string
  customReason: string
}

type AdjustForm = {
  productId: string
  type: MovementType
  quantity: string
  reason: string
  customReason: string
  note: string
  deliveryDate: string
}

const emptyProductForm: ProductForm = {
  name: '',
  quantity: '0',
  unit: '',
  unitPrice: '',
  deliveryDate: '',
  note: '',
  image: undefined,
  deliverySlipImage: undefined,
  signedSlipImage: undefined,
  mode: 'in',
  reason: 'Nhập hàng',
  customReason: '',
}

function parseUnitPriceInput(value: string): number | undefined {
  const cleaned = value.replace(/[^\d.,]/g, '').replace(',', '.')
  if (!cleaned) return undefined
  const n = Number(cleaned)
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : undefined
}

function readImageAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Không đọc được ảnh'))
    reader.readAsDataURL(file)
  })
}

function isExcelFile(file: File) {
  const name = file.name.toLowerCase()
  return (
    name.endsWith('.xlsx') ||
    name.endsWith('.xls') ||
    name.endsWith('.csv') ||
    file.type.includes('sheet') ||
    file.type.includes('excel') ||
    file.type === 'text/csv'
  )
}

function typeLabel(type: MovementType) {
  if (type === 'in') return 'Nhập (+)'
  if (type === 'out') return 'Xuất (−)'
  return 'Đặt tồn'
}

export default function App() {
  const [products, setProducts] = useState<Product[]>(() => loadProducts())
  const [movements, setMovements] = useState<StockMovement[]>(() => loadMovements())
  const [theme, setTheme] = useState<ThemeId>(() => loadTheme())
  const [tab, setTab] = useState<Tab>('stock')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('updated')
  const [view, setView] = useState<ViewMode>('list')
  const [toast, setToast] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  const [openCreate, setOpenCreate] = useState(false)
  const [productForm, setProductForm] = useState<ProductForm>(emptyProductForm)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)

  const [adjusting, setAdjusting] = useState<Product | null>(null)
  const [adjustForm, setAdjustForm] = useState<AdjustForm>({
    productId: '',
    type: 'in',
    quantity: '0',
    reason: 'Nhập hàng',
    customReason: '',
    note: '',
    deliveryDate: '',
  })

  const [historyQuery, setHistoryQuery] = useState('')
  const [historyReason, setHistoryReason] = useState('all')
  const [historyType, setHistoryType] = useState<'all' | MovementType>('all')
  const [historyDateFrom, setHistoryDateFrom] = useState('')
  const [historyDateTo, setHistoryDateTo] = useState('')
  const [activationReady, setActivationReady] = useState(false)
  const [activated, setActivated] = useState(false)
  const [activationKey, setActivationKey] = useState('')
  const [activationError, setActivationError] = useState<string | null>(null)
  const [activating, setActivating] = useState(false)

  const excelRef = useRef<HTMLInputElement>(null)
  const backupRef = useRef<HTMLInputElement>(null)
  const imageRef = useRef<HTMLInputElement>(null)
  const imageFieldRef = useRef<ProductImageField>('image')
  const dragDepth = useRef(0)

  useEffect(() => {
    saveProducts(products)
  }, [products])

  useEffect(() => {
    saveMovements(movements)
  }, [movements])

  useEffect(() => {
    applyTheme(theme)
    saveTheme(theme)
  }, [theme])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 2800)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    let cancelled = false
    void getActivationStatus().then((status) => {
      if (cancelled) return
      setActivated(status.activated)
      setActivationReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const filteredProducts = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = products
    if (q) {
      list = products.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.note ?? '').toLowerCase().includes(q) ||
          (p.unit ?? '').toLowerCase().includes(q),
      )
    }
    const sorted = [...list]
    sorted.sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name, 'vi')
      if (sort === 'qty-asc') return a.quantity - b.quantity
      if (sort === 'qty-desc') return b.quantity - a.quantity
      return b.updatedAt.localeCompare(a.updatedAt)
    })
    return sorted
  }, [products, query, sort])

  const filteredMovements = useMemo(() => {
    const q = historyQuery.trim().toLowerCase()
    return movements.filter((m) => {
      if (historyType !== 'all' && m.type !== historyType) return false
      if (historyReason !== 'all' && m.reason !== historyReason) return false

      const day = m.createdAt.slice(0, 10)
      if (historyDateFrom && day < historyDateFrom) return false
      if (historyDateTo && day > historyDateTo) return false

      if (!q) return true
      return (
        m.code.toLowerCase().includes(q) ||
        m.productName.toLowerCase().includes(q) ||
        m.reason.toLowerCase().includes(q) ||
        (m.note ?? '').toLowerCase().includes(q)
      )
    })
  }, [
    movements,
    historyQuery,
    historyReason,
    historyType,
    historyDateFrom,
    historyDateTo,
  ])

  const totalQty = products.reduce((sum, p) => sum + p.quantity, 0)
  const lowStock = products.filter((p) => p.quantity <= 5).length

  function showToast(message: string) {
    setToast(message)
  }

  function changeTheme(next: ThemeId) {
    setTheme(next)
    showToast(
      next === 'light' ? 'Theme trắng' : next === 'dark' ? 'Theme đen' : 'Theme hồng',
    )
  }

  function openCreateModal() {
    setEditingProduct(null)
    setProductForm(emptyProductForm)
    setOpenCreate(true)
  }

  function loadSampleData() {
    if (products.length > 0) {
      const ok = window.confirm('Đã có dữ liệu. Nạp mẫu sẽ ghi đè tồn + lịch sử hiện tại. Tiếp tục?')
      if (!ok) return
    }
    const sample = createSampleData()
    setProducts(sample.products)
    setMovements(sample.movements)
    showToast(`Đã nạp mẫu: ${sample.products.length} SP · ${sample.movements.length} phiếu`)
  }

  async function handleActivateSubmit(e: React.FormEvent) {
    e.preventDefault()
    setActivationError(null)
    setActivating(true)
    try {
      const result = await activateApp(activationKey)
      if (!result.ok) {
        setActivationError(result.error ?? 'Kích hoạt thất bại')
        return
      }
      setActivated(true)
      setActivationKey('')
      showToast('Đã kích hoạt XiaoxinStock')
    } finally {
      setActivating(false)
    }
  }

  async function exportFullBackup() {
    try {
      const backup = buildBackup(products, movements, theme)
      const result = await downloadBackupJson(backup)
      if (result === 'cancelled') {
        showToast('Đã hủy lưu backup')
        return
      }
      showToast(
        `Đã lưu backup: ${products.length} SP · ${movements.length} phiếu`,
      )
    } catch {
      showToast('Không lưu được backup')
    }
  }

  async function handleBackupImport(file?: File | null) {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.json')) {
      showToast('Chọn file backup .json')
      return
    }
    try {
      const backup = await readBackupFile(file)
      const ok = window.confirm(
        `Khôi phục backup?\n` +
          `• ${backup.products.length} sản phẩm\n` +
          `• ${backup.movements.length} phiếu lịch sử\n` +
          `• Xuất lúc: ${new Date(backup.exportedAt).toLocaleString('vi-VN')}\n\n` +
          `Dữ liệu hiện tại sẽ bị GHI ĐÈ hoàn toàn.`,
      )
      if (!ok) return
      setProducts(backup.products)
      setMovements(backup.movements)
      if (backup.theme === 'light' || backup.theme === 'dark' || backup.theme === 'pink') {
        setTheme(backup.theme)
      }
      showToast(
        `Đã khôi phục: ${backup.products.length} SP · ${backup.movements.length} phiếu`,
      )
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Không đọc được file backup')
    } finally {
      if (backupRef.current) backupRef.current.value = ''
    }
  }

  function openEditInfo(product: Product) {
    setEditingProduct(product)
    setProductForm({
      name: product.name,
      quantity: String(product.quantity),
      unit: product.unit ?? '',
      unitPrice: product.unitPrice != null ? String(product.unitPrice) : '',
      deliveryDate: toIsoDateOnly(product.deliveryDate) ?? '',
      note: product.note ?? '',
      image: product.image,
      deliverySlipImage: product.deliverySlipImage,
      signedSlipImage: product.signedSlipImage,
      mode: 'set',
      reason: 'Kiểm kê điều chỉnh',
      customReason: '',
    })
    setOpenCreate(true)
  }

  function openAdjust(product: Product, type: MovementType = 'in') {
    setAdjusting(product)
    setAdjustForm({
      productId: product.id,
      type,
      quantity: type === 'set' ? String(product.quantity) : '0',
      reason:
        type === 'in' ? 'Nhập hàng' : type === 'out' ? 'Bán hàng / xuất TMĐT' : 'Kiểm kê điều chỉnh',
      customReason: '',
      note: '',
      deliveryDate: toIsoDateOnly(product.deliveryDate) ?? new Date().toISOString().slice(0, 10),
    })
  }

  function resolveReason(reason: string, customReason: string): string | null {
    if (reason !== 'Khác') return reason
    const custom = customReason.trim()
    if (!custom) return null
    return custom
  }

  function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault()
    const name = productForm.name.trim()
    if (!name) {
      showToast('Nhập tên sản phẩm giúp anh nha')
      return
    }
    const quantity = Math.max(0, Math.floor(Number(productForm.quantity) || 0))

    const unitPrice = parseUnitPriceInput(productForm.unitPrice)
    const deliveryDate = toIsoDateOnly(productForm.deliveryDate)

    if (editingProduct) {
      const now = new Date().toISOString()
      setProducts((prev) =>
        prev.map((p) =>
          p.id === editingProduct.id
            ? {
                ...p,
                name,
                unit: productForm.unit.trim() || p.unit,
                unitPrice,
                deliveryDate,
                note: productForm.note.trim() || undefined,
                image: productForm.image,
                deliverySlipImage: productForm.deliverySlipImage,
                signedSlipImage: productForm.signedSlipImage,
                updatedAt: now,
              }
            : p,
        ),
      )
      setOpenCreate(false)
      showToast('Đã cập nhật thông tin SP')
      return
    }

    const reason = resolveReason(productForm.reason, productForm.customReason)
    if (!reason) {
      showToast('Chọn Khác thì phải nhập lý do cụ thể')
      return
    }

    const result = applyStockChange({
      products,
      movements,
      name,
      type: productForm.mode === 'in' ? 'in' : 'set',
      quantity,
      reason,
      note: productForm.note.trim() || undefined,
      unit: productForm.unit.trim() || undefined,
      unitPrice,
      image: productForm.image,
      deliveryDate,
      deliverySlipImage: productForm.deliverySlipImage,
      signedSlipImage: productForm.signedSlipImage,
    })
    setProducts(result.products)
    setMovements(result.movements)
    setOpenCreate(false)
    showToast(
      productForm.mode === 'in'
        ? `Nhập hàng ${result.movement.code} · tồn ${result.movement.after}`
        : `Đặt tồn ${result.movement.code} · tồn ${result.movement.after}`,
    )
  }

  function handleAdjustSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!adjusting) return
    const quantity = Math.max(0, Math.floor(Number(adjustForm.quantity) || 0))
    if (adjustForm.type !== 'set' && quantity <= 0) {
      showToast('Nhập số lượng lớn hơn 0')
      return
    }
    const reason = resolveReason(adjustForm.reason, adjustForm.customReason)
    if (!reason) {
      showToast('Chọn Khác thì phải nhập lý do cụ thể')
      return
    }
    const deliveryDate =
      adjustForm.type === 'out' ? toIsoDateOnly(adjustForm.deliveryDate) : undefined

    const result = applyStockChange({
      products,
      movements,
      productId: adjusting.id,
      name: adjusting.name,
      type: adjustForm.type,
      quantity,
      reason,
      note: adjustForm.note.trim() || undefined,
      unit: adjusting.unit,
      image: adjusting.image,
      deliveryDate,
    })
    setProducts(result.products)
    setMovements(result.movements)
    setAdjusting(null)
    showToast(`${result.movement.code}: ${typeLabel(result.movement.type)} → tồn ${result.movement.after}`)
  }

  function removeProduct(id: string) {
    const target = products.find((p) => p.id === id)
    if (!target) return
    if (!window.confirm(`Xóa "${target.name}" khỏi danh sách? Lịch sử vẫn giữ.`)) return
    setProducts((prev) => prev.filter((p) => p.id !== id))
    showToast('Đã xóa sản phẩm')
  }

  function pickProductImage(field: ProductImageField) {
    imageFieldRef.current = field
    imageRef.current?.click()
  }

  async function handleImageChange(file?: File | null) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      showToast('Chỉ nhận file ảnh')
      return
    }
    if (file.size > 2.5 * 1024 * 1024) {
      showToast('Ảnh dưới 2.5MB giúp anh')
      return
    }
    const dataUrl = await readImageAsDataUrl(file)
    const field = imageFieldRef.current
    setProductForm((prev) => ({ ...prev, [field]: dataUrl }))
  }

  async function handleExcelImport(file?: File | null) {
    if (!file) return
    try {
      const buffer = await file.arrayBuffer()
      const rows = parseProductsFromExcel(buffer)
      if (rows.length === 0) {
        showToast('Không đọc được sản phẩm từ Excel')
        return
      }

      let nextProducts = products
      let nextMovements = movements
      let addedQty = 0
      let touched = 0

      for (const row of rows) {
        const deliveryDate = toIsoDateOnly(row.date)
        const result = applyStockChange({
          products: nextProducts,
          movements: nextMovements,
          name: row.name,
          type: 'in',
          quantity: row.quantity,
          reason: 'Nhập hàng',
          note: row.date ? `Excel ngày ${row.date}` : 'Nhập từ Excel BHLD',
          unit: row.unit,
          unitPrice: row.unitPrice,
          deliveryDate,
        })
        nextProducts = result.products
        nextMovements = result.movements
        addedQty += row.quantity
        touched += 1
      }

      setProducts(nextProducts)
      setMovements(nextMovements)
      showToast(`Nhập Excel: ${touched} dòng · cộng +${addedQty} vào tồn`)
    } catch {
      showToast('Không đọc được file Excel')
    } finally {
      if (excelRef.current) excelRef.current.value = ''
    }
  }

  function onDragEnter(e: React.DragEvent) {
    e.preventDefault()
    dragDepth.current += 1
    if (e.dataTransfer.types.includes('Files')) setDragging(true)
  }

  function onDragLeave(e: React.DragEvent) {
    e.preventDefault()
    dragDepth.current -= 1
    if (dragDepth.current <= 0) {
      dragDepth.current = 0
      setDragging(false)
    }
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault()
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    if (!isExcelFile(file)) {
      showToast('Kéo file Excel (.xlsx / .xls / .csv)')
      return
    }
    void handleExcelImport(file)
  }

  if (!activationReady) {
    return (
      <div className="lock-screen">
        <div className="lock-card">
          <img className="lock-logo" src={APP_LOGO_SRC} alt={APP_NAME} />
          <h1>{APP_NAME}</h1>
          <p>Đang kiểm tra giấy phép...</p>
        </div>
      </div>
    )
  }

  if (!activated) {
    return (
      <div className="lock-screen">
        <form className="lock-card" onSubmit={(e) => void handleActivateSubmit(e)}>
          <img className="lock-logo" src={APP_LOGO_SRC} alt={APP_NAME} />
          <h1>{APP_NAME}</h1>
          <p>Nhập mã kích hoạt do bạn được cấp</p>
          <input
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={activationKey}
            onChange={(e) => setActivationKey(e.target.value)}
            placeholder="Nhập mã kích hoạt"
            disabled={activating}
            autoFocus
          />
          {activationError ? <p className="lock-error">{activationError}</p> : null}
          <button
            className="btn btn-primary"
            type="submit"
            disabled={activating}
          >
            {activating ? 'Đang kích hoạt...' : 'Kích hoạt'}
          </button>
        </form>
      </div>
    )
  }

  return (
    <div
      className={`app-frame${dragging ? ' dragging' : ''}`}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <aside className="sidebar">
        <div className="brand-block">
          <img className="brand-logo" src={APP_LOGO_SRC} alt="" />
          <div className="brand-copy">
            <strong>{APP_NAME}</strong>
            <span>{APP_TAGLINE}</span>
          </div>
        </div>

        <nav className="side-nav">
          <button
            type="button"
            className={tab === 'stock' ? 'active' : ''}
            onClick={() => setTab('stock')}
          >
            <span className="nav-ico">▣</span>
            Tồn kho
          </button>
          <button
            type="button"
            className={tab === 'history' ? 'active' : ''}
            onClick={() => setTab('history')}
          >
            <span className="nav-ico">◷</span>
            Lịch sử
            <span style={{ marginLeft: 'auto', opacity: 0.7 }}>{movements.length}</span>
          </button>
        </nav>

        <div className="side-footer">
          <div className="theme-block">
            <span>Theme</span>
            <div className="theme-switcher" role="group" aria-label="Đổi theme">
              {THEMES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`theme-btn${theme === item.id ? ' active' : ''}`}
                  onClick={() => changeTheme(item.id)}
                >
                  <span className="theme-swatch" aria-hidden>
                    <span style={{ background: item.swatch[0] }} />
                    <span style={{ background: item.swatch[1] }} />
                  </span>
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          {isDevTestUi() ? (
            <p className="storage-note" title={getStorageLocationNote()}>
              Chế độ dev · dữ liệu localStorage · Nạp mẫu chỉ hiện ở đây
            </p>
          ) : (
            <p className="storage-note">
              Nên xuất backup JSON định kỳ để phòng mất dữ liệu
            </p>
          )}
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => void exportFullBackup()}
          >
            Xuất backup toàn bộ
          </button>
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => backupRef.current?.click()}
          >
            Khôi phục backup
          </button>
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => void downloadExcelTemplate()}
          >
            Tải mẫu Excel
          </button>
          <button className="btn btn-ghost" type="button" onClick={() => excelRef.current?.click()}>
            Nhập Excel
          </button>
          {isDevTestUi() ? (
            <button className="btn btn-ghost" type="button" onClick={loadSampleData}>
              Nạp mẫu
            </button>
          ) : null}
          <button className="btn btn-primary" type="button" onClick={openCreateModal}>
            + Thêm / nhập
          </button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="page-title">
            <h1>{tab === 'stock' ? 'Tồn kho' : 'Lịch sử'}</h1>
            <p>
              {tab === 'stock'
                ? 'Nhập cộng dồn · xuất trừ kho · mỗi phiếu có mã'
                : 'Theo dõi mọi lần chỉnh tồn theo thời gian'}
            </p>
          </div>
          <div className="top-actions">
            <div className="theme-switcher-inline" role="group" aria-label="Đổi theme">
              {THEMES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`theme-dot${theme === item.id ? ' active' : ''}`}
                  title={item.label}
                  aria-label={item.label}
                  onClick={() => changeTheme(item.id)}
                >
                  <span
                    style={{
                      background: `linear-gradient(135deg, ${item.swatch[0]} 50%, ${item.swatch[1]} 50%)`,
                    }}
                  />
                </button>
              ))}
            </div>
            {tab === 'stock' ? (
              <>
                <button
                  className="btn btn-ghost btn-hide-mobile"
                  type="button"
                  onClick={() => {
                    if (products.length === 0) {
                      showToast('Chưa có tồn để xuất')
                      return
                    }
                    void exportProductsToExcel(products, movements).then(() => {
                      showToast('Đã xuất báo cáo BHLD')
                    })
                  }}
                >
                  Xuất báo cáo
                </button>
                <button
                  className="btn btn-primary btn-hide-mobile"
                  type="button"
                  onClick={openCreateModal}
                >
                  + Thêm
                </button>
              </>
            ) : (
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => {
                  if (movements.length === 0) {
                    showToast('Chưa có lịch sử')
                    return
                  }
                  void exportMovementsToExcel(filteredMovements).then(() => {
                    showToast('Đã xuất lịch sử')
                  })
                }}
              >
                Xuất lịch sử
              </button>
            )}
          </div>
        </header>

        <section className="stats">
          <div className="stat">
            <span>Sản phẩm</span>
            <strong>{products.length}</strong>
          </div>
          <div className="stat">
            <span>Tổng tồn</span>
            <strong>{totalQty}</strong>
          </div>
          <div className={`stat${lowStock > 0 ? ' warn' : ''}`}>
            <span>Sắp hết</span>
            <strong>{lowStock}</strong>
          </div>
        </section>

        {tab === 'stock' ? (
          <>
            <div className="toolbar">
              <div className="search-wrap">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                  <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <input
                  className="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Tìm sản phẩm..."
                />
              </div>
              <select
                className="select"
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                aria-label="Sắp xếp"
              >
                <option value="updated">Mới cập nhật</option>
                <option value="name">Tên A–Z</option>
                <option value="qty-asc">Tồn tăng</option>
                <option value="qty-desc">Tồn giảm</option>
              </select>
              <div className="segment" role="group" aria-label="Kiểu xem">
                <button
                  type="button"
                  className={view === 'grid' ? 'active' : ''}
                  onClick={() => setView('grid')}
                >
                  Lưới
                </button>
                <button
                  type="button"
                  className={view === 'list' ? 'active' : ''}
                  onClick={() => setView('list')}
                >
                  List
                </button>
              </div>
            </div>

            {filteredProducts.length === 0 ? (
              <div className="empty">
                <div className="empty-ico">＋</div>
                <h3>Chưa có tồn kho</h3>
                <p>
                  {isDevTestUi()
                    ? 'Chế độ dev. Có thể nạp mẫu, nhập Excel, hoặc thêm tay.'
                    : 'Chưa có sản phẩm. Thêm tay, nhập Excel, hoặc khôi phục backup.'}
                </p>
                <div className="empty-actions">
                  {isDevTestUi() ? (
                    <button className="btn btn-primary" type="button" onClick={loadSampleData}>
                      Nạp dữ liệu mẫu
                    </button>
                  ) : null}
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => backupRef.current?.click()}
                  >
                    Khôi phục backup
                  </button>
                  <button className="btn btn-ghost" type="button" onClick={openCreateModal}>
                    + Thêm / nhập
                  </button>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => excelRef.current?.click()}
                  >
                    Nhập Excel
                  </button>
                </div>
              </div>
            ) : view === 'list' ? (
              <div className="table-wrap">
                <table className="stock-table">
                  <thead>
                    <tr>
                      <th className="col-img">Ảnh</th>
                      <th>Tên sản phẩm</th>
                      <th className="col-num">Tồn</th>
                      <th className="col-unit">Đơn vị</th>
                      <th className="col-num">Đơn giá</th>
                      <th className="col-actions">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map((product) => (
                      <tr key={product.id}>
                        <td className="col-img">
                          <div className="table-thumb">
                            {product.image ? (
                              <img src={product.image} alt="" />
                            ) : (
                              <span>—</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <div className="table-name">
                            {product.name}
                            {product.quantity <= 5 ? (
                              <span className="badge inline">Sắp hết</span>
                            ) : null}
                          </div>
                        </td>
                        <td className="col-num table-qty">{product.quantity}</td>
                        <td className="col-unit">{product.unit ?? '—'}</td>
                        <td className="col-num">
                          {product.unitPrice
                            ? `${product.unitPrice.toLocaleString('vi-VN')}đ`
                            : '—'}
                        </td>
                        <td className="col-actions">
                          <div className="table-actions">
                            <button
                              className="btn btn-primary btn-sm"
                              type="button"
                              onClick={() => openAdjust(product, 'in')}
                            >
                              + Nhập
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              type="button"
                              onClick={() => openAdjust(product, 'out')}
                            >
                              − Xuất
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              type="button"
                              onClick={() => openAdjust(product, 'set')}
                            >
                              Đặt
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              type="button"
                              onClick={() => openEditInfo(product)}
                            >
                              Sửa
                            </button>
                            <button
                              className="btn btn-danger btn-sm"
                              type="button"
                              onClick={() => removeProduct(product.id)}
                            >
                              Xóa
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <section className="grid">
                {filteredProducts.map((product) => (
                  <article className="card" key={product.id}>
                    <div className="thumb">
                      {product.quantity <= 5 ? <span className="badge">Sắp hết</span> : null}
                      {product.image ? (
                        <img src={product.image} alt={product.name} />
                      ) : (
                        <span>No image</span>
                      )}
                    </div>
                    <div className="card-body">
                      <h3 className="card-title">{product.name}</h3>
                      <div className="stock-line">
                        <div className="qty">
                          {product.quantity}
                          {product.unit ? (
                            <span style={{ fontSize: '0.7rem', marginLeft: 4, opacity: 0.75 }}>
                              {product.unit}
                            </span>
                          ) : null}
                        </div>
                        <div className="meta">
                          {product.unitPrice
                            ? `${product.unitPrice.toLocaleString('vi-VN')}đ`
                            : 'Chưa có giá'}
                        </div>
                      </div>
                      <div className="quick-actions">
                        <button
                          className="btn btn-primary btn-sm"
                          type="button"
                          onClick={() => openAdjust(product, 'in')}
                        >
                          + Nhập
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          type="button"
                          onClick={() => openAdjust(product, 'out')}
                        >
                          − Xuất
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          type="button"
                          onClick={() => openAdjust(product, 'set')}
                        >
                          Đặt
                        </button>
                      </div>
                      <div className="card-actions">
                        <button
                          className="btn btn-ghost"
                          type="button"
                          onClick={() => openEditInfo(product)}
                        >
                          Sửa
                        </button>
                        <button
                          className="btn btn-danger"
                          type="button"
                          onClick={() => removeProduct(product.id)}
                        >
                          Xóa
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </section>
            )}
          </>
        ) : (
          <>
            <div className="toolbar toolbar-history">
              <div className="search-wrap">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                  <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <input
                  className="search"
                  value={historyQuery}
                  onChange={(e) => setHistoryQuery(e.target.value)}
                  placeholder="Tìm mã phiếu, SP, lý do..."
                />
              </div>
              <select
                className="select"
                value={historyType}
                onChange={(e) => setHistoryType(e.target.value as 'all' | MovementType)}
                aria-label="Lọc loại phiếu"
              >
                <option value="all">Tất cả loại</option>
                <option value="in">Nhập (+)</option>
                <option value="out">Xuất (−)</option>
                <option value="set">Đặt tồn</option>
              </select>
              <label className="date-filter">
                <span>Từ</span>
                <input
                  type="date"
                  className="select"
                  value={historyDateFrom}
                  onChange={(e) => setHistoryDateFrom(e.target.value)}
                  aria-label="Từ ngày"
                />
              </label>
              <label className="date-filter">
                <span>Đến</span>
                <input
                  type="date"
                  className="select"
                  value={historyDateTo}
                  onChange={(e) => setHistoryDateTo(e.target.value)}
                  aria-label="Đến ngày"
                />
              </label>
              <select
                className="select"
                value={historyReason}
                onChange={(e) => setHistoryReason(e.target.value)}
                aria-label="Lọc lý do"
              >
                <option value="all">Tất cả lý do</option>
                {REASON_PRESETS.map((reason) => (
                  <option key={reason} value={reason}>
                    {reason}
                  </option>
                ))}
              </select>
              {historyDateFrom || historyDateTo || historyType !== 'all' || historyReason !== 'all' ? (
                <button
                  className="btn btn-ghost btn-sm"
                  type="button"
                  onClick={() => {
                    setHistoryType('all')
                    setHistoryReason('all')
                    setHistoryDateFrom('')
                    setHistoryDateTo('')
                  }}
                >
                  Xóa lọc
                </button>
              ) : null}
            </div>

            <div className="history">
              {filteredMovements.length === 0 ? (
                <div className="empty">
                  <div className="empty-ico">◷</div>
                  <h3>Chưa có lịch sử</h3>
                  <p>Mỗi lần nhập / xuất / đặt tồn sẽ hiện ở đây kèm mã phiếu.</p>
                </div>
              ) : (
                filteredMovements.map((m) => (
                  <article className="history-row" key={m.id}>
                    <div className="history-code">
                      <strong>{m.code}</strong>
                      <span className={`pill pill-${m.type}`}>{typeLabel(m.type)}</span>
                    </div>
                    <div className="history-main">
                      <h4>{m.productName}</h4>
                      <p>
                        {m.reason}
                        {m.note ? ` · ${m.note}` : ''}
                      </p>
                    </div>
                    <div className="history-qty">
                      <strong>
                        {m.type === 'out' ? '−' : m.type === 'in' ? '+' : '='}
                        {m.quantity}
                      </strong>
                      <span>
                        {m.before} → {m.after}
                      </span>
                    </div>
                    <time dateTime={m.createdAt}>
                      {new Date(m.createdAt).toLocaleString('vi-VN')}
                    </time>
                  </article>
                ))
              )}
            </div>
          </>
        )}
      </main>

      <nav className="mobile-nav">
        <button
          type="button"
          className={tab === 'stock' ? 'active' : ''}
          onClick={() => setTab('stock')}
        >
          <span>▣</span>
          Tồn kho
        </button>
        <button
          type="button"
          className={tab === 'history' ? 'active' : ''}
          onClick={() => setTab('history')}
        >
          <span>◷</span>
          Lịch sử
        </button>
      </nav>

      <button className="fab" type="button" aria-label="Thêm" onClick={openCreateModal}>
        +
      </button>

      <input
        ref={excelRef}
        className="hidden-input"
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={(e) => void handleExcelImport(e.target.files?.[0])}
      />
      <input
        ref={backupRef}
        className="hidden-input"
        type="file"
        accept=".json,application/json"
        onChange={(e) => void handleBackupImport(e.target.files?.[0])}
      />

      {openCreate ? (
        <div className="modal-backdrop" onClick={() => setOpenCreate(false)}>
          <div
            className="modal modal-wide"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-handle" />
            <div className="modal-head">
              <h2>{editingProduct ? 'Sửa thông tin SP' : 'Thêm / nhập hàng'}</h2>
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => setOpenCreate(false)}>
                Đóng
              </button>
            </div>
            <form className="form form-wide" onSubmit={handleCreateSubmit}>
              <div className="form-main">
                <div className="field">
                  <label htmlFor="name">Tên sản phẩm</label>
                  <input
                    id="name"
                    value={productForm.name}
                    onChange={(e) => setProductForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder="VD: Găng tay da hàn dài"
                    autoFocus
                  />
                </div>

                {!editingProduct ? (
                  <>
                    <div className="field">
                      <label>Cách nhập số lượng</label>
                      <div className="segment full">
                        <button
                          type="button"
                          className={productForm.mode === 'in' ? 'active' : ''}
                          onClick={() =>
                            setProductForm((p) => ({ ...p, mode: 'in', reason: 'Nhập hàng' }))
                          }
                        >
                          Cộng thêm
                        </button>
                        <button
                          type="button"
                          className={productForm.mode === 'set' ? 'active' : ''}
                          onClick={() =>
                            setProductForm((p) => ({
                              ...p,
                              mode: 'set',
                              reason: 'Kiểm kê điều chỉnh',
                            }))
                          }
                        >
                          Đặt tồn
                        </button>
                      </div>
                    </div>

                    <div className="field-row field-row-2">
                      <div className="field">
                        <label htmlFor="quantity">Số lượng</label>
                        <input
                          id="quantity"
                          type="number"
                          min={0}
                          value={productForm.quantity}
                          onChange={(e) => setProductForm((p) => ({ ...p, quantity: e.target.value }))}
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="unit">Đơn vị</label>
                        <input
                          id="unit"
                          value={productForm.unit}
                          onChange={(e) => setProductForm((p) => ({ ...p, unit: e.target.value }))}
                          placeholder="ĐÔI / CÁI..."
                        />
                      </div>
                    </div>

                    <div className="field">
                      <label htmlFor="reason">Lý do</label>
                      <select
                        id="reason"
                        value={productForm.reason}
                        onChange={(e) =>
                          setProductForm((p) => ({
                            ...p,
                            reason: e.target.value,
                            customReason: e.target.value === 'Khác' ? p.customReason : '',
                          }))
                        }
                      >
                        {REASON_PRESETS.map((reason) => (
                          <option key={reason} value={reason}>
                            {reason}
                          </option>
                        ))}
                      </select>
                    </div>

                    {productForm.reason === 'Khác' ? (
                      <div className="field">
                        <label htmlFor="custom-reason">Lý do cụ thể *</label>
                        <input
                          id="custom-reason"
                          value={productForm.customReason}
                          onChange={(e) =>
                            setProductForm((p) => ({ ...p, customReason: e.target.value }))
                          }
                          placeholder="Nhập lý do..."
                          required
                          autoFocus
                        />
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="field">
                    <label htmlFor="unit">Đơn vị</label>
                    <input
                      id="unit"
                      value={productForm.unit}
                      onChange={(e) => setProductForm((p) => ({ ...p, unit: e.target.value }))}
                      placeholder="ĐÔI / CÁI / CUỘN..."
                    />
                  </div>
                )}

                <div className="field-row field-row-2">
                  <div className="field">
                    <label htmlFor="unit-price">Đơn giá (VND)</label>
                    <input
                      id="unit-price"
                      type="number"
                      min={0}
                      step={100}
                      value={productForm.unitPrice}
                      onChange={(e) => setProductForm((p) => ({ ...p, unitPrice: e.target.value }))}
                      placeholder="VD: 7500"
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="delivery-date">Ngày giao (báo cáo BHLD)</label>
                    <input
                      id="delivery-date"
                      type="date"
                      value={productForm.deliveryDate}
                      onChange={(e) =>
                        setProductForm((p) => ({ ...p, deliveryDate: e.target.value }))
                      }
                    />
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="note">Ghi chú</label>
                  <textarea
                    id="note"
                    rows={2}
                    value={productForm.note}
                    onChange={(e) => setProductForm((p) => ({ ...p, note: e.target.value }))}
                  />
                </div>
              </div>

              <div className="media-section">
                <div className="media-section-head">
                  <strong>Hình ảnh</strong>
                  <span>SP · phiếu giao · phiếu đã ký (xuất Excel cột ảnh)</span>
                </div>
                <div className="media-grid">
                  {(
                    [
                      ['image', 'Sản phẩm', productForm.image],
                      ['deliverySlipImage', 'Phiếu giao', productForm.deliverySlipImage],
                      ['signedSlipImage', 'Đã ký', productForm.signedSlipImage],
                    ] as const
                  ).map(([field, label, src]) => (
                    <div className={`media-card${src ? ' has-image' : ''}`} key={field}>
                      <button
                        type="button"
                        className="media-preview"
                        onClick={() => pickProductImage(field)}
                        aria-label={`Chọn ảnh ${label}`}
                      >
                        {src ? (
                          <img src={src} alt="" />
                        ) : (
                          <span className="media-empty">
                            <em>+</em>
                            Thêm ảnh
                          </span>
                        )}
                      </button>
                      <div className="media-meta">
                        <span>{label}</span>
                        <div className="media-actions">
                          <button type="button" onClick={() => pickProductImage(field)}>
                            {src ? 'Đổi' : 'Chọn'}
                          </button>
                          {src ? (
                            <button
                              type="button"
                              className="danger"
                              onClick={() =>
                                setProductForm((p) => ({ ...p, [field]: undefined }))
                              }
                            >
                              Xóa
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <input
                  ref={imageRef}
                  className="hidden-input"
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    void handleImageChange(e.target.files?.[0])
                    e.target.value = ''
                  }}
                />
              </div>

              <div className="modal-actions form-footer">
                <button className="btn btn-ghost" type="button" onClick={() => setOpenCreate(false)}>
                  Huỷ
                </button>
                <button className="btn btn-primary" type="submit">
                  {editingProduct ? 'Lưu' : 'Xác nhận'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {adjusting ? (
        <div className="modal-backdrop" onClick={() => setAdjusting(null)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="modal-handle" />
            <h2>Điều chỉnh tồn</h2>
            <p className="modal-sub">
              <strong>{adjusting.name}</strong> · đang có {adjusting.quantity}
              {adjusting.unit ? ` ${adjusting.unit}` : ''}
            </p>
            <form className="form" onSubmit={handleAdjustSubmit}>
              <div className="field">
                <label>Loại phiếu</label>
                <div className="segment full">
                  <button
                    type="button"
                    className={adjustForm.type === 'in' ? 'active' : ''}
                    onClick={() =>
                      setAdjustForm((f) => ({ ...f, type: 'in', reason: 'Nhập hàng' }))
                    }
                  >
                    + Nhập thêm
                  </button>
                  <button
                    type="button"
                    className={adjustForm.type === 'out' ? 'active' : ''}
                    onClick={() =>
                      setAdjustForm((f) => ({
                        ...f,
                        type: 'out',
                        reason: 'Bán hàng / xuất TMĐT',
                      }))
                    }
                  >
                    − Xuất / trừ
                  </button>
                  <button
                    type="button"
                    className={adjustForm.type === 'set' ? 'active' : ''}
                    onClick={() =>
                      setAdjustForm((f) => ({
                        ...f,
                        type: 'set',
                        reason: 'Kiểm kê điều chỉnh',
                        quantity: String(adjusting.quantity),
                      }))
                    }
                  >
                    = Đặt tồn
                  </button>
                </div>
              </div>

              <div className="field">
                <label htmlFor="adj-qty">
                  {adjustForm.type === 'set' ? 'Tồn mới' : 'Số lượng thay đổi'}
                </label>
                <input
                  id="adj-qty"
                  type="number"
                  min={0}
                  value={adjustForm.quantity}
                  onChange={(e) => setAdjustForm((f) => ({ ...f, quantity: e.target.value }))}
                  autoFocus
                />
                {adjustForm.type !== 'set' ? (
                  <small className="hint">
                    Dự kiến sau chỉnh:{' '}
                    <strong>
                      {adjustForm.type === 'in'
                        ? adjusting.quantity + Math.max(0, Math.floor(Number(adjustForm.quantity) || 0))
                        : Math.max(
                            0,
                            adjusting.quantity - Math.max(0, Math.floor(Number(adjustForm.quantity) || 0)),
                          )}
                    </strong>
                  </small>
                ) : null}
              </div>

              {adjustForm.type === 'out' ? (
                <div className="field">
                  <label htmlFor="adj-delivery-date">Ngày giao (báo cáo BHLD)</label>
                  <input
                    id="adj-delivery-date"
                    type="date"
                    value={adjustForm.deliveryDate}
                    onChange={(e) =>
                      setAdjustForm((f) => ({ ...f, deliveryDate: e.target.value }))
                    }
                  />
                  <small className="hint">
                    Ảnh phiếu giao / đã ký gắn ở Sửa thông tin SP.
                  </small>
                </div>
              ) : null}

              <div className="field">
                <label htmlFor="adj-reason">Lý do</label>
                <select
                  id="adj-reason"
                  value={adjustForm.reason}
                  onChange={(e) =>
                    setAdjustForm((f) => ({
                      ...f,
                      reason: e.target.value,
                      customReason: e.target.value === 'Khác' ? f.customReason : '',
                    }))
                  }
                >
                  {REASON_PRESETS.map((reason) => (
                    <option key={reason} value={reason}>
                      {reason}
                    </option>
                  ))}
                </select>
              </div>

              {adjustForm.reason === 'Khác' ? (
                <div className="field">
                  <label htmlFor="adj-custom">Lý do cụ thể *</label>
                  <input
                    id="adj-custom"
                    value={adjustForm.customReason}
                    onChange={(e) => setAdjustForm((f) => ({ ...f, customReason: e.target.value }))}
                    placeholder="Nhập lý do..."
                    required
                    autoFocus
                  />
                </div>
              ) : null}

              <div className="field">
                <label htmlFor="adj-note">Ghi chú thêm</label>
                <textarea
                  id="adj-note"
                  rows={2}
                  value={adjustForm.note}
                  onChange={(e) => setAdjustForm((f) => ({ ...f, note: e.target.value }))}
                  placeholder="VD: lấy mẫu quay video livestream"
                />
              </div>

              <div className="modal-actions">
                <button className="btn btn-ghost" type="button" onClick={() => setAdjusting(null)}>
                  Huỷ
                </button>
                <button className="btn btn-primary" type="submit">
                  Lưu phiếu
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  )
}
