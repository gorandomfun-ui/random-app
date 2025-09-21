/* app/api/share/og/route.tsx */
import { ImageResponse } from 'next/og'

export const runtime = 'edge'

// /api/share/og?title=...&url=...
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const title = searchParams.get('title') || 'Random'
  const url = searchParams.get('url') || 'https://gorandom.fun'

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#111',
          color: '#fff',
          padding: 48,
          fontFamily: 'Inter, ui-sans-serif, system-ui',
        }}
      >
        <div
          style={{
            fontSize: 140,
            fontWeight: 900,
            letterSpacing: 10,
            textTransform: 'uppercase',
          }}
        >
          RANDOM
        </div>

        <div style={{ fontSize: 44, lineHeight: 1.1, maxWidth: 1000 }}>{title}</div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: 28, opacity: 0.8 }}>
            {url.replace(/^https?:\/\//, '')}
          </span>

          <span
            style={{
              background: '#e11d48',
              padding: '10px 22px',
              borderRadius: 999,
              fontSize: 28,
              fontWeight: 800,
            }}
          >
            GO RANDOM
          </span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  )
}
