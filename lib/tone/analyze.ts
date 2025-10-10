type TonePolarity = 'positive' | 'negative'

export type ToneScore = { positive: number; negative: number }

export type ToneSignals = {
  positiveSeeds: string[]
  negativeSeeds: string[]
  positiveTokens: string[]
  negativeTokens: string[]
  positivePhrases: string[]
  negativePhrases: string[]
}

export type ToneScoreResult = {
  score: ToneScore
  signals: ToneSignals
}

export type ToneClassification = {
  tone: 'positive' | 'neutral' | 'negative'
  confidence: number
}

const ACCENT_REGEX = /[\u0300-\u036f]/g
const NON_ALPHANUM_REGEX = /[^a-z0-9\u3040-\u30ff\u4e00-\u9faf\s]/g

type NormalizedKeyword = {
  raw: string
  normalized: string
  pattern?: RegExp
}

type TokenMatchMode = 'exact' | 'prefix' | 'includes'

type TokenRule = {
  polarity: TonePolarity
  weight: number
  match: TokenMatchMode
  keywords: readonly NormalizedKeyword[]
}

type PhraseRule = {
  polarity: TonePolarity
  weight: number
  phrases: readonly NormalizedKeyword[]
}

const POSITIVE_SEEDS_RAW: readonly string[] = [
  'love',
  'lovely',
  'happy',
  'happiness',
  'joy',
  'joyful',
  'fun',
  'funny',
  'amazing',
  'great',
  'awesome',
  'win',
  'winner',
  'victory',
  'lucky',
  'glad',
  'smile',
  'smiling',
  'peace',
  'calm',
  'bright',
  'sunny',
  'hope',
  'hopeful',
  'kind',
  'cute',
  'sweet',
  'success',
  'celebrate',
  'wow',
  'yay',
  'delight',
  'good',
  'wonderful',
  'brilliant',
  'energize',
  'spark',
  'shine',
  'playful',
  'cozy',
  'uplift',
  'magic',
  'bliss',
  'cheer',
  'amour',
  'heureux',
  'joie',
  'rire',
  'succès',
  'chance',
  'lumineux',
  'positif',
  'génial',
  'liebe',
  'glück',
  'glücklich',
  'freu',
  'lustig',
  'witzig',
  'erfolg',
  'hoffnung',
  'sonnig',
  'toll',
  'super',
  '嬉',
  '楽',
  '幸',
  '笑',
  '良',
  '素敵',
  '最高',
  '平和',
  '明る',
  '希望',
]

const NEGATIVE_SEEDS_RAW: readonly string[] = [
  'sad',
  'sorrow',
  'pain',
  'hurt',
  'bad',
  'worse',
  'worst',
  'dark',
  'death',
  'dead',
  'kill',
  'killing',
  'fear',
  'scared',
  'anger',
  'angry',
  'hate',
  'hated',
  'broken',
  'fail',
  'failure',
  'lost',
  'loss',
  'doom',
  'gloom',
  'cry',
  'tears',
  'crash',
  'bleed',
  'bleeding',
  'rage',
  'tired',
  'bored',
  'lonely',
  'void',
  'grim',
  'triste',
  'peur',
  'colère',
  'angoisse',
  'perdu',
  'perte',
  'haine',
  'mort',
  'noir',
  'fatigue',
  'traur',
  'angst',
  'wut',
  'verlust',
  'schmerz',
  'tod',
  'müde',
  'dunkel',
  'hass',
  '悲',
  '辛',
  '怖',
  '恐',
  '死',
  '負け',
  '闇',
  '泣',
  '壊',
  '憂',
  '絶望',
]

function normalizeForSentiment(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(ACCENT_REGEX, '')
    .replace(NON_ALPHANUM_REGEX, ' ')
}

