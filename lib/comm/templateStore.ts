/** The templates in comm_templates: the seed written once, then whatever the curator adds, every one validated. */

import type { Db } from 'mongodb'

import { COMM_TEMPLATES } from './model'
import { seedTemplates, validateTemplate, type Template } from './templates'

const QUERY_MS = 2500
let seeded: Promise<void> | null = null

/** Writes the starting templates that are missing; never overwrites one the curator changed. */
export async function ensureSeedTemplates(db: Db): Promise<void> {
  if (!seeded) {
    seeded = (async () => {
      for (const template of seedTemplates()) {
        await db.collection(COMM_TEMPLATES).updateOne({ key: template.key }, { $setOnInsert: { ...template, seed: true, createdAt: new Date() } }, { upsert: true })
      }
    })().catch(() => { seeded = null })
  }
  await seeded
}

export async function listTemplates(db: Db): Promise<Template[]> {
  await ensureSeedTemplates(db)
  const rows = await db.collection(COMM_TEMPLATES).find({}, { sort: { family: 1, key: 1 }, maxTimeMS: QUERY_MS }).toArray()
  return rows.map((row) => ({ key: String(row.key), name: String(row.name), family: row.family, mode: row.mode, layers: row.layers } as Template))
}

export async function templateByKey(db: Db, key: string): Promise<Template | null> {
  await ensureSeedTemplates(db)
  const row = await db.collection(COMM_TEMPLATES).findOne({ key }, { maxTimeMS: QUERY_MS })
  return row ? ({ key: String(row.key), name: String(row.name), family: row.family, mode: row.mode, layers: row.layers } as Template) : null
}

/** Adds or replaces a template; the validation's reasons when it is refused. */
export async function saveTemplate(db: Db, input: unknown): Promise<{ ok: true; template: Template } | { ok: false; errors: string[] }> {
  const errors = validateTemplate(input)
  if (errors.length) return { ok: false, errors }
  const t = input as Template
  const template: Template = { key: t.key, name: t.name.trim(), family: t.family, mode: t.mode, layers: t.layers }
  await db.collection(COMM_TEMPLATES).updateOne({ key: template.key }, { $set: { ...template, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } }, { upsert: true })
  return { ok: true, template }
}

export async function deleteTemplate(db: Db, key: string): Promise<boolean> {
  if (seedTemplates().some((t) => t.key === key)) return false
  const result = await db.collection(COMM_TEMPLATES).deleteOne({ key })
  return result.deletedCount === 1
}
