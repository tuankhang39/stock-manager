import type pg from 'pg'
import type {
  AppData,
  AppSettings,
  Category,
  DocLine,
  Platform,
  Product,
  StockDocument,
  StockMovement,
} from '../src/types'
import { DEFAULT_LOW_STOCK, DEFAULT_PLATFORMS } from '../src/types'
import type { DataResponse, ReplaceRequest, SyncRequest } from '../src/sync/protocol'

/* ---------- Ánh xạ object <-> cột ---------- */

type Kind = 'text' | 'num' | 'json' | 'ts' | 'tsReq' | 'int'

type Column = { col: string; sql: string; prop: string; kind: Kind }

const SQL_TYPE: Record<Kind, string> = {
  text: 'text',
  num: 'numeric',
  json: 'jsonb',
  ts: 'timestamptz',
  tsReq: 'timestamptz',
  int: 'bigint',
}

function cols(spec: Array<[col: string, prop: string, kind: Kind]>): Column[] {
  return spec.map(([col, prop, kind]) => ({ col, prop, kind, sql: SQL_TYPE[kind] }))
}

const PRODUCT_COLS = cols([
  ['id', 'id', 'text'],
  ['seq', 'seq', 'int'],
  ['sku', 'sku', 'text'],
  ['name', 'name', 'text'],
  ['quantity', 'quantity', 'num'],
  ['unit', 'unit', 'text'],
  ['unit_price', 'unitPrice', 'num'],
  ['category_id', 'categoryId', 'text'],
  ['sale_prices', 'salePrices', 'json'],
  ['combo_items', 'comboItems', 'json'],
  ['image', 'image', 'text'],
  ['delivery_date', 'deliveryDate', 'text'],
  ['delivery_slip_image', 'deliverySlipImage', 'text'],
  ['signed_slip_image', 'signedSlipImage', 'text'],
  ['note', 'note', 'text'],
  ['created_at', 'createdAt', 'ts'],
  ['updated_at', 'updatedAt', 'tsReq'],
])

const MOVEMENT_COLS = cols([
  ['id', 'id', 'text'],
  ['seq', 'seq', 'int'],
  ['code', 'code', 'text'],
  ['product_id', 'productId', 'text'],
  ['product_name', 'productName', 'text'],
  ['sku', 'sku', 'text'],
  ['type', 'type', 'text'],
  ['doc_type', 'docType', 'text'],
  ['doc_id', 'docId', 'text'],
  ['reason', 'reason', 'text'],
  ['quantity', 'quantity', 'num'],
  ['before_qty', 'before', 'num'],
  ['after_qty', 'after', 'num'],
  ['delta', 'delta', 'num'],
  ['unit_price', 'unitPrice', 'num'],
  ['note', 'note', 'text'],
  ['created_at', 'createdAt', 'tsReq'],
])

const DOCUMENT_COLS = cols([
  ['id', 'id', 'text'],
  ['seq', 'seq', 'int'],
  ['code', 'code', 'text'],
  ['type', 'type', 'text'],
  ['doc_date', 'date', 'text'],
  ['created_at', 'createdAt', 'tsReq'],
  ['reason', 'reason', 'text'],
  ['note', 'note', 'text'],
  ['vat_rate', 'vatRate', 'num'],
  ['image', 'image', 'text'],
])

const LINE_COLS = cols([
  ['doc_id', 'docId', 'text'],
  ['position', 'position', 'int'],
  ['id', 'id', 'text'],
  ['movement_id', 'movementId', 'text'],
  ['product_id', 'productId', 'text'],
  ['sku', 'sku', 'text'],
  ['name', 'name', 'text'],
  ['unit', 'unit', 'text'],
  ['quantity', 'quantity', 'num'],
  ['unit_price', 'unitPrice', 'num'],
  ['before_qty', 'before', 'num'],
  ['after_qty', 'after', 'num'],
  ['via_combo', 'viaCombo', 'text'],
])

