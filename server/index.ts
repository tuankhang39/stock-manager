import { existsSync } from 'node:fs'
import path from 'node:path'
import express, { type NextFunction, type Request, type Response } from 'express'
import { createAuth, loadAuthConfig } from './auth'
import { createPool, initSchema } from './db'
import { applySync, BadRequest, getRevision, loadAll, replaceAllData } from './store'

try {
  process.loadEnvFile()
} catch {
  /* không có .env — dùng biến môi trường sẵn có (Docker) */
}

const PORT = Number(process.env.PORT ?? 3001)
const HOST = process.env.HOST ?? '0.0.0.0'
const STATIC_DIR = path.resolve(process.env.STATIC_DIR ?? 'dist')

type Handler = (req: Request, res: Response) => Promise<void>
const wrap = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => {
  fn(req, res).catch(next)
}

/** POST chỉ nhận JSON — form trang khác không gửi được kiểu này (chống CSRF). */
function jsonOnly(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'POST' && !req.is('application/json')) {
    res.status(415).json({ error: 'Chỉ nhận application/json' })
    return
  }
  next()
}

async function main() {
  const auth = createAuth(loadAuthConfig())
  const pool = createPool()
  await initSchema(pool)

  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 'loopback')
  app.use('/api', jsonOnly, express.json({ limit: '200mb' }))

  app.post('/api/login', (req, res) => auth.login(req, res))
  app.post('/api/logout', (req, res) => auth.logout(req, res))
  app.get('/api/me', (req, res) => auth.me(req, res))
  app.get('/api/health', wrap(async (_req, res) => {
    await pool.query('SELECT 1')
    res.json({ ok: true })
  }))

  app.use('/api', (req, res, next) => auth.require(req, res, next))

  app.get('/api/data', wrap(async (_req, res) => {
    res.json(await loadAll(pool))
  }))

  app.get('/api/revision', wrap(async (_req, res) => {
    res.json({ revision: await getRevision(pool) })
  }))

  app.post('/api/sync', wrap(async (req, res) => {
    const result = await applySync(pool, req.body)
    if (!result.ok) {
      res.status(409).json({ error: 'conflict', revision: result.revision })
      return
    }
    res.json({ revision: result.revision })
  }))

  app.post('/api/replace', wrap(async (req, res) => {
    res.json({ revision: await replaceAllData(pool, req.body) })
  }))

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Không có API này' })
  })

  if (existsSync(STATIC_DIR)) {
    app.use(express.static(STATIC_DIR, { index: false, maxAge: '1h' }))
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache')
      res.sendFile(path.join(STATIC_DIR, 'index.html'))
    })
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof BadRequest) {
      res.status(400).json({ error: err.message })
      return
    }
    const status = (err as { status?: number }).status
    if (status === 413) {
      res.status(413).json({ error: 'Dữ liệu gửi lên quá lớn' })
      return
    }
    console.error(err)
    res.status(500).json({ error: 'Lỗi server, chưa lưu được dữ liệu' })
  })

  app.listen(PORT, HOST, () => {
    console.log(`XiaoxinStock server: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`)
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
