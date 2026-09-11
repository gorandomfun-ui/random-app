import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const CURATOR_COOKIE = 'random_curator_v2'
export const CURATOR_TTL = 24 * 60 * 60
const secret = () => process.env.RANDOM_CURATOR_SECRET ?? ''
export const curatorConfigured = () => secret().length >= 32 && Boolean(process.env.RANDOM_EDITOR_OWNER_ID)
const digest = (value: string) => createHmac('sha256', secret()).update(value).digest('hex')
function equal(a: string, b: string): boolean {
  const left = Buffer.from(a), right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}
export function matchesCuratorSecret(value: unknown): boolean {
  return curatorConfigured() && typeof value === 'string' && value.length <= 512 && equal(digest(value), digest(secret()))
}
export function createCuratorToken(now = Date.now()): string {
  if (!curatorConfigured()) throw new Error('Curation is not configured')
  const payload = `${now + CURATOR_TTL * 1000}.${randomBytes(16).toString('hex')}`
  return `${payload}.${digest(`session:${payload}`)}`
}
export function validCuratorToken(token: string | undefined, now = Date.now()): boolean {
  if (!curatorConfigured() || !token || token.length > 160) return false
  const [expiry, nonce, signature, extra] = token.split('.')
  if (extra || !/^\d{13}$/.test(expiry ?? '') || !/^[a-f\d]{32}$/.test(nonce ?? '') || !/^[a-f\d]{64}$/.test(signature ?? '')) return false
  const deadline = Number(expiry)
  return deadline > now && deadline <= now + CURATOR_TTL * 1000 && equal(signature, digest(`session:${expiry}.${nonce}`))
}
export function curatorRequestAllowed(req: Request): boolean {
  const value = (req.headers.get('cookie') ?? '').split(';').map(x => x.trim()).find(x => x.startsWith(`${CURATOR_COOKIE}=`))?.slice(CURATOR_COOKIE.length + 1)
  return validCuratorToken(value)
}
export function sameOrigin(req: Request): boolean {
  return req.headers.get('origin') === new URL(req.url).origin
}
export function curatorRateKey(ip: string, window: number): string {
  return `curator:${digest(ip)}:${window}`
}
