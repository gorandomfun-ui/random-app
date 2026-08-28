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
  'street footage',
  'regional tv',
  'local commercial',
  'city archive',
  'full movie',
  'public domain film',
  'regional music',
  'music video',
  'camcorder',
  'travelogue',
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
  'street footage',
  'city report',
  'tourism film',
  'local commercial',
  'regional music',
  'public domain movie',
  'full movie',
  'camcorder footage',
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
  'local archive',
  'city archive',
  'public domain',
  'regional culture',
  'independent film',
]

const CULTURAL_PLACE_TERMS = [
  'Uzbekistan',
  'Kazakhstan',
  'Kyrgyzstan',
  'Tajikistan',
  'Azerbaijan',
  'Armenia',
  'Georgia',
  'Moldova',
  'Albania',
  'Bulgaria',
  'Romania',
  'Serbia',
  'Bosnia',
  'Mongolia',
  'Laos',
  'Cambodia',
  'Vietnam',
  'Ghana',
  'Senegal',
  'Peru',
  'Bolivia',
  'Appalachia',
  'Midwest',
  'rural America',
  'small town USA',
  'Rust Belt',
  'Siberia',
  'Balkans',
  'Caucasus',
  'Central Asia',
]

const LOCAL_ARCHIVE_SUBJECTS = [
  'small town',
  'village',
  'main street',
  'street market',
  'local festival',
  'county fair',
  'parade',
  'factory',
  'train station',
  'bus station',
  'mall',
  'arcade',
  'roadside attraction',
  'local news',
  'community theater',
  'school play',
  'wedding',
  'tourism board',
  'city report',
  'neighborhood',
  'public access show',
  'regional commercial',
]

const MUSIC_ARCHIVE_SUBJECTS = [
  'regional music',
  'folk music',
  'local band',
  'music video',
  'karaoke',
  'wedding band',
  'street performance',
  'festival performance',
  'TV music show',
  'dance contest',
  'regional pop',
  'synth pop',
]

const SAFE_GLAMOUR_SUBJECTS = [
  'vintage glamour',
  'retro cabaret',
  'classic burlesque',
  'pin up fashion',
  'pin-up style',
  'showgirl dance',
  'swimwear fashion show',
  'beach fashion show',
  'fashion week runway',
  'red carpet fashion',
  'latin dance',
  'salsa dance',
  'tango performance',
  'belly dance performance',
  'go-go dance vintage',
  'nightclub dance',
  'music video glamour',
  'sexy music video',
]

const SAFE_GLAMOUR_FORMATS = [
  'performance',
  'clip',
  'music video',
  'fashion show',
  'runway show',
  'tv segment',
  'broadcast',
  'archive footage',
  'behind the scenes',
]

const SAFE_GLAMOUR_CONTEXTS = [
  'vintage',
  'retro',
  'late night',
  'after dark',
  'stage',
  'festival',
  'local tv',
  'regional tv',
  'rare',
  'public access',
]

const SAFE_GLAMOUR_ERAS = ['1960s', '1970s', '1980s', '1990s', '2000s', 'y2k']

const CINEMA_ARCHIVE_SUBJECTS = [
  'full movie',
  'short film',
  'public domain movie',
  'student film',
  'industrial film',
  'tourism film',
  'local documentary',
  'amateur film',
  'low budget movie',
  'cult movie',
]

const PLACE_CONTEXTS = [
  'rural',
  'provincial',
  'local',
  'regional',
  'forgotten town',
  'small city',
  'remote village',
  'old downtown',
  'back road',
  'border town',
  'suburban',
  'industrial district',
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
  'ai',
  'dubai',
  'food review',
  'elon musk',
  'tesla',
  'iphone',
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
  'cabaret',
  'burlesque',
  'pin up',
  'pin-up style',
  'vintage glamour',
  'swimwear fashion',
  'beach fashion',
  'runway show',
  'fashion week',
  'red carpet',
  'latin dance',
  'salsa dance',
  'tango performance',
  'belly dance',
  'showgirl dance',
  'music video glamour',
  'sexy music video',
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
  'small town',
  'village',
  'main street',
  'street market',
  'local festival',
  'county fair',
  'parade',
  'factory',
  'train station',
  'bus station',
  'mall',
  'arcade',
  'roadside attraction',
  'community theater',
  'school play',
  'wedding',
  'tourism board',
  'city report',
  'neighborhood',
  'regional commercial',
  'regional music',
  'folk music',
  'local band',
  'karaoke',
  'wedding band',
  'street performance',
  'festival performance',
  'TV music show',
  'dance contest',
  'regional pop',
  'synth pop',
  'full movie',
  'student film',
  'industrial film',
  'tourism film',
  'local documentary',
  'amateur film',
  'low budget movie',
  'cult movie',
]