function toIso(value: unknown): string | null {
  if (typeof value !== 'string' && !(value instanceof Date)) return null
  const at = new Date(value)
  return Number.isNaN(at.getTime()) ? null : at.toISOString()
}

function toRow(columns: Column[], obj: Record<string, unknown>): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  for (const c of columns) {
    const v = obj[c.prop]
    switch (c.kind) {
      case 'num':
      case 'int':
        row[c.col] = typeof v === 'number' && Number.isFinite(v) ? v : null
        break
      case 'ts':
        row[c.col] = toIso(v)
        break
      case 'tsReq':
        row[c.col] = toIso(v) ?? new Date().toISOString()
        break
      case 'json':
        row[c.col] = v === undefined ? null : v
        break
      default:
        row[c.col] = v === undefined || v === null ? null : String(v)
    }
  }
  return row
}

function fromRow<T>(columns: Column[], row: Record<string, unknown>, skip: string[] = []): T {
  const obj: Record<string, unknown> = {}
  for (const c of columns) {
    if (skip.includes(c.prop)) continue
    const v = row[c.col]
    if (v === null || v === undefined) continue
    obj[c.prop] = c.kind === 'ts' || c.kind === 'tsReq' ? (v as Date).toISOString() : v
  }
  return obj as T
}

function recordsetSql(table: string, columns: Column[], conflict: 'upsert' | 'insert'): string {
  const list = columns.map((c) => c.col).join(', ')
  const defs = columns.map((c) => `${c.col} ${c.sql}`).join(', ')
  let sql = `INSERT INTO ${table} (${list}) SELECT ${list} FROM jsonb_to_recordset($1::jsonb) AS x(${defs})`
  if (conflict === 'upsert') {
    const updates = columns
      .filter((c) => c.col !== 'id' && c.col !== 'seq')
      .map((c) => `${c.col} = EXCLUDED.${c.col}`)
      .join(', ')
    sql += ` ON CONFLICT (id) DO UPDATE SET ${updates}`
  }
  return sql
}

const ENTITY = {
  products: { table: 'products', columns: PRODUCT_COLS },
  movements: { table: 'stock_movements', columns: MOVEMENT_COLS },
  documents: { table: 'stock_documents', columns: DOCUMENT_COLS },
} as const

type EntityKey = keyof typeof ENTITY

/* ---------- Kiểm tra dữ liệu gửi lên ---------- */

export class BadRequest extends Error {}

function assertEntities(value: unknown, label: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) throw new BadRequest(`${label} phải là mảng`)
  for (const item of value) {
    if (!item || typeof item !== 'object' || typeof (item as { id?: unknown }).id !== 'string') {
      throw new BadRequest(`${label}: có bản ghi thiếu id`)
    }
  }
  return value as Array<Record<string, unknown>>
}

function assertIds(value: unknown, label: string): string[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
    throw new BadRequest(`${label} phải là mảng id`)
  }
  return value
}

function cleanSettings(raw: unknown): AppSettings {
  const t = (raw as Partial<AppSettings> | undefined)?.lowStockThreshold
  return {
    lowStockThreshold: typeof t === 'number' && t >= 0 ? Math.floor(t) : DEFAULT_LOW_STOCK,
  }
}

/* ---------- Đọc ---------- */

