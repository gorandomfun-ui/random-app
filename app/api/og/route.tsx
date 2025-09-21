/* app/api/og/route.tsx */
import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Random share'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const t = searchParams.get('t') || 'Random content'
  const bg = '#0d3df0'  // deep

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
      >
        <div style={{ fontSize: 22, opacity: .9, letterSpacing: 4 }}>RANDOM</div>
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
    size
  )
}
