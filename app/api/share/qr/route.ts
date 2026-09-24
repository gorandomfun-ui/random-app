/**
 * A QR code for the app's own links only: on a computer, a story cannot be
 * posted, so the panel shows a code the phone scans to take over.
 */

import QRCode from 'qrcode'

export const runtime = 'nodejs'

const OWN_HOSTS = new Set(['gorandom.fun', 'www.gorandom.fun', 'localhost'])

export async function GET(req: Request) {
  const requestUrl = new URL(req.url)
  const to = requestUrl.searchParams.get('to') || ''
  let target: URL
  try {
    target = new URL(to)
  } catch {
    return new Response('bad target', { status: 400 })
  }
  // Never a code for someone else's address: the app draws codes for itself.
  if (!OWN_HOSTS.has(target.hostname) && target.hostname !== requestUrl.hostname) return new Response('not ours', { status: 400 })
  const svg = await QRCode.toString(target.toString(), { type: 'svg', margin: 1, width: 240, color: { dark: '#111111', light: '#ffffff' } })
  return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400, s-maxage=86400' } })
}
