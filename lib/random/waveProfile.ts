export const WAVE_PROFILE_VERSION = 1

export type WaveProfile = {
  version: number
  anchors: string[]
  phrases: string[]
  concepts: string[]
  facets: string[]
  confidence: number
}

export type WaveProfileSource = {
  type?: string | null
  title?: string | null
  text?: string | null
  description?: string | null
  author?: string | null
  category?: string | null
  channelTitle?: string | null
  host?: string | null
  provider?: string | null
  tags?: string[] | null
  keywords?: string[] | null
  variant?: string | null
  quiz?: {
    question?: string | null
    answer?: string | null
    category?: string | null
  } | null
}

export type WaveProfileSimilarity = {
  score: number
  anchorMatches: number
  phraseMatches: number
  conceptMatches: number
  facetMatches: number
  directMatches: number
}

const STOP_WORDS = new Set([
  'about', 'after', 'again', 'also', 'and', 'are', 'avec', 'been', 'before', 'being', 'but', 'can',
  'como', 'dans', 'das', 'del', 'des', 'die', 'ein', 'elle', 'est', 'for', 'from', 'fur', 'has',
  'have', 'how', 'ist', 'its', 'las', 'les', 'los', 'mais', 'more', 'not', 'official', 'our', 'para',
  'par', 'pero', 'por', 'pour', 'que', 'qui', 'sur', 'than', 'that', 'the', 'their', 'this', 'uma',
  'una', 'une', 'uno', 'von', 'was', 'were', 'what', 'when', 'where', 'which', 'with', 'you', 'your',
])

const LOW_SIGNAL_WORDS = new Set([
  'animated', 'animation', 'background', 'best', 'channel', 'clip', 'close', 'closeup', 'color', 'colors',
  'compilation', 'content',
  'daily', 'design', 'end', 'episode', 'fact', 'facts', 'footage', 'foreground', 'front', 'full', 'gif',
  'body', 'face', 'hand', 'happy', 'head', 'high', 'holding', 'image', 'images', 'latest', 'looking',
  'low', 'media', 'modern', 'new',
  'officially', 'online', 'optimized', 'part', 'photo', 'picture', 'professional', 'project', 'question',
  'questions', 'quiz', 'random', 'search', 'series', 'short', 'shot', 'showing', 'shows', 'side', 'sitting',
  'standing', 'stomach',
  'shorts', 'show', 'social', 'special', 'story', 'test', 'time', 'today', 'top', 'trend', 'trending',
  'trivia', 'update', 'video', 'videos', 'viral', 'watch', 'world', 'people', 'person', 'woman', 'women',
  'man', 'men', 'young', 'youtube', 'giphy', 'pexels', 'pixabay',
  'unsplash', 'tenor', 'dailymotion', 'reddit', 'tiktok', 'instagram', 'facebook', 'twitter', 'tone',
])

