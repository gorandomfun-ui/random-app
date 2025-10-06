import { Buffer } from 'node:buffer'
import { ObjectId, type Db } from 'mongodb'

import { getDbSafe } from '@/lib/random/data'
import { createFactDocument } from '@/lib/random/facts'
import { createJokeDocument } from '@/lib/random/jokes'
import { createQuoteDocument } from '@/lib/random/quotes'
import { sendSubmissionAccepted } from '@/lib/email/submissionNotification'
import { extractKeywordsFromText } from '@/lib/ingest/extract'

export type SubmissionType = 'image' | 'text' | 'web' | 'video'
export type SubmissionStatus = 'pending' | 'approved' | 'rejected'

export const SUBMISSION_FILE_LIMIT = 1 * 1024 * 1024 // 1 MB
export const SUBMISSION_STORAGE_LIMIT = 100 * 1024 * 1024 // 100 MB

type ImageFilePayload = {
  base64: string
  mimeType: string
  size: number
  fileName?: string
}

type SubmissionData =
  | {
      kind: 'image'
      imageUrl?: string
      imageFile?: ImageFilePayload | null
      contributor: { firstName: string; lastName: string }
    }
  | {
      kind: 'text'
      text: string
      textKind: 'joke' | 'quote' | 'fact'
      language?: string
      author?: string
    }
  | {
      kind: 'web'
      url: string
      meta?: SubmissionMetadata
    }
  | {
      kind: 'video'
      url: string
      meta?: SubmissionMetadata & { videoId?: string | null; provider?: string | null; canEmbed?: boolean | null }
    }

type SubmissionMetadata = {
  title?: string | null
  description?: string | null
  image?: string | null
  siteName?: string | null
  canEmbed?: boolean | null
}

export type SubmissionRecord = {
  _id: ObjectId
  type: SubmissionType
  status: SubmissionStatus
  email: string
  sizeBytes: number
  createdAt: Date
  updatedAt: Date
  data: SubmissionData
  metadata?: SubmissionMetadata | null
  processedAt?: Date | null
  resultItemId?: ObjectId | null
}

export type PublicSubmission = {
  id: string
  type: SubmissionType
  email: string
  sizeBytes: number
  createdAt: string
  data: SubmissionData & { previewDataUri?: string | null }
  metadata?: SubmissionMetadata | null
}

function getCollection(db: Db) {
  return db.collection<SubmissionRecord>('submissions')
}

export async function getSubmissionUsage(): Promise<{ used: number; limit: number; remaining: number }> {
  const db = await getDbSafe()
  if (!db) return { used: 0, limit: SUBMISSION_STORAGE_LIMIT, remaining: SUBMISSION_STORAGE_LIMIT }
  const collection = getCollection(db)
  const [doc] = await collection
    .aggregate<{ _id: null; total: number }>([
      { $match: { status: 'pending' } },
      { $group: { _id: null, total: { $sum: '$sizeBytes' } } },
    ])
    .toArray()
  const used = doc?.total ?? 0
  const remaining = Math.max(0, SUBMISSION_STORAGE_LIMIT - used)
  return { used, limit: SUBMISSION_STORAGE_LIMIT, remaining }
}

function ensureStrings(value: unknown): SubmissionMetadata | undefined {
  if (!value || typeof value !== 'object') return undefined
  const meta = value as Record<string, unknown>
  return {
    title: typeof meta.title === 'string' ? meta.title : null,
    description: typeof meta.description === 'string' ? meta.description : null,
    image: typeof meta.image === 'string' ? meta.image : null,
    siteName: typeof meta.siteName === 'string' ? meta.siteName : null,
    canEmbed: typeof meta.canEmbed === 'boolean' ? meta.canEmbed : null,
  }
}

export type ImageSubmissionPayload = {
  type: 'image'
  email: string
  imageUrl?: string
  imageFile?: ImageFilePayload | null
  firstName: string
  lastName: string
}

export type TextSubmissionPayload = {
  type: 'text'
  email: string
  text: string
  textKind: 'joke' | 'quote' | 'fact'
  language?: string
  author?: string
}

