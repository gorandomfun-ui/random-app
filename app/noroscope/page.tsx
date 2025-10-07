'use client'
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import Link from 'next/link'

import LogoAnimated from '@/components/LogoAnimated'
import MonoIcon from '@/components/MonoIcon'
import ShareMenu from '@/components/ShareMenu'
import { useI18n } from '@/providers/I18nProvider'
import { THEMES } from '@/lib/theme'
import { fetchRandom, type RandomTypes } from '@/lib/api'
import type { ItemType } from '@/lib/random/types'
import type { DisplayItem, FactItem, RandomContentItem } from '@/lib/random/clientTypes'
import { NOROSCOPE_EXPRESSIONS, type ExpressionLocale, type ExpressionTone } from '@/data/noroscopeExpressions'

type Lang = 'en' | 'fr' | 'de' | 'jp'

const NOROSCOPE_TYPES: ItemType[] = ['image', 'video', 'quote', 'joke', 'fact', 'web']
const CACHE_STORAGE_KEY = 'noroscope-cache-v5'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

const TARGET_COUNT = 6

function getItemKey(item: RandomContentItem): string {
  switch (item.type) {
    case 'image':
    case 'video':
    case 'web':
      return `${item.type}:${'url' in item && item.url ? item.url : ''}`
    case 'quote':
      return `${item.type}:${item.text || ''}:${item.author || ''}`
    case 'joke':
      return `${item.type}:${item.text || ''}`
    case 'fact':
      return `${item.type}:${item.text || ''}`
    default:
      return `${(item as { type?: string }).type || 'unknown'}:${Math.random()}`
  }
}

