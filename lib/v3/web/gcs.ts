/**
 * Where the server's captures of websites live: a public Google Cloud Storage
 * bucket, inside the free allowance (5 GB, 100 GB of transfer a month; a
 * capture is about 60 KB). Written with a service account key that exists
 * only on the ingestion server, readable by its `random` user alone; no SDK,
 * one signed token an hour.
 */

import { createSign } from 'node:crypto'
import { readFileSync } from 'node:fs'

export const PREVIEW_BUCKET = process.env.RANDOM_PREVIEW_BUCKET || 'gorandom-web-previews'
export const PREVIEW_KEY_FILE = process.env.RANDOM_PREVIEW_KEY_FILE || '/home/random/.config/random/gcs-previews.json'

export function previewPublicUrl(name: string, bucket = PREVIEW_BUCKET): string {
  return `https://storage.googleapis.com/${bucket}/${name}`
}

type ServiceAccountKey = { client_email: string; private_key: string; token_uri?: string }

const base64url = (value: string | Buffer) => Buffer.from(value).toString('base64url')

export type Upload = (name: string, data: Buffer, contentType: string) => Promise<string>

export function gcsUploader(keyFile = PREVIEW_KEY_FILE, bucket = PREVIEW_BUCKET, request: typeof fetch = fetch): Upload {
  const key = JSON.parse(readFileSync(keyFile, 'utf8')) as ServiceAccountKey
  const audience = key.token_uri || 'https://oauth2.googleapis.com/token'
  let token: { value: string; expires: number } | null = null

  async function accessToken(): Promise<string> {
    if (token && token.expires > Date.now() + 60_000) return token.value
    const now = Math.floor(Date.now() / 1000)
    const unsigned = `${base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${base64url(JSON.stringify({
      iss: key.client_email,
      scope: 'https://www.googleapis.com/auth/devstorage.read_write',
      aud: audience,
      iat: now,
      exp: now + 3600,
    }))}`
    const signature = createSign('RSA-SHA256').update(unsigned).sign(key.private_key).toString('base64url')
    const response = await request(audience, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }),
    })
    if (!response.ok) throw new Error(`gcs token: HTTP ${response.status}`)
    const body = await response.json() as { access_token: string; expires_in: number }
    token = { value: body.access_token, expires: Date.now() + body.expires_in * 1000 }
    return token.value
  }

  return async function upload(name, data, contentType) {
    const boundary = `random${Date.now().toString(36)}`
    const metadata = JSON.stringify({ name, contentType, cacheControl: 'public, max-age=31536000' })
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\ncontent-type: ${contentType}\r\n\r\n`),
      data,
      Buffer.from(`\r\n--${boundary}--`),
    ])
    const response = await request(`https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=multipart`, {
      method: 'POST',
      headers: { authorization: `Bearer ${await accessToken()}`, 'content-type': `multipart/related; boundary=${boundary}` },
      body,
    })
    if (!response.ok) throw new Error(`gcs upload: HTTP ${response.status}`)
    return previewPublicUrl(name, bucket)
  }
}
