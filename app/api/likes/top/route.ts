export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { fetchTopLikedItems } from '@/lib/likes/top'

export async function GET(req: NextRequest) {
  try {
    const limitParam = req.nextUrl.searchParams.get('limit')
    const limit = (() => {
      const value = Number(limitParam)
      if (!Number.isFinite(value)) return 200
      return Math.max(1, Math.min(200, Math.floor(value)))
    })()

    const items = (await fetchTopLikedItems(limit)).map((entry) => ({
      ...entry,
      theme: undefined,
    }))

    return NextResponse.json(
      { items },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } },
    )
  } catch (error) {
    console.error('[likes/top] failed', error)
    return NextResponse.json({ error: 'Failed to load top likes' }, { status: 500 })
  }
}
