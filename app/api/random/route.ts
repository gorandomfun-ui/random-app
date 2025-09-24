export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import type { Db } from 'mongodb'
import fs from 'node:fs/promises'
import path from 'node:path'
import { getDb } from '@/lib/db'
import { recordDailyUsage } from '@/lib/metrics/usage'
import videoKeywordJson from '@/lib/ingest/keywords/video.json'
import webKeywordJson from '@/lib/ingest/keywords/web.json'

type ItemType = 'image'|'quote'|'fact'|'joke'|'video'|'web'
type Lang = 'en'|'fr'|'de'|'jp'

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)]

const ITEM_TYPE_SEQUENCE: ItemType[] = ['image','quote','fact','joke','video','web']

const recentTypeHistory: ItemType[] = []

function typeFatigueScore(type: ItemType): number {
  let fatigue = 0
  let weight = 1
  for (let i = recentTypeHistory.length - 1; i >= 0 && weight <= 24; i--, weight++) {
    if (recentTypeHistory[i] === type) fatigue += 1 / weight
  }
  return fatigue
}

function markRecentType(type: ItemType) {
  recentTypeHistory.push(type)
  if (recentTypeHistory.length > 64) recentTypeHistory.shift()
}

function orderAsGiven(arr: ItemType[]): ItemType[] {
  if (!arr.length) return arr
  const enriched = arr.map((value, index) => ({
    value,
    index,
    fatigue: typeFatigueScore(value),
    jitter: Math.random() * 0.001,
  }))

  enriched.sort((a, b) => {
    const diff = a.fatigue - b.fatigue
    if (Math.abs(diff) > 0.0001) return diff
    if (a.jitter !== b.jitter) return a.jitter - b.jitter
    const baselineDiff = ITEM_TYPE_SEQUENCE.indexOf(a.value) - ITEM_TYPE_SEQUENCE.indexOf(b.value)
    if (baselineDiff !== 0) return baselineDiff
    return a.index - b.index
  })

  return enriched.map(({ value }) => value)
}

const PROVIDER_TIMEOUT_MS = Number(process.env.RANDOM_PROVIDER_TIMEOUT_MS || 2500)
const VIDEO_KEYWORD_LISTS = videoKeywordJson as { core: string[]; folk: string[]; fun: string[] }
const WEB_KEYWORD_LISTS = webKeywordJson as { A: string[]; B: string[]; C: string[] }

const INGEST_VIDEO_KEYWORDS = Array.from(new Set(
  [...VIDEO_KEYWORD_LISTS.core, ...VIDEO_KEYWORD_LISTS.folk, ...VIDEO_KEYWORD_LISTS.fun]
    .map(s => s.trim())
    .filter(Boolean)
))

const LIMITED_AUTHORS = ['kanye west']
const LIMITED_AUTHOR_EXACTS = ['Kanye West']
const isLimitedAuthor = (author?: string | null) => {
  if (!author) return false
  const normalized = author.toLowerCase()
  return LIMITED_AUTHORS.some(name => normalized.includes(name))
}

const trimText = (value?: string | null) => (value || '').trim()

const DAY_MS = 1000 * 60 * 60 * 24

function pushRecent(list: string[], value: string, max: number) {
  const key = value.trim().toLowerCase()
  if (!key) return
  const idx = list.indexOf(key)
  if (idx >= 0) list.splice(idx, 1)
  list.push(key)
  while (list.length > max) list.shift()
}

function pushRecentMany(list: string[], values: string[], max: number) {
  for (const value of values) pushRecent(list, value, max)
  while (list.length > max) list.shift()
}

const BASE_STOP_WORDS = new Set([
  'the','and','with','from','that','this','your','our','for','into','over','under','about','just','make','made','making','best','how','what','when','where','why','who','are','was','were','will','can','get','been','take','takes','took','first','second','third','day','night','amp','episode','official','new','video','full','hd','challenge','vs','vs.','edition','life','hack','hacks','trick','tricks','tip','tips','tutorial','amazing','awesome','incredible','really','very','here','there','have','without','inside','outside','their','them','they','you','yours','give','given','giving','see','seen','look','looking','want','wanted','watch','watching','every','always','never','still','into','out','once','again','another','ever','more','less','thing','things','stuff','maybe','some','someone','something','going','around','back','front','little','big'
])

function extractKeywordsFromText(text: string, stopWords = BASE_STOP_WORDS, limit = 6): string[] {
  if (!text) return []
  const lower = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ')
  const words = lower.split(/\s+/).filter(Boolean)
  const unique: string[] = []
  for (const word of words) {
    if (word.length < 3 || word.length > 18) continue
    if (stopWords.has(word)) continue
    if (!unique.includes(word)) unique.push(word)
    if (unique.length >= limit) break
  }
  return unique
}

function extractTagsFromSeeds(text: string, seedMap: Record<string, string[]>): string[] {
  if (!text) return []
  const lower = text.toLowerCase()
  const tags: string[] = []
  for (const [tag, seeds] of Object.entries(seedMap)) {
    if (seeds.some((seed) => lower.includes(seed))) tags.push(tag)
  }
  return Array.from(new Set(tags))
}

function normalizeStringArray(value: unknown, limit = 20): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const entry of value) {
    if (typeof entry === 'string') {
      const trimmed = entry.trim()
      if (trimmed) out.push(trimmed.toLowerCase())
    } else if (entry && typeof entry === 'object' && 'toString' in entry) {
      const str = String(entry).trim()
      if (str) out.push(str.toLowerCase())
    }
    if (out.length >= limit) break
  }
  return Array.from(new Set(out))
}

const VIDEO_TOPIC_SEEDS: Record<string, string[]> = {
  cooking: ['cook','kitchen','recipe','chef','bake','cake','pastry','bbq','food','grandma','kitchen hack','dessert','candy','sushi','chocolate','street food'],
  challenge: ['challenge','vs','versus','battle','contest','competition','speed challenge','24h','one color','mukbang'],
  satisfying: ['asmr','satisfying','oddly satisfying','slime','soap','kinetic sand','crunch','unboxing','soap cutting'],
  toy: ['toy','playset','kid','diy toy','doll','rainbow','surprise egg','lego','barbie','play doh','squishy'],
  craft: ['craft','diy','handmade','build','maker','knit','sew','crochet','woodworking','print','paper','origami','restoration','repair','fix'],
  music: ['music','song','band','choir','sing','cover','guitar','piano','drum','jam','orchestra','instrument','busking','concert','performance'],
  sport: ['sport','match','game','tournament','trickshot','freestyle','parkour','skate','bmx','derby','race','workout','stunt'],
  archive: ['archive','retro','vhs','vintage','198','199','old footage','public access','home video','nostalgia','classic','historic'],
  travel: ['travel','tour','city','village','walk','explore','journey','trip','abroad','roadtrip','street','hidden'],
  animal: ['animal','cat','dog','pet','wildlife','zoo','bird','horse','goat','ferret','hedgehog','fish'],
  comedy: ['funny','joke','sketch','prank','comedy','lol','fails','bloopers'],
  art: ['art','painting','draw','illustration','animation','stop motion','sculpt','clay','tattoo','calligraphy'],
  fashion: ['fashion','makeup','style','beauty','runway','outfit','nail','hair'],
  science: ['science','experiment','physics','chemistry','laboratory','invention','technology','hacking','tesla','robot'],
  spooky: ['ghost','spooky','creepy','haunted','horror','mystery','paranormal'],
  archive_music: ['cassette','vinyl','reel','demo tape','tiny desk','folk song','choir'],
}

const VIDEO_STOP_WORDS = new Set([
  'the','and','with','from','that','this','your','our','for','into','over','under','about','just','make','made','making','best','how','what','when','where','why','who','are','was','were','will','can','get','been','take','first','second','third','day','night','amp','episode','official','new','video','full','hd','challenge','vs','vs.','edition','life','hack','hacks','trick','tricks','tips','tutorial','amazing','awesome','incredible'
])

const VIDEO_RARE_TAGS = new Set(['archive','archive_music','spooky','travel','craft','sport','science','art','animal','fashion','challenge','satisfying'])

const recentVideoTopics: string[] = []
function markRecentVideoTopics(tags: string[]) {
  for (const tag of tags) {
    const key = tag.trim().toLowerCase()
    if (!key) continue
    const idx = recentVideoTopics.indexOf(key)
    if (idx >= 0) recentVideoTopics.splice(idx, 1)
    recentVideoTopics.push(key)
  }
  while (recentVideoTopics.length > 32) recentVideoTopics.shift()
}

const recentVideoKeywords: string[] = []
function markRecentVideoKeywords(words: string[]) {
  for (const word of words) {
    const key = word.trim().toLowerCase()
    if (!key) continue
    const idx = recentVideoKeywords.indexOf(key)
    if (idx >= 0) recentVideoKeywords.splice(idx, 1)
    recentVideoKeywords.push(key)
  }
  while (recentVideoKeywords.length > 120) recentVideoKeywords.shift()
}

function extractVideoTags(text: string): string[] {
  return extractTagsFromSeeds(text, VIDEO_TOPIC_SEEDS)
}

function extractVideoKeywords(text: string, limit = 6): string[] {
  return extractKeywordsFromText(text, VIDEO_STOP_WORDS, limit)
}

const JOKE_TOPIC_SEEDS: Record<string, string[]> = {
  tech: ['computer','programmer','developer','debug','software','coding','laptop','wifi'],
  work: ['boss','office','meeting','coworker','deadline','hr','job','zoom'],
  family: ['mom','dad','kids','baby','grandma','grandpa','sister','brother','family'],
  relationships: ['dating','marriage','husband','wife','girlfriend','boyfriend','partner','romance'],
  school: ['school','teacher','class','homework','exam','college','university'],
  bar: ['bar','bartender','drink','beer','wine','pub'],
  animals: ['dog','cat','cow','horse','chicken','duck','goat','pig','bird','fish'],
  puns: ['pun','wordplay','knock knock','dad joke'],
  dark: ['grave','ghost','zombie','vampire','death','haunted'],
  daily: ['coffee','sleep','morning','kitchen','laundry','groceries','traffic'],
  holiday: ['christmas','holiday','halloween','birthday','new year','valentine'],
}

const QUOTE_TOPIC_SEEDS: Record<string, string[]> = {
  inspiration: ['dream','hope','inspire','courage','light','future','vision','grow','goal'],
  love: ['love','heart','romance','affection','together','kindness','compassion'],
  wisdom: ['wisdom','knowledge','truth','lesson','learn','understand','philosophy'],
  ambition: ['success','goal','achievement','drive','focus','win','mission'],
  creativity: ['create','art','artist','imagination','idea','design'],
  resilience: ['strength','resilience','fight','battle','storm','survive','rise'],
  humor: ['laugh','funny','smile','joy'],
  mindfulness: ['mind','calm','peace','silence','meditation','breathe'],
}

const FACT_TOPIC_SEEDS: Record<string, string[]> = {
  science: ['planet','star','space','physics','chemistry','biology','atom','quantum','experiment'],
  history: ['history','ancient','empire','king','queen','war','dynasty','medieval'],
  animal: ['animal','cat','dog','bird','fish','insect','mammal','reptile'],
  space: ['galaxy','universe','mars','moon','nasa','astronaut','cosmos'],
  culture: ['culture','festival','language','music','dance','tradition','myth'],
  numbers: ['percent','ratio','number','statistics','probability','math'],
  odd: ['weird','strange','bizarre','unusual','rare','unexpected'],
}

const IMAGE_TOPIC_FALLBACK: Record<string, string[]> = {
  art: ['art','painting','illustration','gallery','design','poster','canvas'],
  travel: ['city','street','landscape','mountain','beach','village','road','travel','temple','market'],
  people: ['portrait','people','person','woman','man','child','family','friends'],
  food: ['food','dish','meal','dessert','cake','coffee','tea','kitchen','restaurant'],
  animal: ['animal','cat','dog','bird','horse','zoo','pet','wildlife'],
  nature: ['forest','river','tree','flower','garden','sunset','lake','sky'],
  retro: ['retro','vintage','analog','film','vhs','cassette','old','nostalgia'],
}

const WEB_TOPIC_SEEDS: Record<string, string[]> = {
  archive: ['archive','retro','vintage','geocities','old web','guestbook','blinkies','y2k','frameset','marquee'],
  food: ['recipe','food','cooking','kitchen','dessert','eat','restaurant','snack'],
  diy: ['diy','craft','maker','build','tutorial','how to','hack','guide'],
  music: ['music','band','playlist','dj','mix','sound','radio','tape','cassette'],
  travel: ['travel','guide','map','city','tour','museum','attraction','itinerary'],
  fandom: ['fan','shrine','tribute','club','community','fanpage','fan site'],
  tech: ['software','download','program','code','script','terminal','retro computing'],
  culture: ['zine','gallery','exhibition','art','design','fashion','style'],
  odd: ['weird','strange','bizarre','curious','odd','mystery'],
}

const recentJokes: string[] = []
function markRecentJoke(text?: string | null) {
  const t = trimText(text)
  if (!t) return
  pushRecent(recentJokes, t, 80)
}

const recentJokeTags: string[] = []
const recentJokeKeywords: string[] = []
const recentJokeProviders: string[] = []

