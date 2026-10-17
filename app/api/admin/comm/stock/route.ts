import { commAllowed, json } from '@/lib/comm/auth'
import { STOCK_PROVIDERS, STOCK_WORDS as WORDS, stockHostAllowed } from '@/lib/comm/stock'
import { getDb } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** A handful of stock pictures drawn at random, served through the proxy so a canvas can read them. */
export async function GET(req: Request) {
  if (!commAllowed(req)) return json({ error: 'Unauthorized' }, 401)
  const n = Math.max(1, Math.min(12, Number(new URL(req.url).searchParams.get('n')) || 8))
  try {
    const items = (await getDb()).collection('items')
    const out: Array<{ id: string; provider: string; page: string; src: string }> = []
    for (let tries = 0; tries < 3 && out.length < n; tries += 1) {
      const word = WORDS[Math.floor(Math.random() * WORDS.length)]
      const rows = await items.find({ keywords: word, type: 'image', rand: { $gte: Math.random() } }, { projection: { url: 1, provider: 1, source: 1 }, maxTimeMS: 3000 })
        .hint('v3_keywords_type_rand').sort({ rand: 1 }).limit(60).toArray()
      for (const row of rows) {
        const provider = String(row.provider ?? '').toLowerCase()
        if (!STOCK_PROVIDERS.includes(provider) || typeof row.url !== 'string' || !stockHostAllowed(row.url)) continue
        if (out.some((p) => p.id === String(row._id))) continue
        out.push({ id: String(row._id), provider, page: typeof row.source?.url === 'string' ? row.source.url : row.url, src: `/api/admin/comm/stock/${String(row._id)}` })
        if (out.length >= n) break
      }
    }
    return json({ pictures: out })
  } catch { return json({ error: 'unavailable' }, 503) }
}