export type WebSubmissionPayload = {
  type: 'web'
  email: string
  url: string
  metadata?: SubmissionMetadata
}

export type VideoSubmissionPayload = {
  type: 'video'
  email: string
  url: string
  metadata?: SubmissionMetadata & { videoId?: string | null; provider?: string | null }
}

export type SubmissionPayload =
  | ImageSubmissionPayload
  | TextSubmissionPayload
  | WebSubmissionPayload
  | VideoSubmissionPayload

function sanitizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function sanitizeName(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

export class SubmissionError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = 'SubmissionError'
    this.status = status
  }
}

export async function createSubmission(payload: SubmissionPayload): Promise<{ id: string }> {
  const db = await getDbSafe()
  if (!db) throw new SubmissionError('storage-unavailable', 503)
  const collection = getCollection(db)

  const cleanEmail = sanitizeEmail(payload.email)
  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new SubmissionError('invalid-email')
  }

  let submissionMeta: SubmissionMetadata | undefined
  let sizeBytes = 0
  let data: SubmissionData
  if (payload.type === 'image') {
    const imageUrlRaw = payload.imageUrl?.trim() || undefined
    const imageUrl = imageUrlRaw ? normalizeUrl(imageUrlRaw) : undefined
    const imageFile = payload.imageFile ?? null
    if (!imageUrl && !imageFile) throw new SubmissionError('missing-image')
    if (imageFile && imageFile.size > SUBMISSION_FILE_LIMIT) throw new SubmissionError('file-too-large')
    const firstName = sanitizeName(payload.firstName)
    const lastName = sanitizeName(payload.lastName)
    if (!firstName || !lastName) throw new SubmissionError('missing-contributor')
    data = { kind: 'image', imageUrl, imageFile, contributor: { firstName, lastName } }
    sizeBytes = (imageFile?.size ?? 0) + (imageUrl ? Buffer.byteLength(imageUrl, 'utf8') : 0) + Buffer.byteLength(firstName, 'utf8') + Buffer.byteLength(lastName, 'utf8')
  } else if (payload.type === 'text') {
    const text = payload.text.trim()
    if (!text) throw new SubmissionError('missing-text')
    const author = payload.textKind === 'quote' ? sanitizeName(payload.author || '') : sanitizeName(payload.author || '')
    if (payload.textKind === 'quote' && !author) throw new SubmissionError('missing-author')
    data = { kind: 'text', text, textKind: payload.textKind, language: payload.language, author: author || undefined }
    sizeBytes = Buffer.byteLength(text, 'utf8') + Buffer.byteLength(author || '', 'utf8')
  } else if (payload.type === 'web') {
    const urlRaw = payload.url.trim()
    if (!urlRaw) throw new SubmissionError('missing-url')
    const url = normalizeUrl(urlRaw)
    submissionMeta = payload.metadata ? ensureStrings(payload.metadata) : undefined
    data = { kind: 'web', url, meta: submissionMeta }
    sizeBytes = Buffer.byteLength(url, 'utf8')
    if (submissionMeta) {
      if (submissionMeta.title) sizeBytes += Buffer.byteLength(submissionMeta.title, 'utf8')
      if (submissionMeta.description) sizeBytes += Buffer.byteLength(submissionMeta.description, 'utf8')
      if (submissionMeta.image) sizeBytes += Buffer.byteLength(submissionMeta.image, 'utf8')
      if (submissionMeta.siteName) sizeBytes += Buffer.byteLength(submissionMeta.siteName, 'utf8')
    }
  } else {
    const urlRaw = payload.url.trim()
    if (!urlRaw) throw new SubmissionError('missing-url')
    const url = normalizeUrl(urlRaw)
    const baseMeta = payload.metadata ? ensureStrings(payload.metadata) : undefined
    const parsed = parseVideo(url)
    const baseProvider = baseMeta && 'provider' in baseMeta ? (baseMeta as { provider?: string | null }).provider ?? null : null
    const baseVideoId = baseMeta && 'videoId' in baseMeta ? (baseMeta as { videoId?: string | null }).videoId ?? null : null
    const canEmbed = resolveEmbedCapability(baseProvider ?? parsed.provider, baseVideoId ?? parsed.videoId)
    submissionMeta = {
      ...baseMeta,
      ...(baseVideoId || parsed.videoId ? { videoId: baseVideoId ?? parsed.videoId ?? null } : {}),
      ...(baseProvider || parsed.provider ? { provider: baseProvider ?? parsed.provider ?? null } : {}),
      canEmbed,
    }
    data = { kind: 'video', url, meta: submissionMeta }
    sizeBytes = Buffer.byteLength(url, 'utf8')
    if (submissionMeta) {
      if (submissionMeta.title) sizeBytes += Buffer.byteLength(submissionMeta.title, 'utf8')
      if (submissionMeta.description) sizeBytes += Buffer.byteLength(submissionMeta.description, 'utf8')
      if (submissionMeta.image) sizeBytes += Buffer.byteLength(submissionMeta.image, 'utf8')
      if (submissionMeta.siteName) sizeBytes += Buffer.byteLength(submissionMeta.siteName, 'utf8')
      if ('videoId' in submissionMeta && submissionMeta.videoId) sizeBytes += Buffer.byteLength(String((submissionMeta as { videoId?: string | null }).videoId), 'utf8')
      if ('provider' in submissionMeta && submissionMeta.provider) sizeBytes += Buffer.byteLength(String((submissionMeta as { provider?: string | null }).provider), 'utf8')
    }
  }

  await assertNoDuplicate(db, collection, data)

  const { remaining } = await getSubmissionUsage()
  if (sizeBytes > remaining) {
    throw new SubmissionError('storage-full', 429)
  }

  const now = new Date()
  const result = await collection.insertOne({
    type: payload.type,
    status: 'pending',
    email: cleanEmail,
    sizeBytes,
    createdAt: now,
    updatedAt: now,
    data,
    metadata: submissionMeta ?? null,
  })

  return { id: result.insertedId.toHexString() }
}