type JokeCandidate = {
  text: string
  item: { type: 'joke'; text: string; source: any; provider: string }
  tags: string[]
  keywords: string[]
  provider: string
  origin: CandidateOrigin
  updatedAt?: Date | null
  lastShownAt?: Date | null
}

function extractJokeTags(text: string): string[] {
  const tags = extractTagsFromSeeds(text, JOKE_TOPIC_SEEDS)
  return tags.length ? tags : ['misc']
}

function buildJokeCandidate(doc: any, origin: CandidateOrigin): JokeCandidate | null {
  const text = trimText(doc?.text)
  if (!text) return null
  const providerRaw = trimText(doc?.provider)
  const source = doc?.source || { name: providerRaw || 'cache', url: doc?.url || '' }
  const provider = providerRaw || (typeof source === 'object' ? trimText(source?.name) || 'cache' : 'cache')
  const storedTags = normalizeStringArray(doc?.tags)
  const storedKeywords = normalizeStringArray(doc?.keywords)
  const tags = storedTags.length ? storedTags : extractJokeTags(text)
  const keywords = storedKeywords.length ? storedKeywords : extractKeywordsFromText(text)
  const updatedAt = doc?.updatedAt ? new Date(doc.updatedAt) : null
  const lastShownAt = doc?.lastShownAt ? new Date(doc.lastShownAt) : null
  return {
    text,
    item: { type: 'joke', text, source, provider },
    tags,
    keywords,
    provider,
    origin,
    updatedAt,
    lastShownAt,
  }
}

function jokeCandidateKey(candidate: JokeCandidate): string {
  return candidate.text
}

function scoreJokeCandidate(candidate: JokeCandidate): number {
  let score = 0
  const text = candidate.text
  const providerKey = candidate.provider.trim().toLowerCase()

  if (!recentJokes.includes(text)) score += 12
  else score -= 15

  if (candidate.origin === 'network') score += 5
  else if (candidate.origin === 'db-unseen') score += 4
  else if (candidate.origin === 'db-backlog') score += 2

  if (!recentJokeProviders.includes(providerKey)) score += 3
  else score -= 4

  const uniqueTags = new Set(candidate.tags)
  for (const tag of uniqueTags) {
    if (recentJokeTags.includes(tag)) score -= 3
    else score += 4
  }

  const uniqueKeywords = candidate.keywords.filter((word) => !recentJokeKeywords.includes(word))
  const repeatedKeywords = candidate.keywords.length - uniqueKeywords.length
  score += uniqueKeywords.length * 1.5
  score -= repeatedKeywords * 2.5

  if (!candidate.lastShownAt) score += 4
  else {
    const days = (Date.now() - candidate.lastShownAt.getTime()) / DAY_MS
    if (days > 21) score += 5
    else if (days > 7) score += 3
    else if (days < 2) score -= 3
  }

  score += Math.random() * 1.5
  return score
}

async function collectJokeCandidates(): Promise<JokeCandidate[]> {
  const db = await getDbSafe()
  if (!db) return []
  const bucket = new Map<string, JokeCandidate>()

  const add = (doc: any, origin: CandidateOrigin) => {
    const candidate = buildJokeCandidate(doc, origin)
    if (!candidate) return
    const key = jokeCandidateKey(candidate)
    const existing = bucket.get(key)
    if (!existing || candidate.origin === 'network') {
      bucket.set(key, candidate)
    }
  }

  try {
    const [freshDocs, unseenDocs, backlogDocs, randomDocs] = await Promise.all([
      db.collection('items').find({ type: 'joke' }).sort({ updatedAt: -1 }).limit(120).toArray(),
      db.collection('items').find({ type: 'joke', $or: [{ lastShownAt: { $exists: false } }, { lastShownAt: null }] }).sort({ updatedAt: -1 }).limit(80).toArray(),
      db.collection('items').find({ type: 'joke', lastShownAt: { $lt: new Date(Date.now() - 14 * DAY_MS) } }).sort({ lastShownAt: 1 }).limit(80).toArray(),
      db.collection('items').aggregate([{ $match: { type: 'joke' } }, { $sample: { size: 60 } }]).toArray(),
    ])

    for (const doc of freshDocs) add(doc, 'db-fresh')
    for (const doc of unseenDocs) add(doc, 'db-unseen')
    for (const doc of backlogDocs) add(doc, 'db-backlog')
    for (const doc of randomDocs) add(doc, 'db-random')
  } catch {}

  return Array.from(bucket.values())
}

async function fetchNetworkJokeCandidates(): Promise<JokeCandidate[]> {
  const results = await Promise.allSettled([
    fetchJokeApiSingle(),
    fetchChuckNorrisJoke(),
    getShortJokeFromCSV(),
  ])

  const out: JokeCandidate[] = []
  for (const result of results) {
    if (result.status !== 'fulfilled') continue
    const doc = result.value
    if (!doc) continue
    const candidate = buildJokeCandidate(doc, 'network')
    if (candidate) out.push(candidate)
  }
  return out
}

const recentFacts: string[] = []
function markRecentFact(text?: string | null) {
  const t = trimText(text)
  if (!t) return
  pushRecent(recentFacts, t, 120)
}

const recentFactTags: string[] = []
const recentFactKeywords: string[] = []
const recentFactProviders: string[] = []

type FactCandidate = {
  text: string
  item: { type: 'fact'; text: string; source: any; provider: string }
  tags: string[]
  keywords: string[]
  provider: string
  origin: CandidateOrigin
  updatedAt?: Date | null
  lastShownAt?: Date | null
}

function extractFactTags(text: string): string[] {
  const tags = extractTagsFromSeeds(text, FACT_TOPIC_SEEDS)
  return tags.length ? tags : ['misc']
}

function buildFactCandidate(doc: any, origin: CandidateOrigin): FactCandidate | null {
  const text = trimText(doc?.text)
  if (!text) return null
  const providerRaw = trimText(doc?.provider)
  const source = doc?.source || { name: providerRaw || 'cache', url: doc?.url || '' }
  const provider = providerRaw || (typeof source === 'object' ? trimText(source?.name) || 'cache' : 'cache')
  const storedTags = normalizeStringArray(doc?.tags)
  const storedKeywords = normalizeStringArray(doc?.keywords)
  const tags = storedTags.length ? storedTags : extractFactTags(text)
  const keywords = storedKeywords.length ? storedKeywords : extractKeywordsFromText(text)
  const updatedAt = doc?.updatedAt ? new Date(doc.updatedAt) : null
  const lastShownAt = doc?.lastShownAt ? new Date(doc.lastShownAt) : null
  return {
    text,
    item: { type: 'fact', text, source, provider },
    tags,
    keywords,
    provider,
    origin,
    updatedAt,
    lastShownAt,
  }
}

function factCandidateKey(candidate: FactCandidate): string {
  return candidate.text
}

function scoreFactCandidate(candidate: FactCandidate): number {
  let score = 0
  const text = candidate.text
  const providerKey = candidate.provider.trim().toLowerCase()

  if (!recentFacts.includes(text)) score += 11
  else score -= 12

  if (candidate.origin === 'network') score += 4
  else if (candidate.origin === 'db-unseen') score += 3
  else if (candidate.origin === 'db-backlog') score += 2

  if (!recentFactProviders.includes(providerKey)) score += 2
  else score -= 3

  const uniqueTags = new Set(candidate.tags)
  for (const tag of uniqueTags) {
    if (recentFactTags.includes(tag)) score -= 3
    else score += 4
  }

  const uniqueKeywords = candidate.keywords.filter((word) => !recentFactKeywords.includes(word))
  const repeatedKeywords = candidate.keywords.length - uniqueKeywords.length
  score += uniqueKeywords.length * 1.3
  score -= repeatedKeywords * 2.2

  if (!candidate.lastShownAt) score += 3
  else {
    const days = (Date.now() - candidate.lastShownAt.getTime()) / DAY_MS
    if (days > 21) score += 4
    else if (days > 10) score += 2
    else if (days < 2) score -= 2
  }

  score += Math.random()
  return score
}

async function collectFactCandidates(): Promise<FactCandidate[]> {
  const db = await getDbSafe()
  if (!db) return []
  const bucket = new Map<string, FactCandidate>()
  const add = (doc: any, origin: CandidateOrigin) => {
    const candidate = buildFactCandidate(doc, origin)
    if (!candidate) return
    const key = factCandidateKey(candidate)
    const existing = bucket.get(key)
    if (!existing || candidate.origin === 'network') bucket.set(key, candidate)
  }

  try {
    const [fresh, unseen, backlog, randomDocs] = await Promise.all([
      db.collection('items').find({ type: 'fact' }).sort({ updatedAt: -1 }).limit(120).toArray(),
      db.collection('items').find({ type: 'fact', $or: [{ lastShownAt: { $exists: false } }, { lastShownAt: null }] }).sort({ updatedAt: -1 }).limit(80).toArray(),
      db.collection('items').find({ type: 'fact', lastShownAt: { $lt: new Date(Date.now() - 14 * DAY_MS) } }).sort({ lastShownAt: 1 }).limit(80).toArray(),
      db.collection('items').aggregate([{ $match: { type: 'fact' } }, { $sample: { size: 60 } }]).toArray(),
    ])
    for (const doc of fresh) add(doc, 'db-fresh')
    for (const doc of unseen) add(doc, 'db-unseen')
    for (const doc of backlog) add(doc, 'db-backlog')
    for (const doc of randomDocs) add(doc, 'db-random')
  } catch {}

  return Array.from(bucket.values())
}

async function fetchNetworkFactCandidates(): Promise<FactCandidate[]> {
  const providers = [factUselessfacts, factNumbers, factCat, factMeow, factDog]
  const out: FactCandidate[] = []
  for (const provider of providers) {
    try {
      const doc = await provider()
      if (!doc) continue
      const candidate = buildFactCandidate(doc, 'network')
      if (candidate) out.push(candidate)
    } catch {}
  }
  return out
}

type QuoteCandidate = {
  text: string
  author: string
  item: { type: 'quote'; text: string; author: string; source: any; provider: string }
  tags: string[]
  keywords: string[]
  provider: string
  origin: CandidateOrigin
  updatedAt?: Date | null
  lastShownAt?: Date | null
}

function extractQuoteTags(text: string): string[] {
  const tags = extractTagsFromSeeds(text, QUOTE_TOPIC_SEEDS)
  return tags.length ? tags : ['misc']
}

function buildQuoteCandidate(doc: any, origin: CandidateOrigin): QuoteCandidate | null {
  const text = trimText(doc?.text || doc?.content)
  if (!text) return null
  const author = trimText(doc?.author || '')
  const providerRaw = trimText(doc?.provider)
  const source = doc?.source || { name: providerRaw || (author || 'quote'), url: doc?.url || '' }
  const provider = providerRaw || (typeof source === 'object' ? trimText(source?.name) || 'quote' : 'quote')
  const storedTags = normalizeStringArray(doc?.tags)
  const storedKeywords = normalizeStringArray(doc?.keywords)
  const combined = `${text} ${author}`.trim()
  const tags = storedTags.length ? storedTags : extractQuoteTags(combined)
  const keywords = storedKeywords.length ? storedKeywords : extractKeywordsFromText(combined)
  const updatedAt = doc?.updatedAt ? new Date(doc.updatedAt) : null
  const lastShownAt = doc?.lastShownAt ? new Date(doc.lastShownAt) : null
  return {
    text,
    author,
    item: { type: 'quote', text, author, source, provider },
    tags,
    keywords,
    provider,
    origin,
    updatedAt,
    lastShownAt,
  }
}

function quoteCandidateKey(candidate: QuoteCandidate): string {
  return `${candidate.text}__${candidate.author}`
}

function scoreQuoteCandidate(candidate: QuoteCandidate): number {
  let score = 0

  if (!recentQuotes.includes(candidate.text)) score += 12
  else score -= 13

  const authorKey = candidate.author.trim().toLowerCase()
  if (authorKey) {
    if (!recentQuoteAuthors.includes(authorKey)) score += 4
    else score -= 5
  }

  if (candidate.origin === 'network') score += 5
  else if (candidate.origin === 'db-unseen') score += 3
  else if (candidate.origin === 'db-backlog') score += 2

  const uniqueTags = new Set(candidate.tags)
  for (const tag of uniqueTags) {
    if (recentQuoteTags.includes(tag)) score -= 3
    else score += 4
  }

  const uniqueKeywords = candidate.keywords.filter((word) => !recentQuoteKeywords.includes(word))
  const repeatedKeywords = candidate.keywords.length - uniqueKeywords.length
  score += uniqueKeywords.length * 1.4
  score -= repeatedKeywords * 2.3

  if (!candidate.lastShownAt) score += 4
  else {
    const days = (Date.now() - candidate.lastShownAt.getTime()) / DAY_MS
    if (days > 30) score += 5
    else if (days > 10) score += 3
    else if (days < 2) score -= 4
  }

  score += Math.random()
  return score
}

