import { loadVideoKeywordDictionary, type VideoKeywordDictionary } from '@/lib/ingest/videoKeywords'

type Rng = () => number

const DAILY_ANCHORS = [
  'weird',
  'bizarre',
  'obscure',
  'forgotten',
  'unexpected',
  'strange',
  'surreal',
  'odd',
  'rare',
  'lost',
  'public access',
  'found footage',
  'vhs',
  'archive',
  'bootleg',
  'underground',
  'outsider',
  'local tv',
  'community tv',
  'late night',
  'deep cut',
]

const DAILY_RETRO_ANCHORS = [
  'public access',
  'vhs',
  'local tv',
  'community tv',
  'found footage',
  'lost tape',
  'training video',
  'school broadcast',
  'industrial film',
  'old commercial',
  'public information film',
  'local news',
  'cable access',
  'home video',
  'archive footage',
]

const DAILY_WEB_ANCHORS = [
  'weird',
  'obscure',
  'forgotten',
  'strange',
  'tiny',
  'handmade',
  'retro',
  'vintage',
  'public access',
  'internet museum',
  'odd archive',
  'lost media',
  'experimental web',
  'outsider art',
]

const GENERIC_SUBJECTS = new Set([
  'business',
  'productivity',
  'tutorial',
  'review',
  'fitness',
  'workout',
  'self improvement',
  'side hustle',
  'passive income',
  'dropshipping',
  'investing',
  'trading',
  'money',
  'setup',
  'gear',
  'unboxing',
  'reaction',
  'vlog',
  'podcast',
  'news',
  'report',
  'alpha male',
  'sigma',
  'dating',
  'relationship',
  'red flags',
  'mindset',
  'crypto',
  'bitcoin',
  'web3',
  'nft',
  'metaverse',
  'startup',
  'entrepreneur',
  'luxury',
  'minimalism',
  'body transformation',
  'biohacking',
  'cold shower',
  'ice bath',
  'dopamine detox',
])

const SUBJECT_ALLOWLIST = [
  'cooking',
  'science',
  'history',
  'architecture',
  'nature',
  'wildlife',
  'festival',
  'street',
  'comedy',
  'dance',
  'radio',
  'animation',
  'shortfilm',
  'musicvideo',
  'documentary',
  'interview',
  'performance',
  'travel',
  'fashion',
  'art',
  'design',
  'technology',
  'sports',
  'gameplay',
  'true crime',
  'mystery',
  'urban legend',
  'abandoned',
  'weird food',
  'street food',
  'experiment',
  'chemistry',
  'space',
  'robot',
  'gaming',
  'speedrun',
  'public prank',
  'street interview',
  'asmr',
  'burning man',
  'rave',
  'street culture',
]

const RETRO_THEMES = [
  'fitness',
  'cooking',
  'business',
  'computer',
  'science',
  'dance',
  'music',
  'commercial',
  'local news',
  'school',
  'public safety',
  'travel',
  'sports',
  'fashion',
  'technology',
  'kids show',
  'variety show',
  'talk show',
  'training',
  'festival',
]

const RETRO_FORMATS = [
  'broadcast',
  'episode',
  'clip',
  'tape',
  'commercial',
  'training video',
  'documentary',
  'highlight',
  'segment',
  'full episode',
]

const EXTRA_CONTEXTS = [
  'unexpected',
  'strange',
  'rare',
  'raw',
  'no filter',
  'behind the scenes',
  'failed attempt',
  'oddly satisfying',
  'bizarre',
  'hidden',
  'before and after',
  'first time',
]

const LOW_VALUE_EXTRAS = new Set([
  'explained',
  'breakdown',
  'reaction',
  'honest review',
  'review after 1 year',
  'update',
  'update 2026',
  'new update',
  'beginner guide',
  'ultimate guide',
  'step by step',
  'how to',
  'things you should know',
  'what i learned',
  'lessons learned',
  'ranking',
  'top 10',
  'top 5',
  'tier list',
  'motivation',
  'inspiration',
  'self improvement',
  'productivity tips',
  'life hacks',
  'startup story',
  'millionaire mindset',
  'passive income ideas',
  'side hustle ideas',
  'is it worth it',
  'worth it?',
  'comparison',
  'debate',
  'panel discussion',
  'public opinion',
  'ask me anything',
  'ama',
  'confession',
  'rant',
  'real talk',
  'hot takes',
  'unpopular opinion',
  'new',
  'latest',
  '2026',
  '2026 prediction',
  'trend forecast',
])

const WEB_CONTEXTS = [
  'archive',
  'museum',
  'collection',
  'gallery',
  'generator',
  'interactive',
  'database',
  'zine',
  'catalog',
  'directory',
  'map',
  'project',
  'lab',
  'blog',
]