const POSITIVE_SEEDS: readonly string[] = [
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

const NEGATIVE_SEEDS: readonly string[] = [
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

const ACCENT_REGEX = /[\u0300-\u036f]/g
const NON_ALPHANUM_REGEX = /[^a-z0-9\u3040-\u30ff\u4e00-\u9faf\s]/g

function normalizeForSentiment(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(ACCENT_REGEX, '')
    .replace(NON_ALPHANUM_REGEX, ' ')
}

function containsSeed(normalizedText: string, seed: string): boolean {
  const normalizedSeed = normalizeForSentiment(seed).trim()
  if (!normalizedSeed) return false
  if (/^[a-z0-9]+$/.test(normalizedSeed)) {
    const pattern = new RegExp(`\\b${normalizedSeed}\\b`, 'i')
    return pattern.test(normalizedText)
  }
  return normalizedText.includes(normalizedSeed)
}

function scoreSegments(segments: string[]): { positive: number; negative: number } {
  const normalized = normalizeForSentiment(segments.filter(Boolean).join(' '))
  if (!normalized.trim()) return { positive: 0, negative: 0 }

  let positive = 0
  let negative = 0

  for (const seed of POSITIVE_SEEDS) {
    if (containsSeed(normalized, seed)) positive += 1
  }
  for (const seed of NEGATIVE_SEEDS) {
    if (containsSeed(normalized, seed)) negative += 1
  }

  return { positive, negative }
}

function scoreItem(item: RandomContentItem): { positive: number; negative: number } {
  const segments: string[] = []

  switch (item.type) {
    case 'image':
      if (item.title) segments.push(item.title)
      if (item.provider) segments.push(item.provider)
      if (item.source?.name) segments.push(item.source.name)
      break
    case 'video':
      if (item.text) segments.push(item.text)
      if (item.provider) segments.push(item.provider)
      if (item.source?.name) segments.push(item.source.name)
      if (item.url) segments.push(item.url)
      break
    case 'quote':
      segments.push(item.text)
      if (item.author) segments.push(item.author)
      segments.push(item.provider)
      if (item.source?.name) segments.push(item.source.name)
      break
    case 'joke':
      segments.push(item.text)
      segments.push(item.provider)
      if (item.source?.name) segments.push(item.source.name)
      break
    case 'fact':
      segments.push(item.text)
      if (item.variant === 'quiz') {
        segments.push(item.question)
        segments.push(item.answer)
        segments.push(item.options.join(' '))
      }
      segments.push(item.provider)
      if (item.source?.name) segments.push(item.source.name)
      break
    case 'web':
      segments.push(item.text)
      if (item.provider) segments.push(item.provider)
      if (item.source?.name) segments.push(item.source.name)
      if (item.url) segments.push(item.url)
      if (item.host) segments.push(item.host)
      break
    default:
      break
  }

  const tags = (item as { tags?: unknown }).tags
  if (Array.isArray(tags)) segments.push(tags.join(' '))

  const keywords = (item as { keywords?: unknown }).keywords
  if (Array.isArray(keywords)) segments.push(keywords.join(' '))

  return scoreSegments(segments)
}

function computeExpressionTone(entries: RandomContentItem[]): ExpressionTone {
  let positive = 0
  let negative = 0

  for (const item of entries) {
    const score = scoreItem(item)
    positive += score.positive
    negative += score.negative
  }

  if (positive === 0 && negative === 0) return 'positiveMedium'
  if (positive === 0) return negative >= 2 ? 'negative' : 'negativeMedium'
  if (negative === 0) return positive >= 2 ? 'positive' : 'positiveMedium'

  const ratio = positive / (negative || 1)
  if (ratio >= 1.6) return 'positive'
  if (ratio <= 1 / 1.6) return 'negative'
  if (positive >= negative) return 'positiveMedium'
  return 'negativeMedium'
}

function BurgerIcon({ color, glitch = false }: { color: string; glitch?: boolean }) {
  return (
    <span
      className={`inline-flex flex-col justify-between h-5 w-7 burger-icon${glitch ? ' burger-icon--glitch' : ''}`}
      aria-hidden
    >
      <span className="burger-line block h-[3px]" style={{ backgroundColor: color, color }} />
      <span className="burger-line block h-[3px]" style={{ backgroundColor: color, color }} />
      <span className="burger-line block h-[3px]" style={{ backgroundColor: color, color }} />
    </span>
  )
}

export default function NoroscopePage() {
  const { t, locale, locales, setLocale } = useI18n()

  const [themeIdx] = useState(() => Math.floor(Math.random() * THEMES.length))
  const theme = THEMES[themeIdx]

  const [menuOpen, setMenuOpen] = useState(false)
  const [languagesOpen, setLanguagesOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [burgerGlitch, setBurgerGlitch] = useState(false)
  const burgerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMountedRef = useRef(true)
  const [entries, setEntries] = useState<RandomContentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [vw, setVw] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1200)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      if (burgerTimeoutRef.current) clearTimeout(burgerTimeoutRef.current)
    }
  }, [])

  const triggerBurgerGlitch = useCallback(() => {
    setBurgerGlitch(true)
    if (burgerTimeoutRef.current) clearTimeout(burgerTimeoutRef.current)
    burgerTimeoutRef.current = setTimeout(() => setBurgerGlitch(false), 360)
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  useEffect(() => {
    if (!menuOpen) setLanguagesOpen(false)
  }, [menuOpen])

  const applyLangOut = useCallback((next: Lang) => {
    try {
      document.documentElement.setAttribute('lang', next)
      const globalWindow = window as Window & { __APP_LANG?: Lang }
      globalWindow.__APP_LANG = next
      const maxAge = 60 * 60 * 24 * 365
      document.cookie = `lang=${next}; path=/; max-age=${maxAge}`
      globalWindow.dispatchEvent(new CustomEvent('i18n:changed', { detail: next }))
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    const onResize = () => {
      setVw(window.innerWidth)
    }
    onResize()
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  }, [])

  const adFormat = useMemo(() => {
    if (vw >= 768) return { width: 728, height: 90 }
    return { width: 320, height: 50 }
  }, [vw])

  useEffect(() => {
    if (typeof document === 'undefined') return
    document.documentElement.style.setProperty('--ad-bar-height', `${adFormat.height}px`)
    return () => {
      document.documentElement.style.removeProperty('--ad-bar-height')
    }
  }, [adFormat.height])

  const langs = (Array.isArray(locales) && locales.length ? locales : ['en', 'fr', 'de', 'jp']) as Lang[]

  type ThemeStyle = CSSProperties & { ['--theme-cream']?: string }
  const mainStyle = useMemo<ThemeStyle>(() => ({
    background: theme.bg,
    color: theme.cream,
    '--theme-cream': theme.cream,
  }), [theme.bg, theme.cream])

  const navLabels = useMemo<Record<ItemType, string>>(
    () => ({
      image: t('nav.images', 'images'),
      video: t('nav.videos', 'videos'),
      quote: t('nav.quotes', 'quotes'),
      joke: t('nav.jokes', 'funny jokes'),
      fact: t('nav.facts', 'facts'),
      web: t('nav.web', 'web'),
    }),
    [t]
  )

  const languageLabel = useMemo(() => t('language.title', 'Language'), [t])
  const likesLabel = useMemo(() => t('likes.title', 'Likes'), [t])
  const noroscopeMenuLabel = useMemo(() => t('noroscope.menu', 'Noroscope'), [t])
  const legalLabel = useMemo(() => t('legal.title', 'Legal notice'), [t])
  const shareLabel = useMemo(() => t('noroscope.shareAction', 'Share this Noroscope'), [t])
  const shareTitle = useMemo(() => t('noroscope.shareTitle', 'Share your Noroscope'), [t])
  const titleBar = useMemo(() => t('noroscope.titleBar', 'Here is your Noroscope for today.'), [t])
  const loadingLabel = useMemo(() => t('noroscope.loading', "Aligning today's Noroscope..."), [t])
  const errorLabel = useMemo(() => t('noroscope.error', "Couldn't load everything. Give it another try."), [t])
  const retryLabel = useMemo(() => t('noroscope.retry', 'Try again'), [t])
  const emptyLabel = useMemo(() => t('noroscope.empty', 'No content available yet.'), [t])
  const expressionFallback = useMemo(() => t('noroscope.expressionFallback', 'The vibes are undecided today.'), [t])

  const expressionData = useMemo(() => {
    if (!entries.length) {
      return { tone: 'positiveMedium' as ExpressionTone, text: expressionFallback }
    }
    const tone = computeExpressionTone(entries)
    const localeKey = (locale || 'en') as ExpressionLocale
    const pool = NOROSCOPE_EXPRESSIONS[tone]?.[localeKey] ?? []
    if (!pool || pool.length === 0) {
      return { tone, text: expressionFallback }
    }
    const pick = pool[Math.floor(Math.random() * pool.length)] ?? expressionFallback
    return { tone, text: pick }
  }, [entries, locale, expressionFallback])

  const shareSummary = useMemo(() => {
    if (!entries.length) return null

    const lines = entries.map((item) => {
      const labelType = item.type as ItemType
      const label = navLabels[labelType] || labelType
      switch (item.type) {
        case 'image':
          return `${label}: ${item.title || item.provider || item.source?.name || item.url || ''}`.trim()
        case 'video':
        case 'web':
          return `${label}: ${item.text || item.source?.name || item.provider || item.url || ''}`.trim()
        case 'quote':
          return `${label}: ${item.text}${item.author ? ` — ${item.author}` : ''}`.trim()
        case 'joke':
        case 'fact':
          return `${label}: ${item.text}`.trim()
        default:
          return label
      }
    }).filter(Boolean)

    if (!lines.length) return null

    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://gorandom.fun'
    return [`NOROSCOPE`, ...lines, origin.replace(/\/$/, '') + '/noroscope'].join('\n')
  }, [entries, navLabels])

  const shareItem = useMemo<DisplayItem | null>(() => {
    if (!shareSummary) return null
    return { type: 'encourage', text: shareSummary, icon: '' }
  }, [shareSummary])

  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[noroscope] entries update', entries)
    }
  }, [entries])

  useEffect(() => {
    if (!shareItem && shareOpen) {
      setShareOpen(false)
    }
  }, [shareItem, shareOpen])

  const loadNoroscope = useCallback(async ({ force = false }: { force?: boolean } = {}) => {
    const lang = (locale || 'en') as Lang
    const storageKey = `${CACHE_STORAGE_KEY}:${lang}`

    setLoading(true)
    setFetchError(null)

    if (force) {
      try {
        localStorage.removeItem(storageKey)
      } catch {
        /* ignore */
      }
    }

    if (!force) {
      try {
        const raw = localStorage.getItem(storageKey)
        if (raw) {
          const parsed = JSON.parse(raw) as { timestamp?: number; entries?: RandomContentItem[] }
          const cached = Array.isArray(parsed?.entries) ? parsed.entries : []
          const isFresh = typeof parsed?.timestamp === 'number' && Date.now() - parsed.timestamp <= CACHE_TTL_MS
          const isComplete = cached.length === 6 && cached.every((item) => item && typeof item.type === 'string')
          if (isFresh && isComplete) {
            if (process.env.NODE_ENV === 'development') {
              console.log('[noroscope] cache hit', parsed)
            }
            setEntries(cached)
            setLoading(false)
            setFetchError(null)
            return
          }
        }
      } catch {
        /* ignore */
      }
    }

    const results: RandomContentItem[] = []
    const seen = new Set<string>()
    let attempts = 0
    const MAX_ATTEMPTS = 48

    while (results.length < TARGET_COUNT && attempts < MAX_ATTEMPTS) {
      attempts += 1
      try {
        const requested = NOROSCOPE_TYPES[Math.floor(Math.random() * NOROSCOPE_TYPES.length)]
        const response = await fetchRandom({ types: [requested] as RandomTypes, lang })
        const candidate = response?.item ?? null
        if (!candidate) continue

        const candidateType = candidate.type as ItemType | 'encourage'
        if (candidateType === 'encourage') continue
        if (!NOROSCOPE_TYPES.includes(candidateType)) continue
        if (candidateType === 'fact' && (candidate as FactItem).variant === 'quiz') continue

        const key = getItemKey(candidate)
        const allowDuplicate = attempts > 24
        if (!allowDuplicate && key && seen.has(key)) continue
        if (key) seen.add(key)

        results.push(candidate)
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('[noroscope] fetchRandom failed', error)
        }
      }
    }

    const hadError = results.length < TARGET_COUNT
    if (hadError && results.length > 0) {
      const pool = [...results]
      while (results.length < TARGET_COUNT) {
        results.push(pool[results.length % pool.length])
      }
    }

    if (!isMountedRef.current) return

    if (process.env.NODE_ENV === 'development') {
      console.log('[noroscope] fetched entries', results)
    }
    setEntries(results)
    setLoading(false)
    if (process.env.NODE_ENV === 'development') {
      console.log('[noroscope] loading -> false')
    }
    setFetchError(hadError ? errorLabel : null)

    const canPersist = !hadError && results.length === TARGET_COUNT
    if (canPersist) {
      try {
        const payload = { timestamp: Date.now(), entries: results }
        localStorage.setItem(storageKey, JSON.stringify(payload))
      } catch {
        /* ignore cache write errors */
      }
    }
  }, [errorLabel, locale])

  useEffect(() => {
    loadNoroscope({ force: false })
  }, [loadNoroscope])

  const adBar = (
    <div
      className="fixed bottom-0 left-0 right-0 flex items-center justify-center"
      style={{
        height: adFormat.height,
        backgroundColor: '#ffffff',
        color: '#111',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        zIndex: 60,
      }}
    >
      <div
        className="flex items-center justify-center border border-dashed border-neutral-300 rounded"
        style={{ width: adFormat.width, height: adFormat.height }}
      >
        <span className="font-inter font-semibold opacity-70">Ad space</span>
      </div>
    </div>
  )

  const TEXT_TILE_VARIANTS: Array<(theme: typeof THEMES[number]) => { backgroundColor: string; color: string }> = [
    (theme) => ({ backgroundColor: theme.deep, color: theme.cream }),
    (theme) => ({ backgroundColor: theme.cream, color: '#191916' }),
    (theme) => ({ backgroundColor: theme.text, color: '#191916' }),
  ]

  const renderTile = (item: RandomContentItem | null, index: number) => {
    if (!item) {
      return (
        <div className="flex h-full flex-col items-center justify-center px-3 text-center" style={{ backgroundColor: 'rgba(248,245,230,0.06)', color: theme.cream }}>
          <span className="font-inter text-xs sm:text-sm opacity-80">{loading ? loadingLabel : emptyLabel}</span>
        </div>
      )
    }

    if (item.type === 'image') {
      return (
        <img src={item.thumbUrl || item.url} alt={item.title || item.provider || 'Image'} className="absolute inset-0 h-full w-full object-cover" />
      )
    }

    if (item.type === 'video') {
      const badgeText = (navLabels.video || 'video').toUpperCase()
      const badge = (
        <span
          className="absolute top-3 left-3 px-3 py-1 text-[10px] font-inter uppercase tracking-[0.24em]"
          style={{ backgroundColor: 'rgba(25,25,22,0.8)', color: theme.cream }}
        >
          {badgeText}
        </span>
      )

      const content = (
        <>
          {item.thumbUrl ? (
            <img src={item.thumbUrl} alt={item.text || 'Video'} className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <MonoIcon src="/icons/Video.svg" color={theme.cream} size={36} />
            </div>
          )}
          {badge}
        </>
      )

      return item.url ? (
        <a href={item.url} target="_blank" rel="noreferrer" className="absolute inset-0">
          {content}
        </a>
      ) : (
        <div className="absolute inset-0">{content}</div>
      )
    }

    if (item.type === 'web') {
      const badgeText = (navLabels.web || 'web').toUpperCase()
      const badge = (
        <span
          className="absolute top-3 left-3 px-3 py-1 text-[10px] font-inter uppercase tracking-[0.24em]"
          style={{ backgroundColor: 'rgba(25,25,22,0.8)', color: theme.cream }}
        >
          {badgeText}
        </span>
      )

      const content = item.ogImage ? (
        <img src={item.ogImage} alt={item.text || 'Web'} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-[rgba(248,245,230,0.08)]">
          <MonoIcon src="/icons/web.svg" color={theme.cream} size={32} />
        </div>
      )

      return item.url ? (
        <a href={item.url} target="_blank" rel="noreferrer" className="absolute inset-0">
          {content}
          {badge}
        </a>
      ) : (
        <div className="absolute inset-0">
          {content}
          {badge}
        </div>
      )
    }

    const variant = TEXT_TILE_VARIANTS[index % TEXT_TILE_VARIANTS.length](theme)
    const wrapperStyle: CSSProperties = {
      backgroundColor: variant.backgroundColor,
      color: variant.color,
    }

    if (item.type === 'quote') {
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center" style={wrapperStyle}>
          <p className="font-tomorrow text-sm sm:text-base leading-snug" style={{ fontFamily: "var(--font-tomorrow), 'Tomorrow', sans-serif", fontWeight: 700 }}>
            “{item.text}”
          </p>
          {item.author ? (
            <p className="text-[11px] font-inter uppercase tracking-[0.2em]" style={{ opacity: 0.75 }}>
              — {item.author}
            </p>
          ) : null}
        </div>
      )
    }

    if (item.type === 'joke') {
      return (
        <div className="absolute inset-0 flex items-center justify-center px-4 text-center" style={wrapperStyle}>
          <p className="font-tomorrow text-sm sm:text-base leading-snug" style={{ fontFamily: "var(--font-tomorrow), 'Tomorrow', sans-serif", fontWeight: 700 }}>
            {item.text}
          </p>
        </div>
      )
    }

    if (item.type === 'fact') {
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center" style={wrapperStyle}>
          <p className="font-tomorrow text-sm sm:text-base leading-snug" style={{ fontFamily: "var(--font-tomorrow), 'Tomorrow', sans-serif", fontWeight: 700 }}>
            {item.text}
          </p>
          {item.source?.name ? (
            <p className="text-[11px] font-inter uppercase tracking-[0.2em]" style={{ opacity: 0.75 }}>
              {item.source.name}
            </p>
          ) : null}
        </div>
      )
    }

    const fallbackText = (item as { text?: string }).text || ''
    if (!fallbackText) {
      return (
        <div className="absolute inset-0 flex items-center justify-center px-4 text-center" style={wrapperStyle}>
          <MonoIcon src="/icons/info.svg" color={variant.color} size={28} />
        </div>
      )
    }

    return (
      <div className="absolute inset-0 flex items-center justify-center px-4 text-center" style={wrapperStyle}>
        <p className="font-tomorrow text-sm sm:text-base leading-snug" style={{ fontFamily: "var(--font-tomorrow), 'Tomorrow', sans-serif", fontWeight: 700 }}>
          {fallbackText}
        </p>
      </div>
    )
  }

  const renderGrid = () => {
    const tiles = loading && !entries.length ? Array.from({ length: TARGET_COUNT }, () => null) : entries
    if (!tiles.length) {
      return Array.from({ length: TARGET_COUNT }, (_, idx) => (
        <div
          key={`placeholder-${idx}`}
          className="relative aspect-[1/1] overflow-hidden border"
          style={{ borderColor: 'rgba(248,245,230,0.18)', backgroundColor: 'rgba(248,245,230,0.06)' }}
        />
      ))
    }

    return tiles.map((item, index) => {
      const key = item ? `${getItemKey(item)}-${index}` : `placeholder-${index}`
      const isImage = !!item && item.type === 'image'
      return (
        <div
          key={key}
          className="relative aspect-[1/1] overflow-hidden border"
          style={{
            borderColor: 'rgba(248,245,230,0.18)',
            backgroundColor: isImage ? 'rgba(0,0,0,0.55)' : theme.deep,
          }}
        >
          {renderTile(item ?? null, index)}
        </div>
      )
    })
  }

  return (
    <main className="min-h-screen flex flex-col" style={mainStyle}>
      <header className="flex items-center justify-between px-4 sm:px-6 pt-6 pb-4">
        <button
          type="button"
          aria-label="Menu"
          onClick={() => {
            triggerBurgerGlitch()
            setMenuOpen(true)
          }}
          className="flex items-center"
        >
          <BurgerIcon color={theme.text} glitch={burgerGlitch} />
        </button>

        <div className="flex-1 flex justify-center">
          <LogoAnimated
            trigger={1}
            toSecond={false}
            fitToWidth
            vhMobile={8}
            vhDesktop={9}
            gapMobile={1}
            gapDesktop={1}
          />
        </div>

        <button
          type="button"
          aria-label={shareLabel}
          onClick={() => setShareOpen(true)}
          className="p-3 disabled:opacity-40 disabled:pointer-events-none"
          disabled={!shareItem}
        >
          <MonoIcon src="/icons/share.svg" color={theme.cream} size={28} />
        </button>
      </header>

      <div className="px-4 sm:px-6">
        <div className="mx-auto w-full">
          <div
            className="px-4 py-3 text-center text-base sm:text-xl uppercase tracking-wide"
            style={{
              backgroundColor: theme.text,
              color: theme.cream,
              letterSpacing: '0.12em',
              fontFamily: "var(--font-inter-tight), 'Inter Tight', sans-serif",
              fontWeight: 400,
            }}
          >
            {titleBar}
          </div>
        </div>
      </div>

      {fetchError ? (
        <div className="px-4 sm:px-6 mt-4">
          <div
            className="px-4 py-3 rounded-2xl border text-sm font-inter"
            style={{
              borderColor: 'rgba(248,245,230,0.25)',
              backgroundColor: 'rgba(25,25,22,0.55)',
              color: theme.cream,
            }}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>{fetchError}</span>
              <button
                type="button"
                onClick={() => loadNoroscope({ force: true })}
                className="self-start sm:self-auto px-3 py-1 rounded-full text-xs font-inter font-semibold uppercase tracking-wide"
                style={{ backgroundColor: theme.text, color: theme.cream }}
              >
                {retryLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <section
        className="flex-1"
        style={{ paddingBottom: `calc(${adFormat.height}px + 72px + env(safe-area-inset-bottom, 0px))` }}
      >
        <div className="px-4 sm:px-6 mt-6">
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mx-auto w-full">
            {renderGrid()}
          </div>
          {loading ? (
            <p className="mt-4 text-center font-inter text-sm" style={{ color: theme.cream, opacity: 0.75 }}>
              {loadingLabel}
            </p>
          ) : null}
          {!loading ? (
            <div className="mt-6">
              <div
                className="mx-auto w-full px-4 py-3 text-center font-tomorrow text-base sm:text-lg leading-snug"
                style={{
                  border: `2px solid ${theme.text}`,
                  borderRadius: 0,
                  backgroundColor: 'transparent',
                  color: theme.text,
                  fontFamily: "var(--font-tomorrow), 'Tomorrow', sans-serif",
                  fontWeight: 700,
                }}
              >
                {expressionData.text}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {adBar}

      {menuOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.65)' }}>
          <div className="absolute inset-0" onClick={() => setMenuOpen(false)} />
          <div
            className="relative w-[min(360px,92vw)] rounded-3xl px-6 pt-4 pb-6 flex flex-col gap-3 shadow-2xl"
            style={{
              backgroundColor: theme.text,
              color: theme.cream,
              fontFamily: 'var(--font-inter-tight), sans-serif',
            }}
          >
            <div className="flex items-center justify-end">
              <button type="button" aria-label="Close" onClick={() => setMenuOpen(false)} className="text-2xl" style={{ color: theme.cream }}>
                ×
              </button>
            </div>

            <nav
              className="flex flex-col text-lg font-semibold uppercase"
              style={{ gap: '10px' }}
            >
              <Link
                href="/"
                onClick={() => setMenuOpen(false)}
                className="flex items-center"
                style={{ color: theme.cream }}
              >
                <span>Home</span>
              </Link>

              <Link
                href="/random"
                onClick={() => setMenuOpen(false)}
                className="flex items-center"
                style={{ color: theme.cream }}
              >
                <span>Random</span>
              </Link>

              <Link
                href="/noroscope"
                onClick={() => setMenuOpen(false)}
                className="flex items-center"
                style={{ color: theme.cream, opacity: 0.7 }}
              >
                <span>{noroscopeMenuLabel}</span>
              </Link>

              <Link
                href="/likes"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2"
                style={{ color: theme.cream }}
              >
                <span>{likesLabel}</span>
                <MonoIcon src="/icons/Heart.svg" color={theme.cream} size={18} />
              </Link>

              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => setLanguagesOpen((open) => !open)}
                  className="w-full flex items-center justify-between"
                  style={{ color: theme.cream }}
                >
                  <span className="uppercase">{languageLabel}</span>
                  <span>{(locale || 'en').toUpperCase()}</span>
                </button>
                {languagesOpen ? (
                  <ul className="space-y-2 text-base font-semibold">
                    {langs.map((lang) => {
                      const active = (locale || 'en') === lang
                      return (
                        <li key={lang}>
                          <button
                            type="button"
                            onClick={() => {
                              setLocale(lang)
                              applyLangOut(lang)
                              setLanguagesOpen(false)
                              setMenuOpen(false)
                            }}
                            className="w-full text-left px-3 py-2 rounded-xl"
                            style={{
                              backgroundColor: active ? 'rgba(25,25,22,0.25)' : 'rgba(25,25,22,0.12)',
                              color: theme.cream,
                            }}
                          >
                            {lang.toUpperCase()}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                ) : null}
              </div>

              <Link
                href="/legal"
                onClick={() => setMenuOpen(false)}
                className="text-lg font-semibold"
                style={{ color: theme.cream }}
              >
                {legalLabel}
              </Link>

              <Link
                href="/add"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2"
                style={{ color: theme.cream }}
              >
                <span>Add</span>
                <MonoIcon src="/icons/plus.svg" color={theme.cream} size={18} />
              </Link>
            </nav>
          </div>
        </div>
      ) : null}

      <ShareMenu
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        title={shareTitle}
        url="/noroscope"
        theme={theme}
        item={shareItem ?? undefined}
      />
    </main>
  )
}
