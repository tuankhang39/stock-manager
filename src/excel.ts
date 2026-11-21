import ExcelJS from 'exceljs'
import * as XLSX from 'xlsx'
import { APP_CREATOR } from './brand'
import { localDateKey } from './domain/format'
import type { ExcelImportRow, Product, StockMovement } from './types'

function cleanText(value: unknown): string {
  return String(value ?? '')
    .replace(/\r/g, '')
    .split('\n')
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ')
    .trim()
}

/** Ưu tiên tên tiếng Việt nếu có dòng song ngữ. */
export function normalizeProductName(raw: unknown): string {
  const text = String(raw ?? '').replace(/\r/g, '').trim()
  if (!text) return ''

  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  if (lines.length === 0) return ''

  const hasVietnamese = (s: string) =>
    /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(s) ||
    /[A-Za-z]/.test(s)

  const viLines = lines.filter(hasVietnamese)
  if (viLines.length > 0) {
    return viLines
      .join(' ')
      .replace(/\s*-\s*/g, ' - ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  return lines.join(' ').replace(/\s+/g, ' ').trim()
}

function parseQuantity(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value))
  }
  const match = String(value ?? '').match(/(\d+(?:[.,]\d+)?)/)
  if (!match) return 0
  const n = Number(match[1].replace(',', '.'))
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0
}

/**
 * Giá tiền (VNĐ): ô số giữ nguyên; ô chữ bỏ dấu phân cách hàng nghìn
 * ("7.500" -> 7500, "1,250,000đ" -> 1250000).
 */
export function parsePrice(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : undefined
  const text = String(value ?? '').trim()
  if (!text) return undefined
  // "12.5" / "12,5" (1–2 chữ số sau dấu) là số thập phân, không phải hàng nghìn
  const decimal = text.match(/^(\d+)[.,](\d{1,2})$/)
  if (decimal) {
    const n = Number(`${decimal[1]}.${decimal[2]}`)
    return n > 0 ? n : undefined
  }
  const digits = text.replace(/[^\d]/g, '')
  if (!digits) return undefined
  const n = Number(digits)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

function parseUnit(unitCell: unknown, qtyCell: unknown): string | undefined {
  const fromUnit = cleanText(unitCell)
    .replace(/\s+/g, ' ')
    .split(' ')[0]
  if (fromUnit) return fromUnit.toUpperCase()

  const qtyText = String(qtyCell ?? '')
  const match = qtyText.match(/\d+(?:[.,]\d+)?\s*([A-Za-zÀ-ỹ]+)/)
  return match?.[1]?.toUpperCase()
}

function excelDateToString(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value)
    if (!parsed) return undefined
    const dd = String(parsed.d).padStart(2, '0')
    const mm = String(parsed.m).padStart(2, '0')
    return `${dd}/${mm}/${parsed.y}`
  }
  const text = cleanText(value)
  const match = text.match(/(\d{1,2}\/\d{1,2}\/\d{4})/)
  if (match?.[1]) return match[1]
  return text || undefined
}

/**
 * Đọc mẫu BHLD:
 * Hàng 0 = tiêu đề, hàng 1 = header
 * Cột: Ngày | STT | Hình | Tên SP | Số lượng | ĐVT | Đơn giá | ...
 */
export function parseBhldExcel(file: ArrayBuffer): ExcelImportRow[] {
  const workbook = XLSX.read(file, { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) return []

  const sheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: '',
    raw: true,
  })

  const products: ExcelImportRow[] = []
  let currentDate: string | undefined

  // Cột "MÃ SKU" (nếu có) nằm ở hàng tiêu đề — tự dò vị trí.
  let skuCol = -1
  for (const headerIdx of [1, 0]) {
    const headerRow = rows[headerIdx]
    if (!headerRow) continue
    const found = headerRow.findIndex((c) => /sku/i.test(String(c ?? '')))
    if (found >= 0) {
      skuCol = found
      break
    }
  }

  for (let i = 2; i < rows.length; i += 1) {
    const row = rows[i]
    if (!row) continue

    const dateCell = row[0]
    const nameCell = row[3]
    const qtyCell = row[4]
    const unitCell = row[5]
    const priceCell = row[6]
    const sku = skuCol >= 0 ? cleanText(row[skuCol]) || undefined : undefined

    const dateParsed = excelDateToString(dateCell)
    if (dateParsed) currentDate = dateParsed

    const name = normalizeProductName(nameCell)
    const quantity = parseQuantity(qtyCell)
    if (!name || quantity <= 0) continue

    const unit = parseUnit(unitCell, qtyCell)
    const unitPrice = parsePrice(priceCell)

    products.push({
      sku,
      name,
      quantity,
      unit,
      unitPrice: unitPrice || undefined,
      date: currentDate,
    })
  }

  return products
}

