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
const nextTriviaProvider = (): TriviaProvider => {
  const provider = TRIVIA_PROVIDERS[triviaProviderCursor]
  triviaProviderCursor = (triviaProviderCursor + 1) % TRIVIA_PROVIDERS.length
  return provider
}

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

const LOCAL_GENERAL_QUIZZES: Array<{
  question: string
  correct: string
  incorrect: string[]
  category?: string
  difficulty?: TriviaDifficulty
}> = [
  {
    question: 'Which planet in our solar system has the shortest day?',
    correct: 'Jupiter',
    incorrect: ['Mercury', 'Earth', 'Saturn'],
    category: 'space',
    difficulty: 'easy',
  },
  {
    question: 'Who painted the famous mural “Guernica”?',
    correct: 'Pablo Picasso',
    incorrect: ['Salvador Dalí', 'Henri Matisse', 'Frida Kahlo'],
    category: 'culture',
    difficulty: 'medium',
  },
  {
    question: 'The term “byte” is equal to how many bits?',
    correct: '8',
    incorrect: ['16', '32', '4'],
    category: 'technology',
    difficulty: 'easy',
  },
  {
    question: 'What is the tallest breed of dog in the world?',
    correct: 'Irish Wolfhound',
    incorrect: ['Great Dane', 'Mastiff', 'Newfoundland'],
    category: 'animal',
    difficulty: 'medium',
  },
]
let quizApiLocalCursor = 0

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
const QUIZ_API_ENDPOINT = 'https://quizapi.io/api/v1/questions'
const QUIZ_API_TOKEN = (process.env.QUIZAPI_IO_TOKEN || '').trim()

type TriviaProvider = 'open-trivia-db' | 'quizapi.io'
const TRIVIA_PROVIDERS: TriviaProvider[] = ['open-trivia-db', 'quizapi.io']
let triviaProviderCursor = 0
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

function takeQuizApiLocalDocs(
  count: number,
  exclusion: QuizExclusionContext,
  avoidIds: Set<string>,
  history: Set<string>,
): FactQuizDoc[] {
  const docs: FactQuizDoc[] = []
  if (!LOCAL_GENERAL_QUIZZES.length) return docs
  const maxAttempts = LOCAL_GENERAL_QUIZZES.length * 2
  let attempts = 0
  while (docs.length < count && attempts < maxAttempts) {
    const entry = LOCAL_GENERAL_QUIZZES[quizApiLocalCursor % LOCAL_GENERAL_QUIZZES.length]
    quizApiLocalCursor = (quizApiLocalCursor + 1) % LOCAL_GENERAL_QUIZZES.length
    attempts += 1
    const doc = createQuizDocFromSource({
      provider: 'quizapi.io',
      sourceName: 'QuizAPI.io (offline)',
      question: entry.question,
      correctAnswer: entry.correct,
      incorrectAnswers: entry.incorrect,
      category: entry.category,
      difficulty: entry.difficulty,
    })
    if (!doc?.quiz) continue
    const normalized = doc.quiz.question.toLowerCase()
    if (exclusion.questions.has(normalized)) continue
    const quizId = doc.quiz.id
    if (exclusion.ids.has(quizId) || avoidIds.has(quizId) || history.has(quizId)) continue
    docs.push(doc)
    avoidIds.add(quizId)
  }
  return docs
}

type QuizDocInput = {
  provider: string
  sourceName?: string
  sourceUrl?: string
  question: string
  correctAnswer: string
  incorrectAnswers: string[]
  category?: string
  difficulty?: string
  id?: string
  extraTags?: string[]
  extraKeywords?: string[]
}

