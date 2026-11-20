import { formatMoney } from '../domain/format'
import type { Platform, Product } from '../types'

/** Giá bán ngoài danh sách: chỉ giá mốc 1 đơn vị của từng sàn. */
export function SalePriceCell({
  product,
  platforms,
}: {
  product: Product
  platforms: Platform[]
}) {
  const rows = platforms
    .map((pf) => {
      const tier = product.salePrices?.[pf.id]?.find((t) => t.qty === 1)
      return tier ? { pf, price: tier.price } : null
    })
    .filter((r): r is { pf: Platform; price: number } => r !== null)

  if (rows.length === 0) return <span className="muted">—</span>
  return (
    <div className="price-stack">
      {rows.map(({ pf, price }) => (
        <div key={pf.id}>
          <span className="price-tag">{pf.name}</span> {formatMoney(price)}
        </div>
      ))}
    </div>
  )
}
