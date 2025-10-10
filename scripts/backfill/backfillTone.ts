import fs from 'fs'
import path from 'path'
import type { AnyBulkWriteOperation, Collection } from 'mongodb'
import { ObjectId } from 'mongodb'

function ensureEnvLoaded() {
  if (process.env.MONGO_URI || process.env.MONGODB_URI) return
  const envPath = path.resolve(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) return
  const content = fs.readFileSync(envPath, 'utf8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const [key, ...rest] = trimmed.split('=')
    if (!key) continue
    const value = rest.join('=').trim()
    if (!process.env[key] && value) {
      process.env[key] = value
    }
  }
}

ensureEnvLoaded()

import { getDb } from '../../lib/db'
import {
  deriveToneAugmentation,
  flattenToneSegments,
} from '../../lib/ingest/tone'

type ItemDocument = {
  _id: ObjectId
  type?: string
  text?: unknown
  title?: unknown
  description?: unknown
  provider?: unknown
  source?: { name?: unknown }
  tags?: unknown
  keywords?: unknown
  author?: unknown
  question?: unknown
  answer?: unknown
  options?: unknown
  quiz?: {
    question?: unknown
    answer?: unknown
    options?: unknown
    category?: unknown
    difficulty?: unknown
  } | null
  channelTitle?: unknown
  host?: unknown
  tone?: unknown
  toneConfidence?: unknown
  toneSignals?: unknown
}

const SUPPORTED_TYPES = new Set(['image', 'video', 'quote', 'fact', 'joke', 'web'])
const BATCH_SIZE = 200

function filterStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
}

function ensureString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

function ensureNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function buildSegments(doc: ItemDocument): string[] {
  const type = doc.type ?? ''
  const sourceName = typeof doc.source === 'object' && doc.source !== null ? ensureString(doc.source.name) : undefined
  const tags = filterStrings(doc.tags)
  const keywords = filterStrings(doc.keywords)

  switch (type) {
    case 'image':
      return flattenToneSegments([
        ensureString(doc.title),
        ensureString(doc.description),
        ensureString(doc.provider),
        sourceName,
        tags,
        keywords,
      ])
    case 'video':
      return flattenToneSegments([
        ensureString(doc.title),
        ensureString(doc.text),
        ensureString(doc.description),
        ensureString(doc.provider),
        sourceName,
        ensureString(doc.channelTitle),
        tags,
        keywords,
      ])
    case 'quote':
      return flattenToneSegments([
        ensureString(doc.text),
        ensureString(doc.author),
        ensureString(doc.provider),
        sourceName,
        tags,
        keywords,
      ])
    case 'joke':
      return flattenToneSegments([
        ensureString(doc.text),
        ensureString(doc.provider),
        tags,
        keywords,
      ])
    case 'fact': {
      const question = ensureString(doc.question)
      const answer = ensureString(doc.answer)
      const options = filterStrings(doc.options)
      const quizQuestion = ensureString(doc.quiz?.question)
      const quizAnswer = ensureString(doc.quiz?.answer)
      const quizOptions = filterStrings(doc.quiz?.options)
      return flattenToneSegments([
        ensureString(doc.text),
        ensureString(doc.provider),
        sourceName,
        question,
        answer,
        options,
        quizQuestion,
        quizAnswer,
        quizOptions,
        ensureString(doc.quiz?.category),
        ensureString(doc.quiz?.difficulty),
        tags,
        keywords,
      ])
    }
    case 'web':
      return flattenToneSegments([
        ensureString(doc.text) ?? ensureString(doc.title),
        ensureString(doc.provider),
        sourceName,
        ensureString(doc.host),
        tags,
        keywords,
      ])
    default:
      return []
  }
}

function arraysEqual(a: readonly string[] = [], b: readonly string[] = []): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false
  }
  return true
}

async function processCollection(collection: Collection<ItemDocument>) {
  const cursor = collection.find({ type: { $in: Array.from(SUPPORTED_TYPES) } }, { batchSize: BATCH_SIZE })

  let processed = 0
  let updated = 0
  let skipped = 0

  let bulkOps: AnyBulkWriteOperation<ItemDocument>[] = []

  for await (const doc of cursor) {
    processed += 1
    const segments = buildSegments(doc)
    if (!segments.length) {
      skipped += 1
      continue
    }

    const augmentation = deriveToneAugmentation(segments)
    if (!augmentation) {
      skipped += 1
      continue
    }

    const nextTone = augmentation.tone
    const nextConfidence = augmentation.toneConfidence
    const nextSignals = augmentation.toneSignals

    const currentTone = ensureString(doc.tone)
    const currentConfidence = ensureNumber(doc.toneConfidence)
    const currentSignals = Array.isArray(doc.toneSignals)
      ? filterStrings(doc.toneSignals)
      : []

    const toneChanged = currentTone !== nextTone
    const confidenceChanged = (currentConfidence ?? null) !== (nextConfidence ?? null)
    const signalsChanged = !arraysEqual(currentSignals, nextSignals)

    if (!toneChanged && !confidenceChanged && !signalsChanged) {
      skipped += 1
      continue
    }

    bulkOps.push({
      updateOne: {
        filter: { _id: doc._id },
        update: {
          $set: {
            tone: nextTone,
            toneConfidence: nextConfidence,
            toneSignals: nextSignals,
          },
        },
      },
    })
    updated += 1

    if (bulkOps.length >= BATCH_SIZE) {
      await collection.bulkWrite(bulkOps, { ordered: false })
      bulkOps = []
      console.log(`[tone-backfill] progress: processed=${processed}, updated=${updated}, skipped=${skipped}`)
    }
  }

  if (bulkOps.length) {
    await collection.bulkWrite(bulkOps, { ordered: false })
  }

  console.log(`[tone-backfill] done: processed=${processed}, updated=${updated}, skipped=${skipped}`)
}

async function main() {
  const db = await getDb()
  const collection = db.collection<ItemDocument>('items')
  await processCollection(collection)
}

main()
  .then(() => {
    console.log('[tone-backfill] completed successfully')
    process.exit(0)
  })
  .catch((error) => {
    console.error('[tone-backfill] failed:', error)
    process.exit(1)
  })
