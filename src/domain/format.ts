export function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function formatNumber(n: number): string {
  return Math.round(n).toLocaleString('vi-VN')
}

export function formatMoney(n?: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return `${Math.round(n).toLocaleString('vi-VN')}đ`
}

/** YYYY-MM-DD theo giờ máy. */
export function localDateKey(d = new Date()): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

export function formatDate(value?: string | null): string {
  if (!value) return '—'
  const iso = value.length >= 10 ? value.slice(0, 10) : value
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return value
  return `${d}/${m}/${y}`
}

export function formatDateTime(iso: string): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return iso
  const dd = String(at.getDate()).padStart(2, '0')
  const mm = String(at.getMonth() + 1).padStart(2, '0')
  const hh = String(at.getHours()).padStart(2, '0')
  const mi = String(at.getMinutes()).padStart(2, '0')
  return `${dd}/${mm}/${at.getFullYear()} ${hh}:${mi}`
}

/** Bỏ dấu + hạ chữ thường để tìm kiếm theo từ khoá. */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .trim()
}

export function parseMoneyInput(value: string): number | undefined {
  const cleaned = value.replace(/[^\d]/g, '')
  if (!cleaned) return undefined
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : undefined
}

export function parseQtyInput(value: string): number {
  const n = Math.floor(Number(String(value).replace(/[^\d]/g, '')) || 0)
  return Math.max(0, n)
}

export function daysBetween(fromIso: string, to = new Date()): number {
  const from = new Date(fromIso)
  if (Number.isNaN(from.getTime())) return 0
  const ms = to.getTime() - from.getTime()
  return Math.max(0, Math.floor(ms / 86400000))
}