/** Fallback parser cho Excel thường (header tên cột). */
export function parseProductsFromExcel(file: ArrayBuffer): ExcelImportRow[] {
  const bhld = parseBhldExcel(file)
  if (bhld.length > 0) return bhld

  const workbook = XLSX.read(file, { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) return []
  const sheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })

  const products: ExcelImportRow[] = []
  for (const row of rows) {
    const entries = Object.entries(row)
    const find = (keys: string[]) => {
      for (const [k, v] of entries) {
        const key = k.toLowerCase()
        if (keys.some((wanted) => key.includes(wanted))) return v
      }
      return undefined
    }

    const name = normalizeProductName(
      find(['tên', 'ten', 'name', 'sản phẩm', 'san pham']) ?? '',
    )
    const sku =
      cleanText(find(['sku', 'mã sp', 'ma sp', 'mã hàng', 'ma hang']) || '') || undefined
    const quantity = parseQuantity(find(['số lượng', 'so luong', 'quantity', 'sl', 'qty']))
    const unit = cleanText(find(['đơn vị', 'don vi', 'unit', 'dvt']) || '') || undefined
    const priceRaw = find(['giá nhập', 'gia nhap', 'đơn giá', 'don gia', 'price'])
    const unitPrice = parsePrice(priceRaw)
    if (!name || quantity <= 0) continue
    products.push({ sku, name, quantity, unit, unitPrice })
  }
  return products
}

function formatViCnDate(date = new Date()): string {
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const yyyy = date.getFullYear()
  return `${dd}/${mm}/${yyyy}\n${yyyy}年${Number(mm)}月${Number(dd)}日`
}

/** Chuẩn hoá ngày về YYYY-MM-DD (từ input / Excel dd/mm/yyyy / ISO). */
export function toIsoDateOnly(value?: string | null): string | undefined {
  if (!value) return undefined
  const text = value.trim()
  if (!text) return undefined
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  const vi = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (vi) {
    return `${vi[3]}-${vi[2].padStart(2, '0')}-${vi[1].padStart(2, '0')}`
  }
  const parsed = new Date(text)
  if (!Number.isNaN(parsed.getTime())) {
    const dd = String(parsed.getDate()).padStart(2, '0')
    const mm = String(parsed.getMonth() + 1).padStart(2, '0')
    return `${parsed.getFullYear()}-${mm}-${dd}`
  }
  return undefined
}

function formatViCnFromIso(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return formatViCnDate()
  return formatViCnDate(new Date(y, m - 1, d))
}

/** Ngày trên báo cáo BHLD: ưu tiên deliveryDate → lần xuất gần nhất → updatedAt. */
export function resolveProductReportDate(
  product: Product,
  movements: StockMovement[],
): string {
  const fromField = toIsoDateOnly(product.deliveryDate)
  if (fromField) return fromField

  const lastOut = [...movements]
    .filter((m) => m.productId === product.id && m.type === 'out')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  if (lastOut) return localDateKey(new Date(lastOut.createdAt))

  return localDateKey(new Date(product.updatedAt))
}

function formatQtyWithUnit(quantity: number, unit?: string): string {
  const u = (unit ?? '').trim()
  return u ? `${quantity} ${u}` : String(quantity)
}

function formatUnitCell(unit?: string): string {
  const u = (unit ?? '').trim().toUpperCase()
  if (!u) return ''
  if (u.includes('ĐÔI') || u === 'DOI') return 'ĐÔI 双'
  if (u.includes('CÁI') || u === 'CAI') return 'CÁI 个'
  if (u.includes('CUỘN') || u.includes('CUON')) return 'CUỘN 卷'
  if (u.includes('SỢI') || u.includes('SOI')) return 'SỢI 条'
  return u
}

const YELLOW = 'FFFF00'
const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FF000000' } },
  left: { style: 'thin', color: { argb: 'FF000000' } },
  bottom: { style: 'thin', color: { argb: 'FF000000' } },
  right: { style: 'thin', color: { argb: 'FF000000' } },
}

function yellowFill(): ExcelJS.Fill {
  return {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: `FF${YELLOW}` },
  }
}