export async function loadAll(pool: pg.Pool): Promise<DataResponse> {
  const client = await pool.connect()
  try {
    // Một snapshot nhất quán cho tất cả bảng
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    const meta = await client.query('SELECT revision, settings FROM app_meta WHERE id = 1')
    const products = await client.query('SELECT * FROM products ORDER BY seq DESC')
    const movements = await client.query('SELECT * FROM stock_movements ORDER BY seq DESC')
    const documents = await client.query('SELECT * FROM stock_documents ORDER BY seq DESC')
    const lines = await client.query(
      'SELECT * FROM stock_document_lines ORDER BY doc_id, position',
    )
    const categories = await client.query('SELECT id, name FROM categories ORDER BY position')
    const platforms = await client.query('SELECT id, name FROM platforms ORDER BY position')
    await client.query('COMMIT')

    const linesByDoc = new Map<string, DocLine[]>()
    for (const row of lines.rows) {
      const list = linesByDoc.get(row.doc_id) ?? []
      list.push(fromRow<DocLine>(LINE_COLS, row, ['docId', 'position']))
      linesByDoc.set(row.doc_id, list)
    }

    const revision = Number(meta.rows[0]?.revision ?? 0)
    const data: AppData = {
      products: products.rows.map((r) => fromRow<Product>(PRODUCT_COLS, r, ['seq'])),
      movements: movements.rows.map((r) => fromRow<StockMovement>(MOVEMENT_COLS, r, ['seq'])),
      documents: documents.rows.map((r) => ({
        ...fromRow<Omit<StockDocument, 'lines'>>(DOCUMENT_COLS, r, ['seq']),
        lines: linesByDoc.get(r.id) ?? [],
      })),
      categories: categories.rows as Category[],
      platforms:
        revision === 0 && platforms.rows.length === 0
          ? DEFAULT_PLATFORMS.map((p) => ({ ...p }))
          : (platforms.rows as Platform[]),
      settings: cleanSettings(meta.rows[0]?.settings),
    }
    return { revision, data }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw err
  } finally {
    client.release()
  }
}

export async function getRevision(pool: pg.Pool): Promise<number> {
  const res = await pool.query('SELECT revision FROM app_meta WHERE id = 1')
  return Number(res.rows[0]?.revision ?? 0)
}

/* ---------- Ghi ---------- */

async function upsertEntities(
  client: pg.PoolClient,
  key: EntityKey,
  items: Array<Record<string, unknown>>,
): Promise<void> {
  if (items.length === 0) return
  const { table, columns } = ENTITY[key]
  // Bản ghi mới nhận seq tăng dần theo thứ tự gửi lên (cũ -> mới).
  const max = await client.query(`SELECT COALESCE(MAX(seq), 0) AS m FROM ${table}`)
  let seq = Number(max.rows[0].m)
  const rows = items.map((item) => {
    seq += 1
    return toRow(columns, { ...item, seq })
  })
  await client.query(recordsetSql(table, columns, 'upsert'), [JSON.stringify(rows)])

  if (key === 'documents') {
    const ids = items.map((d) => d.id as string)
    await client.query('DELETE FROM stock_document_lines WHERE doc_id = ANY($1)', [ids])
    const lineRows: Array<Record<string, unknown>> = []
    for (const doc of items) {
      const docLines = Array.isArray(doc.lines) ? (doc.lines as Array<Record<string, unknown>>) : []
      docLines.forEach((line, position) => {
        lineRows.push(toRow(LINE_COLS, { ...line, docId: doc.id, position }))
      })
    }
    if (lineRows.length > 0) {
      await client.query(recordsetSql('stock_document_lines', LINE_COLS, 'insert'), [
        JSON.stringify(lineRows),
      ])
    }
  }
}

async function replaceList(
  client: pg.PoolClient,
  table: 'categories' | 'platforms',
  list: unknown,
): Promise<void> {
  const items = assertEntities(list, table)
  await client.query(`DELETE FROM ${table}`)
  if (items.length === 0) return
  const rows = items.map((c, position) => ({ id: c.id, position, name: String(c.name ?? '') }))
  await client.query(
    `INSERT INTO ${table} (id, position, name)
     SELECT id, position, name FROM jsonb_to_recordset($1::jsonb) AS x(id text, position integer, name text)
     ON CONFLICT (id) DO NOTHING`,
    [JSON.stringify(rows)],
  )
}

