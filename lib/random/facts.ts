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
  variant: 'text' | 'quiz'
  quiz?: FactQuizPayload
}

export type FactTextItem = {
  type: 'fact'
  variant: 'text'
  text: string
  provider: string
  source: { name: string; url?: string }
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
}

export type FactItem = FactTextItem | FactQuizItem

type FactRecord = FactDocument & { lastShownAt?: Date | string | null; hash?: string; _id?: unknown }

type FactQuizDoc = FactRecord & { variant: 'quiz'; quiz: FactQuizPayload }
type FactQuizQueueEntry = { doc: FactQuizDoc; item: FactQuizItem }

const QUIZ_PRELOAD_TARGET = 4
const quizQueue: FactQuizQueueEntry[] = []
let quizPreloadRunning = false

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

async function sampleQuizFromCacheDoc(
  exclusion: QuizExclusionContext,
  avoidIds: Set<string>,
): Promise<FactQuizDoc | null> {
  const filter: Record<string, unknown> = { variant: 'quiz' }
  const blockedIds = new Set([...avoidIds, ...exclusion.ids])
  if (blockedIds.size) filter['quiz.id'] = { $nin: Array.from(blockedIds) }
  const doc = await sampleFromCache<FactQuizDoc>('fact', filter)
  if (doc?.quiz) return doc
  return null
}

async function fetchTriviaBatch(count: number): Promise<FactQuizDoc[]> {
  try {
    const url = `https://opentdb.com/api.php?amount=${Math.max(1, Math.min(10, count))}&type=multiple`
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return []
    const payload = (await res.json()) as OpenTriviaResponse
    if (!Array.isArray(payload?.results)) return []
    const docs: FactQuizDoc[] = []
    for (const entry of payload.results) {
      const question = decodeHtml(entry?.question ?? '')
      if (!question) continue
      const correctAnswer = decodeHtml(entry?.correct_answer ?? '')
      const incorrectAnswers = Array.isArray(entry?.incorrect_answers)
        ? entry.incorrect_answers.map((answer) => decodeHtml(answer)).filter(Boolean)
        : []
      if (!correctAnswer || incorrectAnswers.length < 1) continue
      const options = shuffleArray([...incorrectAnswers, correctAnswer])
      const correctIndex = Math.max(0, options.findIndex((option) => option === correctAnswer))
      const baseDoc = createFactDocument({
        text: question,
        provider: 'open-trivia-db',
        source: { name: 'Open Trivia DB', url: 'https://opentdb.com' },
      })
      if (!baseDoc) continue
      const normalizedQuestion = question.toLowerCase()
      const hash = createHash('sha1').update(normalizedQuestion).digest('hex')
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
      const doc: FactQuizDoc = {
        ...baseDoc,
        text: question,
        provider: 'open-trivia-db',
        source: { name: 'Open Trivia DB', url: 'https://opentdb.com' },
        tags: Array.from(tags),
        keywords: Array.from(keywordSet).slice(0, 14),
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
      }
      await upsertCache('fact', { hash }, doc)
      docs.push(doc)
    }
    return docs
  } catch {
    return []
  }
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

  const fetchedDocs = await fetchTriviaBatch(QUIZ_PRELOAD_TARGET)
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
  return {
    type: 'fact',
    text,
    provider,
    source: { name: sourceName, url: sourceUrl },
    tags,
    keywords,
    variant: 'text',
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
        variant: 'text',
        text,
        provider,
        source: { name: sourceName, url: sourceUrl },
      }
    }
  }

  const fallback = LOCAL_FACTS.find((entry) => !exclude.includes(entry.toLowerCase())) || LOCAL_FACTS[0]
  registerRecent(fallback)
  lastFactWasQuiz = false
  return {
    type: 'fact',
    variant: 'text',
    text: fallback,
    provider: 'local',
    source: { name: 'Local' },
  }
}