async function collectQuoteCandidates(): Promise<QuoteCandidate[]> {
  const db = await getDbSafe()
  if (!db) return []
  const bucket = new Map<string, QuoteCandidate>()
  const add = (doc: any, origin: CandidateOrigin) => {
    const candidate = buildQuoteCandidate(doc, origin)
    if (!candidate) return
    const key = quoteCandidateKey(candidate)
    const existing = bucket.get(key)
    if (!existing || candidate.origin === 'network') bucket.set(key, candidate)
  }

  try {
    const [fresh, unseen, backlog, randomDocs] = await Promise.all([
      db.collection('items').find({ type: 'quote' }).sort({ updatedAt: -1 }).limit(150).toArray(),
      db.collection('items').find({ type: 'quote', $or: [{ lastShownAt: { $exists: false } }, { lastShownAt: null }] }).sort({ updatedAt: -1 }).limit(100).toArray(),
      db.collection('items').find({ type: 'quote', lastShownAt: { $lt: new Date(Date.now() - 21 * DAY_MS) } }).sort({ lastShownAt: 1 }).limit(120).toArray(),
      db.collection('items').aggregate([{ $match: { type: 'quote' } }, { $sample: { size: 80 } }]).toArray(),
    ])
    for (const doc of fresh) add(doc, 'db-fresh')
    for (const doc of unseen) add(doc, 'db-unseen')
    for (const doc of backlog) add(doc, 'db-backlog')
    for (const doc of randomDocs) add(doc, 'db-random')
  } catch {}

  return Array.from(bucket.values())
}

async function fetchQuotableQuotes(limit = 6): Promise<any[]> {
  const base = process.env.QUOTABLE_BASE || 'https://api.quotable.io'
  try {
    const res = await fetchWithTimeout(`${base}/quotes/random?limit=${Math.max(1, Math.min(limit, 10))}`, { cache: 'no-store' })
    if (!res?.ok) return []
    const data: any = await res.json()
    return Array.isArray(data) ? data : [data]
  } catch {
    return []
  }
}

async function fetchNetworkQuoteCandidates(): Promise<QuoteCandidate[]> {
  const out: QuoteCandidate[] = []
  const quotable = await fetchQuotableQuotes(6)
  for (const entry of quotable) {
    const text = trimText(entry?.content || entry?.text || '')
    if (!text || isRecentQuote(text)) continue
    const doc = {
      text,
      author: trimText(entry?.author || ''),
      provider: 'quotable',
      source: { name: 'Quotable', url: 'https://quotable.io' },
    }
    const candidate = buildQuoteCandidate(doc, 'network')
    if (candidate) out.push(candidate)
  }

  const zen = await fetchZenQuoteDoc()
  if (zen) {
    const candidate = buildQuoteCandidate(zen, 'network')
    if (candidate) out.push(candidate)
  }

  return out
}

const recentImageUrls: string[] = []
const recentImageProviders: string[] = []
const recentImageTags: string[] = []
const recentImageKeywords: string[] = []

type ImageCandidate = {
  url: string
  item: { type: 'image'; url: string; thumbUrl: string | null; source: any }
  tags: string[]
  keywords: string[]
  provider: string
  origin: CandidateOrigin
  updatedAt?: Date | null
  lastShownAt?: Date | null
}

function extractImageTags(text: string): string[] {
  const tags = extractTagsFromSeeds(text, IMAGE_TOPIC_FALLBACK)
  return tags.length ? tags : ['misc']
}

function buildImageCandidate(doc: any, origin: CandidateOrigin): ImageCandidate | null {
  const url = trimText(doc?.url)
  if (!url) return null
  const thumb = doc?.thumb || doc?.thumbUrl || null
  const provider = trimText(doc?.provider) || 'image'
  const title = trimText(doc?.title || doc?.text || '')
  const source = doc?.source || { name: provider, url: doc?.pageUrl || url }
  const descriptor = `${title} ${(typeof source === 'object' ? source?.name : '') || ''} ${url}`
  const storedTags = normalizeStringArray(doc?.tags)
  const storedKeywords = normalizeStringArray(doc?.keywords)
  const tags = storedTags.length ? storedTags : extractImageTags(descriptor)
  const keywords = storedKeywords.length ? storedKeywords : extractKeywordsFromText(descriptor)
  const updatedAt = doc?.updatedAt ? new Date(doc.updatedAt) : null
  const lastShownAt = doc?.lastShownAt ? new Date(doc.lastShownAt) : null
  return {
    url,
    item: { type: 'image', url, thumbUrl: thumb, source },
    tags,
    keywords,
    provider,
    origin,
    updatedAt,
    lastShownAt,
  }
}

function imageCandidateKey(candidate: ImageCandidate): string {
  return candidate.url
}

function scoreImageCandidate(candidate: ImageCandidate): number {
  let score = 0

  if (!recentImageUrls.includes(candidate.url)) score += 10
  else score -= 12

  if (!recentImageProviders.includes(candidate.provider)) score += 4
  else score -= 5

  const uniqueTags = new Set(candidate.tags)
  for (const tag of uniqueTags) {
    if (recentImageTags.includes(tag)) score -= 3
    else score += 4
  }

  const uniqueKeywords = candidate.keywords.filter((word) => !recentImageKeywords.includes(word))
  const repeatedKeywords = candidate.keywords.length - uniqueKeywords.length
  score += uniqueKeywords.length * 1.2
  score -= repeatedKeywords * 2

  if (candidate.origin === 'network') score += 5
  else if (candidate.origin === 'db-unseen') score += 3
  else if (candidate.origin === 'db-backlog') score += 2

  if (!candidate.lastShownAt) score += 3
  else {
    const days = (Date.now() - candidate.lastShownAt.getTime()) / DAY_MS
    if (days > 21) score += 4
    else if (days < 2) score -= 3
  }

  score += Math.random()
  return score
}

async function collectImageCandidates(): Promise<ImageCandidate[]> {
  const db = await getDbSafe()
  if (!db) return []
  const bucket = new Map<string, ImageCandidate>()
  const add = (doc: any, origin: CandidateOrigin) => {
    const candidate = buildImageCandidate(doc, origin)
    if (!candidate) return
    const key = imageCandidateKey(candidate)
    const existing = bucket.get(key)
    if (!existing || candidate.origin === 'network') bucket.set(key, candidate)
  }

  try {
    const [fresh, unseen, backlog, randomDocs] = await Promise.all([
      db.collection('items').find({ type: 'image' }).sort({ updatedAt: -1 }).limit(120).toArray(),
      db.collection('items').find({ type: 'image', $or: [{ lastShownAt: { $exists: false } }, { lastShownAt: null }] }).sort({ updatedAt: -1 }).limit(80).toArray(),
      db.collection('items').find({ type: 'image', lastShownAt: { $lt: new Date(Date.now() - 14 * DAY_MS) } }).sort({ lastShownAt: 1 }).limit(80).toArray(),
      db.collection('items').aggregate([{ $match: { type: 'image' } }, { $sample: { size: 60 } }]).toArray(),
    ])
    for (const doc of fresh) add(doc, 'db-fresh')
    for (const doc of unseen) add(doc, 'db-unseen')
    for (const doc of backlog) add(doc, 'db-backlog')
    for (const doc of randomDocs) add(doc, 'db-random')
  } catch {}

  return Array.from(bucket.values())
}

async function fetchNetworkImageCandidates(): Promise<ImageCandidate[]> {
  const out: ImageCandidate[] = []
  const PEXELS_KEY = process.env.PEXELS_API_KEY
  const UNSPLASH_KEY = process.env.UNSPLASH_ACCESS_KEY
  const GIPHY_KEY = process.env.GIPHY_API_KEY
  const TENOR_KEY = process.env.TENOR_API_KEY

  const WORDS_PHOTO = ['weird','vintage','odd','retro','obscure','fun','tiny','toy','museum','street','festival','garage','zine','travel','market','temple','mountain','beach','archive','analog']
  const WORDS_GIF = ['reaction','fail','dance','facepalm','meme','lol','weirdcore','glitch','vaporwave','awkward','party','vibes','surprised','blink','retro gif','vhs glitch','pixel art','loop']

  const photoQuery = pick(WORDS_PHOTO)
  const gifQuery = pick(WORDS_GIF)

  async function addCandidateFromDoc(doc: any, origin: CandidateOrigin) {
    const candidate = buildImageCandidate(doc, origin)
    if (candidate) out.push(candidate)
  }

  if (GIPHY_KEY) {
    try {
      const url = `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(gifQuery)}&limit=50&rating=g`
      const res = await fetchWithTimeout(url, { cache: 'no-store' })
      if (res?.ok) {
        const data: any = await res.json()
        const items: any[] = data?.data || []
        if (items.length) {
          const g: any = pick(items)
          const media = g?.images || {}
          const urlGif: string | undefined = media?.original?.url || media?.downsized_large?.url || media?.downsized?.url
          if (urlGif) {
            await addCandidateFromDoc({
              url: urlGif,
              thumb: media?.fixed_width?.url || null,
              provider: 'giphy',
              source: { name: 'Giphy', url: g?.url || urlGif },
              title: g?.title || '',
            }, 'network')
          }
        }
      }
    } catch {}
  }

  if (TENOR_KEY) {
    const doc = await fetchFromTenorDoc(gifQuery)
    if (doc) await addCandidateFromDoc(doc, 'network')
  }

  if (PEXELS_KEY) {
    try {
      const url = `https://api.pexels.com/v1/search?per_page=50&query=${encodeURIComponent(photoQuery)}`
      const res = await fetchWithTimeout(url, { headers: { Authorization: PEXELS_KEY }, cache: 'no-store' })
      if (res?.ok) {
        const data: any = await res.json()
        const photos: any[] = data?.photos || []
        if (photos.length) {
          const p: any = pick(photos)
          const src: any = p?.src || {}
          const urlImg: string | undefined = src.large2x || src.large || src.original
          if (urlImg) {
            await addCandidateFromDoc({
              url: urlImg,
              thumb: src.medium || null,
              provider: 'pexels',
              source: { name: 'Pexels', url: p?.url || urlImg },
              title: p?.alt || '',
            }, 'network')
          }
        }
      }
    } catch {}
  }

  try {
    const doc = await fetchFromPixabayDoc(photoQuery)
    if (doc) await addCandidateFromDoc(doc, 'network')
  } catch {}

  if (UNSPLASH_KEY) {
    try {
      const url = `https://api.unsplash.com/photos/random?query=${encodeURIComponent(photoQuery)}&count=1&client_id=${UNSPLASH_KEY}`
      const res = await fetchWithTimeout(url, { cache: 'no-store' })
      if (res?.ok) {
        const data: any = await res.json()
        const it: any = Array.isArray(data) ? data[0] : data
        const urls: any = it?.urls || {}
        const urlImg: string | undefined = urls.regular || urls.full
        if (urlImg) {
          await addCandidateFromDoc({
            url: urlImg,
            thumb: urls.small || null,
            provider: 'unsplash',
            source: { name: 'Unsplash', url: (it?.links && it.links.html) || urlImg },
            title: it?.description || it?.alt_description || '',
          }, 'network')
        }
      }
    } catch {}
  }

  try {
    const doc = await fetchFromImgflipDoc()
    if (doc) await addCandidateFromDoc(doc, 'network')
  } catch {}

  return out
}

const recentVideoProviders: string[] = []
function markRecentVideoProvider(provider?: string | null) {
  const key = trimText(provider).toLowerCase()
  if (!key) return
  const idx = recentVideoProviders.indexOf(key)
  if (idx >= 0) recentVideoProviders.splice(idx, 1)
  recentVideoProviders.push(key)
  if (recentVideoProviders.length > 12) recentVideoProviders.shift()
}

async function sampleVideoFromCache(options?: { preferArchive?: boolean }): Promise<any | null> {
  const db = await getDbSafe()
  if (!db) return null
  try {
    if (options?.preferArchive) {
      const arr = await db.collection('items').aggregate([
        { $match: { type: 'video', provider: 'archive.org' } },
        { $sort: { lastShownAt: 1, updatedAt: -1 } },
        { $limit: 150 },
        { $sample: { size: 1 } },
      ]).toArray()
      return arr[0] || null
    }

    const arr = await db.collection('items').aggregate([
      { $match: { type: 'video' } },
      { $sort: { lastShownAt: 1, updatedAt: -1 } },
      { $limit: 200 },
      { $sample: { size: 5 } },
    ]).toArray()
    if (!arr.length) return null
    const exclude = new Set(recentVideoProviders)
    const choice = arr.find(doc => !exclude.has(trimText(doc?.provider).toLowerCase())) || arr[0]
    return choice || null
  } catch {
    return null
  }
}

function mapVideoDoc(doc: any): { item: any; key: Record<string, any>; provider: string; raw: any } | null {
  if (!doc) return null
  const provider = trimText(doc?.provider) || 'cache'
  const videoId = trimText(doc?.videoId)
  const url = trimText(doc?.url) || (videoId ? `https://youtu.be/${videoId}` : '')
  if (!url) return null
  const thumb = doc?.thumb || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : undefined)
  const text = trimText(doc?.title || doc?.text || '')
  const source = doc?.source || { name: provider, url }
  const key = videoId ? { videoId } : { url }
  return {
    item: { type: 'video' as const, url, thumbUrl: thumb || undefined, text, source, provider },
    key,
    provider,
    raw: doc,
  }
}

type CandidateOrigin = 'db-fresh' | 'db-unseen' | 'db-backlog' | 'db-random' | 'network'

const globalRecentItems: string[] = []
const globalRecentTopics: string[] = []
const globalRecentProviders: string[] = []
const globalRecentKeywords: string[] = []
const globalRecentOrigins: string[] = []

