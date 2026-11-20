import type { RevertPreviewItem } from '../domain/documents'

/** Bảng xem trước tồn trước / sau khi xóa phiếu hoặc dòng nhật ký. */
export function RevertPreview({ items }: { items: RevertPreviewItem[] }) {
  const clamped = items.filter((i) => i.clamped)
  return (
    <>
      <ul className="confirm-list">
        {items.slice(0, 14).map((i) => (
          <li key={i.movementId}>
            {i.sku ? <span className="muted">{i.sku} · </span> : null}
            {i.productName}:{' '}
            {i.missing ? (
              <em>SP đã bị xóa, chỉ xóa bản ghi</em>
            ) : (
              <>
                tồn {i.from} → <strong>{i.to}</strong>
              </>
            )}
          </li>
        ))}
        {items.length > 14 ? <li>... và {items.length - 14} dòng khác</li> : null}
      </ul>
      {clamped.length > 0 ? (
        <p className="over-note">
          Lưu ý: {clamped.length} SP không đủ tồn để hoàn lại hết, tồn sẽ dừng ở 0 (đã có biến
          động khác sau đó).
        </p>
      ) : null}
    </>
  )
}