function dataWithPreview(doc: SubmissionRecord): PublicSubmission['data'] {
  if (doc.data.kind === 'image' && doc.data.imageFile) {
    const mime = doc.data.imageFile.mimeType || 'image/png'
    const base64 = doc.data.imageFile.base64
    return { ...doc.data, previewDataUri: `data:${mime};base64,${base64}` }
  }
  return { ...doc.data, previewDataUri: null }
}

export async function listPendingSubmissions(): Promise<PublicSubmission[]> {
  const db = await getDbSafe()
  if (!db) return []
  const collection = getCollection(db)
  const docs = await collection
    .find({ status: 'pending' })
    .sort({ createdAt: 1 })
    .limit(200)
    .toArray()
  return docs.map((doc) => ({
    id: doc._id.toHexString(),
    type: doc.type,
    email: doc.email,
    sizeBytes: doc.sizeBytes,
    createdAt: doc.createdAt.toISOString(),
    data: dataWithPreview(doc),
    metadata: doc.metadata ?? undefined,
  }))
}

type ApprovalOptions = {
  textKind?: 'joke' | 'quote' | 'fact'
}

function buildDataUri(file?: ImageFilePayload | null): string | null {
  if (!file || !file.base64) return null
  const mime = file.mimeType || 'image/png'
  return `data:${mime};base64,${file.base64}`
}

function safeKeywords(text?: string | null, limit = 8): string[] {
  if (!text) return []
  return extractKeywordsFromText(text, limit)
}

function normalizeUrl(url: string): string {
  try {
    return new URL(url).toString()
  } catch {
    return url
  }
}

const EMBED_PROVIDERS = new Set(['youtube', 'youtu', 'vimeo', 'dailymotion'])

function resolveEmbedCapability(provider?: string | null, videoId?: string | null): boolean {
  if (videoId && provider && provider.toLowerCase().includes('youtube')) return true
  if (provider) {
    const normalized = provider.toLowerCase()
    for (const key of EMBED_PROVIDERS) {
      if (normalized.includes(key)) return true
    }
  }
  return Boolean(videoId)
}

