export const runtime = 'nodejs'
export const maxDuration = 10

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
      // The same list for everyone: Vercel's network keeps it five minutes, so most visits call no function.
      { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=600' } },
    )
  } catch (error) {
    console.error('[likes/top] failed', error)
    return NextResponse.json({ error: 'Failed to load top likes' }, { status: 500 })
  }
}