type GlobalFootprint = {
  type: ItemType
  key?: string | null
  tags?: string[]
  keywords?: string[]
  provider?: string
  origin?: CandidateOrigin | 'fallback'
}

function buildGlobalItemKey(type: ItemType, key?: string | null): string | null {
  if (!key) return null
  const normalized = String(key).trim().toLowerCase()
  if (!normalized) return null
  return `${type}:${normalized}`
}

function markGlobalItem(type: ItemType, key?: string | null) {
  const globalKey = buildGlobalItemKey(type, key)
  if (!globalKey) return
  pushRecent(globalRecentItems, globalKey, 260)
}

function isGlobalItemRecent(type: ItemType, key?: string | null): boolean {
  const globalKey = buildGlobalItemKey(type, key)
  if (!globalKey) return false
  return globalRecentItems.includes(globalKey)
}

function markGlobalTopics(tags: string[]) {
  if (!tags?.length) return
  pushRecentMany(globalRecentTopics, tags, 220)
}

function areTopicsGloballyRecent(tags: string[]): boolean {
  if (!tags?.length) return false
  const normalized = tags.map(tag => tag.trim().toLowerCase()).filter(Boolean)
  if (!normalized.length) return false
  return normalized.every(tag => globalRecentTopics.includes(tag))
}

function markGlobalKeywords(words: string[]) {
  if (!words?.length) return
  pushRecentMany(globalRecentKeywords, words, 260)
}

function areKeywordsGloballyRecent(words: string[]): boolean {
  if (!words?.length) return false
  const normalized = words.map(word => word.trim().toLowerCase()).filter(Boolean)
  if (!normalized.length) return false
  return normalized.every(word => globalRecentKeywords.includes(word))
}

function markGlobalProvider(provider?: string) {
  if (!provider) return
  pushRecent(globalRecentProviders, provider, 140)
}

function isProviderGloballyRecent(provider?: string): boolean {
  if (!provider) return false
  return globalRecentProviders.includes(provider.trim().toLowerCase())
}

function markGlobalOrigin(origin: CandidateOrigin | 'fallback') {
  pushRecent(globalRecentOrigins, origin, 160)
}

function shouldPreferFreshContent(): boolean {
  const window = globalRecentOrigins.slice(-10)
  if (window.length < 5) return false
  const fresh = window.filter((v) => v === 'network' || v === 'db-fresh' || v === 'db-unseen').length
  const backlog = window.filter((v) => v === 'db-backlog' || v === 'db-random').length
  return fresh < 3 && backlog >= fresh + 2
}

function registerGlobalFootprint(meta: GlobalFootprint) {
  if (meta.key) markGlobalItem(meta.type, meta.key)
  if (meta.tags?.length) markGlobalTopics(meta.tags)
  if (meta.keywords?.length) markGlobalKeywords(meta.keywords)
  if (meta.provider) markGlobalProvider(meta.provider)
  if (meta.origin) markGlobalOrigin(meta.origin)
}

type VideoMapped = NonNullable<ReturnType<typeof mapVideoDoc>>

type VideoCandidate = {
  mapped: VideoMapped
  tags: string[]
  keywords: string[]
  origin: CandidateOrigin
  updatedAt?: Date | null
  lastShownAt?: Date | null
}

function buildVideoCandidate(doc: any, origin: CandidateOrigin): VideoCandidate | null {
  const mapped = mapVideoDoc(doc)
  if (!mapped) return null
  const description = trimText(doc?.description || '')
  const combined = `${mapped.item.text || ''} ${description}`.trim()
  const storedTags = normalizeStringArray(doc?.tags)
  const storedKeywords = normalizeStringArray(doc?.keywords)
  const tags = storedTags.length ? storedTags : extractVideoTags(combined)
  const keywords = storedKeywords.length ? storedKeywords : extractVideoKeywords(combined)
  const updatedAt = doc?.updatedAt ? new Date(doc.updatedAt) : null
  const lastShownAt = doc?.lastShownAt ? new Date(doc.lastShownAt) : null
  return { mapped, tags: tags.length ? tags : ['misc'], keywords, origin, updatedAt, lastShownAt }
}

function candidateKey(candidate: VideoCandidate): string | null {
  const key = candidate.mapped.key.videoId || candidate.mapped.key.url
  return key || null
}

function scoreVideoCandidate(candidate: VideoCandidate): number {
  const key = candidateKey(candidate)
  if (!key) return -Infinity

  const providerKey = trimText(candidate.mapped.provider).toLowerCase()
  const now = Date.now()
  const updatedAt = candidate.updatedAt?.getTime() ?? 0
  const lastShownAt = candidate.lastShownAt?.getTime() ?? 0

  let score = 0

  if (!lastShownAt) score += 14
  else {
    const daysSinceShown = (now - lastShownAt) / DAY_MS
    if (daysSinceShown > 21) score += 9
    else if (daysSinceShown > 14) score += 7
    else if (daysSinceShown > 7) score += 5
    else if (daysSinceShown > 3) score += 2
    else score -= 5
  }

  if (updatedAt) {
    const daysSinceUpdate = (now - updatedAt) / DAY_MS
    if (daysSinceUpdate < 2) score += 8
    else if (daysSinceUpdate < 7) score += 5
    else if (daysSinceUpdate < 21) score += 2
    else score -= 1
  } else {
    score -= 1
  }

  if (candidate.origin === 'network') score += 6
  else if (candidate.origin === 'db-unseen') score += 4
  else if (candidate.origin === 'db-backlog') score += 2

  if (!recentVideoProviders.includes(providerKey)) score += 5
  else score -= 7

  const tagSet = new Set(candidate.tags)
  let freshTagBoost = 0
  let repeatTagPenalty = 0
  for (const tag of tagSet) {
    if (recentVideoTopics.includes(tag)) repeatTagPenalty += 5
    else freshTagBoost += 6
  }
  score += freshTagBoost - repeatTagPenalty

  if (candidate.tags.some((tag) => VIDEO_RARE_TAGS.has(tag))) score += 4

  const uniqueKeywords = candidate.keywords.filter((word) => !recentVideoKeywords.includes(word))
  const repeatedKeywords = candidate.keywords.length - uniqueKeywords.length
  score += uniqueKeywords.length * 1.8
  score -= repeatedKeywords * 2.8

  if (key && recentVideoIds.includes(key)) score -= 10

  score += Math.random() * 2
  return score
}

async function collectVideoCandidates(): Promise<VideoCandidate[]> {
  const db = await getDbSafe()
  if (!db) return []

  const bucket = new Map<string, VideoCandidate>()
  const add = (doc: any, origin: CandidateOrigin) => {
    const candidate = buildVideoCandidate(doc, origin)
    if (!candidate) return
    const key = candidateKey(candidate)
    if (!key) return
    const existing = bucket.get(key)
    if (!existing || (candidate.origin === 'network' && existing.origin !== 'network')) {
      bucket.set(key, candidate)
    }
  }

  try {
    const [freshDocs, unseenDocs, backlogDocs, randomDocs] = await Promise.all([
      db.collection('items').find({ type: 'video' }).sort({ updatedAt: -1 }).limit(120).toArray(),
      db.collection('items').find({ type: 'video', $or: [{ lastShownAt: { $exists: false } }, { lastShownAt: null }] }).sort({ updatedAt: -1 }).limit(80).toArray(),
      db.collection('items').find({ type: 'video', lastShownAt: { $lt: new Date(Date.now() - 14 * DAY_MS) } }).sort({ lastShownAt: 1 }).limit(80).toArray(),
      db.collection('items').aggregate([{ $match: { type: 'video' } }, { $sample: { size: 60 } }]).toArray(),
    ])

    for (const doc of freshDocs) add(doc, 'db-fresh')
    for (const doc of unseenDocs) add(doc, 'db-unseen')
    for (const doc of backlogDocs) add(doc, 'db-backlog')
    for (const doc of randomDocs) add(doc, 'db-random')
  } catch {}

  return Array.from(bucket.values())
}

async function fetchYouTubeCandidates(): Promise<VideoCandidate[]> {
  const KEY = process.env.YOUTUBE_API_KEY
  if (!KEY) return []
  const query = buildYouTubeQuery()
  const publishedAfter = new Date(Date.now() - 120 * DAY_MS).toISOString()
  const params = new URLSearchParams({
    key: KEY,
    part: 'snippet',
    type: 'video',
    maxResults: '20',
    q: query,
    order: Math.random() < 0.5 ? 'date' : 'relevance',
    publishedAfter,
    videoEmbeddable: 'true',
  })
  try {
    const res = await fetchWithTimeout(`${YT_ENDPOINT}/search?${params.toString()}`, { cache: 'no-store' })
    if (!res?.ok) return []
    const data: any = await res.json()
    const items: any[] = data?.items || []
    const out: VideoCandidate[] = []
    for (const entry of items) {
      const id = entry?.id?.videoId
      const sn = entry?.snippet
      if (!id || !sn) continue
      const doc = {
        videoId: id,
        url: `https://youtu.be/${id}`,
        title: sn?.title || '',
        description: sn?.description || '',
        thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        provider: 'youtube',
        source: { name: sn?.channelTitle || 'YouTube', url: `https://youtu.be/${id}` },
      }
      const candidate = buildVideoCandidate(doc, 'network')
      if (candidate) out.push(candidate)
    }
    return out
  } catch {
    return []
  }
}

async function fetchRedditVideoCandidates(): Promise<VideoCandidate[]> {
  const doc = await fetchFromRedditFunnyYouTube()
  if (!doc) return []
  const candidate = buildVideoCandidate(doc, 'network')
  return candidate ? [candidate] : []
}

async function fetchNetworkVideoCandidates(): Promise<VideoCandidate[]> {
  const results = await Promise.allSettled([
    fetchYouTubeCandidates(),
    fetchRedditVideoCandidates(),
  ])
  const out: VideoCandidate[] = []
  for (const res of results) {
    if (res.status === 'fulfilled' && Array.isArray(res.value)) out.push(...res.value)
  }
  return out
}

async function fetchWithTimeout(input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1], timeout = PROVIDER_TIMEOUT_MS): Promise<Response | null> {
  if (typeof AbortController === 'undefined') {
    return Promise.race([
      fetch(input, init),
      new Promise<Response | null>((resolve) => setTimeout(() => resolve(null), timeout)),
    ])
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const res = await fetch(input, { ...(init || {}), signal: controller.signal })
    return res
  } catch (err: any) {
    if (err?.name === 'AbortError') return null
    return null
  } finally {
    clearTimeout(timer)
  }
}

/* --------------------------- DB light cache helpers ----------------------- */
let cachedDb: Db | null = null
async function getDbSafe(): Promise<Db | null> {
  try {
    if (cachedDb) return cachedDb
    cachedDb = await getDb(process.env.MONGODB_DB || process.env.MONGO_DB || 'randomapp')
    return cachedDb
  } catch {
    return null
  }
}

