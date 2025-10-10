import { createHash } from 'crypto'
import * as cheerio from 'cheerio'

import { sampleFromCache, touchLastShown, upsertCache } from '@/lib/random/data'
import {
  markGlobalItem,
  markGlobalKeywords,
  markGlobalOrigin,
  markGlobalProvider,
  markGlobalTopics,
} from '@/lib/random/globalState'
import {
  deriveToneAugmentation,
  flattenToneSegments,
  mergeToneHintsIntoTags,
  mergeToneSignalsIntoKeywords,
} from '@/lib/ingest/tone'

const RECENT_LIMIT = 10
const recentFacts: string[] = []
let lastFactWasQuiz = false

const FACT_TOPIC_SEEDS: Record<string, string[]> = {
  science: ['planet', 'star', 'space', 'physics', 'chemistry', 'biology', 'atom', 'quantum', 'experiment'],
  history: ['history', 'ancient', 'empire', 'king', 'queen', 'war', 'dynasty', 'medieval'],
  animal: ['animal', 'cat', 'dog', 'bird', 'fish', 'insect', 'mammal', 'reptile'],
  space: ['galaxy', 'universe', 'mars', 'moon', 'nasa', 'astronaut', 'cosmos'],
  culture: ['culture', 'festival', 'language', 'music', 'dance', 'tradition', 'myth'],
  numbers: ['percent', 'ratio', 'number', 'statistics', 'probability', 'math'],
  odd: ['weird', 'strange', 'bizarre', 'unusual', 'rare', 'unexpected'],
}

const LOCAL_FACTS = [
  'Honey never spoils.',
  'Octopuses have three hearts.',
  'Bananas are berries.',
  'A group of flamingos is a flamboyance.',
]

type TriviaDifficulty = 'easy' | 'medium' | 'hard'

export type FactQuizPayload = {
  id: string
  question: string
  options: string[]
  correctIndex: number
  answer: string
  category?: string
  difficulty?: TriviaDifficulty
}

export type FactDocument = {
  type: 'fact'
  text: string
  provider: string
  source: { name: string; url?: string }
  tags: string[]
  keywords: string[]
  variant: 'text' | 'quiz' | 'ai'
  quiz?: FactQuizPayload
  lang?: string
  hash?: string
  ai?: {
    source?: string
    model?: string
    generatedAt?: string
  } | null
  disclaimer?: string
  tone?: 'positive' | 'neutral' | 'negative'
  toneConfidence?: number
  toneSignals?: string[]
}

export type FactTextItem = {
  type: 'fact'
  variant: 'text' | 'ai'
  text: string
  provider: string
  source: { name: string; url?: string }
  lang?: string
  ai?: {
    source?: string
    model?: string
    generatedAt?: string
  } | null
  disclaimer?: string
  tone?: 'positive' | 'neutral' | 'negative'
  toneConfidence?: number
  toneSignals?: string[]
}

export type FactQuizItem = {
  type: 'fact'
  variant: 'quiz'
  id: string
  text: string
  question: string
  options: string[]
  correctIndex: number
  answer: string
  provider: string
  source: { name: string; url?: string }
  category?: string
  difficulty?: TriviaDifficulty
  tone?: 'positive' | 'neutral' | 'negative'
  toneConfidence?: number
  toneSignals?: string[]
}

export type FactItem = FactTextItem | FactQuizItem

type FactRecord = FactDocument & { lastShownAt?: Date | string | null; hash?: string; _id?: unknown }

type FactQuizDoc = FactRecord & { variant: 'quiz'; quiz: FactQuizPayload }
type FactQuizQueueEntry = { doc: FactQuizDoc; item: FactQuizItem }

const QUIZ_PRELOAD_TARGET = 6
const QUIZ_HISTORY_LIMIT = 600
const TRIVIA_API_BASE = 'https://opentdb.com'
const TRIVIA_MAX_ATTEMPTS = 5
const quizQueue: FactQuizQueueEntry[] = []
let quizPreloadRunning = false

