import { NextResponse, type NextRequest } from 'next/server'

import { fetchLinkMetadata } from '@/lib/submissions/metadata'
import type { SubmissionType } from '@/lib/submissions'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
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
