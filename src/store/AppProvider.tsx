import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { APP_LOGO_SRC, APP_NAME } from '../brand'
import { comboAvailable, expandCombo, isCombo } from '../domain/combos'
import { applyDocument } from '../domain/documents'
import { localDateKey } from '../domain/format'
import { DocumentDetailModal } from '../modals/DocumentDetailModal'
import { DocumentFormModal } from '../modals/DocumentFormModal'
import { ProductDetailModal } from '../modals/ProductDetailModal'
import { ProductFormModal } from '../modals/ProductFormModal'
import { isBrowserDataMigrated, loadBrowserData, markBrowserDataMigrated } from '../storage'
import { api, ApiError } from '../sync/api'
import { SyncEngine, type SyncStatus } from '../sync/engine'
import { ConfirmDialog } from '../ui/Modal'
import { emptyData, type AppData, type Product } from '../types'
import {
  AppContext,
  type AppCtx,
  type ConfirmOptions,
  type DocFormInit,
} from './context'

type ConfirmState = { opts: ConfirmOptions; resolve: (ok: boolean) => void }

type Props = {
  children: ReactNode
  username: string
  /** Phiên hết hạn: hiện màn đăng nhập (giữ nguyên dữ liệu chưa lưu). */
  onUnauthorized: () => void
  onLoggedOut: () => void
  /** Tăng lên sau mỗi lần đăng nhập lại để tiếp tục lưu. */
  authEpoch: number
}

const CONFLICT_MSG =
  'Dữ liệu vừa được thay đổi ở máy khác nên đã tải lại. Thao tác vừa rồi chưa được lưu, vui lòng làm lại.'