const CONCEPT_ALIASES: Record<string, string> = {
  advert: 'advertising', advertisement: 'advertising', advertisements: 'advertising', advertising: 'advertising',
  commercial: 'advertising', commercials: 'advertising', infomercial: 'advertising', promo: 'advertising', publicity: 'advertising',
  absurd: 'weird', bizarre: 'weird', odd: 'weird', strange: 'weird', surreal: 'weird', weird: 'weird',
  comedy: 'humor', comic: 'humor', funny: 'humor', humour: 'humor', joke: 'humor', meme: 'humor', parody: 'humor', prank: 'humor', spoof: 'humor',
  archival: 'retro', archive: 'retro', classic: 'retro', nostalgic: 'retro', nostalgia: 'retro', retro: 'retro', vintage: 'retro', y2k: 'retro',
  cat: 'cat', cats: 'cat', feline: 'cat', kitten: 'cat', kittens: 'cat', kitty: 'cat',
  canine: 'dog', dog: 'dog', dogs: 'dog', pup: 'dog', puppy: 'dog', puppies: 'dog',
  bovine: 'cow', bull: 'cow', calf: 'cow', cattle: 'cow', cow: 'cow', cows: 'cow',
  bird: 'bird', birds: 'bird', parrot: 'bird', pigeon: 'bird',
  bear: 'bear', bears: 'bear', panda: 'bear',
  jaguar: 'big-cat', leopard: 'big-cat', lion: 'big-cat', panther: 'big-cat', tiger: 'big-cat',
  animal: 'animal', animals: 'animal', creature: 'animal', creatures: 'animal', wildlife: 'animal',
  cola: 'soda', coke: 'soda', pepsi: 'soda', soda: 'soda', softdrink: 'soda',
  automobile: 'car', car: 'car', cars: 'car', vehicle: 'car', vehicles: 'car',
  bike: 'cycling', bicycle: 'cycling', cycling: 'cycling', cyclist: 'cycling',
  football: 'football', soccer: 'football',
  basketball: 'basketball', nba: 'basketball',
  dance: 'dance', dancing: 'dance', dancer: 'dance',
  concert: 'music', musician: 'music', music: 'music', musical: 'music', remix: 'music', song: 'music',
  cinema: 'film', film: 'film', films: 'film', movie: 'film', movies: 'film', trailer: 'film',
  cartoon: 'animation', anime: 'animation', animation: 'animation', animated: 'animation',
  recipe: 'food', cooking: 'food', cuisine: 'food', food: 'food',
  computer: 'technology', digital: 'technology', robot: 'technology', software: 'technology', tech: 'technology', technology: 'technology',
  astronaut: 'space', cosmos: 'space', galaxy: 'space', mars: 'space', moon: 'space', nasa: 'space', planet: 'space', space: 'space', universe: 'space',
  ocean: 'nature', forest: 'nature', landscape: 'nature', mountain: 'nature', nature: 'nature',
  birthday: 'birthday', anniversary: 'birthday',
  fashion: 'fashion', clothing: 'fashion', outfit: 'fashion', runway: 'fashion', style: 'fashion',
  diy: 'diy', handmade: 'diy', tutorial: 'diy', craft: 'diy',
  gaming: 'game', gameplay: 'game', gamer: 'game', game: 'game', videogame: 'game', videogames: 'game',
  health: 'health', medical: 'health', medicine: 'health', physician: 'health',
  digest: 'digestion', digested: 'digestion', digesting: 'digestion', digestion: 'digestion', digestive: 'digestion', pepsin: 'digestion',
  biochemistry: 'biochemistry', enzyme: 'biochemistry', enzymes: 'biochemistry',
  science: 'science', biology: 'science', chemistry: 'science', physics: 'science',
  history: 'history', historical: 'history', ancient: 'history', medieval: 'history',
  news: 'news', journal: 'news', journalist: 'news', report: 'news', television: 'television', radio: 'radio',
}

const FACET_RULES: Array<[RegExp, string]> = [
  [/\b(?:retro|vintage|nostalgi\w*|old[ -]?school|y2k|19[5-9]\d|200\d)\b/i, 'era-retro'],
  [/\b(?:archive|archival|found[ -]?footage|lost[ -]?tape)\b/i, 'format-archive'],
  [/\b(?:advert\w*|commercial|infomercial|promo|publicit\w*|werbung)\b/i, 'format-ad'],
  [/\b(?:meme|funny|comedy|comic|humou?r|parody|spoof|prank)\b/i, 'mood-funny'],
  [/\b(?:weird|strange|odd|bizarre|surreal|absurd)\b/i, 'mood-weird'],
  [/\b(?:tutorial|guide|how[ -]?to|diy|craft)\b/i, 'format-how-to'],
  [/\b(?:animation|animated|cartoon|anime)\b/i, 'format-animation'],
  [/\b(?:music|song|concert|remix|music[ -]?video)\b/i, 'topic-music'],
  [/\b(?:fashion|outfit|clothing|runway)\b/i, 'topic-fashion'],
  [/\b(?:science|space|technology|computer|robot)\b/i, 'topic-tech'],
  [/\b(?:health|medical|medicine|physician|digest\w*|pepsin|enzyme|biology|chemistry)\b/i, 'topic-health'],
  [/\b(?:gaming|gameplay|gamer|video[ -]?games?)\b/i, 'topic-game'],
  [/\b(?:sport|football|soccer|basketball|tennis|skate|cycling)\b/i, 'topic-sport'],
  [/\b(?:nature|animal|wildlife|ocean|forest|cat|kitten|dog|puppy|cow|cattle|bird|parrot|bear|panda|jaguar|leopard|lion|panther|tiger)\b/i, 'topic-animal'],
  [/\b(?:news|journal|newscast|bulletin)\b/i, 'format-news'],
]