function styleCell(
  cell: ExcelJS.Cell,
  options: {
    yellow?: boolean
    bold?: boolean
    size?: number
    fontName?: string
    align?: 'center' | 'left'
    border?: boolean
    numFmt?: string
  } = {},
) {
  cell.alignment = {
    horizontal: options.align ?? 'center',
    vertical: 'middle',
    wrapText: true,
  }
  cell.font = {
    name: options.fontName ?? 'Times New Roman',
    size: options.size ?? 11,
    bold: options.bold ?? false,
  }
  if (options.border !== false) {
    cell.border = THIN_BORDER
  }
  if (options.yellow) {
    cell.fill = yellowFill()
  }
  if (options.numFmt) {
    cell.numFmt = options.numFmt
  }
}

async function downloadWorkbook(workbook: ExcelJS.Workbook, filename: string) {
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

async function normalizeImageDataUrl(
  dataUrl: string,
): Promise<{ buffer: ArrayBuffer; extension: 'png' | 'jpeg' } | null> {
  const match = dataUrl.match(/^data:image\/(png|jpe?g|webp|gif);base64,(.+)$/i)
  if (!match) return null

  const rawType = match[1].toLowerCase()
  if (rawType === 'png' || rawType === 'jpeg' || rawType === 'jpg') {
    return {
      buffer: base64ToArrayBuffer(match[2]),
      extension: rawType === 'png' ? 'png' : 'jpeg',
    }
  }

  // webp/gif -> png qua canvas để Excel nhận được.
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('Không đọc được ảnh'))
      el.src = dataUrl
    })
    const canvas = document.createElement('canvas')
    const size = Math.min(240, Math.max(img.width, img.height, 1))
    const scale = size / Math.max(img.width, img.height, 1)
    canvas.width = Math.max(1, Math.round(img.width * scale))
    canvas.height = Math.max(1, Math.round(img.height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const pngUrl = canvas.toDataURL('image/png')
    const pngMatch = pngUrl.match(/^data:image\/png;base64,(.+)$/)
    if (!pngMatch) return null
    return { buffer: base64ToArrayBuffer(pngMatch[1]), extension: 'png' }
  } catch {
    return null
  }
}

async function addProductImage(
  workbook: ExcelJS.Workbook,
  sheet: ExcelJS.Worksheet,
  dataUrl: string,
  rowIndex: number,
  colIndex: number,
) {
  const parsed = await normalizeImageDataUrl(dataUrl)
  if (!parsed) return false

  const imageId = workbook.addImage({
    buffer: parsed.buffer,
    extension: parsed.extension,
  })

  // Căn giữa trong ô bằng anchor 2 góc (tránh lệch góc trên-trái).
  const pad = 0.18
  sheet.addImage(imageId, {
    tl: { col: colIndex + pad, row: rowIndex - 1 + pad },
    br: { col: colIndex + 1 - pad, row: rowIndex - pad },
    editAs: 'oneCell',
  } as unknown as ExcelJS.ImagePosition)
  return true
}