function normalizeSeed(raw: string): NormalizedKeyword | null {
  const normalized = normalizeForSentiment(raw).trim()
  if (!normalized) return null
  const basic = /^[a-z0-9]+$/.test(normalized)
  return {
    raw,
    normalized,
    pattern: basic ? new RegExp(`\\b${normalized}\\b`) : undefined,
  }
}

function normalizeRuleKeywords(keywords: readonly string[]): NormalizedKeyword[] {
  return keywords
    .map((keyword) => {
      const normalized = normalizeForSentiment(keyword).trim()
      return normalized ? { raw: keyword, normalized } : null
    })
    .filter((entry): entry is NormalizedKeyword => entry !== null)
}

const POSITIVE_SEEDS = POSITIVE_SEEDS_RAW.map(normalizeSeed).filter(
  (entry): entry is NormalizedKeyword => entry !== null,
)
const NEGATIVE_SEEDS = NEGATIVE_SEEDS_RAW.map(normalizeSeed).filter(
  (entry): entry is NormalizedKeyword => entry !== null,
)

const TOKEN_HEURISTICS: readonly TokenRule[] = [
  {
    polarity: 'negative',
    weight: 3,
    match: 'includes',
    keywords: normalizeRuleKeywords([
      'failarmy',
      'watchpeopledieinside',
      'instantkarma',
      'instantregret',
      'therewasanattempt',
      'kidsarefuckingstupid',
      'publicfreakout',
      'cringetopia',
      'cringeanarchy',
      'catastrophicfailure',
    ]),
  },
  {
    polarity: 'negative',
    weight: 2,
    match: 'includes',
    keywords: normalizeRuleKeywords([
      'fail',
      'epicfail',
      'fails',
      'failure',
      'failing',
      'disaster',
      'catastroph',
      'traged',
      'accident',
      'accidents',
      'crash',
      'crashes',
      'collision',
      'wreck',
      'explosion',
      'explosive',
      'burned',
      'burning',
      'burnt',
      'hurricane',
      'tornado',
      'earthquake',
      'tsunami',
      'flood',
      'avalanche',
      'landslide',
      'volcano',
      'eruption',
      'injury',
      'injuries',
      'injured',
      'blood',
      'bloody',
      'bloodbath',
      'gore',
      'violent',
      'violence',
      'fight',
      'fights',
      'brawl',
      'attack',
      'attacks',
      'assault',
      'panic',
      'meltdown',
      'freakout',
      'freakouts',
      'rage',
      'angry',
      'argument',
      'arguments',
      'arrest',
      'arrested',
      'police',
      'policing',
      'crime',
      'criminal',
      'murder',
      'killer',
      'killed',
      'killing',
      'dead',
      'deadly',
      'died',
      'death',
      'fatal',
      'suicide',
      'horror',
      'haunted',
      'nightmare',
      'ghost',
      'demon',
      'demonic',
      'paranormal',
      'cursed',
      'curse',
      'possession',
      'terror',
      'terrorist',
      'terrorism',
      'kidnap',
      'kidnapped',
      'kidnapping',
      'abduction',
      'creepy',
      'disturbing',
      'massacre',
      'shooting',
      'shootings',
      'stabbed',
      'stabbing',
      'homicide',
      'dystopia',
      'dystopian',
      'apocalypse',
      'apocalyptic',
      'doomsday',
      'doom',
      'nsfl',
    ]),
  },
  {
    polarity: 'negative',
    weight: 1,
    match: 'includes',
    keywords: normalizeRuleKeywords([
      'wtf',
      'weird',
      'strange',
      'odd',
      'awkward',
      'cringe',
      'cringey',
      'gross',
      'ew',
      'yikes',
      'mess',
      'messy',
      'drama',
      'rant',
      'chaos',
      'chaotic',
      'oops',
      'facepalm',
      'loser',
      'losers',
      'looser',
      'sucks',
      'angst',
      'stress',
      'stressed',
      'tired',
      'bored',
      'creep',
      'ominous',
      'spoopy',
      'uneasy',
      'badending',
      'badvibes',
    ]),
  },
  {
    polarity: 'positive',
    weight: 2,
    match: 'includes',
    keywords: normalizeRuleKeywords([
      'heartwarming',
      'heartwarmingstory',
      'feelgood',
      'feelgoodnews',
      'feelgoods',
      'wholesome',
      'uplift',
      'uplifting',
      'inspiring',
      'inspiration',
      'inspirational',
      'motivation',
      'motivational',
      'encouraging',
      'encouragement',
      'asmr',
      'relaxing',
      'relaxation',
      'relax',
      'calming',
      'calm',
      'serene',
      'soothing',
      'peaceful',
      'mindful',
      'mindfulness',
      'meditation',
      'gratitude',
      'kindness',
      'rescue',
      'rescued',
      'rescuing',
      'heroic',
      'hero',
      'satisfying',
      'oddlysatisfying',
      'lofi',
      'cozy',
      'comforting',
      'restorative',
      'reassuring',
      'incredible',
      'feelgoodstory',
      'contagiouslaughter',
      'natureisfuckinglit',
      'nextfuckinglevel',
    ]),
  },
  {
    polarity: 'positive',
    weight: 1,
    match: 'prefix',
    keywords: normalizeRuleKeywords([
      'cute',
      'adorable',
      'kawaii',
      'kitten',
      'kitty',
      'puppy',
      'doggo',
      'pupper',
      'panda',
      'otter',
      'bunny',
      'hedgehog',
      'penguin',
      'hamster',
      'duckling',
      'sloth',
      'capybara',
      'alpaca',
      'koala',
      'seal',
      'otterly',
      'pupperino',
      'smile',
      'smiling',
      'laugh',
      'laughing',
      'laughter',
      'funny',
      'hilarious',
      'lol',
      'haha',
      'meme',
      'memes',
      'joyful',
      'delight',
      'delightful',
      'sweetheart',
      'wholesomememe',
      'goodnews',
    ]),
  },
]