function normalize(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&(?:amp|quot|apos|lt|gt);/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function singularize(value: string): string {
  if (value.length > 5 && value.endsWith('ies')) return `${value.slice(0, -3)}y`
  if (value.length > 4 && value.endsWith('es') && !value.endsWith('ses')) return value.slice(0, -2)
  if (value.length > 3 && value.endsWith('s') && !value.endsWith('ss')) return value.slice(0, -1)
  return value
}

function canonicalize(value: string): string {
  const normalized = normalize(value).replace(/\s+/g, '-')
  if (!normalized) return ''
  if (LOW_SIGNAL_WORDS.has(normalized) || STOP_WORDS.has(normalized)) return normalized
  const concept = CONCEPT_ALIASES[normalized]
  return typeof concept === 'string' ? concept : singularize(normalized)
}

function isUseful(value: string): boolean {
  return value.length >= 3
    && value.length <= 42
    && !STOP_WORDS.has(value)
    && !LOW_SIGNAL_WORDS.has(value)
    && !/^\d+$/.test(value)
}

function unique(values: Iterable<string>, limit: number): string[] {
  const result: string[] = []
  const seen = new Set<string>()
  for (const raw of values) {
    if (typeof raw !== 'string') continue
    const value = canonicalize(raw)
    if (!value || !isUseful(value) || seen.has(value)) continue
    seen.add(value)
    result.push(value)
    if (result.length >= limit) break
  }
  return result
}

function tokens(value: string): string[] {
  return normalize(value).split(/\s+/).filter(Boolean)
}

function buildPhrases(value: string, limit = 10): string[] {
  const raw = tokens(value)
  const phrases: string[] = []
  for (let index = 0; index < raw.length - 1; index += 1) {
    const left = canonicalize(raw[index])
    const right = canonicalize(raw[index + 1])
    if (!isUseful(left) || !isUseful(right) || left === right) continue
    phrases.push(`${left}-${right}`)
  }
  return unique(phrases, limit)
}

function extractFacets(source: string): string[] {
  return FACET_RULES.filter(([pattern]) => pattern.test(source)).map(([, facet]) => facet)
}

function conceptsFor(values: string[]): string[] {
  const concepts: string[] = []
  for (const raw of values) {
    const normalized = normalize(raw).replace(/\s+/g, '-')
    const concept = CONCEPT_ALIASES[normalized]
    if (typeof concept === 'string') concepts.push(concept)
  }
  return unique(concepts, 10)
}

function phraseIsUseful(value: string): boolean {
  const parts = normalize(value).split(/\s+/).filter(Boolean)
  return parts.length >= 2 && parts.every((part) => isUseful(canonicalize(part)))
}

function strings(value?: string[] | null): string[] {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === 'string' && Boolean(entry.trim())) : []
}

