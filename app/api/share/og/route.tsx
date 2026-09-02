import { ImageResponse } from 'next/og'

import { getSharedContent } from '@/lib/share/content'
import { normalizeShareLocale, SHARE_PRESENTATION } from '@/lib/share/presentation'
import { THEMES } from '@/lib/theme'

export const runtime = 'nodejs'

const CARD_SIZE = { width: 1200, height: 630 }

function resolveThemeIndex(raw: string | null, id: string): number {
  const parsed = Number.parseInt(raw || '', 10)
  if (Number.isInteger(parsed) && parsed >= 0 && parsed < THEMES.length) return parsed
  return Array.from(id).reduce((total, char) => total + char.charCodeAt(0), 0) % THEMES.length
}

export async function GET(req: Request) {
  const requestUrl = new URL(req.url)
  const id = requestUrl.searchParams.get('id') || ''
  const content = await getSharedContent(id)
  const theme = THEMES[resolveThemeIndex(requestUrl.searchParams.get('theme'), id)]
  const locale = normalizeShareLocale(requestUrl.searchParams.get('lang'))
  const labels = SHARE_PRESENTATION[locale]
  const title = content?.title || labels.foundOn
  const imageUrl = content?.imageUrl || null
  const logoUrl = new URL('/elements/logo_black.png', requestUrl.origin).toString()
  const iconUrl = content ? new URL(`/icons/${content.type === 'video' ? 'Video' : content.type}.svg`, requestUrl.origin).toString() : null
  const titleSize = title.length > 100 ? 39 : title.length > 65 ? 43 : title.length > 35 ? 48 : 56

  return new ImageResponse(
    (
      <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', overflow: 'hidden', background: theme.bg, color: theme.cream, fontFamily: 'Arial, sans-serif' }}>
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" width={1200} height={630} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', background: `linear-gradient(135deg, ${theme.deep} 0%, ${theme.bg} 55%, ${theme.text} 170%)` }} />
        )}

        <div style={{ position: 'absolute', inset: 0, display: 'flex', background: 'linear-gradient(180deg, rgba(0,0,0,.18) 0%, rgba(0,0,0,.28) 35%, rgba(0,0,0,.92) 100%)' }} />
        <div style={{ position: 'absolute', top: 154, left: -40, width: 930, height: 10, display: 'flex', background: '#00eaff', opacity: .33 }} />
        <div style={{ position: 'absolute', top: 174, right: -40, width: 760, height: 7, display: 'flex', background: '#ff006f', opacity: .34 }} />
        <div style={{ position: 'absolute', top: 286, left: 90, width: 1070, height: 2, display: 'flex', background: theme.text, opacity: .5 }} />

        <div style={{ position: 'absolute', top: 24, left: 390, width: 420, height: 141, display: 'flex', background: theme.bg }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoUrl} alt="Random" width={420} height={141} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </div>

        <div style={{ position: 'absolute', inset: '0 0 0 0', padding: '190px 58px 38px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', alignSelf: 'flex-start', gap: 12, minHeight: 48, padding: '10px 20px', background: theme.text, color: theme.cream, fontSize: 22, fontWeight: 800, letterSpacing: 2.5, textTransform: 'uppercase' }}>
            {iconUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={iconUrl} alt="" width={25} height={25} style={{ width: 25, height: 25 }} />
            ) : null}
            <span>{content ? labels.categories[content.type] : 'Random'}</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 17 }}>
            <div style={{ display: 'flex', fontSize: 24, fontWeight: 700, color: theme.cream, opacity: .94 }}>
              {labels.foundOn}
            </div>
            <div style={{ display: 'flex', maxWidth: 1060, fontSize: titleSize, fontWeight: 900, lineHeight: 1.03, textShadow: '0 3px 18px rgba(0,0,0,.75)' }}>
              {title}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 21, opacity: .86 }}>
              <span>goRANDOM.fun</span>
              <span>{content?.provider || content?.type || 'Random'}</span>
            </div>
          </div>
        </div>
      </div>
    ),
    CARD_SIZE,
  )
}
