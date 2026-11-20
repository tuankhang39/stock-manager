import { useEffect, useRef, useState } from 'react'
import { nextSku } from '../domain/documents'
import { uid } from '../domain/format'
import { buildBackup, downloadBackupJson, loadBrowserData, readBackupFile } from '../storage'
import type { AppData } from '../types'
import { THEMES, type ThemeId } from '../theme'
import { useApp } from '../store/context'
import { ExcelButtons } from '../ui/ExcelButtons'

type Props = {
  theme: ThemeId
  onTheme: (t: ThemeId) => void
  onLoadSample?: () => void
}

export function SettingsPage({ theme, onTheme, onLoadSample }: Props) {
  const { data, update, restoreAll, toast, confirm } = useApp()
  const [newCategory, setNewCategory] = useState('')
  const [newPlatform, setNewPlatform] = useState('')
  const backupRef = useRef<HTMLInputElement>(null)
  const [browserData, setBrowserData] = useState<AppData | null>(null)

  // Dữ liệu bản cũ còn lưu trong trình duyệt này (trước khi chuyển sang PostgreSQL)
  useEffect(() => {
    let cancelled = false
    void loadBrowserData().then((d) => {
      if (!cancelled) setBrowserData(d)
    })
    return () => {
      cancelled = true
    }
  }, [])

  /* ---- Ngưỡng ---- */
  function setThreshold(value: string) {
    const n = Math.max(0, Math.floor(Number(value) || 0))
    update((d) => ({ ...d, settings: { ...d.settings, lowStockThreshold: n } }))
  }

  /* ---- Nhóm hàng ---- */
  function addCategory() {
    const label = newCategory.trim()
    if (!label) return
    if (data.categories.some((c) => c.name.toLowerCase() === label.toLowerCase())) {
      toast('Nhóm này đã có')
      return
    }
    update((d) => ({ ...d, categories: [...d.categories, { id: uid(), name: label }] }))
    setNewCategory('')
  }

  function renameCategory(id: string, name: string) {
    const label = name.trim()
    if (!label) return
    update((d) => ({
      ...d,
      categories: d.categories.map((c) => (c.id === id ? { ...c, name: label } : c)),
    }))
  }

  async function removeCategory(id: string) {
    const cat = data.categories.find((c) => c.id === id)
    if (!cat) return
    const count = data.products.filter((p) => p.categoryId === id).length
    const ok = await confirm({
      title: 'Xóa nhóm hàng?',
      message: (
        <p>
          Xóa nhóm <strong>{cat.name}</strong>? {count} sản phẩm trong nhóm sẽ thành “Chưa phân
          nhóm” (không bị xóa).
        </p>
      ),
      confirmLabel: 'Xóa nhóm',
      danger: true,
    })
    if (!ok) return
    update((d) => ({
      ...d,
      categories: d.categories.filter((c) => c.id !== id),
      products: d.products.map((p) => (p.categoryId === id ? { ...p, categoryId: undefined } : p)),
    }))
  }

  /* ---- Sàn bán ---- */
  function addPlatform() {
    const label = newPlatform.trim()
    if (!label) return
    if (data.platforms.some((p) => p.name.toLowerCase() === label.toLowerCase())) {
      toast('Sàn này đã có')
      return
    }
    update((d) => ({ ...d, platforms: [...d.platforms, { id: uid(), name: label }] }))
    setNewPlatform('')
  }

  function renamePlatform(id: string, name: string) {
    const label = name.trim()
    if (!label) return
    update((d) => ({
      ...d,
      platforms: d.platforms.map((p) => (p.id === id ? { ...p, name: label } : p)),
    }))
  }

  async function removePlatform(id: string) {
    const pf = data.platforms.find((p) => p.id === id)
    if (!pf) return
    if (data.platforms.length <= 1) {
      toast('Cần giữ ít nhất 1 sàn')
      return
    }
    const ok = await confirm({
      title: 'Xóa sàn bán?',
      message: (
        <p>
          Xóa sàn <strong>{pf.name}</strong> sẽ xóa luôn giá bán của sàn này trên mọi sản phẩm.
        </p>
      ),
      confirmLabel: 'Xóa sàn',
      danger: true,
    })
    if (!ok) return
    update((d) => ({
      ...d,
      platforms: d.platforms.filter((p) => p.id !== id),
      products: d.products.map((p) => {
        if (!p.salePrices?.[id]) return p
        const next = { ...p.salePrices }
        delete next[id]
        return { ...p, salePrices: Object.keys(next).length > 0 ? next : undefined }
      }),
    }))
  }

  /* ---- SKU tự động ---- */
  const missingSku = data.products.filter((p) => !p.sku).length

  async function fillSkus() {
    const ok = await confirm({
      title: 'Tạo SKU tự động?',
      message: <p>Gán SKU dạng SP0001, SP0002... cho {missingSku} sản phẩm chưa có SKU.</p>,
      confirmLabel: 'Tạo SKU',
    })
    if (!ok) return
    update((d) => {
      let products = d.products
      for (const target of d.products) {
        if (target.sku) continue
        const sku = nextSku(products)
        products = products.map((p) => (p.id === target.id ? { ...p, sku } : p))
      }
      return { ...d, products }
    })
    toast(`Đã tạo SKU cho ${missingSku} sản phẩm`)
  }

  /* ---- Backup ---- */
  async function exportBackup() {
    try {
      const result = await downloadBackupJson(buildBackup(data, theme))
      toast(
        result === 'cancelled'
          ? 'Đã hủy lưu backup'
          : `Đã lưu backup: ${data.products.length} SP · ${data.documents.length} phiếu · ${data.movements.length} dòng nhật ký`,
      )
    } catch {
      toast('Không lưu được backup')
    }
  }

  async function importBackup(file?: File | null) {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.json')) {
      toast('Chọn file backup .json')
      return
    }
    try {
      const backup = await readBackupFile(file)
      const ok = await confirm({
        title: 'Khôi phục backup?',
        message: (
          <>
            <ul className="confirm-list">
              <li>{backup.products.length} sản phẩm</li>
              <li>{backup.documents.length} phiếu</li>
              <li>{backup.movements.length} dòng nhật ký</li>
              <li>Xuất lúc: {new Date(backup.exportedAt).toLocaleString('vi-VN')}</li>
            </ul>
            <p className="over-note">Dữ liệu hiện tại sẽ bị GHI ĐÈ hoàn toàn.</p>
          </>
        ),
        confirmLabel: 'Khôi phục',
        danger: true,
      })
      if (!ok) return
      restoreAll({
        products: backup.products,
        movements: backup.movements,
        documents: backup.documents,
        categories: backup.categories,
        platforms: backup.platforms,
        settings: backup.settings,
      })
      if (backup.theme === 'light' || backup.theme === 'dark' || backup.theme === 'pink') {
        onTheme(backup.theme)
      }
      toast(`Đã khôi phục: ${backup.products.length} SP · ${backup.movements.length} dòng nhật ký`)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Không đọc được file backup')
    } finally {
      if (backupRef.current) backupRef.current.value = ''
    }
  }

  async function importBrowserData() {
    if (!browserData) return
    const ok = await confirm({
      title: 'Nạp dữ liệu cũ của trình duyệt này?',
      message: (
        <>
          <ul className="confirm-list">
            <li>{browserData.products.length} sản phẩm</li>
            <li>{browserData.documents.length} phiếu</li>
            <li>{browserData.movements.length} dòng nhật ký</li>
          </ul>
          <p className="over-note">Dữ liệu hiện tại trên server sẽ bị GHI ĐÈ hoàn toàn.</p>
        </>
      ),
      confirmLabel: 'Nạp lên server',
      danger: true,
    })
    if (!ok) return
    restoreAll(browserData)
    toast(`Đã nạp ${browserData.products.length} SP từ trình duyệt lên server`)
  }

  return (
    <>
      <header className="topbar">
        <div className="page-title">
          <h1>Cài đặt</h1>
          <p>Nhóm hàng, sàn bán, ngưỡng cảnh báo, dữ liệu và giao diện.</p>
        </div>
      </header>

      <div className="settings-grid">
        <section className="panel-block">
          <div className="panel-head">
            <h2>Ngưỡng tồn tối thiểu</h2>
          </div>
          <div className="field">
            <label>Cảnh báo đỏ khi tồn ≤</label>
            <input
              inputMode="numeric"
              value={data.settings.lowStockThreshold}
              onChange={(e) => setThreshold(e.target.value)}
            />
            <span className="hint">Mặc định 10. SP tồn ≤ ngưỡng sẽ hiện đỏ và nằm trong “Sắp hết”.</span>
          </div>
        </section>

        <section className="panel-block">
          <div className="panel-head">
            <h2>Nhóm hàng</h2>
          </div>
          <div className="inline-field">
            <input
              value={newCategory}
              placeholder="Tên nhóm mới, vd Găng tay nylon"
              onChange={(e) => setNewCategory(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addCategory()}
            />
            <button className="btn btn-primary btn-sm" type="button" onClick={addCategory}>
              Thêm nhóm
            </button>
          </div>
          <ul className="edit-list">
            {data.categories.map((c) => (
              <li key={c.id}>
                <input
                  key={c.name}
                  defaultValue={c.name}
                  onBlur={(e) => renameCategory(c.id, e.target.value)}
                />
                <span className="muted small">
                  {data.products.filter((p) => p.categoryId === c.id).length} SP
                </span>
                <button
                  className="btn btn-danger btn-sm"
                  type="button"
                  onClick={() => void removeCategory(c.id)}
                >
                  Xóa
                </button>
              </li>
            ))}
            {data.categories.length === 0 ? <li className="muted">Chưa có nhóm nào.</li> : null}
          </ul>
        </section>

        <section className="panel-block">
          <div className="panel-head">
            <h2>Sàn bán</h2>
          </div>
          <div className="inline-field">
            <input
              value={newPlatform}
              placeholder="Tên sàn mới, vd Lazada"
              onChange={(e) => setNewPlatform(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addPlatform()}
            />
            <button className="btn btn-primary btn-sm" type="button" onClick={addPlatform}>
              Thêm sàn
            </button>
          </div>
          <ul className="edit-list">
            {data.platforms.map((p) => (
              <li key={p.id}>
                <input
                  key={p.name}
                  defaultValue={p.name}
                  onBlur={(e) => renamePlatform(p.id, e.target.value)}
                />
                <button
                  className="btn btn-danger btn-sm"
                  type="button"
                  onClick={() => void removePlatform(p.id)}
                >
                  Xóa
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel-block settings-wide">
          <div className="panel-head">
            <h2>Dữ liệu</h2>
          </div>
          <input
            ref={backupRef}
            className="hidden-input"
            type="file"
            accept=".json,application/json"
            onChange={(e) => void importBackup(e.target.files?.[0])}
          />
          <div className="btn-row">
            <button className="btn btn-primary btn-sm" type="button" onClick={() => void exportBackup()}>
              Xuất backup toàn bộ
            </button>
            <button
              className="btn btn-ghost btn-sm"
              type="button"
              onClick={() => backupRef.current?.click()}
            >
              Khôi phục backup
            </button>
          </div>
          <div className="btn-row">
            <ExcelButtons />
          </div>
          {missingSku > 0 ? (
            <div className="btn-row">
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => void fillSkus()}>
                Tạo SKU tự động ({missingSku} SP chưa có)
              </button>
            </div>
          ) : null}
          {browserData ? (
            <div className="btn-row">
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => void importBrowserData()}>
                Nạp dữ liệu cũ của trình duyệt này ({browserData.products.length} SP)
              </button>
            </div>
          ) : null}
          {onLoadSample ? (
            <div className="btn-row">
              <button className="btn btn-ghost btn-sm" type="button" onClick={onLoadSample}>
                Nạp dữ liệu mẫu (dev)
              </button>
            </div>
          ) : null}
          <p className="hint">
            Dữ liệu lưu trên PostgreSQL. Vẫn nên xuất backup JSON định kỳ. Backup cũ (bản trước) vẫn khôi phục được.
          </p>
        </section>

        <section className="panel-block">
          <div className="panel-head">
            <h2>Giao diện</h2>
          </div>
          <div className="theme-switcher">
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`theme-btn${theme === t.id ? ' active' : ''}`}
                onClick={() => onTheme(t.id)}
              >
                <span
                  className="theme-swatch"
                  style={{ background: `linear-gradient(135deg, ${t.swatch[0]} 50%, ${t.swatch[1]} 50%)` }}
                />
                {t.label}
              </button>
            ))}
          </div>
          <span className="hint">Chỉ áp dụng cho trình duyệt này.</span>
        </section>
      </div>
    </>
  )
}