function createQuizDocFromSource(input: QuizDocInput): FactQuizDoc | null {
  const provider = trim(input.provider) || 'quiz'
  const question = decodeHtml(input.question)
  const correctAnswer = decodeHtml(input.correctAnswer)
  const incorrectAnswers = Array.isArray(input.incorrectAnswers)
    ? input.incorrectAnswers.map((answer) => decodeHtml(answer)).filter(Boolean)
    : []

  if (!question || !correctAnswer || incorrectAnswers.length < 1) return null

  const options = shuffleArray([...incorrectAnswers, correctAnswer])
  let correctIndex = options.findIndex((option) => option === correctAnswer)
  if (correctIndex < 0) {
    correctIndex = 0
    options[0] = correctAnswer
  }

  const sourceName = trim(input.sourceName || '') || provider
  const baseDoc = createFactDocument({
    text: question,
    provider,
    source: { name: sourceName, url: input.sourceUrl },
    tags: input.extraTags,
    keywords: input.extraKeywords,
  })
  if (!baseDoc) return null

  const category = input.category ? decodeHtml(input.category) : undefined
  const difficulty = mapDifficulty(input.difficulty)
  const tagSet = new Set<string>([...baseDoc.tags, 'quiz', 'trivia'])
  if (category) tagSet.add(category.toLowerCase())
  if (difficulty) tagSet.add(difficulty)
  const keywordSet = new Set<string>(baseDoc.keywords)
  for (const option of options) {
    const lowered = option.toLowerCase()
    if (lowered.length >= 3 && lowered.length <= 48) keywordSet.add(lowered)
  }

  const toneSegments = flattenToneSegments([
    provider,
    sourceName,
    question,
    correctAnswer,
    options,
    category,
    difficulty,
    Array.from(tagSet),
    Array.from(keywordSet),
  ])
  const toneDetails = deriveToneAugmentation(toneSegments)
  const mergedTags = mergeToneHintsIntoTags(Array.from(tagSet), toneDetails?.toneTagHints, 16)
  const mergedKeywords = mergeToneSignalsIntoKeywords(Array.from(keywordSet), toneDetails?.toneSignals, 18)

  const baseId = input.id ? String(input.id) : question.toLowerCase()
  const hash = createHash('sha1').update(`${provider}:${baseId}`).digest('hex')

  const doc: FactQuizDoc = {
    ...baseDoc,
    variant: 'quiz',
    tags: mergedTags,
    keywords: mergedKeywords,
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

  return doc
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

async function fetchOpenTriviaDocs(
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
      const doc = createQuizDocFromSource({
        provider: 'open-trivia-db',
        sourceName: 'Open Trivia DB',
        sourceUrl: TRIVIA_API_BASE,
        question: entry?.question ?? '',
        correctAnswer: entry?.correct_answer ?? '',
        incorrectAnswers: Array.isArray(entry?.incorrect_answers) ? entry.incorrect_answers : [],
        category: entry?.category,
        difficulty: entry?.difficulty,
      })
      if (!doc?.quiz) continue
      const normalizedQuestion = doc.quiz.question.toLowerCase()
      if (exclusion.questions.has(normalizedQuestion)) continue
      const quizId = doc.quiz.id
      if (exclusion.ids.has(quizId) || avoidIds.has(quizId) || seenHashes.has(quizId) || history.has(quizId)) continue

      await upsertCache('fact', { hash: quizId }, doc)
      docs.push(doc)
      seenHashes.add(quizId)
      avoidIds.add(quizId)
      if (docs.length >= target) break
    }
  }

  return docs
}