async function assertNoDuplicate(db: Db, collection: ReturnType<typeof getCollection>, data: SubmissionData): Promise<void> {
  const items = db.collection('items')
  if (data.kind === 'image' && data.imageUrl) {
    const url = data.imageUrl
    const existingItem = await items.findOne({ type: 'image', $or: [{ url }, { 'source.url': url }] })
    if (existingItem) throw new SubmissionError('duplicate-url', 409)
    const existingPending = await collection.findOne({ status: 'pending', type: 'image', 'data.kind': 'image', 'data.imageUrl': url })
    if (existingPending) throw new SubmissionError('duplicate-url', 409)
  }
  if (data.kind === 'video') {
    const url = data.url
    const videoId = data.meta?.videoId || null
    const orFilters = videoId ? [{ videoId }, { url }] : [{ url }]
    const existingVideo = await items.findOne({ type: 'video', $or: orFilters })
    if (existingVideo) throw new SubmissionError('duplicate-url', 409)
    const orConditions: Record<string, unknown>[] = [{ 'data.url': url }]
    if (videoId) orConditions.push({ 'data.meta.videoId': videoId })
    const existingPending = await collection.findOne({
      status: 'pending',
      type: 'video',
      'data.kind': 'video',
      $or: orConditions,
    })
    if (existingPending) throw new SubmissionError('duplicate-url', 409)
  }
}

async function approveImageSubmission(record: SubmissionRecord, db: Db): Promise<ObjectId> {
  const data = record.data.kind === 'image' ? record.data : null
  if (!data) throw new SubmissionError('invalid-submission', 422)
  const dataUri = buildDataUri(data.imageFile)
  const url = data.imageUrl ? normalizeUrl(data.imageUrl) : dataUri
  if (!url) throw new SubmissionError('missing-image', 400)
  const contributor = data.contributor
  const contributorName = contributor ? `${contributor.firstName} ${contributor.lastName}`.trim() : ''
  const doc = {
    type: 'image',
    url,
    thumb: url,
    provider: 'community',
    source: {
      name: contributorName ? `Community submission – ${contributorName}` : 'Community submission',
      url: data.imageUrl ? normalizeUrl(data.imageUrl) : undefined,
    },
    tags: [],
    keywords: [],
  }
  const result = await db.collection('items').insertOne(doc)
  return result.insertedId
}

async function approveTextSubmission(record: SubmissionRecord, db: Db, options?: ApprovalOptions): Promise<ObjectId> {
  const data = record.data.kind === 'text' ? record.data : null
  if (!data) throw new SubmissionError('invalid-submission', 422)
  const text = data.text.trim()
  const kind = options?.textKind || data.textKind
  const author = data.author ? sanitizeName(data.author) : undefined
  const baseDoc = {
    text,
    provider: 'community',
    source: { name: 'Community submission', url: undefined },
  }
  let doc: Record<string, unknown> | null = null
  if (kind === 'joke') {
    doc = createJokeDocument(baseDoc) as Record<string, unknown> | null
  } else if (kind === 'quote') {
    if (!author) throw new SubmissionError('missing-author', 400)
    doc = createQuoteDocument({ ...baseDoc, author }) as Record<string, unknown> | null
  } else {
    doc = createFactDocument({ ...baseDoc }) as Record<string, unknown> | null
  }
  if (!doc) throw new SubmissionError('invalid-content', 422)
  doc.createdAt = new Date()
  doc.updatedAt = new Date()
  const result = await db.collection('items').insertOne(doc)
  return result.insertedId
}

function parseVideo(url: string): { url: string; videoId?: string; provider?: string; thumb?: string | null } {
  const normalized = normalizeUrl(url)
  try {
    const parsed = new URL(normalized)
    const host = parsed.hostname.replace(/^www\./, '')
    if (host === 'youtu.be') {
      const id = parsed.pathname.replace(/^\//, '')
      return { url: normalized, videoId: id, provider: 'youtube', thumb: id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null }
    }
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'www.youtube.com') {
      const id = parsed.searchParams.get('v') || parsed.pathname.split('/').filter(Boolean).pop()
      return { url: normalized, videoId: id || undefined, provider: 'youtube', thumb: id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null }
    }
    return { url: normalized, provider: host }
  } catch {
    return { url: normalized }
  }
}