export function AppProvider({ children, username, onUnauthorized, onLoggedOut, authEpoch }: Props) {
  const [data, setData] = useState<AppData>(() => emptyData())
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ state: 'saved' })
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)

  const [productId, setProductId] = useState<string | null>(null)
  const [productForm, setProductForm] = useState<{ product: Product | null } | null>(null)
  const [docForm, setDocForm] = useState<DocFormInit | null>(null)
  const [docDetailId, setDocDetailId] = useState<string | null>(null)

  /** Nguồn dữ liệu chính: cập nhật ngay khi thay đổi, không đợi React render. */
  const dataRef = useRef(data)
  const engineRef = useRef<SyncEngine | null>(null)
  const unauthorizedRef = useRef(onUnauthorized)
  unauthorizedRef.current = onUnauthorized

  const commit = useCallback((next: AppData) => {
    dataRef.current = next
    setData(next)
  }, [])

  const reloadFromServer = useCallback(
    async (message?: string) => {
      const engine = engineRef.current
      try {
        const res = await api.loadData()
        commit(res.data)
        engine?.reset(res.data, res.revision)
        if (message) setToastMsg(message)
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          unauthorizedRef.current()
          return
        }
        setToastMsg('Không tải lại được dữ liệu từ server, đang thử lại...')
        window.setTimeout(() => void reloadFromServer(message), 5000)
      }
    },
    [commit],
  )

  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    void (async () => {
      try {
        const res = await api.loadData()
        if (cancelled) return
        const engine = new SyncEngine(res.data, res.revision, {
          getData: () => dataRef.current,
          onStatus: setSyncStatus,
          onConflict: () => void reloadFromServer(CONFLICT_MSG),
          onUnauthorized: () => unauthorizedRef.current(),
        })
        engineRef.current = engine
        commit(res.data)
        setReady(true)

        // Lần đầu dùng PostgreSQL: đưa dữ liệu cũ trong trình duyệt lên server.
        if (res.revision === 0 && !isBrowserDataMigrated()) {
          const local = await loadBrowserData()
          if (cancelled || !local) return
          const saved = await api.replace(local)
          if (cancelled) return
          commit(local)
          engine.reset(local, saved.revision)
          markBrowserDataMigrated()
          setToastMsg(
            `Đã chuyển dữ liệu cũ lên PostgreSQL: ${local.products.length} SP · ${local.movements.length} dòng nhật ký`,
          )
        }
      } catch (err) {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 401) {
          unauthorizedRef.current()
          return
        }
        setLoadError(err instanceof Error ? err.message : 'Không tải được dữ liệu')
      }
    })()
    return () => {
      cancelled = true
      engineRef.current?.dispose()
      engineRef.current = null
    }
  }, [commit, reloadFromServer, loadAttempt])

  // Đăng nhập lại sau khi hết phiên: lưu tiếp phần còn dở.
  useEffect(() => {
    if (authEpoch > 0) engineRef.current?.resume()
  }, [authEpoch])

  // Còn dữ liệu chưa lưu xong thì trình duyệt hỏi lại trước khi đóng / tải lại trang.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const engine = engineRef.current
      if (!engine?.hasPending()) return
      void engine.flush()
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  // Máy khác vừa lưu: tải bản mới khi quay lại tab và định kỳ 20 giây.
  useEffect(() => {
    if (!ready) return
    let busy = false
    const check = async () => {
      const engine = engineRef.current
      if (busy || !engine || engine.hasPending() || document.visibilityState !== 'visible') return
      busy = true
      try {
        const { revision } = await api.revision()
        if (revision === engine.currentRevision) return
        const res = await api.loadData()
        // Người dùng vừa thao tác trong lúc tải: bỏ qua, lần lưu đó sẽ tự xử lý xung đột.
        if (engine.hasPending() || engineRef.current !== engine) return
        commit(res.data)
        engine.reset(res.data, res.revision)
      } catch {
        /* mất mạng tạm thời — lần sau thử lại */
      } finally {
        busy = false
      }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check()
    }
    const timer = window.setInterval(() => void check(), 20000)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [ready, commit])

  useEffect(() => {
    if (!toastMsg) return
    const t = window.setTimeout(() => setToastMsg(null), 4000)
    return () => window.clearTimeout(t)
  }, [toastMsg])

  const update = useCallback(
    (fn: (d: AppData) => AppData) => {
      commit(fn(dataRef.current))
      engineRef.current?.schedule()
    },
    [commit],
  )

  const replaceAll = useCallback(
    (next: AppData) => {
      commit(next)
      engineRef.current?.schedule()
    },
    [commit],
  )

  const restoreAll = useCallback(
    (next: AppData) => {
      commit(next)
      engineRef.current?.markReplace()
    },
    [commit],
  )

  const getData = useCallback(() => dataRef.current, [])

  const logout = useCallback(async () => {
    const engine = engineRef.current
    if (engine?.hasPending()) {
      setToastMsg('Đang lưu dữ liệu lên server, thử lại sau vài giây')
      void engine.flush()
      return
    }
    try {
      await api.logout()
    } catch {
      /* vẫn thoát ở phía trình duyệt */
    }
    onLoggedOut()
  }, [onLoggedOut])

  const toast = useCallback((message: string) => setToastMsg(message), [])

  const confirm = useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setConfirmState({ opts, resolve })
      }),
    [],
  )

  const sellCombo = useCallback(
    async (id: string, qty = 1) => {
      const current = dataRef.current
      const combo = current.products.find((p) => p.id === id)
      if (!combo || !isCombo(combo)) return
      const avail = comboAvailable(combo, current.products)
      if (avail < qty) {
        setToastMsg(`Không đủ tồn thành phần để bán ${qty} combo (còn ${avail})`)
        return
      }
      let parts: ReturnType<typeof expandCombo>
      try {
        parts = expandCombo(combo, qty, current.products)
      } catch (err) {
        setToastMsg(err instanceof Error ? err.message : 'Combo lỗi')
        return
      }
      const byId = new Map(current.products.map((p) => [p.id, p]))
      const ok = await confirm({
        title: `Bán ${qty} combo?`,
        message: (
          <>
            <p>
              <strong>{combo.name}</strong> — sẽ trừ tồn:
            </p>
            <ul className="confirm-list">
              {parts.map((p) => {
                const c = byId.get(p.productId)
                return (
                  <li key={p.productId}>
                    {c?.name}: {c?.quantity} → <strong>{(c?.quantity ?? 0) - p.quantity}</strong>
                  </li>
                )
              })}
            </ul>
          </>
        ),
        confirmLabel: `Bán ${qty} combo`,
      })
      if (!ok) return
      try {
        const result = applyDocument(dataRef.current, {
          type: 'out',
          date: localDateKey(),
          reason: 'Bán hàng / xuất TMĐT',
          note: `Bán combo ${combo.name}`,
          lines: [{ productId: combo.id, name: combo.name, quantity: qty }],
        })
        replaceAll(result.data)
        setToastMsg(`Đã bán ${qty} combo · phiếu ${result.doc.code}`)
      } catch (err) {
        setToastMsg(err instanceof Error ? err.message : 'Không bán được combo')
      }
    },
    [confirm, replaceAll],
  )

  const deleteProduct = useCallback(
    async (id: string) => {
      const current = dataRef.current
      const target = current.products.find((p) => p.id === id)
      if (!target) return false
      const usedIn = current.products.filter((p) =>
        p.comboItems?.some((c) => c.productId === id),
      )
      if (usedIn.length > 0) {
        setToastMsg(`"${target.name}" đang nằm trong combo ${usedIn[0].name}. Gỡ khỏi combo trước.`)
        return false
      }
      const ok = await confirm({
        title: 'Xóa sản phẩm?',
        message: (
          <p>
            Xóa <strong>{target.name}</strong> khỏi danh sách? Lịch sử và phiếu cũ vẫn được giữ.
          </p>
        ),
        confirmLabel: 'Xóa sản phẩm',
        danger: true,
      })
      if (!ok) return false
      update((d) => ({ ...d, products: d.products.filter((p) => p.id !== id) }))
      setToastMsg('Đã xóa sản phẩm')
      return true
    },
    [confirm, update],
  )

  const ctx = useMemo<AppCtx>(
    () => ({
      data,
      getData,
      update,
      replaceAll,
      restoreAll,
      syncStatus,
      username,
      logout,
      toast,
      confirm,
      openProduct: (id) => setProductId(id),
      openProductForm: (product) => setProductForm({ product: product ?? null }),
      openDocForm: (init) => setDocForm(init),
      openDocDetail: (id) => setDocDetailId(id),
      sellCombo,
      deleteProduct,
    }),
    [
      data,
      getData,
      update,
      replaceAll,
      restoreAll,
      syncStatus,
      username,
      logout,
      toast,
      confirm,
      sellCombo,
      deleteProduct,
    ],
  )

  if (!ready) {
    return (
      <div className="lock-screen">
        <div className="lock-card">
          <img className="lock-logo" src={APP_LOGO_SRC} alt={APP_NAME} />
          <h1>{APP_NAME}</h1>
          {loadError ? (
            <>
              <p className="lock-error">Không tải được dữ liệu: {loadError}</p>
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => setLoadAttempt((n) => n + 1)}
              >
                Thử lại
              </button>
            </>
          ) : (
            <p>Đang tải dữ liệu từ server...</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <AppContext.Provider value={ctx}>
      {children}
      {productId ? (
        <ProductDetailModal productId={productId} onClose={() => setProductId(null)} />
      ) : null}
      {productForm ? (
        <ProductFormModal product={productForm.product} onClose={() => setProductForm(null)} />
      ) : null}
      {docForm ? <DocumentFormModal init={docForm} onClose={() => setDocForm(null)} /> : null}
      {docDetailId ? (
        <DocumentDetailModal docId={docDetailId} onClose={() => setDocDetailId(null)} />
      ) : null}
      {confirmState ? (
        <ConfirmDialog
          title={confirmState.opts.title}
          message={confirmState.opts.message}
          confirmLabel={confirmState.opts.confirmLabel}
          danger={confirmState.opts.danger}
          onConfirm={() => {
            confirmState.resolve(true)
            setConfirmState(null)
          }}
          onCancel={() => {
            confirmState.resolve(false)
            setConfirmState(null)
          }}
        />
      ) : null}
      {toastMsg ? <div className="toast">{toastMsg}</div> : null}
    </AppContext.Provider>
  )
}