async function upsertCache(type: ItemType, key: Record<string, any>, doc: Record<string, any>) {
  const db = await getDbSafe()
  if (!db) return
  try {
    await db.collection('items').updateOne(
      { type, ...key },
      { $set: { type, ...key, ...doc, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
      { upsert: true }
    )
  } catch {}
}

async function touchLastShown(type: ItemType, key: Record<string, any>) {
  const db = await getDbSafe()
  if (!db) return
  try {
    await db.collection('items').updateOne({ type, ...key }, { $set: { lastShownAt: new Date() } })
  } catch {}
}

async function sampleFromCache(type: ItemType, extraMatch: Record<string, any> = {}): Promise<any | null> {
  const db = await getDbSafe()
  if (!db) return null
  try {
    const arr = await db.collection('items').aggregate([
      { $match: { type, ...extraMatch } },
      { $sample: { size: 1 } },
    ]).toArray()
    return arr[0] || null
  } catch { return null }
}

/* -------------------------------- Fallbacks ------------------------------- */
const FB_IMAGES = [
  'https://images.unsplash.com/photo-1519681393784-d120267933ba',
  'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee',
  'https://images.unsplash.com/photo-1495567720989-cebdbdd97913',
]

/* ------------------------------ LIVE: IMAGES ------------------------------ */

/** Pixabay provider */
async function fetchFromPixabayDoc(query: string): Promise<any | null> {
  const key = process.env.PIXABAY_API_KEY
  if (!key) return null
  const url = new URL('https://pixabay.com/api/')
  url.searchParams.set('key', key)
  url.searchParams.set('q', query)
  url.searchParams.set('image_type', 'photo')
  url.searchParams.set('safesearch', 'true')
  url.searchParams.set('per_page', '50')

  const res = await fetchWithTimeout(url, { cache: 'no-store' })
  if (!res?.ok) return null
  const data: any = await res.json()
  const hits: any[] = data?.hits || []
  if (!hits.length) return null
  const hit = pick(hits)

  const urlImg: string | undefined = hit.largeImageURL || hit.webformatURL
  if (!urlImg) return null
  return {
    url: urlImg,
    thumb: hit.previewURL || hit.webformatURL || null,
    provider: 'pixabay',
    source: { name: 'Pixabay', url: hit.pageURL || urlImg },
    title: hit.tags || '',
  }
}

/** Tenor provider (GIFs) */
async function fetchFromTenorDoc(query: string): Promise<any | null> {
  const key = process.env.TENOR_API_KEY
  if (!key) return null
  const u = new URL('https://tenor.googleapis.com/v2/search')
  u.searchParams.set('q', query)
  u.searchParams.set('key', key)
  u.searchParams.set('limit', '50')
  u.searchParams.set('media_filter', 'gif,tinygif')
  u.searchParams.set('random', 'true')

  const res = await fetchWithTimeout(u.toString(), { cache: 'no-store' })
  if (!res?.ok) return null
  const d: any = await res.json()
  const r: any[] = d?.results || []
  if (!r.length) return null

  const it: any = r[Math.floor(Math.random() * r.length)]
  const m = it?.media_formats || {}
  const urlGif: string | undefined =
    m.gif?.url || m.tinygif?.url || m.mediumgif?.url || m.nanogif?.url
  if (!urlGif) return null
  return {
    url: urlGif,
    thumb: m.tinygif?.url || null,
    provider: 'tenor',
    source: { name: 'Tenor', url: it?.itemurl || urlGif },
    title: it?.content_description || '',
  }
}

/** Imgflip (meme templates – pas de clé) */
async function fetchFromImgflipDoc(): Promise<any | null> {
  try {
    const res = await fetchWithTimeout('https://api.imgflip.com/get_memes', { cache: 'no-store' })
    if (!res?.ok) return null
    const d: any = await res.json()
    const arr: any[] = d?.data?.memes || []
    if (!arr.length) return null
    const m = arr[Math.floor(Math.random() * arr.length)]
    const urlImg: string | undefined = m?.url
    if (!urlImg) return null
    return {
      url: urlImg,
      thumb: urlImg,
      provider: 'imgflip',
      source: { name: 'Imgflip', url: 'https://imgflip.com' },
      title: m?.name || '',
    }
  } catch { return null }
}

async function fetchLiveImage(): Promise<any | null> {
  const candidateMap = new Map<string, ImageCandidate>()
  const add = (candidate: ImageCandidate | null) => {
    if (!candidate) return
    const key = imageCandidateKey(candidate)
    const existing = candidateMap.get(key)
    if (!existing || candidate.origin === 'network') candidateMap.set(key, candidate)
  }

  // Pull live providers first so they get priority in the candidate bucket.
  let networkCandidates: ImageCandidate[] = []
  try {
    networkCandidates = await fetchNetworkImageCandidates()
  } catch {
    networkCandidates = []
  }
  networkCandidates.forEach(add)

  const dbCandidates = await collectImageCandidates()
  dbCandidates.forEach(add)

  const scored = Array.from(candidateMap.values())
    .map((candidate) => ({ candidate, score: scoreImageCandidate(candidate) }))
    .filter(({ score }) => Number.isFinite(score))
    .sort((a, b) => b.score - a.score)

  const preferFresh = shouldPreferFreshContent()
  const hasNetworkCandidate = scored.some(({ candidate }) => candidate.origin === 'network')

  for (const { candidate } of scored) {
    const key = imageCandidateKey(candidate)
    const globallyRecent = isGlobalItemRecent('image', key)
    const allTagsRecent = candidate.tags.every((tag) => recentImageTags.includes(tag))
    const allKeywordsRecent = candidate.keywords.length
      ? candidate.keywords.every((word) => recentImageKeywords.includes(word))
      : false
    const topicsGloballyTired = areTopicsGloballyRecent(candidate.tags)
    const keywordsGloballyTired = candidate.keywords.length ? areKeywordsGloballyRecent(candidate.keywords) : false
    const providerGloballyTired = isProviderGloballyRecent(candidate.provider)

    if (globallyRecent && scored.length > 1) continue
    if ((allTagsRecent && allKeywordsRecent) && scored.length > 1) continue
    if ((topicsGloballyTired || keywordsGloballyTired) && scored.length > 1) continue
    if (providerGloballyTired && scored.length > 2 && (!preferFresh || candidate.origin !== 'network')) continue
    if (preferFresh && hasNetworkCandidate && candidate.origin !== 'network' && scored.length > 1) continue

    if (candidate.origin === 'network') {
      await upsertCache('image', { url: candidate.url }, {
        thumb: candidate.item.thumbUrl,
        source: candidate.item.source,
        provider: candidate.provider,
        tags: candidate.tags,
        keywords: candidate.keywords,
      })
    }

    await touchLastShown('image', { url: candidate.url })
    pushRecent(recentImageUrls, candidate.url, 120)
    pushRecent(recentImageProviders, candidate.provider, 40)
    pushRecentMany(recentImageTags, candidate.tags, 100)
    pushRecentMany(recentImageKeywords, candidate.keywords, 160)
    registerGlobalFootprint({
      type: 'image',
      key,
      tags: candidate.tags,
      keywords: candidate.keywords,
      provider: candidate.provider,
      origin: candidate.origin,
    })
    return candidate.item
  }

  const fallback = FB_IMAGES[Math.floor(Math.random() * FB_IMAGES.length)]
  pushRecent(recentImageUrls, fallback, 120)
  registerGlobalFootprint({ type: 'image', key: fallback, provider: 'unsplash', origin: 'fallback' })
  return { type: 'image' as const, url: fallback, thumbUrl: null, source: { name: 'Unsplash', url: fallback } }
}

/* ------------------------------ LIVE: QUOTE/FACT/JOKE --------------------- */

/* --- NEW: anti-repeat buffer for quotes --- */
const recentQuotes: string[] = []
function markRecentQuote(text: string) {
  const t = (text || '').trim()
  if (!t) return
  pushRecent(recentQuotes, t, 120)
}
const isRecentQuote = (t?: string) => !!t && recentQuotes.includes((t || '').trim())
const recentQuoteTags: string[] = []
const recentQuoteKeywords: string[] = []
const recentQuoteAuthors: string[] = []

/* --- REPLACED: fetchLiveQuote keeps providers + DB + local --- */
async function fetchZenQuoteDoc(): Promise<any | null> {
  try {
    const res = await fetchWithTimeout('https://zenquotes.io/api/random', { cache: 'no-store' })
    if (!res?.ok) return null
    const data: any = await res.json()
    const entry: any = Array.isArray(data) ? data[0] : data
    const text = typeof entry?.q === 'string' ? entry.q.trim() : ''
    if (!text) return null
    const author = typeof entry?.a === 'string' ? entry.a.trim() : ''
    if (isLimitedAuthor(author) && Math.random() < 0.8) return null

    return {
      text,
      author,
      source: { name: 'ZenQuotes.io', url: 'https://zenquotes.io/' },
      provider: 'zenquotes',
    }
  } catch {
    return null
  }
}

async function fetchLiveQuote(): Promise<any | null> {
  const candidateMap = new Map<string, QuoteCandidate>()
  const add = (candidate: QuoteCandidate | null) => {
    if (!candidate) return
    const key = quoteCandidateKey(candidate)
    const existing = candidateMap.get(key)
    if (!existing || candidate.origin === 'network') candidateMap.set(key, candidate)
  }

  const dbCandidates = await collectQuoteCandidates()
  dbCandidates.forEach(add)

  const networkCandidates = await fetchNetworkQuoteCandidates()
  networkCandidates.forEach(add)

  const scored = Array.from(candidateMap.values())
    .map((candidate) => ({ candidate, score: scoreQuoteCandidate(candidate) }))
    .filter(({ score }) => Number.isFinite(score))
    .sort((a, b) => b.score - a.score)

  const preferFresh = shouldPreferFreshContent()
  const hasNetworkCandidate = scored.some(({ candidate }) => candidate.origin === 'network')

  for (const { candidate } of scored) {
    const key = quoteCandidateKey(candidate)
    const globallyRecent = isGlobalItemRecent('quote', key)
    const allTagsRecent = candidate.tags.every((tag) => recentQuoteTags.includes(tag))
    const allKeywordsRecent = candidate.keywords.length
      ? candidate.keywords.every((word) => recentQuoteKeywords.includes(word))
      : false
    const topicsGloballyTired = areTopicsGloballyRecent(candidate.tags)
    const keywordsGloballyTired = candidate.keywords.length ? areKeywordsGloballyRecent(candidate.keywords) : false
    const providerGloballyTired = isProviderGloballyRecent(candidate.provider)

    if (globallyRecent && scored.length > 1) continue
    if ((allTagsRecent && allKeywordsRecent) && scored.length > 1) continue
    if ((topicsGloballyTired || keywordsGloballyTired) && scored.length > 1) continue
    if (providerGloballyTired && scored.length > 2 && (!preferFresh || candidate.origin !== 'network')) continue
    if (preferFresh && hasNetworkCandidate && candidate.origin !== 'network' && scored.length > 1) continue

    if (candidate.origin === 'network') {
      await upsertCache('quote', { text: candidate.text }, {
        author: candidate.author,
        source: candidate.item.source,
        provider: candidate.provider,
        tags: candidate.tags,
        keywords: candidate.keywords,
      })
    }

    await touchLastShown('quote', { text: candidate.text })
    markRecentQuote(candidate.text)
    if (candidate.author) pushRecent(recentQuoteAuthors, candidate.author, 60)
    pushRecentMany(recentQuoteTags, candidate.tags, 90)
    pushRecentMany(recentQuoteKeywords, candidate.keywords, 160)
    registerGlobalFootprint({
      type: 'quote',
      key,
      tags: candidate.tags,
      keywords: candidate.keywords,
      provider: candidate.provider,
      origin: candidate.origin,
    })
    return candidate.item
  }

  const local = [
    'Simplicity is the soul of efficiency.',
    'Make it work, make it right, make it fast.',
    'Creativity is intelligence having fun.',
    'The best way to predict the future is to invent it.',
    'Imagination rules the world.',
    'Stay curious and keep exploring.',
    'Every great idea started as something weird.',
  ]
  const text = local.find((t) => !isRecentQuote(t)) || pick(local)
  const candidate = buildQuoteCandidate({ text, author: '', provider: 'local', source: { name: 'Local', url: '' } }, 'network')
  if (candidate) {
    await upsertCache('quote', { text: candidate.text }, {
      author: candidate.author,
      source: candidate.item.source,
      provider: candidate.provider,
      tags: candidate.tags,
      keywords: candidate.keywords,
    })
    await touchLastShown('quote', { text: candidate.text })
    markRecentQuote(candidate.text)
    pushRecentMany(recentQuoteTags, candidate.tags, 90)
    pushRecentMany(recentQuoteKeywords, candidate.keywords, 160)
    registerGlobalFootprint({
      type: 'quote',
      key: quoteCandidateKey(candidate),
      tags: candidate.tags,
      keywords: candidate.keywords,
      provider: candidate.provider,
      origin: candidate.origin,
    })
    return candidate.item
  }

  return null
}

/* ---------------- FACTS: multi-providers + timeouts (patch important) --------------- */

const FACT_HEADERS = { 'User-Agent': 'RandomAppBot/1.0 (+https://example.com)' }
async function fetchJson(url: string, timeoutMs = 6000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { cache: 'no-store', headers: FACT_HEADERS, signal: ctrl.signal as any })
    if (!res.ok) return null
    return await res.json()
  } catch { return null } finally { clearTimeout(t) }
}

async function factUselessfacts() {
  const base = process.env.USELESSFACTS_BASE || 'https://uselessfacts.jsph.pl'
  const d: any = await fetchJson(`${base}/random.json?language=en`)
  const text = trimText(d?.text || d?.data || '')
  return text ? { text, source: { name: 'UselessFacts', url: 'https://uselessfacts.jsph.pl' }, provider: 'uselessfacts' } : null
}
async function factNumbers() {
  const d: any = await fetchJson('https://numbersapi.com/random/trivia?json')
  const text = trimText(d?.text || '')
  return text ? { text, source: { name: 'Numbers API', url: 'https://numbersapi.com' }, provider: 'numbers' } : null
}
async function factCat() {
  const d: any = await fetchJson('https://catfact.ninja/fact')
  const text = trimText(d?.fact || '')
  return text ? { text, source: { name: 'catfact.ninja', url: 'https://catfact.ninja' }, provider: 'catfact' } : null
}
async function factMeow() {
  const d: any = await fetchJson('https://meowfacts.herokuapp.com/')
  const text = trimText(Array.isArray(d?.data) ? d.data[0] : '')
  return text ? { text, source: { name: 'meowfacts', url: 'https://meowfacts.herokuapp.com' }, provider: 'meowfacts' } : null
}
async function factDog() {
  const d: any = await fetchJson('https://dogapi.dog/api/facts')
  const text = trimText(Array.isArray(d?.facts) ? d.facts[0] : '')
  return text ? { text, source: { name: 'dogapi.dog', url: 'https://dogapi.dog' }, provider: 'dogapi' } : null
}
function shuffle<T>(arr: T[]) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]] } return arr }

