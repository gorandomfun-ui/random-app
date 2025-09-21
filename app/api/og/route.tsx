/* app/api/og/route.tsx */
import { ImageResponse } from 'next/og'

export const runtime = 'edge'

// On garde tes valeurs, mais en variables locales (pas exportées)
const ALT = 'Random share'
const SIZE = { width: 1200, height: 630 }
const CONTENT_TYPE = 'image/png'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const t = searchParams.get('t') || 'Random content'
  const bg = '#0d3df0' // deep

  // ImageResponse fixe déjà le content-type (image/png) ;
  // on passe la taille via les options { width, height }.
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: bg,
          color: '#fff4dc',
          padding: 48,
        }}
        aria-label={ALT}
      >
        <div style={{ fontSize: 22, opacity: 0.9, letterSpacing: 4 }}>RANDOM</div>
        <div style={{ fontSize: 72, lineHeight: 1.05, fontWeight: 800 }}>{t}</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <span
            style={{
              padding: '10px 16px',
              background: '#fff4dc',
              color: '#0d3df0',
              borderRadius: 999,
              fontWeight: 700,
            }}
          >
            gorandom.fun
          </span>
        </div>
      </div>
    ),
    {
      width: SIZE.width,
      height: SIZE.height,
      // Si tu veux vraiment forcer le content-type (optionnel, ImageResponse le met en png par défaut)
      // headers: { 'content-type': CONTENT_TYPE },
    }
  )
}
