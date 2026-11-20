import { useRef, useState } from 'react'

const PAGE_SIZES = [20, 50, 100] as const
const STORAGE_PREFIX = 'xiaoxin.pageSize.'

function loadSize(key: string): number {
  try {
    const v = Number(localStorage.getItem(STORAGE_PREFIX + key))
    if ((PAGE_SIZES as readonly number[]).includes(v)) return v
  } catch {
    /* trình duyệt chặn storage */
  }
  return PAGE_SIZES[0]
}

function saveSize(key: string, size: number) {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, String(size))
  } catch {
    /* bỏ qua */
  }
}

/**
 * Phân trang phía trình duyệt.
 * @param key        tên bảng, để nhớ số dòng/trang
 * @param resetKey   đổi giá trị này (bộ lọc, từ khoá...) thì quay về trang 1
 */
export function usePagination<T>(items: T[], key: string, resetKey: string) {
  const [page, setPage] = useState(1)
  const [size, setSizeState] = useState(() => loadSize(key))
  const [prevReset, setPrevReset] = useState(resetKey)

  // Bộ lọc đổi → về trang 1 (điều chỉnh state ngay trong render, không cần effect).
  if (prevReset !== resetKey) {
    setPrevReset(resetKey)
    setPage(1)
  }

  const total = items.length
  const pageCount = Math.max(1, Math.ceil(total / size))
  // Xoá bớt dòng ở trang cuối → tự lùi về trang hợp lệ.
  const current = Math.min(page, pageCount)
  const start = (current - 1) * size

  return {
    pageItems: items.slice(start, start + size),
    page: current,
    pageCount,
    size,
    total,
    start,
    setPage,
    setSize: (s: number) => {
      setSizeState(s)
      saveSize(key, s)
      setPage(1)
    },
  }
}

type PagerProps = ReturnType<typeof usePagination<unknown>>

/** Dãy số trang có dấu … : 1 … 4 5 6 … 12 */
function pageList(page: number, count: number): (number | '…')[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1)
  const set = new Set([1, count, page - 1, page, page + 1])
  const nums = [...set].filter((n) => n >= 1 && n <= count).sort((a, b) => a - b)
  const out: (number | '…')[] = []
  nums.forEach((n, i) => {
    if (i > 0 && n - nums[i - 1] > 1) out.push('…')
    out.push(n)
  })
  return out
}

export function Pager({ page, pageCount, size, total, start, setPage, setSize }: PagerProps) {
  const ref = useRef<HTMLDivElement>(null)
  // Ít dòng, 1 trang là đủ → không hiện thanh phân trang.
  if (total <= PAGE_SIZES[0]) return null

  const go = (p: number) => {
    setPage(p)
    // Đang ở cuối bảng → cuộn lên đầu bảng để xem trang mới.
    const table = ref.current?.previousElementSibling
    if (table && table.getBoundingClientRect().top < 0) {
      table.scrollIntoView({ block: 'start', behavior: 'smooth' })
    }
  }

  return (
    <div className="pager" ref={ref}>
      <span className="pager-info">
        {start + 1}–{Math.min(start + size, total)} / {total}
      </span>
      <div className="pager-pages">
        <button type="button" disabled={page <= 1} onClick={() => go(page - 1)} aria-label="Trang trước">
          ‹
        </button>
        {pageList(page, pageCount).map((p, i) =>
          p === '…' ? (
            <span key={`gap${i}`} className="pager-gap">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              className={p === page ? 'active' : ''}
              aria-current={p === page ? 'page' : undefined}
              onClick={() => go(p)}
            >
              {p}
            </button>
          ),
        )}
        <button
          type="button"
          disabled={page >= pageCount}
          onClick={() => go(page + 1)}
          aria-label="Trang sau"
        >
          ›
        </button>
      </div>
      <select
        className="select pager-size"
        value={size}
        onChange={(e) => setSize(Number(e.target.value))}
        aria-label="Số dòng mỗi trang"
      >
        {PAGE_SIZES.map((s) => (
          <option key={s} value={s}>
            {s} / trang
          </option>
        ))}
      </select>
    </div>
  )
}