async function fetchLiveFact(): Promise<any | null> {
  const candidateMap = new Map<string, FactCandidate>()
  const add = (candidate: FactCandidate | null) => {
    if (!candidate) return
    const key = factCandidateKey(candidate)
    const existing = candidateMap.get(key)
    if (!existing || candidate.origin === 'network') candidateMap.set(key, candidate)
  }

  const dbCandidates = await collectFactCandidates()
  dbCandidates.forEach(add)

  const networkCandidates = await fetchNetworkFactCandidates()
  networkCandidates.forEach(add)

  const scored = Array.from(candidateMap.values())
    .map((candidate) => ({ candidate, score: scoreFactCandidate(candidate) }))
    .filter(({ score }) => Number.isFinite(score))
    .sort((a, b) => b.score - a.score)

  const preferFresh = shouldPreferFreshContent()
  const hasNetworkCandidate = scored.some(({ candidate }) => candidate.origin === 'network')

  for (const { candidate } of scored) {
    const key = factCandidateKey(candidate)
    const globallyRecent = isGlobalItemRecent('fact', key)
    const allTagsRecent = candidate.tags.every((tag) => recentFactTags.includes(tag))
    const allKeywordsRecent = candidate.keywords.length
      ? candidate.keywords.every((word) => recentFactKeywords.includes(word))
      : false
    const topicsGloballyTired = areTopicsGloballyRecent(candidate.tags)
    const keywordsGloballyTired = candidate.keywords.length ? areKeywordsGloballyRecent(candidate.keywords) : false
    const providerGloballyTired = isProviderGloballyRecent(candidate.provider)

    if (globallyRecent && scored.length > 1) continue
    if ((allTagsRecent && allKeywordsRecent) && scored.length > 1) continue
    if ((topicsGloballyTired || keywordsGloballyTired) && scored.length > 1) continue
    if (providerGloballyTired && scored.length > 2 && (!preferFresh || candidate.origin !== 'network')) continue
    if (preferFresh && hasNetworkCandidate && candidate.origin !== 'network' && scored.length > 1) continue

    if (candidate.origin === 'network') {
      await upsertCache('fact', { text: candidate.text }, {
        source: candidate.item.source,
        provider: candidate.provider,
        tags: candidate.tags,
        keywords: candidate.keywords,
      })
    }

    await touchLastShown('fact', { text: candidate.text })
    markRecentFact(candidate.text)
    pushRecentMany(recentFactTags, candidate.tags, 90)
    pushRecentMany(recentFactKeywords, candidate.keywords, 160)
    pushRecent(recentFactProviders, candidate.provider, 40)
    registerGlobalFootprint({
      type: 'fact',
      key,
      tags: candidate.tags,
      keywords: candidate.keywords,
      provider: candidate.provider,
      origin: candidate.origin,
    })
    return candidate.item
  }

  const local = [
    'Honey never spoils.',
    'Octopuses have three hearts.',
    'Bananas are berries.',
    'A group of flamingos is a flamboyance.',
  ]
  const text = local.find(t => !recentFacts.includes(t)) || pick(local)
  const candidate = buildFactCandidate({ text, source: { name: 'Local', url: '' }, provider: 'local' }, 'network')
  if (candidate) {
    await upsertCache('fact', { text: candidate.text }, {
      source: candidate.item.source,
      provider: candidate.provider,
      tags: candidate.tags,
      keywords: candidate.keywords,
    })
    await touchLastShown('fact', { text: candidate.text })
    markRecentFact(candidate.text)
    pushRecentMany(recentFactTags, candidate.tags, 90)
    pushRecentMany(recentFactKeywords, candidate.keywords, 160)
    pushRecent(recentFactProviders, candidate.provider, 40)
    registerGlobalFootprint({
      type: 'fact',
      key: factCandidateKey(candidate),
      tags: candidate.tags,
      keywords: candidate.keywords,
      provider: candidate.provider,
      origin: candidate.origin,
    })
    return candidate.item
  }

  return null
}

/** Chuck Norris API */
async function fetchChuckNorrisJoke(): Promise<any | null> {
  const base = process.env.CHUCK_BASE || 'https://api.chucknorris.io'
  try {
    const res = await fetchWithTimeout(`${base}/jokes/random`, { cache: 'no-store' })
    if (!res?.ok) return null
    const d: any = await res.json()
    const text = trimText(d?.value)
    if (!text) return null
    return {
      type: 'joke',
      text,
      url: d.url,
      source: { name: 'api.chucknorris.io', url: d.url },
      provider: 'chucknorris',
      id: d.id,
    }
  } catch { return null }
}

async function fetchJokeApiSingle(): Promise<any | null> {
  try {
    const res = await fetchWithTimeout('https://v2.jokeapi.dev/joke/Any?type=single', { cache: 'no-store' })
    if (!res?.ok) return null
    const j: any = await res.json()
    const text = trimText(j?.joke)
    if (!text) return null
    return {
      type: 'joke',
      text,
      source: { name: 'JokeAPI', url: 'https://jokeapi.dev' },
      provider: 'jokeapi',
    }
  } catch { return null }
}

/** shortjokes.csv (fallback local) */
let SHORT_JOKES_CACHE: string[] | null = null
async function loadShortJokesCSV(): Promise<string[]> {
  if (SHORT_JOKES_CACHE) return SHORT_JOKES_CACHE
  try {
    const p = path.resolve(process.cwd(), process.env.SHORTJOKES_PATH || 'public/data/shortjokes.csv')
    const raw = await fs.readFile(p, 'utf8')
    SHORT_JOKES_CACHE = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
    return SHORT_JOKES_CACHE
  } catch { SHORT_JOKES_CACHE = []; return [] }
}
async function getShortJokeFromCSV(): Promise<any | null> {
  const list = await loadShortJokesCSV()
  if (!list.length) return null
  const text = trimText(pick(list))
  if (!text) return null
  return { type: 'joke', text, source: { name: 'local-csv' }, provider: 'shortjokes.csv' }
}

async function fetchLiveJoke(): Promise<any | null> {
  const candidateMap = new Map<string, JokeCandidate>()
  const add = (candidate: JokeCandidate | null) => {
    if (!candidate) return
    const key = jokeCandidateKey(candidate)
    const existing = candidateMap.get(key)
    if (!existing || candidate.origin === 'network') candidateMap.set(key, candidate)
  }

  const dbCandidates = await collectJokeCandidates()
  dbCandidates.forEach(add)

  const networkCandidates = await fetchNetworkJokeCandidates()
  networkCandidates.forEach(add)

  const scored = Array.from(candidateMap.values())
    .map((candidate) => ({ candidate, score: scoreJokeCandidate(candidate) }))
    .filter(({ score }) => Number.isFinite(score))
    .sort((a, b) => b.score - a.score)

  const preferFresh = shouldPreferFreshContent()
  const hasNetworkCandidate = scored.some(({ candidate }) => candidate.origin === 'network')

  for (const { candidate } of scored) {
    const key = jokeCandidateKey(candidate)
    const globallyRecent = isGlobalItemRecent('joke', key)
    const allTagsRecent = candidate.tags.every((tag) => recentJokeTags.includes(tag))
    const allKeywordsRecent = candidate.keywords.length
      ? candidate.keywords.every((word) => recentJokeKeywords.includes(word))
      : false
    const topicsGloballyTired = areTopicsGloballyRecent(candidate.tags)
    const keywordsGloballyTired = candidate.keywords.length ? areKeywordsGloballyRecent(candidate.keywords) : false
    const providerGloballyTired = isProviderGloballyRecent(candidate.provider)

    if (globallyRecent && scored.length > 1) continue
    if ((allTagsRecent && allKeywordsRecent) && scored.length > 1) continue
    if ((topicsGloballyTired || keywordsGloballyTired) && scored.length > 1) continue
    if (providerGloballyTired && scored.length > 2 && (!preferFresh || candidate.origin !== 'network')) continue
    if (preferFresh && hasNetworkCandidate && candidate.origin !== 'network' && scored.length > 1) continue

    if (candidate.origin === 'network') {
      await upsertCache('joke', { text: candidate.text }, {
        source: candidate.item.source,
        provider: candidate.provider,
        tags: candidate.tags,
        keywords: candidate.keywords,
      })
    }

    await touchLastShown('joke', { text: candidate.text })
    markRecentJoke(candidate.text)
    pushRecentMany(recentJokeTags, candidate.tags, 80)
    pushRecentMany(recentJokeKeywords, candidate.keywords, 160)
    pushRecent(recentJokeProviders, candidate.provider, 30)
    registerGlobalFootprint({
      type: 'joke',
      key,
      tags: candidate.tags,
      keywords: candidate.keywords,
      provider: candidate.provider,
      origin: candidate.origin,
    })
    return candidate.item
  }

  const csv = await getShortJokeFromCSV()
  if (csv?.text) {
    const candidate = buildJokeCandidate(csv, 'network')
  if (candidate) {
    await upsertCache('joke', { text: candidate.text }, {
      source: candidate.item.source,
      provider: candidate.provider,
      tags: candidate.tags,
      keywords: candidate.keywords,
    })
    await touchLastShown('joke', { text: candidate.text })
    markRecentJoke(candidate.text)
    pushRecentMany(recentJokeTags, candidate.tags, 80)
    pushRecentMany(recentJokeKeywords, candidate.keywords, 160)
    pushRecent(recentJokeProviders, candidate.provider, 30)
    registerGlobalFootprint({
      type: 'joke',
      key: jokeCandidateKey(candidate),
      tags: candidate.tags,
      keywords: candidate.keywords,
      provider: candidate.provider,
      origin: candidate.origin,
    })
    return candidate.item
  }
  }

  return null
}