const PHRASE_HEURISTICS: readonly PhraseRule[] = [
  {
    polarity: 'negative',
    weight: 3,
    phrases: normalizeRuleKeywords([
      'watch people die inside',
      'instant karma',
      'instant regret',
      'there was an attempt',
      'kids are fucking stupid',
      'public freakout',
      'catastrophic failure',
      'fail compilation',
      'mass shooting',
      'school shooting',
      'fatal accident',
      'serious accident',
      'dead body',
      'crime scene',
      'serial killer',
      'true crime',
      'graphic content',
      'not safe for life',
      'jump scare',
      'paranormal activity',
      'demonic possession',
      'dark web',
      'dark internet',
      'caught on camera',
    ]),
  },
  {
    polarity: 'positive',
    weight: 2,
    phrases: normalizeRuleKeywords([
      'good news',
      'good vibe',
      'positive vibes',
      'feel good',
      'feel good story',
      'feel good moment',
      'feel good news',
      'heart warming',
      'heart warming moment',
      'restores faith in humanity',
      'faith in humanity restored',
      'made my day',
      'made our day',
      'happy ending',
      'wholesome moment',
      'instant smile',
      'contagious laughter',
      'oddly satisfying',
      'nature is fucking lit',
      'next fucking level',
      'pure happiness',
      'good ending',
    ]),
  },
]

const EMPTY_SIGNALS: ToneSignals = {
  positiveSeeds: [],
  negativeSeeds: [],
  positiveTokens: [],
  negativeTokens: [],
  positivePhrases: [],
  negativePhrases: [],
}

function matchesNormalized(text: string, entry: NormalizedKeyword): boolean {
  if (!entry.normalized) return false
  if (entry.pattern) return entry.pattern.test(text)
  return text.includes(entry.normalized)
}

type EvaluationResult = {
  score: ToneScore
  hits: ToneScore
  signals: ToneSignals
}