let triviaToken: string | null = null
let triviaTokenPromise: Promise<string | null> | null = null
const servedQuizHistory = new Set<string>()

function trim(value?: string | null): string {
  return (value || '').trim()
}

function computeTags(text: string): string[] {
  const lower = text.toLowerCase()
  const tags: string[] = []
  for (const [tag, seeds] of Object.entries(FACT_TOPIC_SEEDS)) {
    if (seeds.some((seed) => lower.includes(seed))) tags.push(tag)
  }
  return Array.from(new Set(tags))
}

function computeKeywords(text: string, limit = 8): string[] {
  const lower = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ')
  const words = lower.split(/\s+/).filter(Boolean)
  const unique: string[] = []
  for (const word of words) {
    if (word.length < 3 || word.length > 18) continue
    if (!unique.includes(word)) unique.push(word)
    if (unique.length >= limit) break
  }
  return unique
}

type QuizExclusionContext = {
  questions: Set<string>
  ids: Set<string>
}

function normalizeSpaces(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function decodeHtml(value: string): string {
  if (!value) return ''
  try {
    const $ = cheerio.load(`<span>${value}</span>`, { decodeEntities: true })
    return normalizeSpaces($('span').text())
  } catch {
    return normalizeSpaces(value)
  }
}

function shuffleArray<T>(values: T[]): T[] {
  const copy = [...values]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = copy[i]
    copy[i] = copy[j]
    copy[j] = tmp
  }
  return copy
}

function mapDifficulty(value?: string | null): TriviaDifficulty | undefined {
  if (!value) return undefined
  const normalized = value.trim().toLowerCase()
  if (normalized === 'easy' || normalized === 'medium' || normalized === 'hard') return normalized
  return undefined
}

function buildQuizExclusion(exclude: string[]): QuizExclusionContext {
  const questions = new Set<string>()
  const ids = new Set<string>()
  for (const entry of exclude) {
    const normalized = entry.trim().toLowerCase()
    if (!normalized) continue
    questions.add(normalized)
    ids.add(createHash('sha1').update(normalized).digest('hex'))
  }
  return { questions, ids }
}

function buildQuizItem(doc: FactQuizDoc): FactQuizItem | null {
  if (!doc.quiz) return null
  const question = trim(doc.quiz.question || doc.text)
  if (!question) return null
  const provider = trim(doc.provider) || 'Open Trivia DB'
  const sourceName = trim(doc.source?.name || '') || provider
  const sourceUrl = typeof doc.source?.url === 'string' ? doc.source.url : undefined
  const id = doc.quiz.id || doc.hash || createHash('sha1').update(question.toLowerCase()).digest('hex')
  const tone = typeof doc.tone === 'string' ? doc.tone : undefined
  const toneConfidence = typeof doc.toneConfidence === 'number' ? doc.toneConfidence : undefined
  const toneSignals = Array.isArray(doc.toneSignals)
    ? doc.toneSignals.filter((entry): entry is string => typeof entry === 'string')
    : undefined
  return {
    type: 'fact',
    variant: 'quiz',
    id,
    text: question,
    question,
    options: doc.quiz.options.slice(),
    correctIndex: doc.quiz.correctIndex,
    answer: doc.quiz.answer,
    provider,
    source: { name: sourceName, url: sourceUrl },
    category: doc.quiz.category,
    difficulty: doc.quiz.difficulty,
    tone,
    toneConfidence,
    toneSignals,
  }
}

type OpenTriviaQuestion = {
  category?: string
  type?: string
  difficulty?: string
  question?: string
  correct_answer?: string
  incorrect_answers?: string[]
}

type OpenTriviaResponse = {
  response_code?: number
  results?: OpenTriviaQuestion[]
}

type OpenTriviaTokenResponse = {
  response_code?: number
  token?: string
}

