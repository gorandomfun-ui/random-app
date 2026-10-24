import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash, createVerify, generateKeyPairSync } from 'node:crypto'

import { gcsConfigured, objectKeyOf, objectUrl, signUrl, startOfDay, SIGN_MAX_SEC } from '@/lib/comm/gcs'

// A throwaway key pair stands in for the service account (the module reads the environment when first asked): the signatures must verify with its public half.
const pair = generateKeyPairSync('rsa', { modulusLength: 2048 })
const privateKey = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
process.env.COMM_GCS_BUCKET = 'comm-test-bucket'
process.env.COMM_GCS_KEY = Buffer.from(JSON.stringify({ client_email: 'comm-storage@test.iam.gserviceaccount.com', private_key: privateKey })).toString('base64')

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')

/** The string Google signs, rebuilt from the URL as the V4 rules say: the signature must verify over it. */
function stringToSignOf(url: string, method: string, headers: Array<[string, string]>): string {
  const u = new URL(url)
  const query = [...u.searchParams.entries()].filter(([k]) => k !== 'X-Goog-Signature').sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
  const canonical = [method, u.pathname, query, headers.map(([k, v]) => `${k}:${v}\n`).join(''), headers.map(([k]) => k).join(';'), 'UNSIGNED-PAYLOAD'].join('\n')
  return ['GOOG4-RSA-SHA256', u.searchParams.get('X-Goog-Date'), u.searchParams.get('X-Goog-Credential')!.split('/').slice(1).join('/'), sha256(canonical)].join('\n')
}

test('the key from the environment is read, the addresses carry the bucket and give the key back', () => {
  assert.ok(gcsConfigured())
  assert.equal(objectUrl('comm/0123456789abcdef01234567/aa bb.mp4'), 'https://storage.googleapis.com/comm-test-bucket/comm/0123456789abcdef01234567/aa%20bb.mp4')
  assert.equal(objectKeyOf('https://storage.googleapis.com/comm-test-bucket/comm/0123456789abcdef01234567/aa%20bb.mp4'), 'comm/0123456789abcdef01234567/aa bb.mp4')
  assert.equal(objectKeyOf('https://comm-test-bucket.storage.googleapis.com/promo/tracks/x.mp3?X-Goog-Signature=1'), 'promo/tracks/x.mp3')
  // The URL itself folds a `..` away, plain or encoded: no key ever climbs out of its folder.
  assert.equal(objectKeyOf('https://storage.googleapis.com/comm-test-bucket/comm/../x'), 'x')
  assert.equal(objectKeyOf('https://storage.googleapis.com/comm-test-bucket/comm/%2E%2E/x'), 'x')
  assert.equal(objectKeyOf('https://storage.googleapis.com/another/comm/x'), null)
  assert.equal(objectKeyOf('http://storage.googleapis.com/comm-test-bucket/comm/x'), null)
})

test('a signed GET verifies with the public key, holds for the asked time, and the day-stable one is the same all day', () => {
  const url = signUrl({ method: 'GET', key: 'comm/0123456789abcdef01234567/aa.mp4', expiresSec: 7200, at: Date.UTC(2026, 9, 24, 15, 4, 5) })
  const u = new URL(url)
  assert.equal(u.pathname, '/comm-test-bucket/comm/0123456789abcdef01234567/aa.mp4')
  assert.equal(u.searchParams.get('X-Goog-Algorithm'), 'GOOG4-RSA-SHA256')
  assert.equal(u.searchParams.get('X-Goog-Credential'), 'comm-storage@test.iam.gserviceaccount.com/20261024/auto/storage/goog4_request')
  assert.equal(u.searchParams.get('X-Goog-Date'), '20261024T150405Z')
  assert.equal(u.searchParams.get('X-Goog-Expires'), '7200')
  assert.equal(u.searchParams.get('X-Goog-SignedHeaders'), 'host')
  assert.ok(createVerify('RSA-SHA256').update(stringToSignOf(url, 'GET', [['host', 'storage.googleapis.com']])).verify(pair.publicKey, u.searchParams.get('X-Goog-Signature')!, 'hex'))
  const stable = signUrl({ method: 'GET', key: 'comm/x/aa.jpg', expiresSec: 2 * 86400, at: startOfDay(Date.UTC(2026, 9, 24, 15, 4, 5)) })
  assert.equal(stable, signUrl({ method: 'GET', key: 'comm/x/aa.jpg', expiresSec: 2 * 86400, at: startOfDay(Date.UTC(2026, 9, 24, 23, 59, 59)) }))
  assert.equal(new URL(stable).searchParams.get('X-Goog-Date'), '20261024T000000Z')
  assert.equal(new URL(signUrl({ method: 'GET', key: 'comm/x/aa.jpg', expiresSec: 99 * 86400 })).searchParams.get('X-Goog-Expires'), String(SIGN_MAX_SEC))
})

test('a signed PUT binds the content type: it is among the signed headers and in the signature', () => {
  const url = signUrl({ method: 'PUT', key: 'comm/0123456789abcdef01234567/bb.webm', expiresSec: 900, contentType: 'video/webm', at: Date.UTC(2026, 9, 24, 15, 4, 5) })
  const u = new URL(url)
  assert.equal(u.searchParams.get('X-Goog-SignedHeaders'), 'content-type;host')
  const headers: Array<[string, string]> = [['content-type', 'video/webm'], ['host', 'storage.googleapis.com']]
  assert.ok(createVerify('RSA-SHA256').update(stringToSignOf(url, 'PUT', headers)).verify(pair.publicKey, u.searchParams.get('X-Goog-Signature')!, 'hex'))
  assert.ok(!createVerify('RSA-SHA256').update(stringToSignOf(url, 'PUT', [['content-type', 'text/plain'], ['host', 'storage.googleapis.com']])).verify(pair.publicKey, u.searchParams.get('X-Goog-Signature')!, 'hex'))
})