/** Xuất đúng mẫu Báo cáo công việc hàng ngày BHLD (màu / chữ Trung / căn lề). */
export async function exportProductsToExcel(
  products: Product[],
  movements: StockMovement[] = [],
  /** Lịch sử chỉnh tồn (cột bên phải) chỉ lấy các dòng này + hậu tố tên file theo khoảng ngày. */
  history?: { movements: StockMovement[]; fileSuffix?: string },
): Promise<void> {
  const today = new Date()
  const workbook = new ExcelJS.Workbook()
  workbook.creator = APP_CREATOR
  const sheet = workbook.addWorksheet('Danh sách SP & SL BHLĐ', {
    views: [{ showGridLines: true }],
    properties: { defaultRowHeight: 18 },
  })

  sheet.columns = [
    { key: 'a', width: 16 },
    { key: 'b', width: 8 },
    { key: 'c', width: 14 },
    { key: 'd', width: 42 },
    { key: 'e', width: 12 },
    { key: 'f', width: 12 },
    { key: 'g', width: 14 },
    { key: 'h', width: 14 },
    { key: 'i', width: 14 },
    { key: 'j', width: 16 },
    { key: 'k', width: 3 },
    { key: 'l', width: 14 },
    { key: 'm', width: 12 },
    { key: 'n', width: 10 },
    { key: 'o', width: 36 },
    { key: 'p', width: 14 },
  ]

  const title =
    'Danh sách sản phẩm và số lượng BHLĐ cung cấp cho bộ phận TMĐT, (chưa VAT)\n劳保部门提供给电商部门的产品及数量清单（未税）'

  const titleRow = sheet.getRow(1)
  titleRow.height = 36
  sheet.mergeCells(1, 1, 1, 10)
  const titleCell = sheet.getCell(1, 1)
  titleCell.value = title
  styleCell(titleCell, { yellow: true, bold: true, size: 12 })

  const headers = [
    'NGÀY\n日期',
    'SỐ \nTHỨ TỰ\n序号',
    'HÌNH ẢNH\nSẢN PHẨM\n产品图片',
    'TÊN \nSẢN PHẨM\n产品名称',
    'SỐ LƯỢNG\n数量',
    'ĐƠN VỊ \nTÍNH\n单位',
    'GIÁ NHẬP\n(VND)/ĐƠN VỊ\n单价',
    'HÌNH ẢNH PHIẾU GIAO HÀNG\n交货单图片',
    'HÌNH ẢNH PHIẾU GIAO HÀNG\nĐÃ KÝ\n已签字的送货单照片',
    'MÃ SKU',
  ]
  const sideHeaders = [
    'NGÀY CHỈNH TỒN\n库存调整日期',
    'GIỜ CHỈNH TỒN\n库存调整时间',
    'SỐ LƯỢNG\n数量',
    'SẢN PHẨM\n产品',
    'HÌNH ẢNH\n图片',
  ]

  const headerRow = sheet.getRow(2)
  headerRow.height = 48
  headers.forEach((text, index) => {
    const cell = headerRow.getCell(index + 1)
    cell.value = text
    styleCell(cell, { yellow: true, bold: true, size: 10 })
  })
  styleCell(headerRow.getCell(11), { border: false, size: 10 })
  sideHeaders.forEach((text, index) => {
    const cell = headerRow.getCell(index + 12)
    cell.value = text
    styleCell(cell, { yellow: true, bold: true, size: 10 })
  })

  const sortedMovements = [...(history?.movements ?? movements)].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  )

  // Sắp SP theo ngày báo cáo thực (deliveryDate / lần xuất / updatedAt).
  const exportProducts = [...products].sort((a, b) => {
    const da = resolveProductReportDate(a, movements)
    const db = resolveProductReportDate(b, movements)
    if (da !== db) return da.localeCompare(db)
    return a.name.localeCompare(b.name, 'vi')
  })

  const bodyRows = Math.max(exportProducts.length, sortedMovements.length, 1)
  const productById = new Map(products.map((p) => [p.id, p]))
  const reportDates: (string | null)[] = []

  for (let i = 0; i < bodyRows; i += 1) {
    const rowIndex = i + 3
    const row = sheet.getRow(rowIndex)
    const product = exportProducts[i]
    const movement = sortedMovements[i]
    const movedAt = movement ? new Date(movement.createdAt) : null
    const movementProduct = movement ? productById.get(movement.productId) : undefined
    const reportDate = product ? resolveProductReportDate(product, movements) : null
    reportDates.push(reportDate)

    const hasImage = Boolean(
      product?.image ||
        product?.deliverySlipImage ||
        product?.signedSlipImage ||
        movementProduct?.image,
    )
    row.height = hasImage ? 72 : 28

    const values: (string | number | null)[] = [
      product && reportDate ? formatViCnFromIso(reportDate) : null,
      product ? i + 1 : null,
      null,
      product?.name ?? null,
      product ? formatQtyWithUnit(product.quantity, product.unit) : null,
      product ? formatUnitCell(product.unit) : null,
      product?.unitPrice ?? null,
      null,
      null,
      product?.sku ?? null,
      null,
      movedAt
        ? `${String(movedAt.getDate()).padStart(2, '0')}/${String(movedAt.getMonth() + 1).padStart(2, '0')}`
        : null,
      movedAt
        ? `${String(movedAt.getHours()).padStart(2, '0')}:${String(movedAt.getMinutes()).padStart(2, '0')}`
        : null,
      movement ? movement.after : null,
      movement?.productName ?? null,
      null,
    ]

    values.forEach((value, col) => {
      const cell = row.getCell(col + 1)
      cell.value = value
      const inMainTable = col <= 9
      const inSideTable = col >= 11
      styleCell(cell, {
        yellow: col === 0 && Boolean(product),
        size: col === 3 || col === 14 ? 10 : 11,
        align: col === 3 || col === 14 ? 'left' : 'center',
        border: inMainTable || inSideTable,
        numFmt: col === 6 && typeof value === 'number' ? '#,##0' : undefined,
      })
    })

    if (product?.image) {
      await addProductImage(workbook, sheet, product.image, rowIndex, 2)
    }
    if (product?.deliverySlipImage) {
      await addProductImage(workbook, sheet, product.deliverySlipImage, rowIndex, 7)
    }
    if (product?.signedSlipImage) {
      await addProductImage(workbook, sheet, product.signedSlipImage, rowIndex, 8)
    }
    if (movementProduct?.image) {
      await addProductImage(workbook, sheet, movementProduct.image, rowIndex, 15)
    }
  }

  // Gộp ô ngày theo từng nhóm ngày liên tiếp (không gộp cả bảng thành “hôm nay”).
  let groupStart = 0
  while (groupStart < exportProducts.length) {
    const dateKey = reportDates[groupStart]
    let groupEnd = groupStart
    while (
      groupEnd + 1 < exportProducts.length &&
      reportDates[groupEnd + 1] === dateKey
    ) {
      groupEnd += 1
    }
    if (dateKey && groupEnd > groupStart) {
      const startRow = groupStart + 3
      const endRow = groupEnd + 3
      sheet.mergeCells(startRow, 1, endRow, 1)
      const dateCell = sheet.getCell(startRow, 1)
      dateCell.value = formatViCnFromIso(dateKey)
      styleCell(dateCell, { yellow: true, size: 11 })
    }
    groupStart = groupEnd + 1
  }

  const stamp = localDateKey(today)
  const suffix = history?.fileSuffix ?? stamp
  await downloadWorkbook(workbook, `BAO CAO CONG VIEC HANG NGAY BHLD ${suffix}.xlsx`)
}