async function requestTriviaToken(command: 'request' | 'reset', current?: string | null): Promise<string | null> {
  try {
    const params = new URLSearchParams({ command })
    if (command === 'reset' && current) params.set('token', current)
    const res = await fetch(`${TRIVIA_API_BASE}/api_token.php?${params.toString()}`, { cache: 'no-store' })
    if (!res.ok) return null
    const payload = (await res.json()) as OpenTriviaTokenResponse
    if (payload?.response_code === 0 && typeof payload.token === 'string' && payload.token) {
      return payload.token
    }
  } catch {
    /* ignore */
  }
  return null
}

async function refreshTriviaToken(): Promise<string | null> {
  if (triviaTokenPromise) return triviaTokenPromise
  triviaTokenPromise = (async () => {
    const token = await requestTriviaToken('request')
    triviaToken = token || null
    return triviaToken
  })()
  try {
    return await triviaTokenPromise
  } finally {
    triviaTokenPromise = null
  }
}

async function resetTriviaToken(): Promise<string | null> {
  if (triviaTokenPromise) return triviaTokenPromise
  triviaTokenPromise = (async () => {
    let token: string | null = null
    if (triviaToken) {
      token = await requestTriviaToken('reset', triviaToken)
    }
    if (!token) {
      token = await requestTriviaToken('request')
    }
    triviaToken = token || null
    return triviaToken
  })()
  try {
    return await triviaTokenPromise
  } finally {
    triviaTokenPromise = null
  }
}

async function getTriviaToken(): Promise<string | null> {
  if (triviaToken) return triviaToken
  return refreshTriviaToken()
}

async function sampleQuizFromCacheDoc(
  exclusion: QuizExclusionContext,
  avoidIds: Set<string>,
): Promise<FactQuizDoc | null> {
  const filter: Record<string, unknown> = { variant: 'quiz' }
  const blockedIds = new Set([...avoidIds, ...exclusion.ids, ...servedQuizHistory])
  if (blockedIds.size) filter['quiz.id'] = { $nin: Array.from(blockedIds) }
  const doc = await sampleFromCache<FactQuizDoc>('fact', filter)
  if (doc?.quiz) return doc
  return null
}

