import { NextResponse, type NextRequest } from 'next/server'

import { fetchLinkMetadata } from '@/lib/submissions/metadata'
import type { SubmissionType } from '@/lib/submissions'
import { consumeRateLimit } from '@/lib/v3/rateLimit'

export const runtime = 'nodejs'
export const maxDuration = 10

/** The /add page asks for a few previews; nothing else should (18 October: the preview fetched any address for anyone). */
const PREVIEWS_PER_IP_PER_HOUR = 30

export async function GET(request: NextRequest) {
  const site = request.headers.get('sec-fetch-site')
  if (site && site !== 'same-origin') return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const limit = await consumeRateLimit({ req: request, route: 'submissions/preview', limit: PREVIEWS_PER_IP_PER_HOUR, windowMs: 60 * 60 * 1000 })
  if (!limit.allowed) return NextResponse.json({ error: 'too-many' }, { status: 429 })
  const { searchParams } = new URL(request.url)
  const url = searchParams.get('url')
  const type = (searchParams.get('type') || 'web') as SubmissionType
  if (!url) {
    return NextResponse.json({ error: 'missing-url' }, { status: 400 })
  }

  try {
    const metadata = await fetchLinkMetadata(url, type)
    return NextResponse.json({ metadata })
  } catch (error) {
    console.error('[submission-preview]', error)
    return NextResponse.json({ error: 'preview-failed' }, { status: 500 })
  }
}