function movementTypeLabel(m: StockMovement): string {
  if (m.docType === 'return') return 'Khách trả (+)\n退货'
  if (m.type === 'in') return 'Nhập (+)\n入库'
  if (m.type === 'out') return 'Xuất (−)\n出库'
  return 'Đặt tồn\n设定库存'
}

/** Xuất lịch sử chỉnh tồn — format rõ (header vàng, viền, căn lề). */
export async function exportMovementsToExcel(
  movements: StockMovement[],
  products: Product[] = [],
  /** Khoảng thời gian đã lọc: ghi vào tiêu đề + tên file. */
  range?: { label: string; fileSuffix: string },
): Promise<void> {
  const skuById = new Map(products.map((p) => [p.id, p.sku]))
  const today = new Date()
  const workbook = new ExcelJS.Workbook()
  workbook.creator = APP_CREATOR
  const sheet = workbook.addWorksheet('Lịch sử chỉnh tồn', {
    views: [{ showGridLines: true }],
    properties: { defaultRowHeight: 22 },
  })

  sheet.columns = [
    { width: 18 },
    { width: 20 },
    { width: 16 },
    { width: 36 },
    { width: 14 },
    { width: 22 },
    { width: 12 },
    { width: 10 },
    { width: 10 },
    { width: 12 },
    { width: 28 },
  ]

  const titleRow = sheet.getRow(1)
  titleRow.height = 32
  sheet.mergeCells(1, 1, 1, 11)
  const titleCell = sheet.getCell(1, 1)
  titleCell.value =
    'Lịch sử chỉnh tồn kho BHLĐ\n劳保库存调整历史' + (range ? `\n${range.label}` : '')
  if (range) titleRow.height = 48
  styleCell(titleCell, { yellow: true, bold: true, size: 12 })

  const headers = [
    'MÃ PHIẾU\n单据编号',
    'THỜI GIAN\n时间',
    'MÃ SKU',
    'SẢN PHẨM\n产品名称',
    'LOẠI\n类型',
    'NỘI DUNG\n原因',
    'SỐ LƯỢNG\n数量',
    'TRƯỚC\n调整前',
    'SAU\n调整后',
    'THAY ĐỔI\n变动',
    'GHI CHÚ\n备注',
  ]
  const headerRow = sheet.getRow(2)
  headerRow.height = 40
  headers.forEach((text, index) => {
    const cell = headerRow.getCell(index + 1)
    cell.value = text
    styleCell(cell, { yellow: true, bold: true, size: 10 })
  })

  const sorted = [...movements].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  sorted.forEach((m, i) => {
    const rowIndex = i + 3
    const row = sheet.getRow(rowIndex)
    row.height = 28
    const at = new Date(m.createdAt)
    const timeText = `${String(at.getDate()).padStart(2, '0')}/${String(at.getMonth() + 1).padStart(2, '0')}/${at.getFullYear()} ${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`

    const values: (string | number)[] = [
      m.code,
      timeText,
      m.sku ?? skuById.get(m.productId) ?? '',
      m.productName,
      movementTypeLabel(m),
      m.reason,
      m.quantity,
      m.before,
      m.after,
      m.delta ?? m.after - m.before,
      m.note ?? '',
    ]

    values.forEach((value, col) => {
      const cell = row.getCell(col + 1)
      cell.value = value
      styleCell(cell, {
        size: 11,
        align: col === 3 || col === 5 || col === 10 ? 'left' : 'center',
        numFmt: col >= 6 && col <= 9 ? '#,##0' : undefined,
      })
    })
  })

  if (sorted.length === 0) {
    const empty = sheet.getRow(3)
    empty.height = 28
    sheet.mergeCells(3, 1, 3, 11)
    const cell = empty.getCell(1)
    cell.value = 'Chưa có lịch sử'
    styleCell(cell, { size: 11 })
  }

  const stamp = range ? range.fileSuffix : localDateKey(today)
  await downloadWorkbook(workbook, `LICH SU CHINH TON BHLD ${stamp}.xlsx`)
}

