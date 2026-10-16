import { commAllowed, json } from '@/lib/comm/auth'
import { STOCK_WORDS } from '@/lib/comm/stock'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type PexelsFile = { link: string; width?: number; height?: number; file_type?: string }
type PexelsVideo = { id: number; duration: number; url: string; user?: { name?: string }; video_files: PexelsFile[] }

/**
 * A handful of stock videos drawn at random from Pexels (a permissive licence; its files let a canvas read them).
 * Pixabay's video files refuse cross-origin reads and weigh too much to pass through here, so they stay out.
 */
export async function GET(req: Request) {
  if (!commAllowed(req)) return json({ error: 'Unauthorized' }, 401)
  const key = process.env.PEXELS_API_KEY ?? ''
  if (!key) return json({ videos: [], reason: 'missing-key' })
  const params = new URL(req.url).searchParams
  const n = Math.max(1, Math.min(6, Number(params.get('n')) || 3))
  const orientation = ['portrait', 'landscape', 'square'].includes(params.get('orientation') ?? '') ? params.get('orientation')! : 'portrait'
  const word = STOCK_WORDS[Math.floor(Math.random() * STOCK_WORDS.length)]
  try {
    const response = await fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(word)}&per_page=20&orientation=${orientation}&size=medium&page=${1 + Math.floor(Math.random() * 3)}`, { headers: { Authorization: key }, signal: AbortSignal.timeout(8000) })
    if (!response.ok) return json({ videos: [], reason: `pexels ${response.status}` })
    const body = (await response.json()) as { videos?: PexelsVideo[] }
    const pool = (body.videos ?? []).filter((v) => v.duration >= 4 && v.duration <= 60)
    const out: Array<{ id: string; provider: string; page: string; author: string; src: string; width: number; height: number; duration: number }> = []
    while (pool.length && out.length < n) {
      const v = pool.splice(Math.floor(Math.random() * pool.length), 1)[0]
      // The largest file that stays light: at most 720 wide, mp4; a texture for the glitch, not a master.
      const files = v.video_files.filter((f) => (f.file_type ?? '').includes('mp4') && f.width && f.width <= 720 && f.link.startsWith('https://videos.pexels.com/')).sort((a, b) => (b.width ?? 0) - (a.width ?? 0))
      const f = files[0]
      if (!f) continue
      out.push({ id: String(v.id), provider: 'pexels', page: v.url, author: v.user?.name ?? 'Pexels', src: f.link, width: f.width ?? 0, height: f.height ?? 0, duration: v.duration })
    }
    return json({ videos: out, word })
  } catch { return json({ videos: [], reason: 'unavailable' }) }
}
