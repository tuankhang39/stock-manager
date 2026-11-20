import type { ReactNode } from 'react'
import type { Product } from '../types'

/** Ô tên SP trong bảng: ảnh nhỏ (hoặc ô trống) + tên. */
export function ProductNameCell({ product, children }: { product: Product; children?: ReactNode }) {
  return (
    <div className="name-cell">
      <div className="table-thumb" aria-hidden="true">
        {product.image ? (
          <img src={product.image} alt="" loading="lazy" decoding="async" />
        ) : (
          <span>{product.name.trim().charAt(0).toUpperCase() || '·'}</span>
        )}
      </div>
      <div className="table-name">
        {product.name}
        {children}
      </div>
    </div>
  )
}