// ------------------------------ LIVE: VIDEO -------------------------------
const YT_ENDPOINT = 'https://www.googleapis.com/youtube/v3'
const BASE_VIDEO_KEYWORDS: string[] = [
 'weird','obscure','retro','vintage','lofi','lo-fi','analog','super 8','vhs','camcorder',
  'crt scanlines','mono audio','field recording','one take','bedroom recording','demo tape',
  'b-side','bootleg','lost media','found footage','public access tv','community tv',
  'radio archive','open reel','cassette rip','vinyl rip','shellac 78','archive footage',
  'home video','school recital','talent show','garage rehearsal','backyard session',
  'kitchen session','living room session','live session','studio live','acoustic set',
 'tiny desk style','busking','street performance','subway performance','rooftop concert',
  'basement show','barn session','porch session','campfire song','circle singing',
  'choir warmup','soundcheck','rehearsal take','improv jam','loop pedal','one man band',
  'homemade instrument','marble machine','toy orchestra','8bit music','chiptune','flash game',
  'pixel art cutscene','retro game intro','speedrun highlight','lan party',
  'amateur animation','paper stop motion','claymation','flipbook','stickman fight',
  'funny sketch','micro budget short','student film','no dialogue short',
  'outsider art','performance art','site specific art','happening','kinetic sculpture','sex','love','chocolate','sexy',
  'cake','cook','kitchen','sugar','recipe','vintage commercial','psa announcement','station ident','closing theme','end credits',
  'stadium tour live','chart topping live performance','global pop hit remix','international dance challenge','billboard awards live','modern art installation','contemporary dance troupe','orchestral film score recording','world cup fan cam','olympic opening ceremony flashback','viral short film award','immersive theater experience','indie music festival 2024','city street food documentary','tech conference keynote highlight','space agency live stream'
]
const KEYWORDS: string[] = Array.from(new Set([...BASE_VIDEO_KEYWORDS, ...INGEST_VIDEO_KEYWORDS]))
const COMBOS: [string, string][] = [ ['gospel','romania'], ['festival','village'], ['folk','iceland'], ['choir','argentina'], ['busking','japan'], ['retro game','speedrun'], ['home made','instrument'], ['toy','orchestra'], ['amateur','sport'], ['art','fun'], ['obscure','retro'], ['rare','game'], ['sea shanty','brittany'], ['sea shanty','cornwall'], ['polyphonic','georgia'], ['brass band','serbia'], ['klezmer','poland'], ['fado','lisbon'], ['flamenco','andalusia'], ['rebetiko','athens'], ['tarantella','naples'], ['cumbia','colombia'], ['forró','northeast brazil'], ['samba','bahia'], ['huapongo','mexico'], ['tango','buenos aires'], ['gnawa','essaouira'], ['rai','oran'], ['dabke','lebanon'], ['qawwali','lahore'], ['bhajan','varanasi'], ['enka','tokyo'], ['minyo','tohoku'], ['joik','sapmi'], ['yodel','tyrol'], ['bluegrass','kentucky'], ['old-time','appalachia'], ['zydeco','louisiana'], ['kora','mali'], ['mbira','zimbabwe'], ['hurdy-gurdy','drone'], ['nyckelharpa','folk'], ['charango','andean'], ['bandoneon','milonga'], ['oud','taqsim'], ['saz','anatolian'], ['kanun','takht'], ['duduk','lament'], ['kaval','shepherd'], ['bagpipes','procession'], ['steelpan','street'], ['handpan','improv'], ['theremin','noir'], ['washboard','skiffle'], ['lap steel','hawaiian'], ['hardanger','waltz'], ['tiny desk','cover'], ['tiny desk','choir'], ['living room','session'], ['kitchen','session'], ['porch','session'], ['barn','session'], ['backyard','concert'], ['rooftop','concert'], ['basement','show'], ['subway','performance'], ['market','busking'], ['train platform','choir'], ['church','reverb'], ['cave','echo'], ['lighthouse','stairwell'], ['factory','reverb'], ['courtyard','ensemble'], ['river bank','song'], ['forest','chorus'], ['tea house','duo'], ['izakaya','live'], ['yurt','jam'], ['vhs','concert'], ['camcorder','wedding'], ['super 8','parade'], ['black and white','choir'], ['sepia','waltz'], ['cassette','demo'], ['vinyl','rip'], ['reel to reel','transfer'], ['public access','variety'], ['local tv','showcase'], ['newsreel','march'], ['colorized','archive'], ['school','recital'], ['talent','show'], ['family','band'], ['birthday','serenade'], ['farewell','song'], ['lullaby','grandma'], ['flash','animation'], ['pixel','cutscene'], ['8bit','cover'], ['chip','remix'], ['crt','capture'], ['lan','party'], ['speedrun','glitch'], ['retro','longplay'], ['odd','sport'], ['rural','games'], ['stone','lifting'], ['log','toss'], ['banjo','spaghetti'], ['pingouin','synthwave'], ['moquette','symphonie'], ['baguette','laser'], ['chaussette','opera'], ['brume','karaoké'], ['pyramide','yodel'], ['pastèque','minuet'], ['escargot','free-jazz'], ['moustache','autotune'], ['chausson','dubstep'], ['fondue','breakbeat'], ['poney','maracas'], ['bibliothèque','techno'], ['chandelle','hip-hop'], ['parapluie','boléro'], ['cornichon','requiem'], ['béret','sitar'], ['météorite','berceuse'], ['citron','dissonance'], ['radis','madrigal'], ['cartouche','tamboo'], ['serpent','bal musette'], ['biscotte','koto'], ['zanzibar','trombone'], ['tortue','clapping'], ['larme','tambourin'], ['nuage','scat'], ['mouette','bossa'], ['glaçon','ragtime'], ['gruyère','chorale'], ['caméléon','vocoder'], ['chausson','kazoo'], ['tuba','grenadine'], ['haricot','fugue'], ['bretzel','ukulélé'], ['chou-fleur','clavecin'], ['pamplemousse','gamelan'], ['cornemuse','bubblegum'], ['pierre','beatbox'], ['sabayon','timbales'], ['yéti','harmonium'], ['cactus','bongos'], ['hamac','arpèges'], ['baleine','triangle'], ['girafe','sifflement'], ['lama','riff'], ['café','tremolo'], ['soufflé','chorus'], ['ampoule','bpm'], ['glacier','cassette'], ['patate','vibrato'], ['courgette','polyrythmie'], ['mangue','contrepoint'], ['poussière','refrain'], ['aquarium','dub'], ['navet','flanger'], ['fantôme','clave'], ['cerf-volant','toccata'], ['scaphandre','mazurka'], ['parpaing','salsa'], ['lutin','samba'], ['orage','menuet'], ['tornade','cadenza'], ['brouillard','beat'], ['valise','glissando'], ['tournesol','rave'], ['boussole','nocturne'], ['bouchon','aria'], ['gaufre','chorinho'], ['sardine','cantate'], ['chouette','grind'], ['mirabelle','groove'], ['crocodile','valse'], ['rose des vents','hocket'], ['bourdon','limbique'], ['cabane','syncopes'], ['fenouil','crescendo'], ['fourchette','counter-melody'], ['serrure','harmoniques'], ['ballon','distorsion'], ['soucoupe','reverb'], ['marmotte','fadeout'], ['moutarde','autopan'], ['pastel','sidechain'], ['puzzle','clave'], ['cathédrale','lo-fi'], ['cymbale','confettis'], ['pissenlit','drop'], ['brouette','riff'], ['tapir','chorale'], ['pluie','sample'], ['savonnette','drone'], ['poubelle','oratorio'], ['carton','808'], ['bretelle','arpège'], ['bourricot','syncopé'], ['clairière','harmonie'], ['kiwi','sustain'], ['grenouille','snare'] ]
const recentVideoIds: string[] = []
function markRecentVideo(id: string) { const i = recentVideoIds.indexOf(id); if (i >= 0) recentVideoIds.splice(i, 1); recentVideoIds.push(id); if (recentVideoIds.length > 30) recentVideoIds.shift() }
const isRecentVideo = (id?: string) => !!id && recentVideoIds.includes(id)
function buildYouTubeQuery(): string {
  const roll = Math.random()
  if (roll < 0.5 && INGEST_VIDEO_KEYWORDS.length) return pick(INGEST_VIDEO_KEYWORDS)
  if (roll < 0.8) return pick(KEYWORDS)
  const [a, b] = pick(COMBOS)
  return `${a} ${b}`
}

async function fetchFromRedditFunnyYouTube(): Promise<any | null> {
  try {
    const res = await fetchWithTimeout('https://www.reddit.com/r/funnyvideos/.json?limit=20', { cache: 'no-store' })
    if (!res?.ok) return null
    const j: any = await res.json()
    const posts: any[] = j?.data?.children?.map((c: any) => c?.data).filter(Boolean) || []
    const yt = posts.filter(p => /youtu\.be\/|youtube\.com\/watch\?/.test((p?.url || '').toString()))
    if (!yt.length) return null
    const p = pick(yt)
    const url: string = p.url
    let id = ''
    try { const u = new URL(url); if (u.hostname.includes('youtu')) id = u.searchParams.get('v') || u.pathname.split('/').pop() || '' } catch {}
    if (!id) return null

    const title = (p?.title || '').toString()
    const thumb = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
    return {
      videoId: id,
      url,
      title,
      description: '',
      thumb,
      provider: 'reddit-youtube',
      source: { name: 'Reddit', url: `https://www.reddit.com${p?.permalink || ''}` },
    }
  } catch { return null }
}

async function fetchFromVimeo(query: string): Promise<any | null> {
  const token = process.env.VIMEO_ACCESS_TOKEN
  if (!token) return null
  try {
    const u = new URL('https://api.vimeo.com/videos')
    u.searchParams.set('query', query)
    u.searchParams.set('per_page', '20')
    u.searchParams.set('sort', 'relevant')
    const res = await fetchWithTimeout(u.toString(), { cache: 'no-store', headers: { Authorization: `Bearer ${token}` } })
    if (!res?.ok) return null
    const d: any = await res.json()
    const arr: any[] = d?.data || []
    if (!arr.length) return null
    const v = pick(arr)
    const link: string = v?.link || ''
    const pictures = v?.pictures?.sizes || []
    const og = (pictures[pictures.length - 1]?.link) || (pictures[0]?.link) || null
    const title = (v?.name || '').toString()

    const item = { type: 'web' as const, url: link, text: title || link, ogImage: og, source: { name: 'Vimeo', url: link }, provider: 'vimeo' }
    await upsertCache('web', { url: link }, { title: item.text, ogImage: og, provider: 'vimeo' })
    await touchLastShown('web', { url: link })
    return item
  } catch { return null }
}

async function fetchLiveVideo(): Promise<any | null> {
  const candidateMap = new Map<string, VideoCandidate>()

  const add = (candidate: VideoCandidate | null) => {
    if (!candidate) return
    const key = candidateKey(candidate)
    if (!key) return
    const existing = candidateMap.get(key)
    if (!existing || (candidate.origin === 'network' && existing.origin !== 'network')) {
      candidateMap.set(key, candidate)
    }
  }

  const dbCandidates = await collectVideoCandidates()
  dbCandidates.forEach(add)

  const networkCandidates = await fetchNetworkVideoCandidates()
  networkCandidates.forEach(add)

  const scored = Array.from(candidateMap.values())
    .map((candidate) => ({ candidate, score: scoreVideoCandidate(candidate) }))
    .filter(({ score }) => Number.isFinite(score))
    .sort((a, b) => b.score - a.score)

  const preferFresh = shouldPreferFreshContent()
  const hasNetworkCandidate = scored.some(({ candidate }) => candidate.origin === 'network')

  for (const { candidate, score } of scored) {
    if (score < -5) continue
    const key = candidateKey(candidate)
    if (!key) continue
    const providerKey = candidate.mapped.provider
    const tags = candidate.tags
    const keywords = candidate.keywords
    const allTagsRecent = tags.length && tags.every((tag) => recentVideoTopics.includes(tag))
    const allKeywordsRecent = keywords.length && keywords.every((word) => recentVideoKeywords.includes(word))
    const globallyRecent = isGlobalItemRecent('video', key)
    const topicsGloballyTired = tags.length ? areTopicsGloballyRecent(tags) : false
    const keywordsGloballyTired = keywords.length ? areKeywordsGloballyRecent(keywords) : false
    const providerGloballyTired = isProviderGloballyRecent(providerKey)
    if (globallyRecent && scored.length > 1) continue
    if (allTagsRecent && allKeywordsRecent && scored.length > 1) continue
    if ((topicsGloballyTired || keywordsGloballyTired) && scored.length > 1) continue
    if (providerGloballyTired && scored.length > 2 && (!preferFresh || candidate.origin !== 'network')) continue
    if (preferFresh && hasNetworkCandidate && candidate.origin !== 'network' && scored.length > 1) continue

    if (candidate.origin === 'network') {
      await upsertCache('video', candidate.mapped.key, {
        title: candidate.mapped.item.text,
        url: candidate.mapped.item.url,
        description: trimText(candidate.mapped.raw?.description || ''),
        provider: candidate.mapped.provider,
        thumb: candidate.mapped.item.thumbUrl || null,
        source: candidate.mapped.item.source,
        tags,
        keywords,
      })
    }

    await touchLastShown('video', candidate.mapped.key)
    if (candidate.mapped.key.videoId) markRecentVideo(candidate.mapped.key.videoId)
    else if (candidate.mapped.key.url) markRecentVideo(candidate.mapped.key.url)
    markRecentVideoProvider(candidate.mapped.provider)
    markRecentVideoTopics(tags)
    if (keywords.length) markRecentVideoKeywords(keywords)
    registerGlobalFootprint({
      type: 'video',
      key,
      tags,
      keywords,
      provider: providerKey,
      origin: candidate.origin,
    })
    return candidate.mapped.item
  }

  const fallbackDoc = await sampleVideoFromCache()
  const fallbackCandidate = fallbackDoc ? buildVideoCandidate(fallbackDoc, 'db-random') : null
  if (fallbackCandidate) {
    await touchLastShown('video', fallbackCandidate.mapped.key)
    if (fallbackCandidate.mapped.key.videoId) markRecentVideo(fallbackCandidate.mapped.key.videoId)
    else if (fallbackCandidate.mapped.key.url) markRecentVideo(fallbackCandidate.mapped.key.url)
    markRecentVideoProvider(fallbackCandidate.mapped.provider)
    markRecentVideoTopics(fallbackCandidate.tags)
    if (fallbackCandidate.keywords.length) markRecentVideoKeywords(fallbackCandidate.keywords)
    registerGlobalFootprint({
      type: 'video',
      key: candidateKey(fallbackCandidate) || fallbackCandidate.mapped.key.videoId || fallbackCandidate.mapped.key.url,
      tags: fallbackCandidate.tags,
      keywords: fallbackCandidate.keywords,
      provider: fallbackCandidate.mapped.provider,
      origin: fallbackCandidate.origin,
    })
    return fallbackCandidate.mapped.item
  }

  const cachedWeb = await sampleFromCache('web', { provider: 'vimeo', ogImage: { $nin: [null, '', false] } })
  if (cachedWeb?.url) {
    touchLastShown('web', { url: cachedWeb.url })
    registerGlobalFootprint({
      type: 'web',
      key: cachedWeb.url,
      provider: 'vimeo',
      origin: 'fallback',
    })
    return { type: 'web', url: cachedWeb.url, text: cachedWeb.title || cachedWeb.url, ogImage: cachedWeb.ogImage || null, source: { name: 'Vimeo', url: cachedWeb.url } }
  }

  return null
}

// ------------------------------- LIVE: WEB --------------------------------
const recentHosts: string[] = []
function markRecentHost(h: string) { const i = recentHosts.indexOf(h); if (i >= 0) recentHosts.splice(i, 1); recentHosts.push(h); if (recentHosts.length > 30) recentHosts.shift() }
const isRecentHost = (h?: string) => !!h && recentHosts.includes(h)
type WebCandidate = {
  url: string
  host: string
  item: { type: 'web'; url: string; text: string; ogImage: string | null; source: any }
  tags: string[]
  keywords: string[]
  provider: string
  origin: CandidateOrigin
  updatedAt?: Date | null
  lastShownAt?: Date | null
}

function extractWebTags(text: string): string[] {
  const tags = extractTagsFromSeeds(text, WEB_TOPIC_SEEDS)
  return tags.length ? tags : ['misc']
}

function buildWebCandidate(doc: any, origin: CandidateOrigin): WebCandidate | null {
  const url = trimText(doc?.url)
  if (!url) return null
  let host = trimText(doc?.host || '')
  if (!host) {
    try { host = new URL(url).host.replace(/^www\./, '') } catch {}
  }
  const text = trimText(doc?.title || doc?.text || host || url)
  const ogImage = doc?.ogImage || doc?.thumb || null
  const provider = trimText(doc?.provider) || 'web'
  const source = doc?.source || { name: provider, url }
  const descriptor = `${text} ${host} ${provider}`
  const storedTags = normalizeStringArray(doc?.tags)
  const storedKeywords = normalizeStringArray(doc?.keywords)
  const tags = storedTags.length ? storedTags : extractWebTags(descriptor)
  const keywords = storedKeywords.length ? storedKeywords : extractKeywordsFromText(descriptor)
  const updatedAt = doc?.updatedAt ? new Date(doc.updatedAt) : null
  const lastShownAt = doc?.lastShownAt ? new Date(doc.lastShownAt) : null
  return {
    url,
    host,
    item: { type: 'web', url, text, ogImage, source },
    tags,
    keywords,
    provider,
    origin,
    updatedAt,
    lastShownAt,
  }
}

