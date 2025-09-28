export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import type { LikeType } from '@/utils/likes'

type StoredTheme = {
  bg?: string | null
  deep?: string | null
  cream?: string | null
  text?: string | null
} | null

type StoredItem = {
  url?: string
  text?: string
  title?: string
  thumbUrl?: string | null
  ogImage?: string | null
  provider?: string | null
}

type GlobalLikeDoc = {
  _id: string
  type: LikeType
  count: number
  item: StoredItem
  theme: StoredTheme
  createdAt: Date
  updatedAt: Date
}

function sanitizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function sanitiseTheme(theme: unknown): StoredTheme {
  if (!theme || typeof theme !== 'object') return null
  const record = theme as Record<string, unknown>
  const cleaned: StoredTheme = {
    bg: sanitizeString(record.bg) || null,
    deep: sanitizeString(record.deep) || null,
    cream: sanitizeString(record.cream) || null,
    text: sanitizeString(record.text) || null,
  }
  if (!cleaned.bg && !cleaned.deep && !cleaned.cream && !cleaned.text) return null
  return cleaned
}

function sanitiseItem(raw: unknown): StoredItem {
  if (!raw || typeof raw !== 'object') return {}
  const record = raw as Record<string, unknown>
  return {
    url: sanitizeString(record.url),
    text: sanitizeString(record.text),
    title: sanitizeString(record.title),
    thumbUrl: sanitizeString(record.thumbUrl) ?? null,
    ogImage: sanitizeString(record.ogImage) ?? null,
    provider: sanitizeString(record.provider) ?? null,
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const { id, type, item, theme } = body as {
      id?: unknown
      type?: unknown
      item?: unknown
      theme?: unknown
    }

    const likeId = sanitizeString(id)
    const likeType = sanitizeString(type) as LikeType | undefined

    if (!likeId || !likeType) {
      return NextResponse.json({ error: 'Missing id or type' }, { status: 400 })
    }

    const db = await getDb()
    const collection = db.collection<GlobalLikeDoc>('likeStats')

    const now = new Date()
    const update = {
      $inc: { count: 1 },
      $set: {
        type: likeType,
        item: sanitiseItem(item),
        theme: sanitiseTheme(theme),
        updatedAt: now,
      },
      $setOnInsert: {
        createdAt: now,
      },
    }

    await collection.updateOne({ _id: likeId }, update, { upsert: true })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[likes/global] failed', error)
    return NextResponse.json({ error: 'Failed to record like' }, { status: 500 })
  }
}