async function fetchQuizApiDocs(
  count: number,
  exclusion: QuizExclusionContext,
  avoidIds: Set<string>,
  history: Set<string>,
): Promise<FactQuizDoc[]> {
  const target = Math.max(1, Math.min(10, count))
  const docs: FactQuizDoc[] = []
  const seenHashes = new Set<string>()

  if (!QUIZ_API_TOKEN) {
    return takeQuizApiLocalDocs(target, exclusion, avoidIds, history)
  }

  const amount = Math.min(20, Math.max(target * 2, target, 5))
  const difficulties: TriviaDifficulty[] = ['easy', 'medium', 'hard']
  const difficulty = difficulties[Math.floor(Math.random() * difficulties.length)]
  const params = new URLSearchParams({ limit: String(amount), difficulty })

  let payload: unknown = null
  try {
    const res = await fetch(`${QUIZ_API_ENDPOINT}?${params.toString()}`, {
      cache: 'no-store',
      headers: { 'X-Api-Key': QUIZ_API_TOKEN },
    })
    if (!res.ok) return takeQuizApiLocalDocs(target, exclusion, avoidIds, history)
    payload = await res.json()
  } catch {
    return takeQuizApiLocalDocs(target, exclusion, avoidIds, history)
  }

  const entries: Array<Record<string, unknown>> = Array.isArray(payload) ? (payload as Array<Record<string, unknown>>) : []

  for (const entry of entries) {
    const questionRaw = typeof entry.question === 'string' ? entry.question : ''
    if (!questionRaw) continue
    const normalizedQuestion = questionRaw.toLowerCase()
    if (exclusion.questions.has(normalizedQuestion)) continue

    const answersRaw = (entry.answers as Record<string, unknown>) || {}
    const correctRaw = (entry.correct_answers as Record<string, unknown>) || {}

    const options: string[] = []
    const correctIndices: number[] = []
    Object.entries(answersRaw).forEach(([key, value]) => {
      if (typeof value !== 'string' || !value.trim()) return
      const optionText = decodeHtml(value)
      const index = options.length
      options.push(optionText)
      const correctKey = `${key}_correct`
      if (typeof correctRaw[correctKey] === 'string' && correctRaw[correctKey] === 'true') {
        correctIndices.push(index)
      }
    })

    if (options.length < 2) continue
    if (correctIndices.length !== 1) continue
    const correctIndex = correctIndices[0]
    const correctAnswer = options[correctIndex]

    const tags = Array.isArray(entry.tags)
      ? (entry.tags as Array<{ name?: string }>).map((tag) => (typeof tag?.name === 'string' ? tag.name : ''))
      : undefined

    const doc = createQuizDocFromSource({
      provider: 'quizapi.io',
      sourceName: 'QuizAPI.io',
      sourceUrl: 'https://quizapi.io',
      question: questionRaw,
      correctAnswer,
      incorrectAnswers: options.filter((_, idx) => idx !== correctIndex),
      category: typeof entry.category === 'string' ? entry.category : undefined,
      difficulty: typeof entry.difficulty === 'string' ? entry.difficulty : undefined,
      id: typeof entry.id === 'string' ? entry.id : questionRaw,
      extraTags: tags?.filter(Boolean),
    })

    if (!doc?.quiz) continue
    const quizId = doc.quiz.id
    if (exclusion.ids.has(quizId) || avoidIds.has(quizId) || seenHashes.has(quizId) || history.has(quizId)) continue

    await upsertCache('fact', { hash: quizId }, doc)
    docs.push(doc)
    seenHashes.add(quizId)
    avoidIds.add(quizId)
    if (docs.length >= target) break
  }

  if (docs.length < target) {
    const localDocs = takeQuizApiLocalDocs(target - docs.length, exclusion, avoidIds, history)
    docs.push(...localDocs)
  }

  return docs
}

