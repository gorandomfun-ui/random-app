/**
 * Google Cloud Storage with nothing but Node's crypto. The bucket is private:
 * nothing in it is readable without a signature. The service account's key
 * (COMM_GCS_KEY, the JSON in base64) signs V4 URLs for the browser — a PUT into
 * one path for a quarter of an hour, a GET for a while — and a JWT for the
 * JSON API the server uses itself: put, delete, metadata, list. No SDK: the
 * whole of it is a few hashes, and a dependency less to carry.
 */

import { createHash, createPrivateKey, createSign, type KeyObject } from 'node:crypto'

export const GCS_HOST = 'storage.googleapis.com'
const SCOPE = 'https://www.googleapis.com/auth/devstorage.read_write'
const TOKEN_URI = 'https://oauth2.googleapis.com/token'
/** The farthest a V4 signature may reach. */
export const SIGN_MAX_SEC = 7 * 24 * 3600

type ServiceKey = { client_email: string; private_key: string }
let parsed: { key: ServiceKey; pk: KeyObject } | null | undefined

/** The service account's key from the environment, parsed once; null when absent or unreadable. */
export function gcsKey(): { key: ServiceKey; pk: KeyObject } | null {
  if (parsed !== undefined) return parsed
  parsed = null
  const raw = process.env.COMM_GCS_KEY ?? ''
  if (!raw) return null
  try {
    const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8')
    const key = JSON.parse(text) as Partial<ServiceKey>
    if (typeof key.client_email !== 'string' || typeof key.private_key !== 'string') return null
    parsed = { key: { client_email: key.client_email, private_key: key.private_key }, pk: createPrivateKey(key.private_key) }
  } catch { parsed = null }
  return parsed
}

export function gcsBucket(): string {
  return (process.env.COMM_GCS_BUCKET ?? '').trim()
}

export function gcsConfigured(): boolean {
  return /^[a-z0-9][a-z0-9._-]{1,62}$/.test(gcsBucket()) && gcsKey() !== null
}

/** Percent-encoding as Google's signature wants it: unreserved characters stay, everything else is %XX (a slash too, unless kept). */
function encode(value: string, keepSlash = false): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`).replace(/%2F/g, keepSlash ? '/' : '%2F')
}

/** The object's own address, with no signature: what the records keep. */
export function objectUrl(key: string, bucket = gcsBucket()): string {
  return `https://${GCS_HOST}/${bucket}/${encode(key, true)}`
}

/** The object's key from an address of this bucket, signed or not; null for any other address. */
export function objectKeyOf(url: string, bucket = gcsBucket()): string | null {
  if (!bucket) return null
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:') return null
    // Both forms of address: the host with the bucket in the path, or the bucket as a subdomain.
    let path: string
    if (u.host === GCS_HOST && u.pathname.startsWith(`/${bucket}/`)) path = u.pathname.slice(bucket.length + 2)
    else if (u.host === `${bucket}.${GCS_HOST}`) path = u.pathname.replace(/^\//, '')
    else return null
    const key = decodeURIComponent(path)
    return key && !key.includes('..') ? key : null
  } catch { return null }
}

const stamp = (at: number) => new Date(at).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')

export type SignInput = { method: 'GET' | 'PUT' | 'HEAD'; key: string; expiresSec: number; contentType?: string; /** The signing moment: the start of the day for an address that must stay the same all day. */ at?: number }

/** A V4 signed URL: the one method, the one object, for that long; a PUT may be bound to its content type. */
export function signUrl(input: SignInput): string {
  const auth = gcsKey()
  const bucket = gcsBucket()
  if (!auth || !bucket) throw new Error('COMM_GCS_KEY or COMM_GCS_BUCKET missing')
  const at = input.at ?? Date.now()
  const expires = Math.max(1, Math.min(SIGN_MAX_SEC, Math.round(input.expiresSec)))
  const when = stamp(at), day = when.slice(0, 8)
  const scope = `${day}/auto/storage/goog4_request`
  const headers: Array<[string, string]> = [['host', GCS_HOST]]
  if (input.contentType && input.method === 'PUT') headers.push(['content-type', input.contentType])
  headers.sort((a, b) => a[0].localeCompare(b[0]))
  const signedHeaders = headers.map(([k]) => k).join(';')
  const query: Array<[string, string]> = [
    ['X-Goog-Algorithm', 'GOOG4-RSA-SHA256'],
    ['X-Goog-Credential', `${auth.key.client_email}/${scope}`],
    ['X-Goog-Date', when],
    ['X-Goog-Expires', String(expires)],
    ['X-Goog-SignedHeaders', signedHeaders],
  ].sort((a, b) => a[0].localeCompare(b[0])) as Array<[string, string]>
  const canonicalQuery = query.map(([k, v]) => `${encode(k)}=${encode(v)}`).join('&')
  const canonicalPath = `/${bucket}/${encode(input.key, true)}`
  const canonicalRequest = [input.method, canonicalPath, canonicalQuery, headers.map(([k, v]) => `${k}:${v}\n`).join(''), signedHeaders, 'UNSIGNED-PAYLOAD'].join('\n')
  const stringToSign = ['GOOG4-RSA-SHA256', when, scope, sha256(canonicalRequest)].join('\n')
  const signature = createSign('RSA-SHA256').update(stringToSign).sign(auth.pk, 'hex')
  return `https://${GCS_HOST}${canonicalPath}?${canonicalQuery}&X-Goog-Signature=${signature}`
}

