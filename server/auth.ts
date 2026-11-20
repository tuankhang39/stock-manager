import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'

const COOKIE = 'xs_session'
const MAX_AGE_SEC = 30 * 24 * 3600

type AuthConfig = {
  username: string
  password: string
  secret: string
  secureCookie: boolean
}

export function loadAuthConfig(): AuthConfig {
  const username = process.env.APP_USERNAME?.trim()
  const password = process.env.APP_PASSWORD
  if (!username || !password) {
    throw new Error('Thiếu APP_USERNAME / APP_PASSWORD trong .env')
  }
  let secret = process.env.SESSION_SECRET ?? ''
  if (secret.length < 16) {
    console.warn('[auth] SESSION_SECRET chưa đặt (>=16 ký tự) — dùng khóa tạm, khởi động lại sẽ phải đăng nhập lại')
    secret = randomBytes(32).toString('hex')
  }
  return {
    username,
    password,
    secret,
    secureCookie: process.env.COOKIE_SECURE === 'true',
  }
}

function sha256(text: string): Buffer {
  return createHash('sha256').update(text, 'utf8').digest()
}

function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(sha256(a), sha256(b))
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

function makeToken(cfg: AuthConfig): string {
  const payload = Buffer.from(
    JSON.stringify({ u: cfg.username, exp: Math.floor(Date.now() / 1000) + MAX_AGE_SEC }),
  ).toString('base64url')
  return `${payload}.${sign(payload, cfg.secret)}`
}

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie
  if (!header) return undefined
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx < 0) continue
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim())
  }
  return undefined
}

function verifyToken(token: string | undefined, cfg: AuthConfig): boolean {
  if (!token) return false
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return false
  if (!safeEqual(sig, sign(payload, cfg.secret))) return false
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      u?: string
      exp?: number
    }
    return data.u === cfg.username && typeof data.exp === 'number' && data.exp * 1000 > Date.now()
  } catch {
    return false
  }
}

function cookieHeader(cfg: AuthConfig, value: string, maxAge: number): string {
  const parts = [
    `${COOKIE}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ]
  if (cfg.secureCookie) parts.push('Secure')
  return parts.join('; ')
}

/* Chặn dò mật khẩu: tối đa 10 lần sai / 15 phút / IP */
const failures = new Map<string, { count: number; until: number }>()
const WINDOW_MS = 15 * 60 * 1000
const MAX_FAILS = 10

export function createAuth(cfg: AuthConfig) {
  return {
    isAuthed(req: Request): boolean {
      return verifyToken(readCookie(req, COOKIE), cfg)
    },

    login(req: Request, res: Response) {
      const ip = req.ip ?? 'unknown'
      const now = Date.now()
      const f = failures.get(ip)
      if (f && f.until > now && f.count >= MAX_FAILS) {
        res.status(429).json({ error: 'Sai quá nhiều lần, thử lại sau 15 phút' })
        return
      }
      const { username, password } = (req.body ?? {}) as { username?: unknown; password?: unknown }
      const ok =
        typeof username === 'string' &&
        typeof password === 'string' &&
        safeEqual(username.trim(), cfg.username) &&
        safeEqual(password, cfg.password)
      if (!ok) {
        const next = f && f.until > now ? f.count + 1 : 1
        failures.set(ip, { count: next, until: now + WINDOW_MS })
        res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' })
        return
      }
      failures.delete(ip)
      res.setHeader('Set-Cookie', cookieHeader(cfg, makeToken(cfg), MAX_AGE_SEC))
      res.json({ username: cfg.username })
    },

    logout(_req: Request, res: Response) {
      res.setHeader('Set-Cookie', cookieHeader(cfg, '', 0))
      res.json({ ok: true })
    },

    me(req: Request, res: Response) {
      if (!verifyToken(readCookie(req, COOKIE), cfg)) {
        res.status(401).json({ error: 'Chưa đăng nhập' })
        return
      }
      res.json({ username: cfg.username })
    },

    require(req: Request, res: Response, next: NextFunction) {
      if (!verifyToken(readCookie(req, COOKIE), cfg)) {
        res.status(401).json({ error: 'Phiên đăng nhập đã hết, vui lòng đăng nhập lại' })
        return
      }
      next()
    },
  }
}