async function fillQuizQueue(exclusion: QuizExclusionContext): Promise<boolean> {
  const currentIds = new Set<string>()
  for (const entry of quizQueue) {
    if (entry.doc.quiz?.id) currentIds.add(entry.doc.quiz.id)
  }

  let added = false

  const providersToTry = [...TRIVIA_PROVIDERS]
  providersToTry.sort((a, b) => {
    const idxA = (TRIVIA_PROVIDERS.indexOf(a) - triviaProviderCursor + TRIVIA_PROVIDERS.length) % TRIVIA_PROVIDERS.length
    const idxB = (TRIVIA_PROVIDERS.indexOf(b) - triviaProviderCursor + TRIVIA_PROVIDERS.length) % TRIVIA_PROVIDERS.length
    return idxA - idxB
  })

  for (let index = 0; index < providersToTry.length && quizQueue.length < QUIZ_PRELOAD_TARGET; index++) {
    const provider = providersToTry[index]
    const remainingNeeded = Math.max(1, QUIZ_PRELOAD_TARGET - quizQueue.length)
    const providersLeft = providersToTry.length - index
    const perProviderTarget = Math.max(1, Math.ceil(remainingNeeded / Math.max(1, providersLeft)))
    let fetchedDocs: FactQuizDoc[] = []
    if (provider === 'open-trivia-db') {
      fetchedDocs = await fetchOpenTriviaDocs(perProviderTarget, exclusion, currentIds, servedQuizHistory)
    } else {
      fetchedDocs = await fetchQuizApiDocs(perProviderTarget, exclusion, currentIds, servedQuizHistory)
    }
    triviaProviderCursor = (TRIVIA_PROVIDERS.indexOf(provider) + 1) % TRIVIA_PROVIDERS.length

    for (const fetched of fetchedDocs) {
      if (!fetched.quiz) continue
      const normalizedQuestion = fetched.quiz.question.toLowerCase()
      if (exclusion.questions.has(normalizedQuestion)) continue
      const item = buildQuizItem(fetched)
      if (!item) continue
      if (exclusion.ids.has(item.id) || currentIds.has(item.id)) continue
      quizQueue.push({ doc: fetched, item })
      currentIds.add(item.id)
      added = true
      if (quizQueue.length >= QUIZ_PRELOAD_TARGET) break
    }
    if (quizQueue.length >= QUIZ_PRELOAD_TARGET) break
  }

  if (quizQueue.length < QUIZ_PRELOAD_TARGET) {
    const fallbackDocs = await fetchOpenTriviaDocs(
      QUIZ_PRELOAD_TARGET - quizQueue.length,
      exclusion,
      currentIds,
      servedQuizHistory,
    )
    for (const fetched of fallbackDocs) {
      if (!fetched.quiz) continue
      const normalizedQuestion = fetched.quiz.question.toLowerCase()
      if (exclusion.questions.has(normalizedQuestion)) continue
      const item = buildQuizItem(fetched)
      if (!item) continue
      if (exclusion.ids.has(item.id) || currentIds.has(item.id)) continue
      quizQueue.push({ doc: fetched, item })
      currentIds.add(item.id)
      added = true
      if (quizQueue.length >= QUIZ_PRELOAD_TARGET) break
    }
  }

  if (quizQueue.length >= QUIZ_PRELOAD_TARGET) return added

  const CACHE_ATTEMPTS = 4
  for (let attempt = 0; attempt < CACHE_ATTEMPTS && quizQueue.length < QUIZ_PRELOAD_TARGET; attempt++) {
    const docFromCache = await sampleQuizFromCacheDoc(exclusion, currentIds)
    if (!docFromCache?.quiz) continue
    const item = buildQuizItem(docFromCache)
    if (!item) continue
    if (exclusion.ids.has(item.id) || currentIds.has(item.id) || servedQuizHistory.has(item.id)) continue
    quizQueue.push({ doc: docFromCache, item })
    currentIds.add(item.id)
    added = true
  }

  if (quizQueue.length < QUIZ_PRELOAD_TARGET) {
    const needed = QUIZ_PRELOAD_TARGET - quizQueue.length
    const localDocs = takeQuizApiLocalDocs(needed, exclusion, currentIds, servedQuizHistory)
    for (const doc of localDocs) {
      if (!doc.quiz) continue
      const item = buildQuizItem(doc)
      if (!item) continue
      if (currentIds.has(item.id)) continue
      quizQueue.push({ doc, item })
      currentIds.add(item.id)
      added = true
    }
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
