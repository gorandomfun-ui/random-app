import { getDb } from '@/lib/db'
import { followLink } from '@/lib/comm/posts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** The counted way to the original: one click, one more on the post, then the source. */
export async function GET(_req: Request, { params }: { params: { key: string } }) {
  try {
    const url = await followLink(await getDb(), params.key)
    if (!url) return new Response('Lien inconnu', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
    return Response.redirect(url, 302)
  } catch { return new Response('Indisponible', { status: 503 }) }
}