const RETRO_THEMES = [
  'fitness',
  'cooking',
  'business',
  'computer',
  'science',
  'dance',
  'music',
  'cabaret',
  'burlesque',
  'pin up',
  'vintage glamour',
  'beauty pageant',
  'showgirl',
  'go-go dance',
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
  'small town',
  'village',
  'main street',
  'street market',
  'county fair',
  'parade',
  'factory',
  'train station',
  'bus station',
  'mall',
  'arcade',
  'roadside attraction',
  'tourism board',
  'city report',
  'regional commercial',
  'regional music',
  'folk music',
  'local band',
  'music video',
  'wedding band',
  'street performance',
  'TV music show',
  'full movie',
  'short film',
  'public domain movie',
  'student film',
  'amateur film',
  'low budget movie',
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
  'full movie',
  'music video',
  'street footage',
  'city report',
  'local commercial',
  'public domain film',
  'home movie',
  'camcorder footage',
  'vhs rip',
  'tv archive',
  'tourism film',
  'concert',
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
  'local',
  'regional',
  'small town',
  'provincial',
  'amateur',
  'low budget',
  'public domain',
  'camcorder',
  'rare recording',
  'uncut',
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
  'archive list',
  'public domain collection',
  'local history',
  'city database',
  'fan archive',
  'tape archive',
  'scan collection',
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

function archiveSubjects(): string[] {
  return unique([
    ...LOCAL_ARCHIVE_SUBJECTS,
    ...MUSIC_ARCHIVE_SUBJECTS,
    ...CINEMA_ARCHIVE_SUBJECTS,
    ...SAFE_GLAMOUR_SUBJECTS,
  ])
}

function buildSafeGlamourQuery(rng: Rng, eras: string[] = SAFE_GLAMOUR_ERAS): string {
  const subject = pickOne(SAFE_GLAMOUR_SUBJECTS, rng)
  const format = rng() < 0.85 ? pickOne(SAFE_GLAMOUR_FORMATS, rng) : undefined
  const context = rng() < 0.7 ? pickOne(SAFE_GLAMOUR_CONTEXTS, rng) : undefined
  const era = rng() < 0.55 ? pickOne(eras.length ? eras : SAFE_GLAMOUR_ERAS, rng) : undefined
  const place = rng() < 0.35 ? pickOne(CULTURAL_PLACE_TERMS, rng) : undefined
  const pattern = rng()

  if (pattern < 0.34) return compactQuery([context, era, subject, format])
  if (pattern < 0.67) return compactQuery([place, era, subject, format])
  return compactQuery([subject, context, format])
}

function interestingSubjects(dict: Required<VideoKeywordDictionary>): string[] {
  const fromDict = dict.subjects.filter((subject) => {
    const key = subject.toLowerCase()
    return SUBJECT_ALLOWLIST.includes(key) || !GENERIC_SUBJECTS.has(key)
  })
  return unique([...SUBJECT_ALLOWLIST, ...archiveSubjects(), ...fromDict])
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
    'full movie',
    'music video',
    'street footage',
    'local commercial',
    'public domain film',
    'home movie',
    'camcorder footage',
    'vhs rip',
    'city report',
    'tourism film',
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
  const archivePool = archiveSubjects()
  const formats = fallbackFormats(dict)
  const eras = fallbackEras(dict)
  const extras = fallbackExtras(dict)
  const queries: string[] = []

  let attempts = 0
  while (queries.length < count && attempts < count * 20) {
    attempts += 1
    if (rng() < 0.16) {
      const query = buildSafeGlamourQuery(rng, eras)
      if (query) queries.push(query)
      continue
    }

    const anchor = pickOne(DAILY_ANCHORS, rng)
    const subject = rng() < 0.42 ? pickOne(archivePool, rng) : pickOne(subjects, rng)
    const format = rng() < 0.85 ? pickOne(formats, rng) : undefined
    const era = rng() < 0.65 ? pickOne(eras, rng) : undefined
    const extra = rng() < 0.45 ? pickOne(extras, rng) : undefined
    const place = rng() < 0.55 ? pickOne(CULTURAL_PLACE_TERMS, rng) : undefined
    const placeContext = rng() < 0.35 ? pickOne(PLACE_CONTEXTS, rng) : undefined

    const pattern = rng()
    const query = pattern < 0.34
      ? compactQuery([anchor, place, era, subject, format])
      : pattern < 0.58
        ? compactQuery([place, placeContext, era, subject, format, extra])
        : compactQuery([anchor, era, subject, format, extra])
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
    if (rng() < 0.18) {
      const query = buildSafeGlamourQuery(rng)
      if (query) queries.push(query)
      continue
    }

    const anchor = pickOne(DAILY_RETRO_ANCHORS, rng)
    const theme = pickOne(RETRO_THEMES, rng)
    const format = pickOne(RETRO_FORMATS, rng)
    const year = rng() < 0.75 ? 1965 + Math.floor(rng() * 40) : undefined
    const place = rng() < 0.65 ? pickOne(CULTURAL_PLACE_TERMS, rng) : undefined
    const placeContext = rng() < 0.45 ? pickOne(PLACE_CONTEXTS, rng) : undefined
    const query = rng() < 0.58
      ? compactQuery([anchor, place, theme, year, format])
      : compactQuery([place, placeContext, theme, year, format])
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
    const subject = pickOne([...SUBJECT_ALLOWLIST, ...RETRO_THEMES, ...archiveSubjects()], rng)
    const context = pickOne(WEB_CONTEXTS, rng)
    const place = rng() < 0.35 ? pickOne(CULTURAL_PLACE_TERMS, rng) : undefined
    const query = compactQuery([anchor, place, subject, context])
    if (query) queries.push(query)
  }

  return unique(queries).slice(0, count)
}
