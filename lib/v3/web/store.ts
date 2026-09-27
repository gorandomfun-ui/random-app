/**
 * Writing websites into the catalogue: one upsert per address, labelled as
 * the automatic ingestion labels everything (tagForInsert), so a site added by
 * the web ingest and one added by the server's preview line look the same.
 */

import type { Db } from 'mongodb'

import { tagForInsert, type TaggableDocument } from '@/lib/v3/tagging/atInsert'

export type WebInsertRow = {
  type: 'web'
  url: string
  title?: string
  text?: string
  host?: string
  ogImage?: string | null
  provider?: string
  source?: { name: string; url?: string }
  tags?: string[]
  keywords?: string[]
  imageMeta?: { width: number; height: number }
  /** Where the preview comes from: the site's own og:image, or a capture made by the server. */
  webPreview?: 'og' | 'shot'
}

export async function upsertWebRows(db: Db, rows: WebInsertRow[]): Promise<{ inserted: number; updated: number }> {
  if (!rows.length) return { inserted: 0, updated: 0 }
  const now = new Date()
  const sets = rows.map((row) => {
    const { imageMeta, ...rest } = row
    const base: Record<string, unknown> = { ...rest, type: 'web', updatedAt: now }
    if (imageMeta) {
      base.webImageValidatedAt = now
      base.webImageValidation = imageMeta
    }
    return base
  })
  const tagged = await tagForInsert(db, sets as unknown as TaggableDocument[])
  sets.forEach((set, index) => {
    const v3 = (tagged[index] as { v3?: unknown }).v3
    if (v3) set.v3 = v3
  })
  const result = await db.collection('items').bulkWrite(sets.map((set) => ({
    updateOne: {
      filter: { type: 'web', url: set.url as string },
      update: { $set: set, $setOnInsert: { createdAt: now, rand: Math.random() } },
      upsert: true,
    },
  })), { ordered: false })
  return { inserted: result.upsertedCount || 0, updated: result.modifiedCount || 0 }
}