async function approveVideoSubmission(record: SubmissionRecord, db: Db): Promise<ObjectId> {
  const data = record.data.kind === 'video' ? record.data : null
  if (!data) throw new SubmissionError('invalid-submission', 422)
  const parsed = parseVideo(data.url)
  const text = data.meta?.title || record.metadata?.title || null
  const doc = {
    type: 'video',
    url: parsed.url,
    videoId: parsed.videoId ?? null,
    provider: parsed.provider || 'community',
    thumb: data.meta?.image || parsed.thumb || null,
    text,
    tags: safeKeywords(text ?? '', 6),
    keywords: safeKeywords(`${text ?? ''} ${parsed.provider ?? ''}`, 10),
    source: { name: 'Community submission', url: parsed.url },
  }
  const result = await db.collection('items').insertOne(doc)
  return result.insertedId
}

async function approveWebSubmission(record: SubmissionRecord, db: Db): Promise<ObjectId> {
  const data = record.data.kind === 'web' ? record.data : null
  if (!data) throw new SubmissionError('invalid-submission', 422)
  const url = normalizeUrl(data.url)
  const title = data.meta?.title || record.metadata?.title || url
  const description = data.meta?.description || record.metadata?.description || ''
  const doc = {
    type: 'web',
    url,
    provider: 'community',
    title,
    text: title,
    description,
    ogImage: data.meta?.image || record.metadata?.image || null,
    tags: safeKeywords(`${title} ${description}`, 8),
    keywords: safeKeywords(`${title} ${description} ${url}`, 12),
    source: { name: data.meta?.siteName || record.metadata?.siteName || 'Community submission', url },
  }
  const result = await db.collection('items').insertOne(doc)
  return result.insertedId
}

export async function approveSubmission(id: string, options?: ApprovalOptions): Promise<{ itemId: string }> {
  const db = await getDbSafe()
  if (!db) throw new SubmissionError('storage-unavailable', 503)
  const collection = getCollection(db)
  const objectId = new ObjectId(id)
  const record = await collection.findOne({ _id: objectId })
  if (!record) throw new SubmissionError('not-found', 404)
  if (record.status !== 'pending') throw new SubmissionError('already-processed', 409)

  let insertedId: ObjectId
  if (record.type === 'image') {
    insertedId = await approveImageSubmission(record, db)
  } else if (record.type === 'text') {
    insertedId = await approveTextSubmission(record, db, options)
  } else if (record.type === 'web') {
    insertedId = await approveWebSubmission(record, db)
  } else {
    insertedId = await approveVideoSubmission(record, db)
  }

  await collection.updateOne(
    { _id: objectId },
    {
      $set: {
        status: 'approved',
        processedAt: new Date(),
        resultItemId: insertedId,
        updatedAt: new Date(),
        sizeBytes: 0,
        'data.imageFile': null,
      },
    },
  )

  try {
    await sendSubmissionAccepted(record.email, record.type)
  } catch (error) {
    console.warn('[submission-email-failed]', error)
  }

  return { itemId: insertedId.toHexString() }
}

export async function rejectSubmission(id: string): Promise<void> {
  const db = await getDbSafe()
  if (!db) throw new SubmissionError('storage-unavailable', 503)
  const collection = getCollection(db)
  const objectId = new ObjectId(id)
  const record = await collection.findOne({ _id: objectId })
  if (!record) throw new SubmissionError('not-found', 404)
  if (record.status !== 'pending') {
    await collection.deleteOne({ _id: objectId })
    return
  }
  await collection.deleteOne({ _id: objectId })
}

export async function findSubmission(id: string): Promise<SubmissionRecord | null> {
  const db = await getDbSafe()
  if (!db) return null
  const collection = getCollection(db)
  return collection.findOne({ _id: new ObjectId(id) })
}
