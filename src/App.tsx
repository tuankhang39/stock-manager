import { useCallback, useEffect, useRef, useState } from 'react'
import { APP_LOGO_SRC, APP_NAME, APP_TAGLINE } from './brand'
import { DashboardPage } from './pages/DashboardPage'
import { DocumentsPage } from './pages/DocumentsPage'
import { HistoryPage } from './pages/HistoryPage'
import { ProductsPage } from './pages/ProductsPage'
import { ReportsPage } from './pages/ReportsPage'
import { SettingsPage } from './pages/SettingsPage'
import { createSampleData } from './seed'
import { AppProvider } from './store/AppProvider'
import { useApp } from './store/context'
import { importExcelFile, isExcelFile } from './store/excelImport'
import { api, ApiError } from './sync/api'
import { applyTheme, loadTheme, saveTheme, type ThemeId } from './theme'

type Page =
  | 'dashboard'
  | 'products'
  | 'in'
  | 'out'
  | 'return'
  | 'set'
  | 'history'
  | 'reports'
  | 'settings'

const NAV: Array<{ id: Page; label: string; icon: string }> = [
  { id: 'dashboard', label: 'Tổng quan', icon: '▦' },
  { id: 'products', label: 'Sản phẩm', icon: '▣' },
  { id: 'in', label: 'Nhập kho', icon: '⬇' },
  { id: 'out', label: 'Xuất kho', icon: '⬆' },
  { id: 'return', label: 'Khách trả hàng', icon: '↩' },
  { id: 'set', label: 'Kiểm kê', icon: '✓' },
  { id: 'history', label: 'Lịch sử giao dịch', icon: '⟲' },
  { id: 'reports', label: 'Báo cáo', icon: '▥' },
  { id: 'settings', label: 'Cài đặt', icon: '⚙' },
]

function Shell() {
  const ctx = useApp()
  const [page, setPage] = useState<Page>('dashboard')
  const [lowOnly, setLowOnly] = useState(false)
  const [theme, setTheme] = useState<ThemeId>(() => loadTheme())
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)

  useEffect(() => {
    applyTheme(theme)
    saveTheme(theme)
  }, [theme])

  async function loadSampleData() {
    if (ctx.data.products.length > 0) {
      const ok = await ctx.confirm({
        title: 'Nạp dữ liệu mẫu?',
        message: <p>Đã có dữ liệu. Nạp mẫu sẽ GHI ĐÈ toàn bộ tồn, phiếu và lịch sử hiện tại.</p>,
        confirmLabel: 'Nạp mẫu',
        danger: true,
      })
      if (!ok) return
    }
    const sample = createSampleData()
    ctx.restoreAll(sample)
    ctx.toast(`Đã nạp mẫu: ${sample.products.length} SP · ${sample.documents.length} phiếu`)
  }

  function changeTheme(next: ThemeId) {
    setTheme(next)
    ctx.toast(next === 'light' ? 'Theme trắng' : next === 'dark' ? 'Theme đen' : 'Theme hồng')
  }

  function changePage(next: Page) {
    if (next === 'products') setLowOnly(false)
    setPage(next)
  }

  function goProducts(low: boolean) {
    setLowOnly(low)
    setPage('products')
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

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    if (!isExcelFile(file)) {
      ctx.toast('Kéo file Excel (.xlsx / .xls / .csv)')
      return
    }
    void importExcelFile(ctx, file)
  }

  // Chỉ hiện khi chạy `npm run dev`
  const sampleHandler = import.meta.env.DEV ? () => void loadSampleData() : undefined

  return (
    <div
      className={`app-frame${dragging ? ' dragging' : ''}`}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={(e) => e.preventDefault()}
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
          {NAV.map((n) => (
            <button
              key={n.id}
              type="button"
              className={page === n.id ? 'active' : ''}
              onClick={() => changePage(n.id)}
            >
              <span className="nav-ico">{n.icon}</span>
              {n.label}
            </button>
          ))}
        </nav>

        <div className="side-footer">
          <SyncBadge />
          <div className="account-row">
            <span title="Tài khoản đang đăng nhập">{ctx.username}</span>
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => void ctx.logout()}>
              Đăng xuất
            </button>
          </div>
        </div>
      </aside>

      <main className="main">
        {page === 'dashboard' ? <DashboardPage onOpenProducts={goProducts} /> : null}
        {page === 'products' ? (
          <ProductsPage lowOnly={lowOnly} setLowOnly={setLowOnly} onLoadSample={sampleHandler} />
        ) : null}
        {page === 'in' || page === 'out' || page === 'return' || page === 'set' ? (
          <DocumentsPage key={page} type={page} />
        ) : null}
        {page === 'history' ? <HistoryPage /> : null}
        {page === 'reports' ? <ReportsPage /> : null}
        {page === 'settings' ? (
          <SettingsPage theme={theme} onTheme={changeTheme} onLoadSample={sampleHandler} />
        ) : null}
      </main>

      <nav className="mobile-nav">
        {NAV.map((n) => (
          <button
            key={n.id}
            type="button"
            className={page === n.id ? 'active' : ''}
            onClick={() => changePage(n.id)}
          >
            <span>{n.icon}</span>
            {n.label}
          </button>
        ))}
      </nav>
    </div>
  )
}

