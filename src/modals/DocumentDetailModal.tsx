import { deleteDocument, movementIdsOfDocument, previewRevert } from '../domain/documents'
import { formatDate, formatDateTime, formatMoney, formatNumber } from '../domain/format'
import { docTotals, lineAmount } from '../domain/valuation'
import { useApp } from '../store/context'
import { Modal } from '../ui/Modal'
import { RevertPreview } from '../ui/RevertPreview'
import { DOC_LABEL } from '../types'

type Props = {
  docId: string
  onClose: () => void
}

export function DocumentDetailModal({ docId, onClose }: Props) {
  const { data, getData, replaceAll, confirm, toast } = useApp()
  const doc = data.documents.find((d) => d.id === docId)
  if (!doc) return null

  const showPrice = doc.type === 'in'
  const totals = docTotals(doc)

  async function remove() {
    if (!doc) return
    const preview = previewRevert(data, movementIdsOfDocument(data, doc.id))
    const ok = await confirm({
      title: `Xóa phiếu ${doc.code}?`,
      message: (
        <>
          <p>Xóa phiếu sẽ hoàn lại tồn kho như trước khi lập phiếu:</p>
          <RevertPreview items={preview} />
        </>
      ),
      confirmLabel: 'Xóa phiếu',
      danger: true,
    })
    if (!ok) return
    const latest = getData()
    if (!latest.documents.some((d) => d.id === doc.id)) return
    replaceAll(deleteDocument(latest, doc.id))
    toast(`Đã xóa phiếu ${doc.code}, tồn đã hoàn lại`)
    onClose()
  }

  return (
    <Modal
      title={`${DOC_LABEL[doc.type]} · ${doc.code}`}
      sub={`Ngày ${formatDate(doc.date)} · lập lúc ${formatDateTime(doc.createdAt)}`}
      onClose={onClose}
      xwide
      footer={
        <>
          <button className="btn btn-danger" type="button" onClick={() => void remove()}>
            Xóa phiếu (hoàn tồn)
          </button>
          <span className="foot-spacer" />
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            Đóng
          </button>
        </>
      }
    >
      <div className="doc-meta">
        <span>Nội dung: {doc.reason}</span>
        {doc.note ? <span>Ghi chú: {doc.note}</span> : null}
      </div>

      <div className="table-wrap doc-table-wrap">
        <table className="stock-table doc-table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Sản phẩm</th>
              <th>ĐVT</th>
              <th className="col-num">Trước</th>
              <th className="col-num">{doc.type === 'set' ? 'Tồn mới' : 'Số lượng'}</th>
              <th className="col-num">Sau</th>
              {showPrice ? <th className="col-num">Đơn giá</th> : null}
              {showPrice ? <th className="col-num">Thành tiền</th> : null}
            </tr>
          </thead>
          <tbody>
            {doc.lines.map((l) => (
              <tr key={l.id}>
                <td className="muted">{l.sku || '—'}</td>
                <td>
                  <div className="table-name">
                    {l.name}
                    {l.viaCombo ? <span className="badge inline">Combo: {l.viaCombo}</span> : null}
                  </div>
                </td>
                <td className="muted">{l.unit || '—'}</td>
                <td className="col-num">{l.before}</td>
                <td className="col-num">{formatNumber(l.quantity)}</td>
                <td className="col-num">{l.after}</td>
                {showPrice ? <td className="col-num">{formatMoney(l.unitPrice)}</td> : null}
                {showPrice ? <td className="col-num">{formatMoney(lineAmount(l))}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="doc-foot">
        <div className="doc-image">
          {doc.image ? (
            <a href={doc.image} target="_blank" rel="noreferrer">
              <img className="doc-image-thumb" src={doc.image} alt="Ảnh phiếu" />
            </a>
          ) : (
            <span className="muted">Không có ảnh phiếu</span>
          )}
        </div>
        <div className="doc-totals">
          <div>
            <span>Tổng số lượng</span>
            <strong>{formatNumber(totals.qty)}</strong>
          </div>
          {showPrice ? (
            <>
              <div>
                <span>Tổng tiền (chưa VAT)</span>
                <strong>{formatMoney(totals.subtotal)}</strong>
              </div>
              <div>
                <span>VAT {doc.vatRate ?? 0}%</span>
                <strong>{formatMoney(totals.vat)}</strong>
              </div>
              <div className="doc-grand">
                <span>Tổng tiền (có VAT)</span>
                <strong>{formatMoney(totals.total)}</strong>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </Modal>
  )
}