async function fetchTriviaBatch(
  count: number,
  exclusion: QuizExclusionContext,
  avoidIds: Set<string>,
  history: Set<string>,
): Promise<FactQuizDoc[]> {
  const target = Math.max(1, Math.min(12, count))
  const docs: FactQuizDoc[] = []
  const seenHashes = new Set<string>()

  for (let attempt = 0; attempt < TRIVIA_MAX_ATTEMPTS && docs.length < target; attempt++) {
    const remaining = Math.max(1, target - docs.length)
    const amount = Math.min(20, Math.max(remaining * 2, remaining, 3))

    const params = new URLSearchParams({ amount: String(amount), type: 'multiple' })
    const token = await getTriviaToken()
    if (token) params.set('token', token)

    let payload: OpenTriviaResponse | null = null
    try {
      const res = await fetch(`${TRIVIA_API_BASE}/api.php?${params.toString()}`, { cache: 'no-store' })
      if (!res.ok) continue
      payload = (await res.json()) as OpenTriviaResponse
    } catch {
      payload = null
    }

    if (!payload) continue
    const code = payload.response_code ?? 0
    if (code === 3 || code === 4) {
      await resetTriviaToken()
      continue
    }
    if (!Array.isArray(payload.results) || !payload.results.length) {
      if (code === 1) break
      continue
    }

    for (const entry of payload.results) {
      const question = decodeHtml(entry?.question ?? '')
      if (!question) continue
      const normalizedQuestion = question.toLowerCase()
      if (exclusion.questions.has(normalizedQuestion)) continue

      const correctAnswer = decodeHtml(entry?.correct_answer ?? '')
      const incorrectAnswers = Array.isArray(entry?.incorrect_answers)
        ? entry.incorrect_answers.map((answer) => decodeHtml(answer)).filter(Boolean)
        : []
      if (!correctAnswer || incorrectAnswers.length < 1) continue
      const options = shuffleArray([...incorrectAnswers, correctAnswer])
      const correctIndex = Math.max(0, options.findIndex((option) => option === correctAnswer))

      const hash = createHash('sha1').update(normalizedQuestion).digest('hex')
      if (exclusion.ids.has(hash) || avoidIds.has(hash) || seenHashes.has(hash) || history.has(hash)) continue

      const baseDoc = createFactDocument({
        text: question,
        provider: 'open-trivia-db',
        source: { name: 'Open Trivia DB', url: TRIVIA_API_BASE },
      })
      if (!baseDoc) continue

      const category = entry?.category ? decodeHtml(entry.category) : undefined
      const difficulty = mapDifficulty(entry?.difficulty)
      const tags = new Set<string>([...baseDoc.tags, 'quiz', 'trivia'])
      if (category) tags.add(category.toLowerCase())
      if (difficulty) tags.add(difficulty)
      const keywordSet = new Set<string>([...baseDoc.keywords])
      for (const option of options) {
        const lowered = option.toLowerCase()
        if (lowered.length >= 3 && lowered.length <= 26) keywordSet.add(lowered)
      }
      const baseTagList = Array.from(tags)
      const baseKeywordList = Array.from(keywordSet)
      const toneDetails = deriveToneAugmentation(
        flattenToneSegments([
          'quiz',
          question,
          correctAnswer,
          options,
          category,
          difficulty,
          baseTagList,
          baseKeywordList,
        ]),
      )
      const mergedTags = mergeToneHintsIntoTags(baseTagList, toneDetails?.toneTagHints, 16)
      const mergedKeywords = mergeToneSignalsIntoKeywords(baseKeywordList, toneDetails?.toneSignals, 18)

      const doc: FactQuizDoc = {
        ...baseDoc,
        text: question,
        provider: 'open-trivia-db',
        source: { name: 'Open Trivia DB', url: TRIVIA_API_BASE },
        tags: mergedTags,
        keywords: mergedKeywords,
        variant: 'quiz',
        quiz: {
          id: hash,
          question,
          options,
          correctIndex,
          answer: correctAnswer,
          category,
          difficulty,
        },
        hash,
        tone: toneDetails?.tone ?? baseDoc.tone,
        toneConfidence: toneDetails?.toneConfidence ?? baseDoc.toneConfidence,
        toneSignals: toneDetails?.toneSignals ?? baseDoc.toneSignals,
      }

      await upsertCache('fact', { hash }, doc)
      docs.push(doc)
      seenHashes.add(hash)
      avoidIds.add(hash)
      if (docs.length >= target) break
    }
  }

  return docs
}

async function fillQuizQueue(exclusion: QuizExclusionContext): Promise<boolean> {
  const currentIds = new Set<string>()
  for (const entry of quizQueue) {
    if (entry.doc.quiz?.id) currentIds.add(entry.doc.quiz.id)
  }

  const docFromCache = await sampleQuizFromCacheDoc(exclusion, currentIds)
  if (docFromCache?.quiz) {
    const item = buildQuizItem(docFromCache)
    if (item && !exclusion.ids.has(item.id) && !currentIds.has(item.id)) {
      quizQueue.push({ doc: docFromCache, item })
      currentIds.add(item.id)
      return true
    }
  }

  const fetchedDocs = await fetchTriviaBatch(QUIZ_PRELOAD_TARGET, exclusion, currentIds, servedQuizHistory)
  let added = false
  for (const fetched of fetchedDocs) {
    if (!fetched.quiz) continue
    const item = buildQuizItem(fetched)
    if (!item) continue
    if (exclusion.ids.has(item.id) || currentIds.has(item.id)) continue
    quizQueue.push({ doc: fetched, item })
    currentIds.add(item.id)
    added = true
  }
  return added
}