function makeSeededRng(seed: string): Rng {
  let h = 2166136261
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return () => {
    h += 0x6d2b79f5
    let t = h
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pickOne(values: string[], rng: Rng): string | undefined {
  if (!values.length) return undefined
  return values[Math.floor(rng() * values.length)]
}

function compactQuery(parts: Array<string | number | undefined | null>): string {
  return parts
    .map((part) => String(part ?? '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function unique(values: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const key = value.toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(value)
  }
  return out
}

function interestingSubjects(dict: Required<VideoKeywordDictionary>): string[] {
  const fromDict = dict.subjects.filter((subject) => {
    const key = subject.toLowerCase()
    return SUBJECT_ALLOWLIST.includes(key) || !GENERIC_SUBJECTS.has(key)
  })
  return unique([...SUBJECT_ALLOWLIST, ...fromDict])
}

function fallbackFormats(dict: Required<VideoKeywordDictionary>): string[] {
  return unique([
    'clip',
    'episode',
    'broadcast',
    'documentary',
    'interview',
    'performance',
    'timelapse',
    'rehearsal',
    'session',
    'montage',
    ...dict.formats,
  ])
}

function fallbackEras(dict: Required<VideoKeywordDictionary>): string[] {
  return unique(['1970s', '1980s', '1990s', '2000s', 'early internet', 'y2k', ...dict.eras])
}

function fallbackExtras(dict: Required<VideoKeywordDictionary>): string[] {
  return unique([...EXTRA_CONTEXTS, ...dict.extras])
    .filter((extra) => !LOW_VALUE_EXTRAS.has(extra.toLowerCase()))
}

export type DailyQueryOptions = {
  count?: number
  seed?: string
}

export async function buildDailyVideoQueries(options: DailyQueryOptions = {}): Promise<string[]> {
  const count = Math.max(1, Math.min(60, Math.floor(options.count ?? 8)))
  const rng = makeSeededRng(options.seed || `daily-video:${new Date().toISOString().slice(0, 10)}`)
  const dict = await loadVideoKeywordDictionary()
  const subjects = interestingSubjects(dict)
  const formats = fallbackFormats(dict)
  const eras = fallbackEras(dict)
  const extras = fallbackExtras(dict)
  const queries: string[] = []

  let attempts = 0
  while (queries.length < count && attempts < count * 20) {
    attempts += 1
    const anchor = pickOne(DAILY_ANCHORS, rng)
    const subject = pickOne(subjects, rng)
    const format = rng() < 0.85 ? pickOne(formats, rng) : undefined
    const era = rng() < 0.65 ? pickOne(eras, rng) : undefined
    const extra = rng() < 0.45 ? pickOne(extras, rng) : undefined

    const query = compactQuery([anchor, era, subject, format, extra])
    if (query) queries.push(query)
  }

  return unique(queries).slice(0, count)
}

export async function buildDailyRetroQueries(options: DailyQueryOptions = {}): Promise<string[]> {
  const count = Math.max(1, Math.min(24, Math.floor(options.count ?? 8)))
  const rng = makeSeededRng(options.seed || `daily-retro:${new Date().toISOString().slice(0, 10)}`)
  const queries: string[] = []

  let attempts = 0
  while (queries.length < count && attempts < count * 20) {
    attempts += 1
    const anchor = pickOne(DAILY_RETRO_ANCHORS, rng)
    const theme = pickOne(RETRO_THEMES, rng)
    const format = pickOne(RETRO_FORMATS, rng)
    const year = rng() < 0.75 ? 1965 + Math.floor(rng() * 40) : undefined
    const query = compactQuery([anchor, theme, year, format])
    if (query) queries.push(query)
  }

  return unique(queries).slice(0, count)
}

export async function buildDailyWebQueries(options: DailyQueryOptions = {}): Promise<string[]> {
  const count = Math.max(1, Math.min(20, Math.floor(options.count ?? 4)))
  const rng = makeSeededRng(options.seed || `daily-web:${new Date().toISOString().slice(0, 10)}`)
  const queries: string[] = []

  let attempts = 0
  while (queries.length < count && attempts < count * 20) {
    attempts += 1
    const anchor = pickOne(DAILY_WEB_ANCHORS, rng)
    const subject = pickOne([...SUBJECT_ALLOWLIST, ...RETRO_THEMES], rng)
    const context = pickOne(WEB_CONTEXTS, rng)
    const query = compactQuery([anchor, subject, context])
    if (query) queries.push(query)
  }

  return unique(queries).slice(0, count)
}
