export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { ObjectId, type AnyBulkWriteOperation, type Document } from 'mongodb'

import { getDatabase } from '@/lib/mongodb'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import { buildWaveProfile, type WaveProfile, type WaveProfileSource } from '@/lib/random/waveProfile'

type WaveFeedbackAction = 'continue' | 'complete' | 'exit' | 'like'

type WaveFeedbackPayload = {
  anchorId?: unknown
  candidateId?: unknown
  action?: unknown
  dwellMs?: unknown
}

type FeedbackDocument = WaveProfileSource & {
  _id: ObjectId
  waveProfile?: WaveProfile | null
}

type WavePairDocument = Document & { _id: string }
type WaveRelationDocument = Document & { _id: string }

function parseId(value: unknown): ObjectId | null {
  if (typeof value !== 'string' || !ObjectId.isValid(value)) return null
  return new ObjectId(value)
}

function parseAction(value: unknown): WaveFeedbackAction | null {
  return value === 'continue' || value === 'complete' || value === 'exit' || value === 'like' ? value : null
}

function profileFor(doc: FeedbackDocument): WaveProfile {
  return buildWaveProfile(doc)
}

function learningTerms(profile: WaveProfile): string[] {
  return Array.from(new Set([...profile.phrases, ...profile.anchors, ...profile.concepts])).slice(0, 8)
}

function rewardFor(action: WaveFeedbackAction, dwellMs: number): number {
  if (action === 'like') return 4
  if (action === 'complete') return dwellMs >= 2500 ? 0.75 : 0.15
  if (action === 'continue') return dwellMs >= 5000 ? 0.2 : 0
  return dwellMs < 1200 ? -1 : -0.15
}

export async function POST(request: Request) {
  try {
    const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anonymous'
    if (!checkRateLimit(`wave-feedback:${forwarded}`, 90, 60_000)) {
      return NextResponse.json({ success: true, skipped: true }, { status: 202 })
    }
    const body = await request.json().catch(() => null) as WaveFeedbackPayload | null
    const anchorId = parseId(body?.anchorId)
    const candidateId = parseId(body?.candidateId)
    const action = parseAction(body?.action)
    if (!anchorId || !candidateId || !action || anchorId.equals(candidateId)) {
      return NextResponse.json({ success: true, skipped: true }, { status: 202 })
    }
    const dwellMs = Math.max(0, Math.min(120_000, Number(body?.dwellMs) || 0))
    const reward = rewardFor(action, dwellMs)
    const db = await getDatabase()
    const items = db.collection<FeedbackDocument>('items')
    const docs = await items.find({ _id: { $in: [anchorId, candidateId] } }).toArray()
    const anchorDoc = docs.find((doc) => doc._id.equals(anchorId))
    const candidateDoc = docs.find((doc) => doc._id.equals(candidateId))
    if (!anchorDoc || !candidateDoc) {
      return NextResponse.json({ success: true, skipped: true }, { status: 202 })
    }

    const now = new Date()
    const pairId = `${anchorId.toHexString()}:${candidateId.toHexString()}`
    const pairUpdate = db.collection<WavePairDocument>('wave_feedback_pairs').updateOne(
      { _id: pairId },
      {
        $set: { anchorId, candidateId, lastAction: action, lastDwellMs: dwellMs, updatedAt: now },
        $setOnInsert: { createdAt: now },
        $inc: {
          score: reward,
          impressions: 1,
          ...(reward > 0 ? { positive: 1 } : { negative: 1 }),
        },
      },
      { upsert: true },
    )

    const relationOperations: AnyBulkWriteOperation<WaveRelationDocument>[] = []
    if (reward >= 0.5) {
      const anchorTerms = learningTerms(profileFor(anchorDoc))
      const candidateTerms = learningTerms(profileFor(candidateDoc))
      for (const anchorTerm of anchorTerms) {
        for (const candidateTerm of candidateTerms) {
          const relationId = `${anchorTerm}:${candidateTerm}`
          relationOperations.push({
            updateOne: {
              filter: { _id: relationId },
              update: {
                $set: { anchorTerm, candidateTerm, updatedAt: now },
                $setOnInsert: { createdAt: now },
                $inc: { score: reward, positive: 1 },
              },
              upsert: true,
            },
          })
        }
      }
    }
    const relationUpdate = relationOperations.length
      ? db.collection<WaveRelationDocument>('wave_relations').bulkWrite(relationOperations, { ordered: false })
      : Promise.resolve()
    await Promise.all([pairUpdate, relationUpdate])
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ success: true, skipped: true }, { status: 202 })
  }
}