async function ensureQuizPreloaded(exclusion: QuizExclusionContext): Promise<void> {
  if (quizQueue.length >= QUIZ_PRELOAD_TARGET) return
  if (quizPreloadRunning) return
  quizPreloadRunning = true
  try {
    for (let i = 0; i < QUIZ_PRELOAD_TARGET; i++) {
      if (quizQueue.length >= QUIZ_PRELOAD_TARGET) break
      const added = await fillQuizQueue(exclusion)
      if (!added) break
    }
  } finally {
    quizPreloadRunning = false
  }
}

async function getNextQuizEntry(exclusion: QuizExclusionContext): Promise<FactQuizQueueEntry | null> {
  await ensureQuizPreloaded(exclusion)
  while (quizQueue.length) {
    const entry = quizQueue.shift()!
    const normalized = entry.item.text.toLowerCase()
    if (exclusion.questions.has(normalized)) continue
    return entry
  }
  if (!quizPreloadRunning) {
    await ensureQuizPreloaded(exclusion)
    if (quizQueue.length) return getNextQuizEntry(exclusion)
  }
  return null
}

export function createFactDocument(doc: Record<string, unknown>): FactDocument | null {
  const text = trim(typeof doc.text === 'string' ? doc.text : '')
  if (!text) return null
  const provider = trim(typeof doc.provider === 'string' ? doc.provider : '') || 'fact'
  const rawSource = doc.source && typeof doc.source === 'object' ? (doc.source as { name?: string; url?: string }) : null
  const sourceName = trim(rawSource?.name || '') || provider
  const sourceUrl = rawSource?.url && typeof rawSource.url === 'string' ? rawSource.url : undefined
  const tags = Array.isArray(doc.tags) && doc.tags.length
    ? doc.tags.filter((entry): entry is string => typeof entry === 'string')
    : computeTags(text)
  const keywords = Array.isArray(doc.keywords) && doc.keywords.length
    ? doc.keywords.filter((entry): entry is string => typeof entry === 'string')
    : computeKeywords(text)
  const toneSegments = flattenToneSegments([
    provider,
    sourceName,
    text,
    tags,
    keywords,
  ])
  const tone = deriveToneAugmentation(toneSegments)
  const mergedTags = mergeToneHintsIntoTags(tags, tone?.toneTagHints, 14)
  const mergedKeywords = mergeToneSignalsIntoKeywords(keywords, tone?.toneSignals, 16)
  return {
    type: 'fact',
    text,
    provider,
    source: { name: sourceName, url: sourceUrl },
    tags: mergedTags,
    keywords: mergedKeywords,
    variant: 'text',
    tone: tone?.tone,
    toneConfidence: tone?.toneConfidence,
    toneSignals: tone?.toneSignals,
  }
}

function registerRecent(text: string) {
  const key = text.toLowerCase()
  const idx = recentFacts.indexOf(key)
  if (idx >= 0) recentFacts.splice(idx, 1)
  recentFacts.push(key)
  while (recentFacts.length > RECENT_LIMIT) recentFacts.shift()
}

async function pickFromDb(exclude: string[]): Promise<FactRecord | null> {
  const baseFilter: Record<string, unknown> = { variant: { $ne: 'quiz' } }
  if (exclude.length) baseFilter.text = { $nin: exclude }
  const doc = await sampleFromCache<FactRecord>('fact', baseFilter)
  if (doc && doc.variant !== 'quiz') return doc
  if (exclude.length) {
    const fallback = await sampleFromCache<FactRecord>('fact', { variant: { $ne: 'quiz' } })
    if (fallback && fallback.variant !== 'quiz') return fallback
  }
  return null
}

