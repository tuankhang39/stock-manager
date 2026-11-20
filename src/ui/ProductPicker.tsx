import { useMemo, useRef, useState } from 'react'
import { isCombo } from '../domain/combos'
import { normalizeText } from '../domain/format'
import type { Product } from '../types'

type Props = {
  products: Product[]
  onPick: (product: Product) => void
  /** Có truyền = cho phép tạo SP mới từ chữ vừa gõ. */
  onCreate?: (text: string) => void
  filter?: (product: Product) => boolean
  placeholder?: string
  autoFocus?: boolean
}

/** Gõ SKU hoặc từ khoá tên -> chọn từ danh sách (không cần gõ nguyên tên). */
export function ProductPicker({
  products,
  onPick,
  onCreate,
  filter,
  placeholder = 'Gõ SKU hoặc tên sản phẩm để thêm dòng...',
  autoFocus,
}: Props) {
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const matches = useMemo(() => {
    const tokens = normalizeText(text).split(/\s+/).filter(Boolean)
    const pool = filter ? products.filter(filter) : products
    if (tokens.length === 0) return pool.slice(0, 8)
    return pool
      .filter((p) => {
        const hay = normalizeText(`${p.sku ?? ''} ${p.name}`)
        return tokens.every((t) => hay.includes(t))
      })
      .sort((a, b) => {
        const exactA = normalizeText(a.sku ?? '') === normalizeText(text) ? 0 : 1
        const exactB = normalizeText(b.sku ?? '') === normalizeText(text) ? 0 : 1
        return exactA - exactB
      })
      .slice(0, 8)
  }, [products, text, filter])

  function pick(product: Product) {
    onPick(product)
    setText('')
    setActive(0)
    setOpen(false)
    inputRef.current?.focus()
  }

  function create() {
    if (!onCreate || !text.trim()) return
    onCreate(text.trim())
    setText('')
    setOpen(false)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive((i) => Math.min(i + 1, Math.max(matches.length - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (open && matches[active]) pick(matches[active])
      else if (onCreate && text.trim()) create()
    } else if (e.key === 'Escape' && open) {
      e.stopPropagation()
      setOpen(false)
    }
  }

  return (
    <div className="picker">
      <input
        ref={inputRef}
        className="picker-input"
        type="text"
        value={text}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value)
          setActive(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKeyDown}
      />
      {open ? (
        <div className="picker-list">
          {matches.map((p, i) => (
            <button
              key={p.id}
              type="button"
              className={`picker-item${i === active ? ' active' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault()
                pick(p)
              }}
            >
              <span className="picker-sku">{p.sku || '—'}</span>
              <span className="picker-name">{p.name}</span>
              <span className="picker-qty">
                {isCombo(p) ? 'Combo' : `Tồn ${p.quantity}`}
              </span>
            </button>
          ))}
          {matches.length === 0 ? <div className="picker-empty">Không thấy sản phẩm</div> : null}
          {onCreate && text.trim() ? (
            <button
              type="button"
              className="picker-item picker-create"
              onMouseDown={(e) => {
                e.preventDefault()
                create()
              }}
            >
              + Tạo sản phẩm mới “{text.trim()}”
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
