/**
 * The branded card of the app: what a story shows on Instagram or TikTok
 * (1080 × 1920), and what a link to the home unfurls into (1200 × 630).
 * The logo, the invitation in the sharer's language, the address — on the
 * home's colours, the accent changing with the day unless a theme is asked.
 */

import { ImageResponse } from 'next/og'

import { APP_SHARE, CARD_SIZES, type CardFormat } from '@/lib/share/app'
import { normalizeShareLocale } from '@/lib/share/presentation'
import { THEMES } from '@/lib/theme'

export const runtime = 'nodejs'

/** The app's own typeface, read once from its public files; the card falls back to the default fonts without it. */
const fontCache = new Map<string, Promise<ArrayBuffer | null>>()
function loadFont(origin: string, file: string): Promise<ArrayBuffer | null> {
  const key = `${origin}/fonts/${file}`
  const cached = fontCache.get(key)
  if (cached) return cached
  const loading = fetch(key).then((response) => (response.ok ? response.arrayBuffer() : null)).catch(() => null)
  fontCache.set(key, loading)
  return loading
}

function themeIndexOf(raw: string | null, now = new Date()): number {
  const parsed = Number.parseInt(raw || '', 10)
  if (Number.isInteger(parsed) && parsed >= 0 && parsed < THEMES.length) return parsed
  const dayOfYear = Math.floor((now.getTime() - Date.UTC(now.getUTCFullYear(), 0, 1)) / 86_400_000)
  return dayOfYear % THEMES.length
}

export async function GET(req: Request) {
  const requestUrl = new URL(req.url)
  const locale = normalizeShareLocale(requestUrl.searchParams.get('lang'))
  const format: CardFormat = requestUrl.searchParams.get('format') === 'story' ? 'story' : 'og'
  const theme = THEMES[themeIndexOf(requestUrl.searchParams.get('theme'))]
  const { width, height } = CARD_SIZES[format]
  const slogan = APP_SHARE[locale].slogan
  const logoUrl = new URL('/elements/logo_black.png', requestUrl.origin).toString()
  const story = format === 'story'
  const long = slogan.length > 40
  const sloganSize = story ? (long ? 82 : 96) : long ? 52 : 60
  const [black, bold] = await Promise.all([loadFont(requestUrl.origin, 'Tomorrow-Black.ttf'), loadFont(requestUrl.origin, 'Tomorrow-Bold.ttf')])
  const fonts = [
    ...(black ? [{ name: 'Tomorrow', data: black, weight: 900 as const, style: 'normal' as const }] : []),
    ...(bold ? [{ name: 'Tomorrow', data: bold, weight: 700 as const, style: 'normal' as const }] : []),
  ]
  const layer = { position: 'absolute' as const, top: 0, left: 0, width, height, display: 'flex' as const }

  return new ImageResponse(
    (
      <div style={{ position: 'relative', width, height, display: 'flex', overflow: 'hidden', background: theme.bg, color: theme.cream, fontFamily: 'Tomorrow, sans-serif' }}>
        <div style={{ ...layer, background: `linear-gradient(160deg, ${theme.deep} 0%, ${theme.bg} 55%, ${theme.text} 210%)` }} />
        <div style={{ position: 'absolute', top: story ? 250 : 178, left: -60, width: story ? 820 : 760, height: story ? 14 : 9, display: 'flex', background: '#00eaff', opacity: 0.33 }} />
        <div style={{ position: 'absolute', top: story ? 278 : 196, right: -60, width: story ? 700 : 640, height: story ? 10 : 6, display: 'flex', background: '#ff006f', opacity: 0.34 }} />

        <div style={{ ...layer, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: story ? '0 90px' : '0 80px' }}>
          <div style={{ display: 'flex', width: story ? 640 : 380, height: story ? 215 : 128, background: theme.bg }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoUrl} alt="Random" width={story ? 640 : 380} height={story ? 215 : 128} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <div style={{ display: 'flex', width: story ? 520 : 360, height: 3, marginTop: story ? 70 : 34, background: theme.text, opacity: 0.7 }} />
          <div style={{ display: 'flex', justifyContent: 'center', textAlign: 'center', maxWidth: story ? 900 : 1000, marginTop: story ? 70 : 34, fontSize: sloganSize, fontWeight: 900, lineHeight: 1.12, textShadow: '0 4px 22px rgba(0,0,0,.55)' }}>
            {slogan}
          </div>
          <div style={{ display: 'flex', marginTop: story ? 110 : 44, padding: story ? '22px 46px' : '12px 26px', background: theme.text, color: theme.cream, fontSize: story ? 38 : 22, fontWeight: 700, letterSpacing: story ? 5 : 3, textTransform: 'uppercase' }}>
            goRANDOM.fun
          </div>
        </div>
      </div>
    ),
    { width, height, fonts, headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400' } },
  )
}