export async function selectFact(): Promise<FactItem | null> {
  const exclude = recentFacts.slice(-RECENT_LIMIT)
  const quizExclusion = buildQuizExclusion(exclude)

  if (!lastFactWasQuiz) {
    const quizEntry = await getNextQuizEntry(quizExclusion)
    if (quizEntry) {
      const { item, doc } = quizEntry
      registerRecent(item.text)
      const updatedExclusion = buildQuizExclusion(recentFacts.slice(-RECENT_LIMIT))
      await touchLastShown('fact', doc.hash ? { hash: doc.hash } : { text: doc.text })
      markGlobalItem('fact', item.text)
      markGlobalProvider(item.provider)
      markGlobalOrigin(doc._id ? 'db-random' : 'network')
      markGlobalTopics(Array.isArray(doc.tags) ? doc.tags.filter((tag): tag is string => typeof tag === 'string') : [])
      markGlobalKeywords(Array.isArray(doc.keywords) ? doc.keywords.filter((word): word is string => typeof word === 'string') : [])
      servedQuizHistory.add(item.id)
      if (servedQuizHistory.size > QUIZ_HISTORY_LIMIT) {
        const oldest = servedQuizHistory.values().next()
        if (!oldest.done) servedQuizHistory.delete(oldest.value)
      }
      lastFactWasQuiz = true
      ensureQuizPreloaded(updatedExclusion).catch(() => undefined)
      return item
    }
  }

  const doc = await pickFromDb(exclude)
  if (doc) {
    const text = trim(doc.text)
    if (text) {
      const provider = trim(doc.provider) || (doc.source?.name ?? 'fact')
      const sourceName = trim(doc.source?.name) || provider
      const sourceUrl = typeof doc.source?.url === 'string' ? doc.source.url : undefined
      registerRecent(text)
      const lookupKey = doc.hash ? { hash: doc.hash } : { text }
      await touchLastShown('fact', lookupKey)
      markGlobalItem('fact', text)
      markGlobalProvider(provider)
      markGlobalOrigin(doc._id ? 'db-random' : 'network')
      markGlobalTopics(Array.isArray(doc.tags) ? doc.tags.filter((tag): tag is string => typeof tag === 'string') : [])
      markGlobalKeywords(Array.isArray(doc.keywords) ? doc.keywords.filter((word): word is string => typeof word === 'string') : [])
      lastFactWasQuiz = false
      ensureQuizPreloaded(buildQuizExclusion(recentFacts.slice(-RECENT_LIMIT))).catch(() => undefined)
      return {
        type: 'fact',
        variant: doc.variant === 'ai' ? 'ai' : 'text',
        text,
        provider,
        source: { name: sourceName, url: sourceUrl },
        lang: typeof doc.lang === 'string' && doc.lang.trim() ? doc.lang.trim() : undefined,
        ai: doc.ai && typeof doc.ai === 'object'
          ? {
              source: typeof doc.ai.source === 'string' ? doc.ai.source : undefined,
              model: typeof doc.ai.model === 'string' ? doc.ai.model : undefined,
              generatedAt: typeof doc.ai.generatedAt === 'string' ? doc.ai.generatedAt : undefined,
            }
          : null,
        disclaimer: typeof doc.disclaimer === 'string' && doc.disclaimer.trim() ? doc.disclaimer.trim() : undefined,
        tone: typeof doc.tone === 'string' ? doc.tone : undefined,
        toneConfidence: typeof doc.toneConfidence === 'number' ? doc.toneConfidence : undefined,
        toneSignals: Array.isArray(doc.toneSignals)
          ? doc.toneSignals.filter((entry): entry is string => typeof entry === 'string')
          : undefined,
      }
    }
  }

  const fallback = LOCAL_FACTS.find((entry) => !exclude.includes(entry.toLowerCase())) || LOCAL_FACTS[0]
  registerRecent(fallback)
  lastFactWasQuiz = false
  const fallbackTone = deriveToneAugmentation(flattenToneSegments(['fact', fallback]))
  return {
    type: 'fact',
    variant: 'text',
    text: fallback,
    provider: 'local',
    source: { name: 'Local' },
    tone: fallbackTone?.tone,
    toneConfidence: fallbackTone?.toneConfidence,
    toneSignals: fallbackTone?.toneSignals,
  }
}