/** The start of today (UTC): an address signed from there stays the same all day, so the browser's cache serves it. */
export const startOfDay = (now = Date.now()) => Math.floor(now / 86_400_000) * 86_400_000

// ----- the JSON API, as the service account

let token: { value: string; until: number } | null = null
const b64url = (data: string | Buffer) => Buffer.from(data).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')

/** An access token for the bucket, asked with a signed JWT and kept until a minute before it dies. */
export async function accessToken(fetchImpl: typeof fetch = fetch): Promise<string> {
  if (token && token.until > Date.now()) return token.value
  const auth = gcsKey()
  if (!auth) throw new Error('COMM_GCS_KEY missing')
  const now = Math.floor(Date.now() / 1000)
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64url(JSON.stringify({ iss: auth.key.client_email, scope: SCOPE, aud: TOKEN_URI, iat: now, exp: now + 3600 }))
  const signature = b64url(createSign('RSA-SHA256').update(`${head}.${claims}`).sign(auth.pk))
  const response = await fetchImpl(TOKEN_URI, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${head}.${claims}.${signature}` })
  if (!response.ok) throw new Error(`token ${response.status}`)
  const body = (await response.json()) as { access_token?: string; expires_in?: number }
  if (!body.access_token) throw new Error('token')
  token = { value: body.access_token, until: Date.now() + (Math.max(120, body.expires_in ?? 3600) - 60) * 1000 }
  return token.value
}

const api = (bucket: string) => `https://${GCS_HOST}/storage/v1/b/${encodeURIComponent(bucket)}/o`

export type ObjectMeta = { key: string; size: number; contentType: string; updated: string }

/** Writes an object with its content type and cache rule, in one multipart request. */
export async function putObject(key: string, body: ArrayBuffer | Uint8Array, contentType: string, cacheControl = 'public, max-age=31536000, immutable'): Promise<void> {
  const bucket = gcsBucket()
  const boundary = `comm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  const meta = JSON.stringify({ name: key, contentType, cacheControl })
  const head = Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`)
  const tail = Buffer.from(`\r\n--${boundary}--`)
  const bytes = body instanceof Uint8Array ? body : new Uint8Array(body)
  const payload = Buffer.concat([head, Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength), tail])
  const response = await fetch(`https://${GCS_HOST}/upload/storage/v1/b/${encodeURIComponent(bucket)}/o?uploadType=multipart`, {
    method: 'POST', headers: { authorization: `Bearer ${await accessToken()}`, 'content-type': `multipart/related; boundary=${boundary}` }, body: payload,
  })
  if (!response.ok) throw new Error(`put ${response.status}`)
}

/** Removes an object; a missing one is not an error. */
export async function deleteObject(key: string): Promise<boolean> {
  const response = await fetch(`${api(gcsBucket())}/${encodeURIComponent(key)}`, { method: 'DELETE', headers: { authorization: `Bearer ${await accessToken()}` } })
  return response.status === 204 || response.status === 404
}

/** The object's size and type, or null when it is not there. */
export async function objectMeta(key: string): Promise<ObjectMeta | null> {
  const response = await fetch(`${api(gcsBucket())}/${encodeURIComponent(key)}?fields=name,size,contentType,updated`, { headers: { authorization: `Bearer ${await accessToken()}` } })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`meta ${response.status}`)
  const body = (await response.json()) as { name?: string; size?: string; contentType?: string; updated?: string }
  return { key: body.name ?? key, size: Number(body.size ?? 0), contentType: body.contentType ?? '', updated: body.updated ?? '' }
}

/** Every object under a prefix, a thousand at most. */
export async function listObjects(prefix: string): Promise<ObjectMeta[]> {
  const out: ObjectMeta[] = []
  let pageToken = ''
  do {
    const response = await fetch(`${api(gcsBucket())}?prefix=${encodeURIComponent(prefix)}&maxResults=500&fields=items(name,size,contentType,updated),nextPageToken${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`, { headers: { authorization: `Bearer ${await accessToken()}` } })
    if (!response.ok) throw new Error(`list ${response.status}`)
    const body = (await response.json()) as { items?: Array<{ name: string; size?: string; contentType?: string; updated?: string }>; nextPageToken?: string }
    for (const item of body.items ?? []) out.push({ key: item.name, size: Number(item.size ?? 0), contentType: item.contentType ?? '', updated: item.updated ?? '' })
    pageToken = body.nextPageToken ?? ''
  } while (pageToken && out.length < 1000)
  return out
}
