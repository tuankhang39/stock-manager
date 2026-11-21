import { localDateKey } from '../domain/format'

/** Khoảng ngày giờ dạng 'YYYY-MM-DDTHH:mm' (giờ máy); '' = không giới hạn. */
export type DateTimeRange = { from: string; to: string }

/** Mốc nhanh: [từ, đến]. */
export const RANGE_PRESETS: { id: string; label: string; range: () => [string, string] }[] = [
  {
    id: 'today',
    label: 'Hôm nay',
    range: () => {
      const d = new Date()
      return [`${localDateKey(d)}T00:00`, `${localDateKey(d)}T23:59`]
    },
  },
  {
    id: 'yesterday',
    label: 'Hôm qua',
    range: () => {
      const d = new Date()
      d.setDate(d.getDate() - 1)
      return [`${localDateKey(d)}T00:00`, `${localDateKey(d)}T23:59`]
    },
  },
  {
    id: '7d',
    label: '7 ngày',
    range: () => {
      const d = new Date()
      d.setDate(d.getDate() - 6)
      return [`${localDateKey(d)}T00:00`, `${localDateKey()}T23:59`]
    },
  },
  {
    id: 'month',
    label: 'Tháng này',
    range: () => {
      const d = new Date()
      return [`${localDateKey(new Date(d.getFullYear(), d.getMonth(), 1))}T00:00`, `${localDateKey(d)}T23:59`]
    },
  },
]

export function todayRange(): DateTimeRange {
  const [from, to] = RANGE_PRESETS[0].range()
  return { from, to }
}

/** '2026-11-20T08:00' → '20/11/2026 08:00' */
export function showDateTime(v: string): string {
  const [date, time] = v.split('T')
  const [y, m, d] = date.split('-')
  return `${d}/${m}/${y} ${time}`
}

/** Có nằm trong khoảng không ("đến" tính hết phút đó: 08:30 → 08:30:59.999). */
export function inRange(iso: string, { from, to }: DateTimeRange): boolean {
  const at = new Date(iso).getTime()
  if (from && at < new Date(from).getTime()) return false
  if (to && at > new Date(to).getTime() + 59_999) return false
  return true
}

/** Nhãn + hậu tố tên file cho khoảng ngày; undefined nếu không giới hạn. */
export function rangeLabel({ from, to }: DateTimeRange): { label: string; fileSuffix: string } | undefined {
  if (!from && !to) return undefined
  return {
    label: `Từ ${from ? showDateTime(from) : 'đầu'} đến ${to ? showDateTime(to) : 'nay'}`,
    fileSuffix: `${from ? from.replace('T', '_').replace(':', '') : 'dau'} den ${
      to ? to.replace('T', '_').replace(':', '') : localDateKey()
    }`,
  }
}

/** Mô tả ngắn cho câu hiển thị: 'hôm nay', '7 ngày qua', 'từ 20/11/2026 08:00 đến 21/11/2026 17:00'… */
export function describeRange({ from, to }: DateTimeRange): string {
  if (!from && !to) return 'tất cả thời gian'
  const preset = RANGE_PRESETS.find((p) => {
    const [f, t] = p.range()
    return f === from && t === to
  })
  if (preset) {
    return { today: 'hôm nay', yesterday: 'hôm qua', '7d': '7 ngày qua', month: 'tháng này' }[preset.id] ?? preset.label
  }
  return `từ ${from ? showDateTime(from) : 'đầu'} đến ${to ? showDateTime(to) : 'nay'}`
}

/** Chip mốc nhanh + 2 ô chọn ngày giờ. */
export function DateRangePicker({
  value,
  onChange,
}: {
  value: DateTimeRange
  onChange: (next: DateTimeRange) => void
}) {
  const { from, to } = value
  const active = RANGE_PRESETS.find((p) => {
    const [f, t] = p.range()
    return f === from && t === to
  })?.id

  return (
    <div className="range-bar">
      <div className="range-presets">
        {RANGE_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`chip${active === p.id ? ' active' : ''}`}
            onClick={() => {
              const [f, t] = p.range()
              onChange({ from: f, to: t })
            }}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          className={`chip${!from && !to ? ' active' : ''}`}
          onClick={() => onChange({ from: '', to: '' })}
        >
          Tất cả
        </button>
      </div>
      <div className="date-filter">
        <label>
          <span>Từ</span>
          <input
            className="select"
            type="datetime-local"
            value={from}
            max={to || undefined}
            onChange={(e) => onChange({ from: e.target.value, to })}
          />
        </label>
        <span>→</span>
        <label>
          <span>Đến</span>
          <input
            className="select"
            type="datetime-local"
            value={to}
            min={from || undefined}
            onChange={(e) => onChange({ from, to: e.target.value })}
          />
        </label>
      </div>
    </div>
  )
}