function evaluateSeeds(normalizedText: string): EvaluationResult {
  let positive = 0
  let negative = 0
  const positiveSeeds = new Set<string>()
  const negativeSeeds = new Set<string>()

  for (const seed of POSITIVE_SEEDS) {
    if (matchesNormalized(normalizedText, seed)) {
      positive += 1
      positiveSeeds.add(seed.raw)
    }
  }

  for (const seed of NEGATIVE_SEEDS) {
    if (matchesNormalized(normalizedText, seed)) {
      negative += 1
      negativeSeeds.add(seed.raw)
    }
  }

  return {
    score: { positive, negative },
    hits: { positive: positiveSeeds.size, negative: negativeSeeds.size },
    signals: {
      ...EMPTY_SIGNALS,
      positiveSeeds: Array.from(positiveSeeds),
      negativeSeeds: Array.from(negativeSeeds),
    },
  }
}

function tokenMatches(token: string, keyword: string, mode: TokenMatchMode): boolean {
  switch (mode) {
    case 'exact':
      return token === keyword
    case 'prefix':
      return token === keyword || token.startsWith(keyword)
    case 'includes':
    default:
      return token.includes(keyword)
  }
}

function evaluateTokenHeuristics(tokens: readonly string[]): EvaluationResult {
  if (!tokens.length) {
    return {
      score: { positive: 0, negative: 0 },
      hits: { positive: 0, negative: 0 },
      signals: EMPTY_SIGNALS,
    }
  }

  const uniqueTokens = Array.from(new Set(tokens))
  let positive = 0
  let negative = 0
  const positiveMatches = new Set<string>()
  const negativeMatches = new Set<string>()

  for (const token of uniqueTokens) {
    if (!token) continue
    for (const rule of TOKEN_HEURISTICS) {
      for (const entry of rule.keywords) {
        if (!entry.normalized) continue
        if (tokenMatches(token, entry.normalized, rule.match)) {
          if (rule.polarity === 'positive') {
            positive += rule.weight
            positiveMatches.add(entry.raw)
          } else {
            negative += rule.weight
            negativeMatches.add(entry.raw)
          }
          break
        }
      }
    }
  }

  return {
    score: { positive, negative },
    hits: { positive: positiveMatches.size, negative: negativeMatches.size },
    signals: {
      ...EMPTY_SIGNALS,
      positiveTokens: Array.from(positiveMatches),
      negativeTokens: Array.from(negativeMatches),
    },
  }
}

function evaluatePhraseHeuristics(normalizedText: string): EvaluationResult {
  if (!normalizedText.trim()) {
    return {
      score: { positive: 0, negative: 0 },
      hits: { positive: 0, negative: 0 },
      signals: EMPTY_SIGNALS,
    }
  }

  let positive = 0
  let negative = 0
  const positiveMatches = new Set<string>()
  const negativeMatches = new Set<string>()

  for (const rule of PHRASE_HEURISTICS) {
    for (const phrase of rule.phrases) {
      if (!phrase.normalized) continue
      if (normalizedText.includes(phrase.normalized)) {
        if (rule.polarity === 'positive') {
          positive += rule.weight
          positiveMatches.add(phrase.raw)
        } else {
          negative += rule.weight
          negativeMatches.add(phrase.raw)
        }
      }
    }
  }

  return {
    score: { positive, negative },
    hits: { positive: positiveMatches.size, negative: negativeMatches.size },
    signals: {
      ...EMPTY_SIGNALS,
      positivePhrases: Array.from(positiveMatches),
      negativePhrases: Array.from(negativeMatches),
    },
  }
}

