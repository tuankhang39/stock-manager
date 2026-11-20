import type { AppData } from '../types'
import { api, ApiError } from './api'
import { diffData } from './diff'

export type SyncStatus =
  | { state: 'saved' }
  | { state: 'saving' }
  | { state: 'error'; message: string; retrying: boolean }
  | { state: 'offline-auth' }

type Options = {
  getData: () => AppData
  onStatus: (status: SyncStatus) => void
  /** Máy khác đã ghi trước — cần tải lại dữ liệu từ server. */
  onConflict: () => void
  /** Phiên đăng nhập hết hạn. */
  onUnauthorized: () => void
}

/**
 * Lưu thay đổi lên server: gửi phần khác biệt so với lần lưu thành công gần nhất.
 * Chỉ coi là đã lưu khi server trả về thành công; lỗi mạng / server thì tự thử lại.
 */
export class SyncEngine {
  private synced: AppData
  private revision: number
  private pendingReplace = false
  private running = false
  private paused = false
  private timer: ReturnType<typeof setTimeout> | null = null
  private retryDelay = 0
  private opts: Options

  constructor(initial: AppData, revision: number, opts: Options) {
    this.synced = initial
    this.revision = revision
    this.opts = opts
  }

  get currentRevision() {
    return this.revision
  }

  /** Còn thay đổi chưa lưu xong lên server. */
  hasPending(): boolean {
    return this.running || this.pendingReplace || this.opts.getData() !== this.synced
  }

  /** Dữ liệu vừa tải lại từ server. */
  reset(data: AppData, revision: number) {
    this.clearTimer()
    this.synced = data
    this.revision = revision
    this.pendingReplace = false
    this.paused = false
    this.retryDelay = 0
    this.opts.onStatus({ state: 'saved' })
  }

  schedule(delay = 120) {
    if (this.paused) return
    this.clearTimer()
    this.timer = setTimeout(() => void this.flush(), delay)
  }

  /** Lần lưu tới sẽ ghi đè toàn bộ dữ liệu trên server. */
  markReplace() {
    this.pendingReplace = true
    this.schedule(0)
  }

  /** Tiếp tục sau khi đăng nhập lại. */
  resume() {
    this.paused = false
    this.retryDelay = 0
    this.schedule(0)
  }

  dispose() {
    this.clearTimer()
    this.paused = true
  }

  private clearTimer() {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  async flush(): Promise<void> {
    if (this.running || this.paused) return
    this.clearTimer()
    const current = this.opts.getData()
    if (!this.pendingReplace && current === this.synced) {
      this.opts.onStatus({ state: 'saved' })
      return
    }

    this.running = true
    this.opts.onStatus({ state: 'saving' })
    const replacing = this.pendingReplace
    try {
      if (replacing) {
        const res = await api.replace(current)
        this.revision = res.revision
        this.pendingReplace = false
      } else {
        const req = diffData(this.synced, current, this.revision)
        if (req) {
          const res = await api.sync(req)
          this.revision = res.revision
        }
      }
      this.synced = current
      this.retryDelay = 0
    } catch (err) {
      this.running = false
      this.handleError(err)
      return
    }
    this.running = false

    if (this.pendingReplace || this.opts.getData() !== this.synced) this.schedule(0)
    else this.opts.onStatus({ state: 'saved' })
  }

  private handleError(err: unknown) {
    const status = err instanceof ApiError ? err.status : 0
    const message = err instanceof Error ? err.message : 'Không lưu được dữ liệu'
    if (status === 409) {
      this.paused = true
      this.opts.onConflict()
      return
    }
    if (status === 401) {
      this.paused = true
      this.opts.onStatus({ state: 'offline-auth' })
      this.opts.onUnauthorized()
      return
    }
    if (status >= 400 && status < 500) {
      // Dữ liệu bị server từ chối: thử lại cũng vậy, chờ thao tác tiếp theo.
      this.opts.onStatus({ state: 'error', message, retrying: false })
      return
    }
    this.retryDelay = Math.min(Math.max(2000, this.retryDelay * 2), 30000)
    this.opts.onStatus({ state: 'error', message, retrying: true })
    this.schedule(this.retryDelay)
  }
}