async function bumpRevision(client: pg.PoolClient, settings?: AppSettings): Promise<number> {
  const res = settings
    ? await client.query(
        'UPDATE app_meta SET revision = revision + 1, settings = $1, updated_at = now() WHERE id = 1 RETURNING revision',
        [JSON.stringify(settings)],
      )
    : await client.query(
        'UPDATE app_meta SET revision = revision + 1, updated_at = now() WHERE id = 1 RETURNING revision',
      )
  return Number(res.rows[0].revision)
}

export type SyncResult = { ok: true; revision: number } | { ok: false; revision: number }

/** Áp phần thay đổi. Từ chối nếu DB đã được máy khác ghi sau baseRevision. */
export async function applySync(pool: pg.Pool, body: SyncRequest): Promise<SyncResult> {
  if (!body || typeof body !== 'object') throw new BadRequest('Thiếu dữ liệu')
  if (typeof body.baseRevision !== 'number') throw new BadRequest('Thiếu baseRevision')

  const upsert = {
    products: assertEntities(body.upsert?.products ?? [], 'products'),
    movements: assertEntities(body.upsert?.movements ?? [], 'movements'),
    documents: assertEntities(body.upsert?.documents ?? [], 'documents'),
  }
  const remove = {
    products: assertIds(body.remove?.products, 'remove.products'),
    movements: assertIds(body.remove?.movements, 'remove.movements'),
    documents: assertIds(body.remove?.documents, 'remove.documents'),
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const meta = await client.query('SELECT revision FROM app_meta WHERE id = 1 FOR UPDATE')
    const current = Number(meta.rows[0].revision)
    if (current !== body.baseRevision) {
      await client.query('ROLLBACK')
      return { ok: false, revision: current }
    }

    for (const key of Object.keys(ENTITY) as EntityKey[]) {
      if (remove[key].length > 0) {
        await client.query(`DELETE FROM ${ENTITY[key].table} WHERE id = ANY($1)`, [remove[key]])
      }
    }
    for (const key of Object.keys(ENTITY) as EntityKey[]) {
      await upsertEntities(client, key, upsert[key])
    }
    if (body.categories !== undefined) await replaceList(client, 'categories', body.categories)
    if (body.platforms !== undefined) await replaceList(client, 'platforms', body.platforms)

    const revision = await bumpRevision(
      client,
      body.settings !== undefined ? cleanSettings(body.settings) : undefined,
    )
    await client.query('COMMIT')
    return { ok: true, revision }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw err
  } finally {
    client.release()
  }
}

/** Ghi đè toàn bộ dữ liệu (khôi phục backup). */
export async function replaceAllData(pool: pg.Pool, body: ReplaceRequest): Promise<number> {
  const data = body?.data
  if (!data || typeof data !== 'object') throw new BadRequest('Thiếu dữ liệu')
  const products = assertEntities(data.products, 'products')
  const movements = assertEntities(data.movements, 'movements')
  const documents = assertEntities(data.documents ?? [], 'documents')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT revision FROM app_meta WHERE id = 1 FOR UPDATE')
    await client.query(
      'TRUNCATE products, stock_movements, stock_documents, stock_document_lines, categories, platforms',
    )
    // Mảng trên màn hình xếp mới -> cũ; ghi cũ -> mới để seq tăng dần.
    await upsertEntities(client, 'products', [...products].reverse())
    await upsertEntities(client, 'movements', [...movements].reverse())
    await upsertEntities(client, 'documents', [...documents].reverse())
    await replaceList(client, 'categories', data.categories ?? [])
    await replaceList(
      client,
      'platforms',
      Array.isArray(data.platforms) && data.platforms.length > 0 ? data.platforms : DEFAULT_PLATFORMS,
    )
    const revision = await bumpRevision(client, cleanSettings(data.settings))
    await client.query('COMMIT')
    return revision
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw err
  } finally {
    client.release()
  }
}
