import type { AppData } from '../types'
import { ENTITY_TABLES, type SyncRequest } from './protocol'

/**
 * So sánh 2 bản dữ liệu (cập nhật kiểu immutable: object không đổi thì giữ nguyên tham chiếu).
 * Trả null nếu không có gì thay đổi.
 */
export function diffData(prev: AppData, next: AppData, baseRevision: number): SyncRequest | null {
  const req: SyncRequest = {
    baseRevision,
    upsert: { products: [], movements: [], documents: [] },
    remove: { products: [], movements: [], documents: [] },
  }
  let changed = false

  for (const key of ENTITY_TABLES) {
    const before = prev[key] as Array<{ id: string }>
    const after = next[key] as Array<{ id: string }>
    if (before === after) continue
    const prevById = new Map(before.map((item) => [item.id, item]))
    const nextIds = new Set<string>()
    const upserts: Array<{ id: string }> = []
    // Mảng xếp mới -> cũ; duyệt ngược để bản ghi mới được gửi theo thứ tự cũ -> mới.
    for (let i = after.length - 1; i >= 0; i -= 1) {
      const item = after[i]
      nextIds.add(item.id)
      if (prevById.get(item.id) !== item) upserts.push(item)
    }
    const removes = before.filter((item) => !nextIds.has(item.id)).map((item) => item.id)
    if (upserts.length > 0 || removes.length > 0) changed = true
    ;(req.upsert[key] as Array<{ id: string }>) = upserts
    req.remove[key] = removes
  }

  if (prev.categories !== next.categories) {
    req.categories = next.categories
    changed = true
  }
  if (prev.platforms !== next.platforms) {
    req.platforms = next.platforms
    changed = true
  }
  if (prev.settings !== next.settings) {
    req.settings = next.settings
    changed = true
  }

  return changed ? req : null
}