function SyncBadge() {
  const { syncStatus } = useApp()
  let text = 'Đã lưu vào PostgreSQL'
  let cls = 'sync-badge ok'
  if (syncStatus.state === 'saving') {
    text = 'Đang lưu...'
    cls = 'sync-badge saving'
  } else if (syncStatus.state === 'error') {
    text = syncStatus.retrying
      ? `Chưa lưu được (${syncStatus.message}) — đang thử lại`
      : `Chưa lưu được: ${syncStatus.message}`
    cls = 'sync-badge error'
  } else if (syncStatus.state === 'offline-auth') {
    text = 'Hết phiên đăng nhập — đăng nhập lại để lưu'
    cls = 'sync-badge error'
  }
  return (
    <p className={cls} role="status">
      {text}
    </p>
  )
}

function LockCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="lock-card">
      <img className="lock-logo" src={APP_LOGO_SRC} alt={APP_NAME} />
      <h1>{APP_NAME}</h1>
      {children}
    </div>
  )
}

function LoginForm({ note, onSuccess }: { note?: string; onSuccess: (username: string) => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res = await api.login(username, password)
      setPassword('')
      onSuccess(res.username)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đăng nhập thất bại')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="lock-card" onSubmit={(e) => void submit(e)}>
      <img className="lock-logo" src={APP_LOGO_SRC} alt={APP_NAME} />
      <h1>{APP_NAME}</h1>
      <p>{note ?? 'Đăng nhập để vào kho'}</p>
      <input
        type="text"
        autoComplete="username"
        spellCheck={false}
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="Tên đăng nhập"
        disabled={busy}
        autoFocus
      />
      <input
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Mật khẩu"
        disabled={busy}
      />
      {error ? <p className="lock-error">{error}</p> : null}
      <button className="btn btn-primary" type="submit" disabled={busy || !username || !password}>
        {busy ? 'Đang đăng nhập...' : 'Đăng nhập'}
      </button>
    </form>
  )
}

type AuthState =
  | { state: 'checking' }
  | { state: 'error'; message: string }
  | { state: 'login' }
  | { state: 'in'; username: string; expired: boolean }

export default function App() {
  const [auth, setAuth] = useState<AuthState>({ state: 'checking' })
  const [attempt, setAttempt] = useState(0)
  const [authEpoch, setAuthEpoch] = useState(0)

  useEffect(() => {
    let cancelled = false
    setAuth({ state: 'checking' })
    api
      .me()
      .then((res) => {
        if (!cancelled) setAuth({ state: 'in', username: res.username, expired: false })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 401) setAuth({ state: 'login' })
        else
          setAuth({
            state: 'error',
            message: err instanceof Error ? err.message : 'Không kết nối được server',
          })
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  const onUnauthorized = useCallback(() => {
    setAuth((a) => (a.state === 'in' ? { ...a, expired: true } : a))
  }, [])
  const onLoggedOut = useCallback(() => setAuth({ state: 'login' }), [])

  if (auth.state === 'checking') {
    return (
      <div className="lock-screen">
        <LockCard>
          <p>Đang kết nối server...</p>
        </LockCard>
      </div>
    )
  }

  if (auth.state === 'error') {
    return (
      <div className="lock-screen">
        <LockCard>
          <p className="lock-error">{auth.message}</p>
          <button className="btn btn-primary" type="button" onClick={() => setAttempt((n) => n + 1)}>
            Thử lại
          </button>
        </LockCard>
      </div>
    )
  }

  if (auth.state === 'login') {
    return (
      <div className="lock-screen">
        <LoginForm onSuccess={(username) => setAuth({ state: 'in', username, expired: false })} />
      </div>
    )
  }

  return (
    <>
      <AppProvider
        username={auth.username}
        onUnauthorized={onUnauthorized}
        onLoggedOut={onLoggedOut}
        authEpoch={authEpoch}
      >
        <Shell />
      </AppProvider>
      {auth.expired ? (
        <div className="lock-screen lock-overlay">
          <LoginForm
            note="Phiên đăng nhập đã hết. Đăng nhập lại để lưu tiếp — dữ liệu đang mở vẫn được giữ."
            onSuccess={(username) => {
              setAuth({ state: 'in', username, expired: false })
              setAuthEpoch((n) => n + 1)
            }}
          />
        </div>
      ) : null}
    </>
  )
}