export function buildWaveProfile(source: WaveProfileSource): WaveProfile {
  const primaryDescriptor = [
    source.title,
    source.text,
    source.quiz?.question,
  ].find((value): value is string => typeof value === 'string' && Boolean(value.trim()))
  const descriptorParts = [
    primaryDescriptor || source.description,
    source.quiz?.answer,
    source.quiz?.category,
    source.category,
  ].filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
  const descriptor = descriptorParts.join(' ').slice(0, 2400)
  const descriptorTokens = unique(tokens(descriptor), 18)
  const descriptorSet = new Set(descriptorTokens)
  const keywordTokens = unique(strings(source.keywords).flatMap(tokens), 16)
  const tagTokens = unique(strings(source.tags).flatMap(tokens), 16)

  const confirmedMetadata = [...keywordTokens, ...tagTokens].filter((value) => descriptorSet.has(value))
  const fallbackMetadata = descriptorTokens.length
    ? confirmedMetadata
    : [...keywordTokens.slice(0, 8), ...tagTokens.slice(0, 5)]
  const anchors = unique([...descriptorTokens, ...fallbackMetadata], 18)
  const phrases = buildPhrases(descriptor, 12)
  const metadataConcepts = conceptsFor([...keywordTokens, ...tagTokens])
  const descriptorConcepts = conceptsFor([...anchors, ...tokens(descriptor)])
  const concepts = unique([...descriptorConcepts, ...metadataConcepts], 10)
  const facets = extractFacets(`${descriptor} ${anchors.join(' ')} ${concepts.join(' ')}`)
  const confidence = descriptorTokens.length >= 4
    ? 1
    : descriptorTokens.length >= 2
      ? 0.78
      : anchors.length
        ? 0.52
        : 0

  return {
    version: WAVE_PROFILE_VERSION,
    anchors,
    phrases,
    concepts,
    facets,
    confidence,
  }
}

function overlap(left: string[], right: string[]): string[] {
  const rightSet = new Set(right)
  return left.filter((value, index) => rightSet.has(value) && left.indexOf(value) === index)
}

const BROAD_CONCEPTS = new Set([
  'advertising', 'animal', 'animation', 'dance', 'diy', 'fashion', 'film', 'food', 'game', 'health',
  'history', 'humor', 'music', 'nature', 'news', 'radio', 'retro', 'science', 'space', 'technology',
  'television', 'weird',
])

export function getWaveProfileSimilarity(anchor: WaveProfile, candidate: WaveProfile): WaveProfileSimilarity {
  const cleanAnchor = sanitizeWaveProfile(anchor)
  const cleanCandidate = sanitizeWaveProfile(candidate)
  const anchorMatches = overlap(cleanAnchor.anchors, cleanCandidate.anchors).length
  const phraseMatches = overlap(cleanAnchor.phrases, cleanCandidate.phrases).length
  const sharedConcepts = overlap(cleanAnchor.concepts, cleanCandidate.concepts)
  const conceptMatches = sharedConcepts.length
  const facetMatches = overlap(cleanAnchor.facets, cleanCandidate.facets).length
  const directMatches = anchorMatches + phraseMatches + conceptMatches
  const confidence = Math.max(0.45, Math.min(cleanAnchor.confidence, cleanCandidate.confidence))
  const score = (
    phraseMatches * 18
    + anchorMatches * 9
    + sharedConcepts.reduce((total, concept) => total + (BROAD_CONCEPTS.has(concept) ? 3 : 10), 0)
    + facetMatches * 1.5
  ) * confidence

  return {
    score,
    anchorMatches,
    phraseMatches,
    conceptMatches,
    facetMatches,
    directMatches,
  }
}

export function getWaveProfileQueryTokens(profile: WaveProfile): string[] {
  const clean = sanitizeWaveProfile(profile)
  return unique([...clean.phrases, ...clean.anchors, ...clean.concepts], 36)
}

export function sanitizeWaveProfile(profile: WaveProfile): WaveProfile {
  return {
    version: WAVE_PROFILE_VERSION,
    anchors: unique(profile.anchors, 18),
    phrases: unique(profile.phrases.filter((value) => typeof value === 'string' && phraseIsUseful(value)), 12),
    concepts: unique(profile.concepts, 10),
    facets: unique(profile.facets, 10),
    confidence: Math.max(0, Math.min(1, Number(profile.confidence) || 0)),
  }
}

export function isUsableWaveProfile(value: unknown): value is WaveProfile {
  if (!value || typeof value !== 'object') return false
  const profile = value as Partial<WaveProfile>
  return profile.version === WAVE_PROFILE_VERSION
    && Array.isArray(profile.anchors)
    && Array.isArray(profile.phrases)
    && Array.isArray(profile.concepts)
    && Array.isArray(profile.facets)
    && typeof profile.confidence === 'number'
}