function webCandidateKey(candidate: WebCandidate): string {
  return candidate.url
}

function scoreWebCandidate(candidate: WebCandidate): number {
  let score = 0

  if (!recentHosts.includes(candidate.host)) score += 8
  else score -= 9

  if (!recentWebProviders.includes(candidate.provider)) score += 3
  else score -= 3

  const uniqueTags = new Set(candidate.tags)
  for (const tag of uniqueTags) {
    if (recentWebTags.includes(tag)) score -= 2
    else score += 3
  }

  const uniqueKeywords = candidate.keywords.filter((word) => !recentWebKeywords.includes(word))
  const repeatedKeywords = candidate.keywords.length - uniqueKeywords.length
  score += uniqueKeywords.length * 1.4
  score -= repeatedKeywords * 2.4

  if (candidate.origin === 'network') score += 4
  else if (candidate.origin === 'db-unseen') score += 2

  if (!candidate.lastShownAt) score += 3
  else {
    const days = (Date.now() - candidate.lastShownAt.getTime()) / DAY_MS
    if (days > 21) score += 4
    else if (days < 3) score -= 3
  }

  score += Math.random()
  return score
}

async function collectWebCandidates(): Promise<WebCandidate[]> {
  const db = await getDbSafe()
  if (!db) return []
  const bucket = new Map<string, WebCandidate>()
  const add = (doc: any, origin: CandidateOrigin) => {
    const candidate = buildWebCandidate(doc, origin)
    if (!candidate) return
    const key = webCandidateKey(candidate)
    const existing = bucket.get(key)
    if (!existing || candidate.origin === 'network') bucket.set(key, candidate)
  }

  try {
    const [fresh, unseen, backlog, randomDocs] = await Promise.all([
      db.collection('items').find({ type: 'web' }).sort({ updatedAt: -1 }).limit(120).toArray(),
      db.collection('items').find({ type: 'web', $or: [{ lastShownAt: { $exists: false } }, { lastShownAt: null }] }).sort({ updatedAt: -1 }).limit(80).toArray(),
      db.collection('items').find({ type: 'web', lastShownAt: { $lt: new Date(Date.now() - 14 * DAY_MS) } }).sort({ lastShownAt: 1 }).limit(80).toArray(),
      db.collection('items').aggregate([{ $match: { type: 'web' } }, { $sample: { size: 60 } }]).toArray(),
    ])
    for (const doc of fresh) add(doc, 'db-fresh')
    for (const doc of unseen) add(doc, 'db-unseen')
    for (const doc of backlog) add(doc, 'db-backlog')
    for (const doc of randomDocs) add(doc, 'db-random')
  } catch {}

  return Array.from(bucket.values())
}

async function fetchNetworkWebCandidates(): Promise<WebCandidate[]> {
  const KEY = process.env.GOOGLE_CSE_KEY || process.env.GOOGLE_API_KEY
  const CX = process.env.GOOGLE_CSE_CX  || process.env.GOOGLE_CSE_ID
  if (!KEY || !CX) return []

  const A = Array.from(new Set([...(WEB_KEYWORD_LISTS.A || []), 'weird','forgotten','retro','vintage','ascii','obscure','random','tiny','handmade','zine','folk','outsider','underground','amateur','old web','geocities','blogspot','tripod','myspace','lofi','pixel','crt','vhs','camcorder','guestbook','y2k','webcore','demoscene','net.art']))
  const B = Array.from(new Set([...(WEB_KEYWORD_LISTS.B || []), 'blog','diary','gallery','generator','zine','festival','toy','museum','game','playlist','lyrics','fan page','tutorial','archive','personal site','homepage','forum','webring','guestbook','wiki','cookbook','guide','blogroll','directory','portal','topsites','newsletter','mirror','ftp','userscripts','bookmarklet','fanfic','scanlation','pet game','virtual pet','toybox','playground','lab','experiments']))
  const C = Array.from(new Set([...(WEB_KEYWORD_LISTS.C || []), '1998','2003','romania','argentina','finland','iceland','japan','france','village','basement','attic','garage','mexico','brazil','colombia','morocco','turkey','greece','portugal','neon','cybercafe','library','dorm room','rooftop','market','pier','lighthouse','forest','river']))

  const queries = new Set<string>()
  while (queries.size < 4) {
    queries.add(`${pick(A)} ${pick(B)} ${pick(C)}`)
  }

  const out: WebCandidate[] = []
  for (const query of queries) {
    try {
      const start = String([1,1,1,11,21][Math.floor(Math.random() * 5)])
      const num = String([10,9,8][Math.floor(Math.random() * 3)])
      const res = await fetchWithTimeout(`https://www.googleapis.com/customsearch/v1?key=${KEY}&cx=${CX}&q=${encodeURIComponent(query)}&num=${num}&start=${start}&safe=off`, { cache: 'no-store' })
      if (!res?.ok) continue
      const data: any = await res.json()
      const items: any[] = data?.items || []
      for (const candidate of shuffle(items.slice())) {
        const link: string | undefined = candidate?.link
        if (!link) continue
        let host = ''
        try { host = new URL(link).host.replace(/^www\./,'') } catch {}
        if (host && isRecentHost(host)) continue
        const ogImage = await fetchOgImage(link)
        if (!ogImage) continue
        const doc = {
          url: link,
          host,
          title: candidate?.title || host || link,
          ogImage,
          provider: 'google-cse',
          source: { name: 'Google', url: link },
        }
        const built = buildWebCandidate(doc, 'network')
        if (built) out.push(built)
        if (out.length >= 6) break
      }
    } catch {}
    if (out.length >= 6) break
  }
  return out
}
const recentWebTags: string[] = []
const recentWebKeywords: string[] = []
const recentWebProviders: string[] = []

async function fetchOgImage(link: string): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(
      link,
      { cache: 'no-store', headers: { 'User-Agent': 'Mozilla/5.0 (RandomApp Bot; +https://example.com)' } },
      1500,
    )
    if (!res?.ok) return null
    const html = await res.text()
    const og = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1]
      || /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1]
    if (og) return new URL(og, link).toString()
    const img = /<img[^>]+src=["']([^"']+)["'][^>]*>/i.exec(html)?.[1]
    return img ? new URL(img, link).toString() : null
  } catch { return null }
}

async function fetchLiveWeb(): Promise<any | null> {
  const candidateMap = new Map<string, WebCandidate>()
  const add = (candidate: WebCandidate | null) => {
    if (!candidate) return
    const key = webCandidateKey(candidate)
    const existing = candidateMap.get(key)
    if (!existing || candidate.origin === 'network') candidateMap.set(key, candidate)
  }

  const dbCandidates = await collectWebCandidates()
  dbCandidates.forEach(add)

  const networkCandidates = await fetchNetworkWebCandidates()
  networkCandidates.forEach(add)

  const scored = Array.from(candidateMap.values())
    .map((candidate) => ({ candidate, score: scoreWebCandidate(candidate) }))
    .filter(({ score }) => Number.isFinite(score))
    .sort((a, b) => b.score - a.score)

  const preferFresh = shouldPreferFreshContent()
  const hasNetworkCandidate = scored.some(({ candidate }) => candidate.origin === 'network')

  for (const { candidate } of scored) {
    const allTagsRecent = candidate.tags.every((tag) => recentWebTags.includes(tag))
    const allKeywordsRecent = candidate.keywords.length
      ? candidate.keywords.every((word) => recentWebKeywords.includes(word))
      : false
    const globallyRecent = isGlobalItemRecent('web', candidate.url)
    const topicsGloballyTired = areTopicsGloballyRecent(candidate.tags)
    const keywordsGloballyTired = candidate.keywords.length ? areKeywordsGloballyRecent(candidate.keywords) : false
    const providerGloballyTired = isProviderGloballyRecent(candidate.provider)

    if (globallyRecent && scored.length > 1) continue
    if (allTagsRecent && allKeywordsRecent && scored.length > 1) continue
    if ((topicsGloballyTired || keywordsGloballyTired) && scored.length > 1) continue
    if (providerGloballyTired && scored.length > 2 && (!preferFresh || candidate.origin !== 'network')) continue
    if (preferFresh && hasNetworkCandidate && candidate.origin !== 'network' && scored.length > 1) continue

    if (candidate.origin === 'network') {
      await upsertCache('web', { url: candidate.url }, {
        title: candidate.item.text,
        host: candidate.host,
        ogImage: candidate.item.ogImage,
        provider: candidate.provider,
        tags: candidate.tags,
        keywords: candidate.keywords,
      })
    }

    await touchLastShown('web', { url: candidate.url })
    if (candidate.host) markRecentHost(candidate.host)
    pushRecentMany(recentWebTags, candidate.tags, 120)
    pushRecentMany(recentWebKeywords, candidate.keywords, 160)
    pushRecent(recentWebProviders, candidate.provider, 40)
    registerGlobalFootprint({
      type: 'web',
      key: candidate.url,
      tags: candidate.tags,
      keywords: candidate.keywords,
      provider: candidate.provider,
      origin: candidate.origin,
    })
    return candidate.item
  }

  const cached = await sampleFromCache('web', { ogImage: { $nin: [null, '', false] } })
  if (cached?.url) {
    await touchLastShown('web', { url: cached.url })
    const fallback = buildWebCandidate(cached, 'db-random')
    if (fallback) {
      pushRecentMany(recentWebTags, fallback.tags, 120)
      pushRecentMany(recentWebKeywords, fallback.keywords, 160)
      if (fallback.host) markRecentHost(fallback.host)
      registerGlobalFootprint({
        type: 'web',
        key: fallback.item.url,
        tags: fallback.tags,
        keywords: fallback.keywords,
        provider: fallback.provider,
        origin: fallback.origin,
      })
      return fallback.item
    }
    registerGlobalFootprint({
      type: 'web',
      key: cached.url,
      provider: cached.provider || 'cache',
      origin: 'db-random',
    })
    return { type: 'web' as const, url: cached.url, text: cached.title || cached.host || cached.url, ogImage: cached.ogImage || null, source: cached.source || { name: cached.provider || 'cache', url: cached.url } }
  }

  return null
}

/* -------------------------------- Handler -------------------------------- */
function parseTypes(param: string | null | undefined): ItemType[] {
  const allow = new Set<ItemType>(['image','quote','fact','joke','video','web'])
  const list = (param || '').split(',').map(s => s.trim()).filter(Boolean) as ItemType[]
  const filtered = list.filter(t => allow.has(t))
  return filtered.length ? filtered : ['image','quote','fact']
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const lang = (searchParams.get('lang') || 'en') as Lang
    const types = orderAsGiven(parseTypes(searchParams.get('types')))

    // on essaie les types demandés dans l'ordre
    for (const t of types) {
      let it: any | null = null
      if (t === 'image') it = await fetchLiveImage()
      else if (t === 'video') it = await fetchLiveVideo()      // ⬅ garde ta version
      else if (t === 'quote') it = await fetchLiveQuote()
      else if (t === 'joke')  it = await fetchLiveJoke()
      else if (t === 'fact')  it = await fetchLiveFact()
      else if (t === 'web')   it = await fetchLiveWeb()        // ⬅ garde ta version
      if (it) {
        const itemType = (it as any)?.type as ItemType | undefined
        if (itemType) markRecentType(itemType)
        await recordDailyUsage({
          type: (it as any)?.type,
          lang,
          provider: (it as any)?.provider || (typeof (it as any)?.source === 'object' ? (it as any)?.source?.name : undefined) || null,
        })
        return NextResponse.json({ item: it })
      }
    }

    // ---- Fallback final (pour ne jamais retourner null) ----
    if (types.includes('quote')) {
      const local = [
        'Simplicity is the soul of efficiency.',
        'Make it work, make it right, make it fast.',
        'Creativity is intelligence having fun.',
        'The best way to predict the future is to invent it.'
      ]
      const text = local[Math.floor(Math.random() * local.length)]
      const fallbackQuote = { type: 'quote' as const, text, author: '', source: { name: 'Local', url: '' } }
      markRecentType('quote')
      registerGlobalFootprint({ type: 'quote', key: text, provider: fallbackQuote.source.name || 'local', origin: 'fallback' })
      await recordDailyUsage({ type: fallbackQuote.type, lang, provider: fallbackQuote.source.name })
      return NextResponse.json({ item: fallbackQuote })
    }

    const img = pick(FB_IMAGES)
    const fallbackImage = { type: 'image' as const, url: img, source: { name: 'Unsplash', url: img } }
    markRecentType('image')
    registerGlobalFootprint({ type: 'image', key: img, provider: fallbackImage.source.name || 'unsplash', origin: 'fallback' })
    await recordDailyUsage({ type: fallbackImage.type, lang, provider: fallbackImage.source.name })
    return NextResponse.json({ item: fallbackImage })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'error' }, { status: 500 })
  }
}
