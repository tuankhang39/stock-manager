import { useEffect, type ReactNode } from 'react'

type Props = {
  title: string
  sub?: ReactNode
  onClose: () => void
  wide?: boolean
  xwide?: boolean
  /** z-index cao hơn (hộp xác nhận chồng lên modal khác). */
  top?: boolean
  /** Hàng nút cố định ở đáy (không cuộn theo nội dung). */
  footer?: ReactNode
  children: ReactNode
}

export function Modal({ title, sub, onClose, wide, xwide, top, footer, children }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Hộp xác nhận đang mở thì Esc chỉ đóng hộp đó.
      if (!top && document.querySelector('[data-top-modal]')) return
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, top])

  return (
    <div
      className="modal-backdrop"
      style={top ? { zIndex: 90 } : undefined}
      data-top-modal={top ? '' : undefined}
    >
      <div
        className={`modal${wide ? ' modal-wide' : ''}${xwide ? ' modal-xwide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-handle" />
        <div className="modal-head">
          <div className="modal-titles">
            <h2>{title}</h2>
            {sub ? <p className="modal-sub">{sub}</p> : null}
          </div>
          <button
            className="modal-close"
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            title="Đóng (Esc)"
          >
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  )
}

type ConfirmProps = {
  title: string
  message: ReactNode
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Xác nhận',
  danger,
  onConfirm,
  onCancel,
}: ConfirmProps) {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      top
      footer={
        <>
          <button className="btn btn-ghost" type="button" onClick={onCancel}>
            Hủy
          </button>
          <button
            className={`btn ${danger ? 'btn-danger-solid' : 'btn-primary'}`}
            type="button"
            autoFocus
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="confirm-body">{message}</div>
    </Modal>
  )
}