function mergeSignals(parts: ToneSignals[]): ToneSignals {
  const mergeSet = (getter: (signals: ToneSignals) => string[]): string[] => {
    const set = new Set<string>()
    for (const part of parts) {
      for (const value of getter(part)) {
        if (value) set.add(value)
      }
    }
    return Array.from(set)
  }

  return {
    positiveSeeds: mergeSet((signals) => signals.positiveSeeds),
    negativeSeeds: mergeSet((signals) => signals.negativeSeeds),
    positiveTokens: mergeSet((signals) => signals.positiveTokens),
    negativeTokens: mergeSet((signals) => signals.negativeTokens),
    positivePhrases: mergeSet((signals) => signals.positivePhrases),
    negativePhrases: mergeSet((signals) => signals.negativePhrases),
  }
}

export function computeToneScore(segments: readonly string[]): ToneScoreResult {
  const meaningful = segments
    .filter((segment): segment is string => typeof segment === 'string' && segment.trim().length > 0)
  if (!meaningful.length) {
    return { score: { positive: 0, negative: 0 }, signals: EMPTY_SIGNALS }
  }

  const normalizedText = normalizeForSentiment(meaningful.join(' '))
  if (!normalizedText.trim()) {
    return { score: { positive: 0, negative: 0 }, signals: EMPTY_SIGNALS }
  }

  const tokens = normalizedText.split(/\s+/).filter(Boolean)

  const seedResult = evaluateSeeds(normalizedText)
  const tokenResult = evaluateTokenHeuristics(tokens)
  const phraseResult = evaluatePhraseHeuristics(normalizedText)

  let positive = seedResult.score.positive + tokenResult.score.positive + phraseResult.score.positive
  let negative = seedResult.score.negative + tokenResult.score.negative + phraseResult.score.negative

  const totalPositiveHits =
    seedResult.hits.positive + tokenResult.hits.positive + phraseResult.hits.positive
  const totalNegativeHits =
    seedResult.hits.negative + tokenResult.hits.negative + phraseResult.hits.negative

  if (totalPositiveHits >= 2 && totalNegativeHits === 0) {
    positive += totalPositiveHits >= 4 ? 2 : 1
  }

  if (totalNegativeHits >= 2 && totalPositiveHits === 0) {
    negative += totalNegativeHits >= 4 ? 2 : 1
  }

  const signals = mergeSignals([seedResult.signals, tokenResult.signals, phraseResult.signals])

  return {
    score: { positive, negative },
    signals,
  }
}

export function classifyTone(score: ToneScore): ToneClassification {
  const { positive, negative } = score
  const total = positive + negative

  if (total === 0) {
    return { tone: 'neutral', confidence: 0 }
  }

  if (positive === negative) {
    const tieConfidence = Math.min(0.45, Number((total * 0.08).toFixed(2)))
    return { tone: 'neutral', confidence: tieConfidence }
  }

  const tone = positive > negative ? 'positive' : 'negative'
  const diff = Math.abs(positive - negative)
  const base = diff / total
  const magnitudeBoost = Math.min(0.4, total / 6)
  const weighted = Math.min(1, Number(((base * 0.7) + magnitudeBoost).toFixed(2)))

  return { tone, confidence: weighted }
}

export function deriveToneFromSegments(segments: readonly string[]): ToneScoreResult & {
  classification: ToneClassification
} {
  const result = computeToneScore(segments)
  return {
    ...result,
    classification: classifyTone(result.score),
  }
}

export function summarizeSignals(signals: ToneSignals): {
  positive: string[]
  negative: string[]
} {
  const positive = [
    ...signals.positiveSeeds,
    ...signals.positiveTokens,
    ...signals.positivePhrases,
  ]
  const negative = [
    ...signals.negativeSeeds,
    ...signals.negativeTokens,
    ...signals.negativePhrases,
  ]
  return {
    positive: Array.from(new Set(positive)),
    negative: Array.from(new Set(negative)),
  }
}

export function getAllToneSeeds(): { positive: readonly string[]; negative: readonly string[] } {
  return {
    positive: POSITIVE_SEEDS_RAW,
    negative: NEGATIVE_SEEDS_RAW,
  }
}
