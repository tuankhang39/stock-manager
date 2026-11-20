/**
 * Tạo key kích hoạt cho XiaoxinStock (bản web).
 * Usage:
 *   node scripts/generate-keys.mjs           → tạo 10 key mới (ghi đè hashes)
 *   node scripts/generate-keys.mjs --append 5 → thêm 5 key
 *
 * File bí mật (giữ riêng, đừng đưa khách): keys-private.txt
 * File build (hash only): src/license-keys.json
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const keysJsonPath = path.join(root, 'src', 'license-keys.json')
const privatePath = path.join(root, 'keys-private.txt')

const args = process.argv.slice(2)
const append = args.includes('--append')
const countArg = args.find((a) => /^\d+$/.test(a))
const count = Number(countArg ?? (append ? 5 : 10))

function makeKey() {
  const raw = crypto.randomBytes(12).toString('hex').toUpperCase()
  // XX-XXXX-XXXX-XXXX
  return `${raw.slice(0, 2)}-${raw.slice(2, 6)}-${raw.slice(6, 10)}-${raw.slice(10, 16)}`
}

function hashKey(key) {
  return crypto.createHash('sha256').update(key.trim().toUpperCase()).digest('hex')
}

let existing = { hashes: [] }
if (fs.existsSync(keysJsonPath)) {
  existing = JSON.parse(fs.readFileSync(keysJsonPath, 'utf8'))
  if (!Array.isArray(existing.hashes)) existing.hashes = []
}

const hashes = append ? [...existing.hashes] : []
const plainKeys = []

for (let i = 0; i < count; i += 1) {
  const key = makeKey()
  plainKeys.push(key)
  hashes.push(hashKey(key))
}

fs.writeFileSync(keysJsonPath, JSON.stringify({ hashes }, null, 2) + '\n', 'utf8')

const stamp = new Date().toISOString()
const block =
  `\n# Generated ${stamp} (${append ? 'append' : 'replace'} ${count} keys)\n` +
  plainKeys.map((k, i) => `${i + 1}. ${k}`).join('\n') +
  '\n'

if (append && fs.existsSync(privatePath)) {
  fs.appendFileSync(privatePath, block, 'utf8')
} else {
  fs.writeFileSync(
    privatePath,
    `# XiaoxinStock — mã kích hoạt (GIỮ BÍ MẬT). Khách nhập đúng mã là dùng được.\n${block}`,
    'utf8',
  )
}

console.log(`Đã tạo ${count} key.`)
console.log(`- Hash build: ${keysJsonPath}`)
console.log(`- Key thật (bí mật): ${privatePath}`)
plainKeys.forEach((k, i) => console.log(`  ${i + 1}. ${k}`))
