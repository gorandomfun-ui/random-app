import { commAllowed, json } from '@/lib/comm/auth'
import { logoDataUri } from '@/lib/comm/brand'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** The logo composed from its letters, as an SVG file the browser can draw on a canvas. */
export async function GET(req: Request) {
  if (!commAllowed(req)) return json({ error: 'Unauthorized' }, 401)
  const params = new URL(req.url).searchParams
  const variant = params.get('variant') === 'vertical' ? 'vertical' : 'horizontal'
  const color = /^#[0-9a-fA-F]{6}$/.test(params.get('color') ?? '') ? params.get('color')! : '#F8F5E6'
  const uri = await logoDataUri(variant, color)
  if (!uri) return json({ error: 'unavailable' }, 503)
  const svg = Buffer.from(uri.slice('data:image/svg+xml;base64,'.length), 'base64')
  return new Response(svg, { status: 200, headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'private, max-age=3600' } })
}