/** Mẫu Excel nhập liệu — cùng format báo cáo BHLD, 1 dòng ví dụ. */
export async function downloadExcelTemplate(): Promise<void> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = APP_CREATOR
  const sheet = workbook.addWorksheet('Mẫu nhập BHLD', {
    views: [{ showGridLines: true }],
    properties: { defaultRowHeight: 18 },
  })

  sheet.columns = [
    { width: 16 },
    { width: 8 },
    { width: 14 },
    { width: 42 },
    { width: 12 },
    { width: 12 },
    { width: 14 },
    { width: 18 },
    { width: 20 },
    { width: 16 },
  ]

  const titleRow = sheet.getRow(1)
  titleRow.height = 36
  sheet.mergeCells(1, 1, 1, 10)
  const titleCell = sheet.getCell(1, 1)
  titleCell.value =
    'Mẫu nhập Excel BHLĐ (điền từ hàng 3)\n劳保Excel导入模板（从第3行填写）'
  styleCell(titleCell, { yellow: true, bold: true, size: 12 })

  const headers = [
    'NGÀY\n日期',
    'SỐ \nTHỨ TỰ\n序号',
    'HÌNH ẢNH\nSẢN PHẨM\n产品图片',
    'TÊN \nSẢN PHẨM\n产品名称',
    'SỐ LƯỢNG\n数量',
    'ĐƠN VỊ \nTÍNH\n单位',
    'GIÁ NHẬP\n(VND)/ĐƠN VỊ\n单价',
    'HÌNH ẢNH PHIẾU GIAO HÀNG\n交货单图片',
    'HÌNH ẢNH PHIẾU GIAO HÀNG\nĐÃ KÝ\n已签字的送货单照片',
    'MÃ SKU\n(không bắt buộc)',
  ]
  const headerRow = sheet.getRow(2)
  headerRow.height = 48
  headers.forEach((text, index) => {
    const cell = headerRow.getCell(index + 1)
    cell.value = text
    styleCell(cell, { yellow: true, bold: true, size: 10 })
  })

  const today = new Date()
  const sample = sheet.getRow(3)
  sample.height = 28
  const sampleValues: (string | number)[] = [
    formatViCnDate(today),
    1,
    '',
    'Găng Tay Vãi Canvas Nguyên Chất',
    '100 ĐÔI',
    formatUnitCell('ĐÔI'),
    7500,
    '',
    '',
    'GT-CANVAS',
  ]
  sampleValues.forEach((value, col) => {
    const cell = sample.getCell(col + 1)
    cell.value = value
    styleCell(cell, {
      yellow: col === 0,
      size: col === 3 ? 10 : 11,
      align: col === 3 ? 'left' : 'center',
      numFmt: col === 6 ? '#,##0' : undefined,
    })
  })

  // Thêm vài dòng trống đã kẻ viền để điền tiếp.
  for (let i = 4; i <= 12; i += 1) {
    const row = sheet.getRow(i)
    row.height = 28
    for (let col = 1; col <= 10; col += 1) {
      styleCell(row.getCell(col), {
        size: 11,
        align: col === 4 ? 'left' : 'center',
      })
    }
  }

  await downloadWorkbook(workbook, 'MAU NHAP EXCEL BHLD.xlsx')
}
