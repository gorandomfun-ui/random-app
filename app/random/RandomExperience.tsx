'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { RotateCcw, X } from 'lucide-react'

import AnimatedButtonLabel from '@/components/AnimatedButtonLabel'
import { useCookieConsent } from '@/components/CookieConsent'
import AadsFooterSlot from '@/components/AadsFooterSlot'
import { FactQuizCard } from '@/components/RandomContentRenderer'
import MiniGameCard from '@/components/minigames/MiniGameCard'
import LogoAnimated from '@/components/LogoAnimated'
import MonoIcon from '@/components/MonoIcon'
import ScoreCounter from '@/components/ScoreCounter'
import ShareMenu from '@/components/ShareMenu'
import { useI18n } from '@/providers/I18nProvider'
import { useScore } from '@/providers/ScoreProvider'
import { ENCOURAGE_PAGES_ENABLED, MINIGAMES_ENABLED, XP_UI_ENABLED } from '@/lib/features'
import { THEMES } from '@/lib/theme'
import { fetchRandom, fetchWave, type RandomTypes } from '@/lib/api'
import { createMiniGameItem, MINI_GAME_IDS } from '@/lib/minigames/registry'
import type { ItemType, VideoPool } from '@/lib/random/types'
import {
  areWaveItemsFromSameSeries,
  createWaveHint,
  hasWaveSignal,
  hasSameWaveIdentity,
  type WaveSimilarityHint,
} from '@/lib/random/wave'
import { createRandomSequence, type SequenceEntry } from '@/lib/random/sequence'
import type {
  FactItem,
  FactQuizItem,
  DisplayItem,
  EncourageItem as EncourageContentItem,
  MiniGameItem,
  MiniGameId,
  RandomContentItem,
  SourceInfo,
  VideoItem as VideoContentItem,
} from '@/lib/random/clientTypes'
import { addLike, isLiked, removeLike } from '@/utils/likes'
import { reportImageLoadIssue } from '@/utils/imageSuspects'
import {
  isVideoBlockedThisSession,
  reportVideoPlaybackIssue,
  type VideoPlaybackIssue,
} from '@/utils/videoSuspects'
import { reportWaveFeedback } from '@/utils/waveFeedback'
import { playAgain, playRandom, playWaveEnter, playWaveStep, setMuted } from '@/utils/sound'
import { createTestEncourage3DEvent, type Encourage3DEvent } from '@/lib/encourage3d/catalog'

const Encourage3DOverlay = dynamic(() => import('@/components/encourage3d/Encourage3DOverlay'), {
  ssr: false,
})

const TYPE_ICONS: Record<ItemType, string> = {
  image: '/icons/image.svg',
  video: '/icons/Video.svg',
  web: '/icons/web.svg',
  quote: '/icons/quote.svg',
  joke: '/icons/joke.svg',
  fact: '/icons/fact.svg',
}
const FULLSCREEN_ICON = '/icons/fullscreen.svg'
const GIPHY_ATTRIBUTION_BADGE = '/PoweredBy_640_Horizontal_Light-Backgrounds_With_Logo.gif'
const VIDEO_FULLSCREEN_LOGO_LETTERS = ['R', 'A', 'N', 'D', 'O', 'M'] as const

const ENCOURAGE_GROUP_SIZE = 5
const ENCOURAGE_ICON_TOTAL = 30
const ENCOURAGE_INTERVALS = [22, 24, 28, 24, 26, 28]

const RECENT_SESSION_LIMIT = 40
const STRONG_POOL_INITIAL_DRAWS = 20
const INITIAL_VIDEO_POOLS: Partial<Record<number, VideoPool>> = {
  0: 'trending',
  1: 'fresh',
  3: 'trending',
  5: 'retro-ad',
  7: 'trending',
  10: 'fresh',
  12: 'trending',
  13: 'retro',
  15: 'trending',
  17: 'fresh',
  19: 'trending',
}
const ALL_ITEM_TYPES: ItemType[] = ['image', 'video', 'quote', 'joke', 'fact', 'web']
const TEXT_ITEM_TYPES: ItemType[] = ['fact', 'joke', 'quote']
const WAVE_TOTAL_STEPS = 3
const WAVE_RESERVE_STEPS = 7
const RANDOM_READY_TARGET = 3
const RANDOM_SESSION_TTL_MS = 6 * 60 * 60 * 1000
const RANDOM_SESSION_VERSION = 1
const RANDOM_SESSION_PREFIX = 'random-experience-session-'
const EFFECTS_TEST_MAX_STEPS = 25
const EFFECTS_TEST_DRAWS_PER_STEP = 20
const EFFECTS_PROGRESSION_MAX_DRAWS = 500
const EFFECTS_TEST_STORAGE_KEY = 'random-effects-test-step'
const MINI_GAME_FREQUENCY = MINIGAMES_ENABLED ? 3 : 0

const FALLBACK_ENCOURAGE_MESSAGES = [
  'Keep exploring forward.',
  'Push beyond the familiar.',
  'The next layer awaits.',
  'Dive further into the odd.',
  'Unlock another surprise.',
]

const GLITCH_COLOR_SETS: Array<[string, string, string]> = [
  ['#22FF9C', '#00E1FF', '#FFFFFF'],
  ['#FF005C', '#FF8A00', '#FFE500'],
  ['#42FF73', '#00B2FF', '#FF3AFB'],
  ['#00E8FF', '#2D6BFF', '#FFFFFF'],
  ['#FF0066', '#FF2FD2', '#00FFE5'],
  ['#ADFF00', '#00FFE3', '#FFFC00'],
]

const IMMERSIVE_ACCENTS: Record<string, string> = {
  video: '#13D8FF',
  image: '#FF35C7',
  web: '#FF8A00',
  quote: '#B7FF4A',
  joke: '#FF005C',
  fact: '#8D6CFF',
  minigame: '#23FF9A',
  encourage: '#FF6A00',
  ad: '#FF005C',
  empty: '#B13CFF',
}

const randomBetween = (min: number, max: number) => Math.random() * (max - min) + min
const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min
const SOUND_STORAGE_KEY = 'randomapp-sound-muted'
const VISUAL_READY_TIMEOUT_MS = 2400
const VISUAL_READY_CACHE_LIMIT = 80

type EffectsProfile = 'standard' | 'webkit-lite'

const visualReadyCache = new Map<string, Promise<boolean>>()

function shouldUseWebkitLiteEffects(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  const isIOSWebKit = /iP(?:ad|hone|od)/i.test(ua)
    || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)
  const isSafari = /Safari/i.test(ua) && !/(?:Chrome|Chromium|CriOS|FxiOS|EdgiOS|OPiOS|Android)/i.test(ua)
  return isIOSWebKit || isSafari
}

function preloadVisualUrl(url: string): Promise<boolean> {
  if (typeof window === 'undefined' || !url) return Promise.resolve(false)
  const cached = visualReadyCache.get(url)
  if (cached) return cached

  const pending = new Promise<boolean>((resolve) => {
    const image = new window.Image()
    let settled = false
    let timeout: number | null = null
    const finish = (ready: boolean) => {
      if (settled) return
      settled = true
      if (timeout) window.clearTimeout(timeout)
      image.onload = null
      image.onerror = null
      resolve(ready)
    }
    image.decoding = 'async'
    image.onload = () => {
      if (typeof image.decode !== 'function') {
        finish(true)
        return
      }
      image.decode().then(() => finish(true)).catch(() => finish(true))
    }
    image.onerror = () => finish(false)
    timeout = window.setTimeout(() => finish(false), VISUAL_READY_TIMEOUT_MS)
    image.src = url
    if (image.complete && image.naturalWidth > 0) {
      window.requestAnimationFrame(() => finish(true))
    }
  })

  if (visualReadyCache.size >= VISUAL_READY_CACHE_LIMIT) {
    const oldest = visualReadyCache.keys().next().value
    if (oldest) visualReadyCache.delete(oldest)
  }
  visualReadyCache.set(url, pending)
  void pending.then((ready) => {
    if (!ready && visualReadyCache.get(url) === pending) visualReadyCache.delete(url)
  })
  return pending
}

type GlitchBar = {
  id: string
  variant: 'line' | 'signal' | 'block' | 'void'
  top: string
  width: string
  left: string
  height: string
  background: string
  delay: number
  duration: number
  shift: string
  yShift: string
  opacity: number
  popOpacity: number
}

type GlitchBarStyle = CSSProperties & {
  ['--glitch-bar-shift']?: string
  ['--glitch-bar-start-x']?: string
  ['--glitch-bar-mid-x']?: string
  ['--glitch-bar-tail-x']?: string
  ['--glitch-bar-y-shift']?: string
  ['--glitch-bar-y-reverse']?: string
  ['--glitch-bar-pop-opacity']?: number
}

type FullscreenVideoPayload = {
  kind: 'youtube' | 'dailymotion' | 'html'
  src: string
  title?: string | null
}

type PlaybackIssueHandler = (item: VideoContentItem, issue: VideoPlaybackIssue) => void

type EncourageItem = EncourageContentItem

type SequenceSlot =
  | { kind: 'content'; itemType: ItemType; requireQuiz?: boolean; strong?: boolean; videoPool?: VideoPool }
  | { kind: 'encourage'; round: number; encourageIndex: number }

type RandomSequenceState = {
  cycle: SequenceEntry[]
  step: number
  round: number
  encourage: number
  draws: number
  sinceEncourage: number
  currentInterval: number
  intervalIndex: number
}

type PreparedRandomEntry = {
  slot: SequenceSlot
  item: DisplayItem
}

type PersistedRandomSession = {
  version: number
  timestamp: number
  lang: Lang
  currentItem: DisplayItem | null
  ready: PreparedRandomEntry[]
  sequence: RandomSequenceState
  progressionDraws: number
  recentKeys: string[]
}

const createInitialSequenceState = (): RandomSequenceState => ({
  cycle: createRandomSequence(),
  step: 0,
  round: 0,
  encourage: 0,
  draws: 0,
  sinceEncourage: 0,
  currentInterval: ENCOURAGE_INTERVALS[0] ?? 15,
  intervalIndex: 0,
})

type ThemeStyle = CSSProperties & {
  ['--theme-cream']?: string
  ['--theme-text']?: string
  ['--random-progress']?: number
  ['--random-progress-shift']?: string
  ['--random-progress-shift-negative']?: string
  ['--random-progress-transition-shift']?: string
  ['--random-progress-transition-shift-negative']?: string
  ['--random-progress-transition-shift-half']?: string
  ['--random-progress-transition-shift-half-negative']?: string
  ['--random-progress-transition-shift-soft']?: string
  ['--random-progress-transition-shift-soft-negative']?: string
  ['--random-progress-transition-y']?: string
  ['--random-progress-transition-y-negative']?: string
  ['--random-progress-chroma-shift']?: string
  ['--random-progress-transition-duration']?: string
  ['--random-progress-transition-scale']?: number
  ['--random-progress-bg-hit-scale']?: number
  ['--random-progress-bg-hit-shift']?: string
  ['--random-progress-bg-hit-shift-negative']?: string
  ['--random-progress-bg-hit-shift-half']?: string
  ['--random-progress-bg-hit-shift-soft-negative']?: string
  ['--random-progress-overlay-saturate']?: number
  ['--random-progress-overlay-contrast']?: number
  ['--random-progress-ambient-duration']?: string
  ['--random-progress-bg-duration']?: string
  ['--random-progress-noise-duration']?: string
  ['--random-overdrive-edge-short']?: string
  ['--random-overdrive-edge-medium']?: string
  ['--random-overdrive-edge-long']?: string
  ['--random-overdrive-edge-opacity']?: number
  ['--random-overdrive-edge-hit-opacity']?: number
  ['--random-overdrive-edge-duration']?: string
  ['--random-overdrive-edge-shift']?: string
  ['--random-overdrive-edge-shift-negative']?: string
  ['--random-overdrive-echo-opacity']?: number
  ['--random-overdrive-echo-duration']?: string
  ['--random-overdrive-echo-reach']?: string
  ['--random-overdrive-echo-reach-negative']?: string
  ['--random-final-edge-opacity']?: number
  ['--random-final-edge-short']?: string
  ['--random-final-edge-medium']?: string
  ['--random-final-edge-long']?: string
  ['--random-final-edge-duration']?: string
}
type EncourageStyle = CSSProperties & { ['--encourage-height']?: string }
type ImmersiveBackgroundStyle = CSSProperties & {
  ['--random-bg-image']?: string
  ['--random-bg-tone']?: string
  ['--random-bg-accent']?: string
  ['--random-bg-strength']?: number
  ['--random-bg-noise-strength']?: number
}
type ImmersiveFragmentStyle = CSSProperties & {
  ['--fragment-opacity']?: number
  ['--fragment-pop-opacity']?: number
  ['--fragment-transform']?: string
  ['--fragment-jump-x']?: string
  ['--fragment-reverse-x']?: string
  ['--fragment-jump-y']?: string
  ['--fragment-duration']?: string
  ['--fragment-delay']?: string
  ['--fragment-color']?: string
  ['--fragment-alt-color']?: string
}

type ImmersiveFragment = {
  id: string
  className: string
  style: ImmersiveFragmentStyle
}

function clampProgress(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function clampOverdrive(value: number): number {
  return Math.max(0, Math.min(1.5, value))
}

function lerp(from: number, to: number, progress: number): number {
  return from + (to - from) * clampProgress(progress)
}

function progressionForDraws(draws: number): number {
  const anchors = [
    { draws: 0, intensity: 0 },
    { draws: 10, intensity: 0.04 },
    { draws: 50, intensity: 0.34 },
    { draws: 100, intensity: 0.72 },
    { draws: 200, intensity: 1.4 },
    { draws: 300, intensity: 2 },
    { draws: 400, intensity: 2.25 },
    { draws: EFFECTS_PROGRESSION_MAX_DRAWS, intensity: 2.5 },
  ]
  const boundedDraws = Math.max(0, Math.min(EFFECTS_PROGRESSION_MAX_DRAWS, draws))
  const upperIndex = anchors.findIndex((anchor) => boundedDraws <= anchor.draws)
  if (upperIndex <= 0) return anchors[0].intensity
  const lower = anchors[upperIndex - 1]
  const upper = anchors[upperIndex]
  const linear = (boundedDraws - lower.draws) / Math.max(1, upper.draws - lower.draws)
  const eased = linear * linear * (3 - 2 * linear)
  return lower.intensity + (upper.intensity - lower.intensity) * eased
}

function progressionForStep(step: number): number {
  const boundedStep = Math.max(0, Math.min(EFFECTS_TEST_MAX_STEPS, step))
  return progressionForDraws(boundedStep * EFFECTS_TEST_DRAWS_PER_STEP)
}

type Lang = 'en' | 'fr' | 'de' | 'jp' | 'es'

type PrefetchedBundle = {
  lang?: Lang
  item?: RandomContentItem
  items?: RandomContentItem[]
}

const buildPrefetchStorageKeys = (lang: Lang | null | undefined, type: ItemType) => {
  const keys: string[] = []
  if (lang) keys.push(`${PREFETCH_STORAGE_PREFIX}${lang}-${type}`)
  keys.push(`${PREFETCH_STORAGE_PREFIX}${type}`)
  return keys
}

const parsePrefetchEntry = (raw: string): PrefetchedBundle | null => {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object') {
      if ('items' in (parsed as Record<string, unknown>)) {
        const bundle = parsed as { items?: RandomContentItem[]; lang?: Lang }
        if (Array.isArray(bundle.items) && bundle.items.length) {
          return { lang: bundle.lang, items: bundle.items }
        }
      } else if ('item' in (parsed as Record<string, unknown>)) {
        const bundle = parsed as { item?: RandomContentItem; lang?: Lang }
        if (bundle.item && typeof bundle.item === 'object') {
          return { lang: bundle.lang, items: [bundle.item] }
        }
      } else if ('type' in (parsed as Record<string, unknown>)) {
        return { item: parsed as RandomContentItem }
      }
    }
  } catch {
    return null
  }
  return null
}

const cloneSequenceState = (state: RandomSequenceState): RandomSequenceState => ({
  ...state,
  cycle: state.cycle.map((entry) => ({ ...entry })),
})

const isSequenceEntry = (value: unknown): value is SequenceEntry => {
  if (!value || typeof value !== 'object') return false
  const entry = value as Partial<SequenceEntry>
  if (entry.kind === 'text') return true
  if (entry.kind === 'quiz') return entry.itemType === 'fact'
  return entry.kind === 'fixed' && ALL_ITEM_TYPES.includes(entry.itemType as ItemType)
}

const isDisplayItem = (value: unknown): value is DisplayItem => {
  if (!value || typeof value !== 'object') return false
  const item = value as { type?: string }
  return item.type === 'encourage' || item.type === 'minigame' || ALL_ITEM_TYPES.includes(item.type as ItemType)
}

const parseRandomSession = (raw: string, lang: Lang): PersistedRandomSession | null => {
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedRandomSession>
    if (
      parsed.version !== RANDOM_SESSION_VERSION
      || parsed.lang !== lang
      || typeof parsed.timestamp !== 'number'
      || Date.now() - parsed.timestamp > RANDOM_SESSION_TTL_MS
      || !parsed.sequence
      || !Array.isArray(parsed.sequence.cycle)
      || !parsed.sequence.cycle.length
      || !parsed.sequence.cycle.every(isSequenceEntry)
    ) return null

    const sequenceNumbers = [
      parsed.sequence.step,
      parsed.sequence.round,
      parsed.sequence.encourage,
      parsed.sequence.draws,
      parsed.sequence.sinceEncourage,
      parsed.sequence.currentInterval,
      parsed.sequence.intervalIndex,
    ]
    if (!sequenceNumbers.every((value) => typeof value === 'number' && Number.isFinite(value))) return null

    const ready = Array.isArray(parsed.ready)
      ? parsed.ready.filter((entry): entry is PreparedRandomEntry => Boolean(
        entry
        && typeof entry === 'object'
        && (entry.slot?.kind === 'content' || entry.slot?.kind === 'encourage')
        && isDisplayItem(entry.item),
      )).slice(0, RANDOM_READY_TARGET)
      : []

    return {
      version: RANDOM_SESSION_VERSION,
      timestamp: parsed.timestamp,
      lang,
      currentItem: isDisplayItem(parsed.currentItem) ? parsed.currentItem : null,
      ready,
      sequence: cloneSequenceState(parsed.sequence as RandomSequenceState),
      progressionDraws: typeof parsed.progressionDraws === 'number' && Number.isFinite(parsed.progressionDraws)
        ? Math.max(0, Math.min(EFFECTS_PROGRESSION_MAX_DRAWS, Math.round(parsed.progressionDraws)))
        : 0,
      recentKeys: Array.isArray(parsed.recentKeys)
        ? parsed.recentKeys.filter((key): key is string => typeof key === 'string').slice(-RECENT_SESSION_LIMIT)
        : [],
    }
  } catch {
    return null
  }
}

const shuffleArray = <T,>(arr: T[]): T[] => {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const temp = copy[i]
    copy[i] = copy[j]
    copy[j] = temp
  }
  return copy
}

const randIdx = (max: number) => Math.floor(Math.random() * max)

const cssImageUrl = (value?: string | null) => {
  if (!value) return undefined
  return `url("${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")`
}

const isGifUrl = (value?: string | null) => Boolean(value && /\.gif(?:[?#]|$)/i.test(value))

const isSmallAnimatedGifUrl = (value: string) =>
  /(?:preview|downsized_small|fixed_(?:width|height)_small|100w|100\.gif|tinygif|nanogif)/i.test(value)

const toStaticGifUrl = (value: string) => {
  if (!isGifUrl(value)) return value
  if (!/giphy/i.test(value)) return null
  const still = value
    .replace(/\/giphy\.gif([?#].*)?$/i, '/giphy_s.gif$1')
    .replace(/\/(\d+w?)\.gif([?#].*)?$/i, '/$1_s.gif$2')
  return still !== value ? still : null
}

const getSafeBackgroundImage = (value?: string | null, viewportWidth?: number | null) => {
  if (!value) return null
  if (!isGifUrl(value)) return value

  const staticGif = toStaticGifUrl(value)
  if (staticGif) return staticGif

  const compact = viewportWidth != null && viewportWidth < 720
  if (!compact && isSmallAnimatedGifUrl(value)) return value
  return null
}

const cleanProviderVideoId = (value?: string | null, { stripSlug = false }: { stripSlug?: boolean } = {}) => {
  if (!value) return null
  let raw = value
  try {
    raw = decodeURIComponent(value)
  } catch {
    raw = value
  }
  const cleaned = raw
    .split('?')[0]
    .split('#')[0]
    .trim()
  if (!cleaned) return null
  return stripSlug ? cleaned.split('_')[0] || null : cleaned
}

const extractYouTubeVideoId = (url: string) => {
  try {
    const parsed = new URL(url)
    if (parsed.hostname.includes('youtu.be')) return cleanProviderVideoId(parsed.pathname.split('/').filter(Boolean)[0])
    if (parsed.hostname.includes('youtube.com')) {
      const parts = parsed.pathname.split('/').filter(Boolean)
      if (parsed.searchParams.get('v')) return cleanProviderVideoId(parsed.searchParams.get('v'))
      if (parts[0] === 'shorts' || parts[0] === 'embed' || parts[0] === 'live') return cleanProviderVideoId(parts[1])
      return cleanProviderVideoId(parts[0])
    }
  } catch {
    return cleanProviderVideoId(url.split('/').pop())
  }
  return null
}

const extractYouTubeIdForThumb = extractYouTubeVideoId

const extractDailymotionVideoId = (url: string) => {
  try {
    const parsed = new URL(url)
    const queryVideo = parsed.searchParams.get('video')
    if (queryVideo) return cleanProviderVideoId(queryVideo)
    if (parsed.hostname.includes('dai.ly')) return cleanProviderVideoId(parsed.pathname.split('/').filter(Boolean)[0], { stripSlug: true })
    if (parsed.hostname.includes('dailymotion.com')) {
      const parts = parsed.pathname.split('/').filter(Boolean)
      const videoIndex = parts.indexOf('video')
      return videoIndex >= 0
        ? cleanProviderVideoId(parts[videoIndex + 1], { stripSlug: true })
        : cleanProviderVideoId(parts[0], { stripSlug: true })
    }
  } catch {
    return cleanProviderVideoId(url.split('/').pop(), { stripSlug: true })
  }
  return null
}

const extractDailymotionIdForThumb = extractDailymotionVideoId

function getImmersiveBackgroundImage(item: DisplayItem | null, viewportWidth?: number | null): string | null {
  if (!item) return null
  if (item.type === 'image') {
    return getSafeBackgroundImage(item.thumbUrl, viewportWidth) || getSafeBackgroundImage(item.url, viewportWidth)
  }
  if (item.type === 'video') {
    const safeThumb = getSafeBackgroundImage(item.thumbUrl, viewportWidth)
    if (safeThumb) return safeThumb
    const provider = (item.provider || '').toLowerCase()
    const youtubeId = provider.includes('youtube') || /youtu\.?be|youtube\.com/.test(item.url)
      ? extractYouTubeIdForThumb(item.url)
      : null
    if (youtubeId) return `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`
    const dailymotionId = provider.includes('dailymotion') || /dailymotion\.com|dai\.ly/.test(item.url)
      ? extractDailymotionIdForThumb(item.url)
      : null
    if (dailymotionId) return `https://www.dailymotion.com/thumbnail/video/${dailymotionId}`
    return null
  }
  if (item.type === 'web') return getSafeBackgroundImage(item.ogImage, viewportWidth)
  if (item.type === 'encourage') return getSafeBackgroundImage(item.icon, viewportWidth)
  return null
}

function getImmersiveBackgroundData(
  item: DisplayItem | null,
  theme: { bg: string; text: string },
  isInlineAd: boolean,
  isPriming: boolean,
  fallbackImage?: string | null,
  viewportWidth?: number | null
) {
  const kind = isInlineAd ? 'ad' : isPriming || !item ? 'empty' : item.type
  const ownImage = isInlineAd || isPriming ? null : getImmersiveBackgroundImage(item, viewportWidth)
  const image = ownImage || fallbackImage || null
  const accent = IMMERSIVE_ACCENTS[kind] || theme.text
  const strength = image
    ? ownImage
      ? kind === 'image'
        ? 0.76
        : kind === 'video'
          ? 0.66
          : 0.56
      : 0.5
    : 0

  return {
    image,
    tone: theme.bg,
    accent,
    strength,
  }
}

function hashString(value: string) {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function createSeededRandom(seed: number) {
  let state = seed || 1
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}

function getImmersiveSeed(item: DisplayItem | null, image?: string | null) {
  if (!item) return image || 'empty'
  if ('_id' in item && item._id) return `${item.type}:${item._id}:${image || ''}`
  if ('url' in item && item.url) return `${item.type}:${item.url}:${image || ''}`
  if (item.type === 'encourage') return `encourage:${item.text}:${image || ''}`
  return `${item.type}:${image || ''}`
}

function buildImmersiveFragments(
  image: string | null,
  seedValue: string,
  viewportWidth: number | null,
  effectsProfile: EffectsProfile,
): ImmersiveFragment[] {
  if (!image) return []

  const isCompact = viewportWidth != null && viewportWidth < 720
  const lite = effectsProfile === 'webkit-lite'
  const fineLineCount = lite ? (isCompact ? 36 : 54) : (isCompact ? 96 : 180)
  const lowerFineLineCount = lite ? (isCompact ? 48 : 72) : (isCompact ? 112 : 210)
  const extraUpperLineCount = lite ? (isCompact ? 4 : 6) : (isCompact ? 14 : 27)
  const extraLowerLineCount = lite ? (isCompact ? 5 : 7) : (isCompact ? 16 : 30)
  const tearCount = lite ? (isCompact ? 18 : 28) : (isCompact ? 40 : 70)
  const clusterCount = lite ? 3 : (isCompact ? 4 : 5)
  const voidCount = lite ? 5 : (isCompact ? 9 : 14)
  const signalCount = lite ? 7 : (isCompact ? 12 : 18)
  const contentZoneTop = isCompact ? 18 : 16
  const contentZoneBottom = isCompact ? 70 : 84
  const sourceZoneTop = isCompact ? 62 : 77
  const sourceZoneBottom = isCompact ? 73 : 87
  const lowerChaosTop = isCompact ? 70 : 84
  const lowerChaosBottom = isCompact ? 98 : 99
  const lowerLineTop = sourceZoneBottom + (isCompact ? 0.8 : 0.6)
  const lowerBlockTop = isCompact ? 74 : 88
  const lowerBlockBottom = isCompact ? 92 : 98
  const rng = createSeededRandom(hashString(seedValue))
  const fragments: ImmersiveFragment[] = []

  const between = (min: number, max: number) => min + rng() * (max - min)
  const intBetween = (min: number, max: number) => Math.floor(between(min, max + 1))
  const fixed = (value: number, precision = 2) => Number(value.toFixed(precision))
  const inContentZone = (top: number) => top >= contentZoneTop && top <= contentZoneBottom
  const inSourceZone = (top: number) => top >= sourceZoneTop && top <= sourceZoneBottom
  const quietFactor = (top: number) => {
    if (inSourceZone(top)) return 0.06
    if (inContentZone(top)) return 0.1
    return 1
  }
  const backdropTop = (insideChance = 0.04) => {
    const roll = rng()
    if (roll < insideChance) return between(contentZoneTop, contentZoneBottom)
    if (roll < 0.5) return between(-2, contentZoneTop - 2)
    return between(lowerChaosTop, lowerChaosBottom)
  }
  const blends: Array<CSSProperties['mixBlendMode']> = ['screen', 'hard-light', 'color-dodge', 'normal', 'difference']
  const signalColors = ['#00fff0', '#ff007a', '#f4ff00', '#19ff5f', '#2458ff', '#ffffff', '#ff5a00']
  const softLineColors = [
    'rgba(255, 255, 255, 0.2)',
    'rgba(0, 255, 240, 0.24)',
    'rgba(255, 0, 122, 0.22)',
    'rgba(25, 255, 95, 0.2)',
    'rgba(36, 88, 255, 0.22)',
    'rgba(3, 3, 3, 0.76)',
  ]
  const motion = (jumpRangeX: number, jumpRangeY: number, minDuration: number, maxDuration: number) => {
    const jumpX = fixed(between(-jumpRangeX, jumpRangeX), 1)
    return {
      '--fragment-jump-x': `${jumpX}px`,
      '--fragment-reverse-x': `${fixed(jumpX * -0.54, 1)}px`,
      '--fragment-jump-y': `${fixed(between(-jumpRangeY, jumpRangeY), 1)}px`,
      '--fragment-duration': `${intBetween(minDuration, maxDuration)}ms`,
      '--fragment-delay': `-${intBetween(0, maxDuration)}ms`,
    } satisfies ImmersiveFragmentStyle
  }

  for (let i = 0; i < fineLineCount; i += 1) {
    const top = backdropTop(0.025)
    const protectedZone = inContentZone(top)
    const sourceZone = inSourceZone(top)
    const edgeOnly = protectedZone && !sourceZone && rng() > 0.08
    const quiet = sourceZone ? 0.04 : edgeOnly ? 0.42 : quietFactor(top)
    const mediaLine = rng() > 0.58
    const hot = !protectedZone && rng() > 0.9
    const long = rng() > 0.78
    const height = rng() > 0.9 ? between(0.5, 1) : between(0.14, 0.4)
    const width = long ? between(isCompact ? 26 : 38, isCompact ? 88 : 118) : between(3, isCompact ? 36 : 58)
    const left = edgeOnly
      ? rng() > 0.5
        ? between(-30, 8)
        : between(82, 116)
      : between(-28, 116)
    const lineWidth = edgeOnly ? Math.min(width, between(12, isCompact ? 32 : 44)) : width

    fragments.push({
      id: `fine-${i}`,
      className: 'random-immersive-fragment random-immersive-fragment--fine',
      style: {
        left: `${fixed(left)}%`,
        top: `${fixed(top)}%`,
        width: `${fixed(lineWidth)}vw`,
        height: `${fixed(height, 2)}px`,
        backgroundImage: mediaLine ? undefined : 'none',
        backgroundColor: mediaLine ? undefined : softLineColors[intBetween(0, softLineColors.length - 1)],
        backgroundPosition: `${fixed(between(-28, 126))}% ${fixed(top + between(-16, 16))}%`,
        backgroundSize: `${intBetween(100, 240)}vw ${intBetween(96, 220)}vh`,
        filter: mediaLine
          ? `saturate(${fixed(between(1.05, hot ? 2.8 : 1.7), 2)}) contrast(${fixed(between(1.02, 1.55), 2)}) brightness(${fixed(hot ? between(0.58, 1.02) : between(0.14, 0.5), 2)}) hue-rotate(${intBetween(-42, 46)}deg)`
          : undefined,
        mixBlendMode: hot ? 'screen' : mediaLine ? 'hard-light' : rng() > 0.7 ? 'screen' : 'normal',
        '--fragment-opacity': fixed(between(hot ? 0.28 : 0.12, hot ? 0.58 : 0.38) * quiet, 2),
        '--fragment-pop-opacity': fixed(between(0.32, 0.54) * quiet, 2),
        '--fragment-transform': `translate3d(${fixed(between(-8, 8), 1)}px, 0, 0)`,
      },
    })
  }

  for (let i = 0; i < lowerFineLineCount; i += 1) {
    const top = between(lowerLineTop, lowerChaosBottom)
    const mediaLine = rng() > 0.72
    const long = rng() > 0.66
    const bright = rng() > 0.88
    const height = rng() > 0.93 ? between(0.5, 0.86) : between(0.16, 0.42)
    const width = long ? between(isCompact ? 22 : 30, isCompact ? 92 : 122) : between(5, isCompact ? 46 : 66)
    const opacity = mediaLine ? between(0.22, bright ? 0.58 : 0.4) : between(0.2, bright ? 0.52 : 0.38)

    fragments.push({
      id: `lower-fine-${i}`,
      className: 'random-immersive-fragment random-immersive-fragment--fine random-immersive-fragment--lower-fine',
      style: {
        left: `${fixed(between(-30, 118))}%`,
        top: `${fixed(top)}%`,
        width: `${fixed(width)}vw`,
        height: `${fixed(height, 2)}px`,
        backgroundImage: mediaLine ? undefined : 'none',
        backgroundColor: mediaLine ? undefined : softLineColors[intBetween(0, softLineColors.length - 1)],
        backgroundPosition: `${fixed(between(-34, 132))}% ${fixed(top + between(-9, 9))}%`,
        backgroundSize: `${intBetween(104, 220)}vw ${intBetween(96, 190)}vh`,
        filter: mediaLine
          ? `saturate(${fixed(between(1.25, bright ? 2.65 : 1.85), 2)}) contrast(${fixed(between(1.08, 1.75), 2)}) brightness(${fixed(bright ? between(0.62, 1.05) : between(0.22, 0.62), 2)}) hue-rotate(${intBetween(-48, 52)}deg)`
          : undefined,
        mixBlendMode: mediaLine || bright ? 'screen' : rng() > 0.72 ? 'hard-light' : 'normal',
        '--fragment-opacity': fixed(opacity, 2),
        '--fragment-pop-opacity': fixed(opacity, 2),
        '--fragment-transform': `translate3d(${fixed(between(-7, 7), 1)}px, 0, 0)`,
      },
    })
  }

  for (let i = 0; i < tearCount; i += 1) {
    const hot = rng() > 0.82
    const smear = rng() > 0.9
    const width = isCompact ? between(12, 96) : between(8, 82)
    const height = smear ? between(2.4, 7.2) : between(0.5, 2.3)
    const top = backdropTop(0.02)
    const quiet = quietFactor(top)
    const left = between(-26, 112)
    const hue = hot ? intBetween(-92, 86) : intBetween(-30, 32)
    const transform = `translate3d(${fixed(between(-18, 18), 1)}px, ${fixed(between(-1.5, 1.5), 1)}px, 0)`

    fragments.push({
      id: `tear-${i}`,
      className: `random-immersive-fragment random-immersive-fragment--tear${hot ? ' random-immersive-fragment--hot' : ''}${smear ? ' random-immersive-fragment--smear' : ''}`,
      style: {
        left: `${fixed(left)}%`,
        top: `${fixed(top)}%`,
        width: `${fixed(width)}vw`,
        height: `${fixed(height, 2)}px`,
        backgroundPosition: `${fixed(between(-20, 120))}% ${fixed(top + between(-24, 24))}%`,
        backgroundSize: `${intBetween(86, 210)}vw ${intBetween(92, 210)}vh`,
        filter: `saturate(${fixed(between(1.7, 4.1), 2)}) contrast(${fixed(between(1.25, 2.2), 2)}) brightness(${fixed(hot ? between(0.98, 1.48) : between(0.36, 0.86), 2)}) hue-rotate(${hue}deg)`,
        mixBlendMode: hot ? blends[intBetween(0, blends.length - 2)] : 'screen',
        '--fragment-opacity': fixed(between(0.2, hot ? 0.72 : 0.52) * quiet, 2),
        '--fragment-pop-opacity': fixed(between(0.62, 0.9) * quiet, 2),
        '--fragment-transform': transform,
        ...motion(18, 3, 8200, 22000),
      },
    })
  }

  for (let cluster = 0; cluster < clusterCount; cluster += 1) {
    const clusterTop = rng() > 0.52 ? between(-2, contentZoneTop - 4) : between(lowerBlockTop, lowerBlockBottom)
    const clusterLeft = between(-3, 92)
    const parts = lite
      ? intBetween(3, 5)
      : intBetween(isCompact ? 5 : 6, isCompact ? 8 : 9)
    const clusterWidth = between(isCompact ? 20 : 28, isCompact ? 72 : 108)
    const clusterHeight = between(20, isCompact ? 78 : 108)

    for (let part = 0; part < parts; part += 1) {
      const bright = rng() > 0.48
      const wide = rng() > 0.38
      const width = wide ? between(38, isCompact ? 150 : 260) : between(9, isCompact ? 56 : 86)
      const height = rng() > 0.68 ? between(12, 42) : between(3, 16)
      const localLeft = between(0, clusterWidth)
      const localTop = between(0, clusterHeight)
      const transform = `translate3d(${fixed(between(-12, 12), 1)}px, ${fixed(between(-4, 4), 1)}px, 0)`

      fragments.push({
        id: `cluster-${cluster}-${part}`,
        className: `random-immersive-fragment random-immersive-fragment--block random-immersive-fragment--cluster-block${bright ? ' random-immersive-fragment--hot' : ''}`,
        style: {
          left: `calc(${fixed(clusterLeft)}% + ${fixed(localLeft, 1)}px)`,
          top: `calc(${fixed(clusterTop)}% + ${fixed(localTop, 1)}px)`,
          width: `${fixed(width, 1)}px`,
          height: `${fixed(height, 1)}px`,
          backgroundPosition: `${fixed(clusterLeft + between(-16, 16))}% ${fixed(clusterTop + between(-12, 12))}%`,
          backgroundSize: `${intBetween(88, 146)}vw ${intBetween(88, 146)}vh`,
          filter: `saturate(${fixed(between(2.1, 4.7), 2)}) contrast(${fixed(between(1.35, 2.45), 2)}) brightness(${fixed(bright ? between(1.02, 1.62) : between(0.52, 1), 2)}) hue-rotate(${intBetween(-104, 112)}deg)`,
          mixBlendMode: bright ? 'screen' : 'hard-light',
          '--fragment-opacity': fixed(between(0.58, bright ? 0.98 : 0.86), 2),
          '--fragment-pop-opacity': fixed(between(0.74, 1), 2),
          '--fragment-transform': transform,
          ...motion(20, 5, 6200, 18000),
        },
      })
    }
  }

  for (let i = 0; i < voidCount; i += 1) {
    const strip = rng() > 0.08
    const top = backdropTop(0.015)
    const quiet = quietFactor(top)
    const left = between(-20, 105)
    const width = strip ? between(18, 92) : between(8, 32)
    const height = strip ? between(1, 8) : between(5, 18)

    fragments.push({
      id: `void-${i}`,
      className: 'random-immersive-fragment random-immersive-fragment--void',
      style: {
        left: `${fixed(left)}%`,
        top: `${fixed(top)}%`,
        width: strip ? `${fixed(width)}vw` : `${fixed(width, 1)}vw`,
        height: strip ? `${fixed(height, 1)}px` : `${fixed(height, 1)}px`,
        backgroundImage: 'none',
        backgroundColor: rng() > 0.18 ? '#030303' : '#101010',
        mixBlendMode: 'normal',
        '--fragment-opacity': fixed(between(0.52, 0.9) * quiet, 2),
        '--fragment-pop-opacity': fixed(between(0.62, 0.96) * quiet, 2),
        '--fragment-transform': `translate3d(${fixed(between(-12, 12), 1)}px, ${fixed(between(-2, 2), 1)}px, 0)`,
        ...motion(18, 3, 9000, 24000),
      },
    })
  }

  for (let i = 0; i < signalCount; i += 1) {
    const color = signalColors[intBetween(0, signalColors.length - 1)]
    const altColor = signalColors[intBetween(0, signalColors.length - 1)]
    const top = backdropTop(0.015)
    const quiet = quietFactor(top)

    fragments.push({
      id: `signal-${i}`,
      className: 'random-immersive-fragment random-immersive-fragment--signal random-immersive-fragment--signal-bar',
      style: {
        left: `${fixed(between(-4, 102))}%`,
        top: `${fixed(top)}%`,
        width: `${fixed(between(8, isCompact ? 62 : 78))}vw`,
        height: `${fixed(between(1, 4.8), 2)}px`,
        backgroundImage: 'none',
        mixBlendMode: rng() > 0.36 ? 'screen' : 'normal',
        '--fragment-color': color,
        '--fragment-alt-color': altColor,
        '--fragment-opacity': fixed(between(0.38, 0.82) * quiet, 2),
        '--fragment-pop-opacity': fixed(between(0.68, 0.96) * quiet, 2),
        '--fragment-transform': `translate3d(${fixed(between(-12, 12), 1)}px, ${fixed(between(-2, 2), 1)}px, 0)`,
        ...motion(16, 3, 7600, 21000),
      },
    })
  }

  // These final lines add density without another media layer, filter, or animation.
  for (let i = 0; i < extraUpperLineCount; i += 1) {
    fragments.push({
      id: `extra-upper-fine-${i}`,
      className: 'random-immersive-fragment random-immersive-fragment--fine',
      style: {
        left: `${fixed(between(-8, 96))}%`,
        top: `${fixed(between(-1, Math.max(1, contentZoneTop - 1)))}%`,
        width: `${fixed(between(5, isCompact ? 40 : 56))}vw`,
        height: `${fixed(between(0.12, 0.3), 2)}px`,
        backgroundImage: 'none',
        backgroundColor: softLineColors[intBetween(0, softLineColors.length - 1)],
        mixBlendMode: 'normal',
        '--fragment-opacity': fixed(between(0.14, 0.3), 2),
        '--fragment-pop-opacity': fixed(between(0.14, 0.3), 2),
        '--fragment-transform': 'translate3d(0, 0, 0)',
      },
    })
  }

  for (let i = 0; i < extraLowerLineCount; i += 1) {
    fragments.push({
      id: `extra-lower-fine-${i}`,
      className: 'random-immersive-fragment random-immersive-fragment--fine random-immersive-fragment--lower-fine',
      style: {
        left: `${fixed(between(-10, 98))}%`,
        top: `${fixed(between(lowerLineTop, lowerChaosBottom))}%`,
        width: `${fixed(between(6, isCompact ? 44 : 62))}vw`,
        height: `${fixed(between(0.12, 0.32), 2)}px`,
        backgroundImage: 'none',
        backgroundColor: softLineColors[intBetween(0, softLineColors.length - 1)],
        mixBlendMode: 'normal',
        '--fragment-opacity': fixed(between(0.15, 0.32), 2),
        '--fragment-pop-opacity': fixed(between(0.15, 0.32), 2),
        '--fragment-transform': 'translate3d(0, 0, 0)',
      },
    })
  }

  return fragments
}

function randDiffIdx(max: number, not: number) {
  if (max <= 1) return 0
  let i = randIdx(max)
  if (i === not) i = (i + 1 + randIdx(max - 1)) % max
  return i
}

const PREFETCH_STORAGE_PREFIX = 'random-prefetch-'

function shortenText(text: string, maxWords: number) {
  const words = text.trim().split(/\s+/)
  const slice = words.slice(0, maxWords)
  const snippet = slice.join(' ')
  const cleaned = snippet.replace(/[.,!?;:–-]+$/, '')
  return words.length > maxWords ? `${cleaned}…` : cleaned
}

const isQuizFactItem = (item: RandomContentItem): item is FactItem =>
  item.type === 'fact' && (item as FactItem).variant === 'quiz'
const isTextFactItem = (item: RandomContentItem): item is FactItem =>
  item.type === 'fact' && (item as FactItem).variant !== 'quiz'

function SourceLine({ item }: { item: DisplayItem }) {
  if (item.type === 'encourage') return null
  if (item.type === 'minigame') return null
  if (item.type === 'quote' && item.author) return <span>— {item.author}</span>
  const isQuizFact = item.type === 'fact' && (item as FactItem).variant === 'quiz'

  if (item.type === 'image') {
    const normalizedProvider = (item.provider || item.source?.name || '').toLowerCase()
    const giphyHref = item.source?.url || item.pageUrl || item.link || item.url || null
    if (normalizedProvider === 'giphy' && giphyHref) {
      return (
        <div className="w-full bg-black flex items-center justify-center" style={{ height: '2.6rem' }}>
          <a
            href={giphyHref}
            target="_blank"
            rel="noreferrer"
            aria-label="View on Giphy"
            className="inline-flex items-center justify-center px-4"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={GIPHY_ATTRIBUTION_BADGE}
              alt="Powered by GIPHY"
              className="h-10 w-auto"
              loading="lazy"
              decoding="async"
            />
          </a>
        </div>
      )
    }
  }

  const baseSource: SourceInfo = item.source ?? null
  const fallbackSource: SourceInfo = baseSource ?? (item.provider ? { name: item.provider } : null)

  const snippet = item.type === 'video' && item.text ? shortenText(item.text, 5) : null

  const parts: ReactNode[] = []

  if (fallbackSource?.url) {
    try {
      const host = new URL(fallbackSource.url).host.replace(/^www\./, '')
      parts.push(
        <span key="source-link">
          {fallbackSource.name ? `${fallbackSource.name} · ` : ''}
          <a href={fallbackSource.url} target="_blank" rel="noreferrer" className="underline">
            {host}
          </a>
        </span>
      )
    } catch {
      parts.push(
        <span key="source-fallback">{fallbackSource.name || fallbackSource.url}</span>
      )
    }
  } else if (fallbackSource?.name) {
    parts.push(<span key="source-name">{fallbackSource.name}</span>)
  }

  if (snippet) {
    parts.push(<span key="snippet">{snippet}</span>)
  }

  if (!parts.length) return null

  const rendered: ReactNode[] = []
  parts.forEach((part, idx) => {
    if (idx > 0) rendered.push(<span key={`dot-${idx}`} className="opacity-60">·</span>)
    rendered.push(part)
  })
  if (isQuizFact) {
    return (
      <span className="inline-flex flex-wrap items-center justify-center gap-[6px] opacity-80">
        <span>Source :</span>
        {rendered}
      </span>
    )
  }

  return <span className="inline-flex flex-wrap items-center justify-center gap-[6px] opacity-80">{rendered}</span>
}

function ImageBlock({
  src,
  alt,
  height,
  onError,
}: {
  src: string
  alt?: string
  height: string
  onError?: () => void
}) {
  return (
    <div
      className="overflow-hidden"
      style={{ height, width: '100%' }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt || 'image'}
        className="block h-full w-full object-cover select-none"
        loading="eager"
        decoding="async"
        onError={onError}
      />
    </div>
  )
}

const getFullscreenElement = () => {
  if (typeof document === 'undefined') return null
  const doc = document as Document & {
    webkitFullscreenElement?: Element | null
    mozFullScreenElement?: Element | null
    msFullscreenElement?: Element | null
  }
  return doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement || null
}

async function attemptFullscreen(element: HTMLElement | null): Promise<boolean> {
  if (!element) return false
  const anyEl = element as HTMLElement & {
    requestFullscreen?: () => Promise<void>
    webkitRequestFullscreen?: () => void
    msRequestFullscreen?: () => void
    webkitEnterFullscreen?: () => void
  }
  let invoked = false
  try {
    if (typeof anyEl.requestFullscreen === 'function') {
      await anyEl.requestFullscreen()
      invoked = true
    } else if (typeof anyEl.webkitRequestFullscreen === 'function') {
      anyEl.webkitRequestFullscreen()
      invoked = true
    } else if (typeof anyEl.msRequestFullscreen === 'function') {
      anyEl.msRequestFullscreen()
      invoked = true
    } else if (typeof anyEl.webkitEnterFullscreen === 'function') {
      anyEl.webkitEnterFullscreen()
      invoked = true
    }
  } catch {
    invoked = false
  }

  if (!invoked) return false

  // wait a tick to allow fullscreen state to update
  await new Promise((resolve) => setTimeout(resolve, 150))
  const fs = getFullscreenElement()
  if (!fs) return false
  if (fs === element) return true
  if (Boolean(fs.contains(element)) || Boolean(element.contains(fs))) return true
  return false
}

function exitNativeFullscreen() {
  if (typeof document === 'undefined' || !getFullscreenElement()) return
  const doc = document as Document & {
    exitFullscreen?: () => Promise<void>
    webkitExitFullscreen?: () => void
    msExitFullscreen?: () => void
  }
  try {
    if (typeof doc.exitFullscreen === 'function') {
      void doc.exitFullscreen()
    } else if (typeof doc.webkitExitFullscreen === 'function') {
      doc.webkitExitFullscreen()
    } else if (typeof doc.msExitFullscreen === 'function') {
      doc.msExitFullscreen()
    }
  } catch {
    /* ignore */
  }
}

function openProviderUrl(url?: string | null) {
  if (!url || typeof window === 'undefined') return
  try {
    window.open(url, '_blank', 'noopener,noreferrer')
  } catch {
    /* ignore */
  }
}

function VideoFullscreenIconButton({
  label,
  onClick,
  offsetForSound = false,
  hidden = false,
}: {
  label: string
  onClick: () => void
  offsetForSound?: boolean
  hidden?: boolean
}) {
  if (hidden) return null

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onClick()
      }}
      className="rounded-full bg-black/60 text-white shadow-lg hover:bg-black/75"
      style={{
        position: 'absolute',
        top: '12px',
        right: offsetForSound ? '148px' : '16px',
        zIndex: 4,
        pointerEvents: 'auto',
        touchAction: 'manipulation',
        width: '44px',
        height: '40px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={FULLSCREEN_ICON} alt="" aria-hidden="true" style={{ width: '20px', height: '20px' }} />
    </button>
  )
}

function VideoFullscreenBrand({ visible }: { visible: boolean }) {
  if (!visible) return null

  return (
    <div className="video-fullscreen-brand" aria-hidden="true">
      {VIDEO_FULLSCREEN_LOGO_LETTERS.map((letter) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={letter} src={`/logo/${letter}1.svg`} alt="" draggable={false} />
      ))}
    </div>
  )
}

const shouldBypassNativeFullscreen = () => {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || navigator.vendor || ''
  const isiOS = /iP(ad|hone|od)/.test(ua)
  const isIpadOnMac = /Mac/.test(navigator.platform) && navigator.maxTouchPoints > 1
  return isiOS || isIpadOnMac
}

const VIDEO_SOUND_WAKE_DELAYS = [80, 320, 900, 1600]

function postEmbedMessage(iframe: HTMLIFrameElement | null, payload: unknown) {
  try {
    iframe?.contentWindow?.postMessage(JSON.stringify(payload), '*')
  } catch {
    /* ignore */
  }
}

function parseEmbedMessage(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null
    } catch {
      return null
    }
  }
  return value && typeof value === 'object' ? value as Record<string, unknown> : null
}

function isYouTubeMessageOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname.toLowerCase()
    return host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtube-nocookie.com' || host.endsWith('.youtube-nocookie.com')
  } catch {
    return false
  }
}

function wakeYouTubeSound(iframe: HTMLIFrameElement | null) {
  postEmbedMessage(iframe, { event: 'command', func: 'unMute', args: [] })
  postEmbedMessage(iframe, { event: 'command', func: 'setVolume', args: [100] })
  postEmbedMessage(iframe, { event: 'command', func: 'playVideo', args: [] })
}

function subscribeToYouTubeEvents(iframe: HTMLIFrameElement | null, playerId: string) {
  postEmbedMessage(iframe, { event: 'listening', id: playerId })
  for (const eventName of ['onReady', 'onStateChange', 'onError', 'onAutoplayBlocked']) {
    postEmbedMessage(iframe, { event: 'command', func: 'addEventListener', args: [eventName] })
  }
}

function wakeDailymotionSound(iframe: HTMLIFrameElement | null) {
  postEmbedMessage(iframe, { command: 'setMuted', parameters: [false] })
  postEmbedMessage(iframe, { command: 'setVolume', parameters: [1] })
  postEmbedMessage(iframe, { command: 'play' })
}

function scheduleVideoSoundWake(wake: () => void) {
  if (typeof window === 'undefined') return () => undefined
  const timers = VIDEO_SOUND_WAKE_DELAYS.map((delay) => window.setTimeout(wake, delay))
  return () => {
    timers.forEach((timer) => window.clearTimeout(timer))
  }
}

function useVideoEmbedWatchdog(
  embedKey: string,
  item: VideoContentItem,
  onPlaybackIssue?: PlaybackIssueHandler,
) {
  const [loaded, setLoaded] = useState(false)
  const [reloadNonce, setReloadNonce] = useState(0)
  const reportedRef = useRef(false)

  useEffect(() => {
    setLoaded(false)
    setReloadNonce(0)
    reportedRef.current = false
  }, [embedKey])

  useEffect(() => {
    if (loaded) return undefined
    const timeout = setTimeout(() => {
      if (reloadNonce === 0) {
        setReloadNonce(1)
        return
      }
      if (!reportedRef.current) {
        reportedRef.current = true
        onPlaybackIssue?.(item, { reason: 'video-load-timeout' })
      }
    }, reloadNonce === 0 ? 5000 : 7000)

    return () => clearTimeout(timeout)
  }, [embedKey, item, loaded, onPlaybackIssue, reloadNonce])

  const markLoaded = useCallback(() => setLoaded(true), [])

  return { loaded, markLoaded, reloadNonce }
}

function VideoEmbed({
  item,
  frameHeight,
  soundMuted,
  fullscreenLabel,
  disableFullscreen,
  isFullscreenActive,
  onOpenFullscreen,
  onCloseFullscreen,
  onVideoSoundUnlocked,
  onPlaybackIssue,
}: {
  item: VideoContentItem
  frameHeight: string
  soundMuted: boolean
  fullscreenLabel: string
  disableFullscreen: boolean
  isFullscreenActive: boolean
  onOpenFullscreen?: (payload: FullscreenVideoPayload) => void
  onCloseFullscreen?: () => void
  onVideoSoundUnlocked?: () => void
  onPlaybackIssue?: PlaybackIssueHandler
}) {
  const provider = (item.provider || '').toLowerCase()
  const url = item.url
  if (!url) return null

  const looksYouTube = provider.includes('youtube') || /youtu\.?be/.test(url)
  const looksDailymotion = !looksYouTube && (provider.includes('dailymotion') || /dailymotion\.com|dai\.ly/.test(url))

  if (looksYouTube) {
    return (
      <YouTubeEmbed
        item={item}
        frameHeight={frameHeight}
        soundMuted={soundMuted}
        fullscreenLabel={fullscreenLabel}
        disableFullscreen={disableFullscreen}
        isFullscreenActive={isFullscreenActive}
        onFullscreenFallback={onOpenFullscreen}
        onCloseFullscreen={onCloseFullscreen}
        onVideoSoundUnlocked={onVideoSoundUnlocked}
        onPlaybackIssue={onPlaybackIssue}
      />
    )
  }

  if (looksDailymotion) {
    return (
      <DailymotionEmbed
        item={item}
        frameHeight={frameHeight}
        soundMuted={soundMuted}
        fullscreenLabel={fullscreenLabel}
        disableFullscreen={disableFullscreen}
        isFullscreenActive={isFullscreenActive}
        onFullscreenFallback={onOpenFullscreen}
        onCloseFullscreen={onCloseFullscreen}
        onVideoSoundUnlocked={onVideoSoundUnlocked}
        onPlaybackIssue={onPlaybackIssue}
      />
    )
  }

  return (
    <HtmlVideoEmbed
      item={item}
      frameHeight={frameHeight}
      soundMuted={soundMuted}
      fullscreenLabel={fullscreenLabel}
      isFullscreenActive={isFullscreenActive}
      onOpenFullscreen={onOpenFullscreen}
      onCloseFullscreen={onCloseFullscreen}
      onVideoSoundUnlocked={onVideoSoundUnlocked}
      onPlaybackIssue={onPlaybackIssue}
    />
  )
}

function YouTubeEmbed({
  item,
  frameHeight,
  soundMuted,
  fullscreenLabel,
  disableFullscreen,
  isFullscreenActive,
  onFullscreenFallback,
  onCloseFullscreen,
  onVideoSoundUnlocked,
  onPlaybackIssue,
}: {
  item: VideoContentItem
  frameHeight: string
  soundMuted: boolean
  fullscreenLabel: string
  disableFullscreen: boolean
  isFullscreenActive: boolean
  onFullscreenFallback?: (payload: FullscreenVideoPayload) => void
  onCloseFullscreen?: () => void
  onVideoSoundUnlocked?: () => void
  onPlaybackIssue?: PlaybackIssueHandler
}) {
  const { url, text } = item
  const shellRef = useRef<HTMLDivElement | null>(null)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const reactPlayerId = useId()
  const playerId = useMemo(() => `random-youtube-${reactPlayerId.replace(/[^a-zA-Z0-9_-]/g, '')}`, [reactPlayerId])
  const preservePlayerOnUnmuteRef = useRef(false)
  const muteOnIOSPlaybackStart = shouldBypassNativeFullscreen()
  const soundMutedRef = useRef(soundMuted)
  const [originParam, setOriginParam] = useState('')
  const [isMuted, setIsMuted] = useState(soundMuted || muteOnIOSPlaybackStart)
  const [embedMuted, setEmbedMuted] = useState(soundMuted || muteOnIOSPlaybackStart)
  const [playerReady, setPlayerReady] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOriginParam(window.location.origin)
    }
  }, [])

  useEffect(() => {
    soundMutedRef.current = soundMuted
    if (preservePlayerOnUnmuteRef.current && !soundMuted) {
      preservePlayerOnUnmuteRef.current = false
      return
    }
    const nextMuted = soundMuted || muteOnIOSPlaybackStart
    setIsMuted(nextMuted)
    setEmbedMuted(nextMuted)
  }, [muteOnIOSPlaybackStart, soundMuted])

  useEffect(() => {
    const nextMuted = soundMutedRef.current || muteOnIOSPlaybackStart
    setIsMuted(nextMuted)
    setEmbedMuted(nextMuted)
    preservePlayerOnUnmuteRef.current = false
    setPlayerReady(false)
  }, [muteOnIOSPlaybackStart, url])

  const videoId = useMemo(() => {
    return extractYouTubeVideoId(url) || ''
  }, [url])

  const src = useMemo(() => {
    const params = new URLSearchParams({
      rel: '0',
      autoplay: '1',
      mute: embedMuted ? '1' : '0',
      controls: '1',
      fs: '1',
      playsinline: '1',
      modestbranding: '1',
      enablejsapi: '1',
    })
    if (originParam) params.set('origin', originParam)
    return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`
  }, [videoId, embedMuted, originParam])
  const { loaded: iframeLoaded, markLoaded, reloadNonce } = useVideoEmbedWatchdog(src, item, onPlaybackIssue)
  const posterUrl = useMemo(() => getImmersiveBackgroundImage(item, null), [item])

  const announcePlayer = useCallback(() => {
    markLoaded()
    subscribeToYouTubeEvents(iframeRef.current, playerId)
  }, [markLoaded, playerId])

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const iframeWindow = iframeRef.current?.contentWindow
      if (!iframeWindow || event.source !== iframeWindow || !isYouTubeMessageOrigin(event.origin)) return
      const payload = parseEmbedMessage(event.data)
      if (!payload || (payload.id && payload.id !== playerId)) return

      if (payload.event === 'onReady' || payload.event === 'onStateChange') {
        markLoaded()
        setPlayerReady(true)
      }
      if (payload.event !== 'onError') return

      const rawCode = payload.info ?? payload.data
      const playerCode = typeof rawCode === 'number' ? rawCode : Number(rawCode)
      onPlaybackIssue?.(item, {
        reason: 'youtube-player-error',
        ...(Number.isFinite(playerCode) ? { playerCode } : {}),
      })
    }

    window.addEventListener('message', handleMessage)
    const timers = [0, 250, 900].map((delay) => window.setTimeout(() => {
      subscribeToYouTubeEvents(iframeRef.current, playerId)
    }, delay))
    return () => {
      window.removeEventListener('message', handleMessage)
      timers.forEach((timer) => window.clearTimeout(timer))
    }
  }, [item, markLoaded, onPlaybackIssue, playerId, src])

  useEffect(() => {
    if (!iframeLoaded || playerReady) return undefined
    const timer = window.setTimeout(() => setPlayerReady(true), 900)
    return () => window.clearTimeout(timer)
  }, [iframeLoaded, playerReady])

  const requestSound = useCallback(() => {
    wakeYouTubeSound(iframeRef.current)
  }, [])

  useEffect(() => {
    if (isMuted) return undefined
    return scheduleVideoSoundWake(requestSound)
  }, [isMuted, requestSound, src])

  useEffect(() => {
    if (!isFullscreenActive || isMuted) return undefined
    return scheduleVideoSoundWake(requestSound)
  }, [isFullscreenActive, isMuted, requestSound])

  const unmute = () => {
    preservePlayerOnUnmuteRef.current = true
    requestSound()
    onVideoSoundUnlocked?.()
    setIsMuted(false)
  }

  const handleFullscreen = async () => {
    if (!isMuted) requestSound()
    if (!disableFullscreen && !shouldBypassNativeFullscreen()) {
      await attemptFullscreen(shellRef.current)
    }
    if (onFullscreenFallback) {
      onFullscreenFallback({ kind: 'youtube', src, title: text })
      return
    }
    openProviderUrl(item.url)
  }

  return (
    <div
      ref={shellRef}
      className={`video-embed-shell w-full h-full${isFullscreenActive ? ' video-embed-shell--fullscreen' : ''}`}
      style={{ position: 'relative', height: isFullscreenActive ? undefined : frameHeight }}
    >
      <div
        className="video-embed-player w-full h-full"
        style={{
          position: 'relative',
          overflow: 'hidden',
          height: isFullscreenActive ? undefined : frameHeight,
        }}
      >
        {posterUrl ? (
          <div
            className="video-embed-poster"
            style={{
              backgroundImage: cssImageUrl(posterUrl),
              opacity: playerReady ? 0 : 1,
              zIndex: 2,
            }}
          />
        ) : null}
        <iframe
          key={`${src}-${reloadNonce}`}
          id={playerId}
          ref={iframeRef}
          src={src}
          onLoad={announcePlayer}
          className="absolute top-1/2 left-1/2"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          title={text || 'Video'}
          style={{
            border: 'none',
            width: '177.8%',
            height: '100%',
            transform: 'translate(-50%, -50%)',
            zIndex: 1,
          }}
        />
        <VideoFullscreenIconButton
          label={fullscreenLabel}
          onClick={handleFullscreen}
          offsetForSound={isMuted}
          hidden={isFullscreenActive}
        />
        {isFullscreenActive ? (
          <button
            type="button"
            aria-label="Close video"
            className="video-fullscreen-close"
            onClick={onCloseFullscreen}
          >
            ×
          </button>
        ) : null}
        {isMuted ? (
          <button
            type="button"
            onClick={unmute}
            className="rounded-full bg-black/60 px-4 py-2 text-xs sm:text-sm font-semibold uppercase tracking-wide text-white shadow-lg hover:bg-black/75"
            style={{ position: 'absolute', top: '12px', right: '16px', zIndex: 3, pointerEvents: 'auto', minWidth: '120px', textAlign: 'center' }}
          >
            Tap to unmute
          </button>
        ) : null}
      </div>
      <VideoFullscreenBrand visible={isFullscreenActive} />
    </div>
  )
}

function DailymotionEmbed({
  item,
  frameHeight,
  soundMuted,
  fullscreenLabel,
  disableFullscreen,
  isFullscreenActive,
  onFullscreenFallback,
  onCloseFullscreen,
  onVideoSoundUnlocked,
  onPlaybackIssue,
}: {
  item: VideoContentItem
  frameHeight: string
  soundMuted: boolean
  fullscreenLabel: string
  disableFullscreen: boolean
  isFullscreenActive: boolean
  onFullscreenFallback?: (payload: FullscreenVideoPayload) => void
  onCloseFullscreen?: () => void
  onVideoSoundUnlocked?: () => void
  onPlaybackIssue?: PlaybackIssueHandler
}) {
  const { url, text } = item
  const shellRef = useRef<HTMLDivElement | null>(null)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const preservePlayerOnUnmuteRef = useRef(false)
  const soundMutedRef = useRef(soundMuted)
  const [isMuted, setIsMuted] = useState(soundMuted)
  const [embedMuted, setEmbedMuted] = useState(soundMuted)

  useEffect(() => {
    soundMutedRef.current = soundMuted
    setIsMuted(soundMuted)
    if (preservePlayerOnUnmuteRef.current && !soundMuted) {
      preservePlayerOnUnmuteRef.current = false
      return
    }
    setEmbedMuted(soundMuted)
  }, [soundMuted])

  useEffect(() => {
    const nextMuted = soundMutedRef.current
    setIsMuted(nextMuted)
    setEmbedMuted(nextMuted)
    preservePlayerOnUnmuteRef.current = false
  }, [url])

  const embedUrl = useMemo(() => {
    try {
      const videoId = extractDailymotionVideoId(url) || ''
      const params = new URLSearchParams()
      params.set('autoplay', '1')
      params.set('mute', embedMuted ? '1' : '0')
      params.set('controls', '1')
      params.set('queue-enable', '0')
      params.set('sharing-enable', '0')
      params.set('ui-logo', '0')
      params.set('ui-start-screen-info', 'false')
      params.set('ui-start-screen-controls', 'true')
      params.set('quality', '480')
      params.set('playsinline', '1')
      return videoId
        ? `https://www.dailymotion.com/embed/video/${videoId}?${params.toString()}`
        : url
    } catch {
      return url
    }
  }, [embedMuted, url])
  const { loaded: iframeLoaded, markLoaded, reloadNonce } = useVideoEmbedWatchdog(embedUrl, item, onPlaybackIssue)
  const posterUrl = useMemo(() => getImmersiveBackgroundImage(item, null), [item])

  const requestSound = useCallback(() => {
    wakeDailymotionSound(iframeRef.current)
  }, [])

  useEffect(() => {
    if (isMuted) return undefined
    return scheduleVideoSoundWake(requestSound)
  }, [embedUrl, isMuted, requestSound])

  useEffect(() => {
    if (!isFullscreenActive || isMuted) return undefined
    return scheduleVideoSoundWake(requestSound)
  }, [isFullscreenActive, isMuted, requestSound])

  const handleFullscreen = async () => {
    if (!isMuted) requestSound()
    if (!disableFullscreen && !shouldBypassNativeFullscreen()) {
      await attemptFullscreen(shellRef.current)
    }
    if (onFullscreenFallback) {
      onFullscreenFallback({ kind: 'dailymotion', src: embedUrl, title: text })
      return
    }
    openProviderUrl(item.url)
  }

  const unmute = () => {
    preservePlayerOnUnmuteRef.current = true
    requestSound()
    onVideoSoundUnlocked?.()
    setIsMuted(false)
  }

  return (
    <div
      ref={shellRef}
      className={`video-embed-shell w-full h-full${isFullscreenActive ? ' video-embed-shell--fullscreen' : ''}`}
      style={{ position: 'relative', height: isFullscreenActive ? undefined : frameHeight }}
    >
      <div
        className="video-embed-player w-full h-full"
        style={{
          position: 'relative',
          overflow: 'hidden',
          height: isFullscreenActive ? undefined : frameHeight,
        }}
      >
        {posterUrl ? (
          <div
            className="video-embed-poster"
            style={{
              backgroundImage: cssImageUrl(posterUrl),
              opacity: iframeLoaded ? 0 : 1,
            }}
          />
        ) : null}
        <iframe
          key={`${embedUrl}-${reloadNonce}`}
          ref={iframeRef}
          src={embedUrl}
          onLoad={markLoaded}
          className="absolute top-1/2 left-1/2"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          title={text || 'Video'}
          style={{
            border: 'none',
            width: '177.8%',
            height: '100%',
            transform: 'translate(-50%, -50%)',
            zIndex: 1,
          }}
        />
        <VideoFullscreenIconButton
          label={fullscreenLabel}
          onClick={handleFullscreen}
          offsetForSound={isMuted}
          hidden={isFullscreenActive}
        />
        {isFullscreenActive ? (
          <button
            type="button"
            aria-label="Close video"
            className="video-fullscreen-close"
            onClick={onCloseFullscreen}
          >
            ×
          </button>
        ) : null}
        {isMuted ? (
          <button
            type="button"
            onClick={unmute}
            className="rounded-full bg-black/60 px-4 py-2 text-xs sm:text-sm font-semibold uppercase tracking-wide text-white shadow-lg hover:bg-black/75"
            style={{ position: 'absolute', top: '12px', right: '16px', zIndex: 3, pointerEvents: 'auto', minWidth: '120px', textAlign: 'center' }}
          >
            Tap to unmute
          </button>
        ) : null}
      </div>
      <VideoFullscreenBrand visible={isFullscreenActive} />
    </div>
  )
}

function HtmlVideoEmbed({
  item,
  frameHeight,
  soundMuted,
  fullscreenLabel,
  isFullscreenActive,
  onOpenFullscreen,
  onCloseFullscreen,
  onVideoSoundUnlocked,
  onPlaybackIssue,
}: {
  item: VideoContentItem
  frameHeight: string
  soundMuted: boolean
  fullscreenLabel: string
  isFullscreenActive: boolean
  onOpenFullscreen?: (payload: FullscreenVideoPayload) => void
  onCloseFullscreen?: () => void
  onVideoSoundUnlocked?: () => void
  onPlaybackIssue?: PlaybackIssueHandler
}) {
  const shellRef = useRef<HTMLDivElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [isMuted, setIsMuted] = useState(soundMuted)
  const shouldAutoPlay = useMemo(() => {
    const provider = (item.provider || '').toLowerCase()
    return provider.includes('pixabay') || provider.includes('pexels')
  }, [item.provider])

  useEffect(() => {
    setIsMuted(soundMuted)
  }, [soundMuted, item.url])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.setAttribute('playsinline', 'true')
    video.setAttribute('webkit-playsinline', 'true')
    video.setAttribute('x5-playsinline', 'true')
    if (shouldAutoPlay) {
      video.muted = isMuted
      const playPromise = video.play()
      if (playPromise) playPromise.catch(() => undefined)
    } else {
      video.pause()
    }
  }, [isMuted, item.url, shouldAutoPlay])

  const unmute = () => {
    const video = videoRef.current
    if (video) {
      video.muted = false
      const playPromise = video.play()
      if (playPromise) playPromise.catch(() => undefined)
    }
    onVideoSoundUnlocked?.()
    setIsMuted(false)
  }

  const handleFullscreen = async () => {
    const video = videoRef.current
    if (!isMuted) {
      const playPromise = video?.play()
      if (playPromise) playPromise.catch(() => undefined)
    }
    if (!shouldBypassNativeFullscreen()) {
      await attemptFullscreen(shellRef.current)
    }
    if (onOpenFullscreen) {
      onOpenFullscreen({ kind: 'html', src: item.url || '', title: item.text })
      return
    }
    openProviderUrl(item.url)
  }

  return (
    <div
      ref={shellRef}
      className={`video-embed-shell w-full h-full${isFullscreenActive ? ' video-embed-shell--fullscreen' : ''}`}
      style={{ position: 'relative', height: isFullscreenActive ? undefined : frameHeight }}
    >
      <div
        className="video-embed-player w-full h-full"
        style={{
          position: 'relative',
          overflow: 'hidden',
          height: isFullscreenActive ? undefined : frameHeight,
        }}
      >
        <video
          ref={videoRef}
          controls
          playsInline
          autoPlay={shouldAutoPlay}
          muted={shouldAutoPlay && isMuted}
          className="absolute top-1/2 left-1/2"
          style={{
            backgroundColor: '#000',
            width: '177.8%',
            height: '100%',
            transform: 'translate(-50%, -50%)',
          }}
          poster={item.thumbUrl ?? undefined}
          controlsList="nodownload"
          disablePictureInPicture
          onError={() => onPlaybackIssue?.(item, { reason: 'video-error' })}
        >
          <source src={item.url} />
        </video>
        <VideoFullscreenIconButton
          label={fullscreenLabel}
          onClick={handleFullscreen}
          offsetForSound={shouldAutoPlay && isMuted}
          hidden={isFullscreenActive}
        />
        {isFullscreenActive ? (
          <button
            type="button"
            aria-label="Close video"
            className="video-fullscreen-close"
            onClick={onCloseFullscreen}
          >
            ×
          </button>
        ) : null}
        {shouldAutoPlay && isMuted ? (
          <button
            type="button"
            onClick={unmute}
            className="rounded-full bg-black/60 px-4 py-2 text-xs sm:text-sm font-semibold uppercase tracking-wide text-white shadow-lg hover:bg-black/75"
            style={{ position: 'absolute', top: '12px', right: '16px', zIndex: 3, pointerEvents: 'auto', minWidth: '120px', textAlign: 'center' }}
          >
            Tap to unmute
          </button>
        ) : null}
      </div>
      <VideoFullscreenBrand visible={isFullscreenActive} />
    </div>
  )
}

function ContentRenderer({
  item,
  theme,
  frameHeight,
  viewportWidth,
  soundMuted,
  fullscreenLabel,
  disableFullscreen,
  isFullscreenActive,
  onOpenFullscreen,
  onCloseFullscreen,
  onVideoSoundUnlocked,
  onPlaybackIssue,
}: {
  item: DisplayItem
  theme: { cream: string; text: string; deep: string; bg: string }
  frameHeight: string
  viewportWidth: number | null
  soundMuted: boolean
  fullscreenLabel: string
  disableFullscreen: boolean
  isFullscreenActive: boolean
  onOpenFullscreen?: (payload: FullscreenVideoPayload) => void
  onCloseFullscreen?: () => void
  onVideoSoundUnlocked?: () => void
  onPlaybackIssue?: PlaybackIssueHandler
}) {
  if (item.type === 'encourage') {
    const encourageStyle: EncourageStyle = {
      height: '100%',
      '--encourage-height': frameHeight,
    }
    const desktop = viewportWidth != null && viewportWidth >= 1024
    const tablet = viewportWidth != null && viewportWidth >= 768 && viewportWidth < 1024
    const iconMaxHeight = desktop ? '60vh' : tablet ? '32vh' : '33vh'
    const iconMaxWidth = desktop
      ? 'min(780px, 60vw)'
      : tablet
        ? 'min(320px, 50vw)'
        : 'min(280px, 70vw)'
    return (
      <div key={item.text} className="h-full w-full px-5 sm:px-8" style={encourageStyle}>
        <div className="encourage-layout encourage-active flex h-full w-full flex-col items-center justify-center gap-4 text-center md:flex-row md:items-center md:justify-center">
          {item.icon ? (
            <div
              className="encourage-icon-wrapper encourage-icon-glitch"
              style={{
                maxWidth: iconMaxWidth,
                width: iconMaxWidth,
                height: iconMaxHeight,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.icon}
                alt="Encouragement"
                className="encourage-icon"
                loading="lazy"
                decoding="async"
                style={{
                  height: '100%',
                  width: '100%',
                  objectFit: 'contain',
                }}
              />
            </div>
          ) : null}
          {item.text ? (
            <div className="encourage-copy-wrapper">
              <p
                className="encourage-copy font-tomorrow font-bold leading-snug"
                style={{ color: theme.cream, letterSpacing: '.01em' }}
              >
                {item.text}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  if (item.type === 'image') {
    const src = item.url || item.thumbUrl || ''
    if (!src) return null
    const alt = item.title || 'image'

    return (
      <div className="h-full w-full flex items-center justify-center" style={{ height: '100%' }}>
        <ImageBlock
          src={src}
          alt={alt}
          height={frameHeight}
          onError={() => reportImageLoadIssue(item, 'image-load-error', src)}
        />
      </div>
    )
  }

  if (item.type === 'quote') {
    const disclaimer = item.disclaimer || (item.ai?.source ? `Généré par IA – ${item.ai.source}` : null)
    return (
      <div className="h-full w-full flex flex-col items-center justify-center px-6 text-center" style={{ height: '100%' }}>
        <blockquote
          className="max-w-[80ch] font-tomorrow font-bold text-[22px] md:text-[32px] leading-snug"
          style={{ color: theme.cream, letterSpacing: '.01em' }}
        >
          “{item.text}”
        </blockquote>
        {item.author ? (
          <p className="mt-3 text-sm font-inter opacity-80" style={{ color: theme.cream }}>
            — {item.author}
          </p>
        ) : null}
        {disclaimer ? (
          <p className="mt-3 text-xs font-inter opacity-75" style={{ color: theme.cream }}>
            {disclaimer}
          </p>
        ) : null}
      </div>
    )
  }

  if (item.type === 'fact') {
    const fact = item as FactItem
    if (fact.variant === 'quiz') {
      return (
        <div
          className="h-full w-full px-4"
          style={{ height: '100%', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}
        >
          <FactQuizCard item={fact as FactQuizItem} theme={theme} />
        </div>
      )
    }
    const disclaimer = fact.disclaimer || (fact.ai?.source ? `Généré par IA – ${fact.ai.source}` : null)
    return (
      <div className="h-full w-full flex flex-col items-center justify-center px-6 text-center" style={{ height: '100%' }}>
        <p
          className="max-w-[85ch] font-tomorrow font-bold text-[20px] md:text-[28px] leading-snug"
          style={{ color: theme.cream, letterSpacing: '.01em' }}
        >
          {fact.text}
        </p>
        {disclaimer ? (
          <p className="mt-3 text-xs font-inter opacity-75" style={{ color: theme.cream }}>
            {disclaimer}
          </p>
        ) : null}
      </div>
    )
  }

  if (item.type === 'joke') {
    const disclaimer = item.disclaimer || (item.ai?.source ? `Généré par IA – ${item.ai.source}` : null)
    return (
      <div className="h-full w-full flex flex-col items-center justify-center px-6 text-center" style={{ height: '100%' }}>
        <p
          className="max-w-[85ch] font-tomorrow font-bold text-[20px] md:text-[28px] leading-snug"
          style={{ color: theme.cream, letterSpacing: '.01em' }}
        >
          {item.text}
        </p>
        {disclaimer ? (
          <div
            className="mt-3 max-w-sm px-3 py-2 text-xs"
            style={{
              backgroundColor: '#b1001f',
              color: '#fff5f5',
              fontFamily: "var(--font-inter-tight), 'Inter Tight', sans-serif",
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            {disclaimer}
          </div>
        ) : null}
      </div>
    )
  }

  if (item.type === 'minigame') {
    return (
      <div
        className="h-full w-full px-4"
        style={{ height: '100%', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}
      >
        <MiniGameCard item={item} theme={theme} />
      </div>
    )
  }

  if (item.type === 'web') {
    const href = item.url
    let host = item.host || ''
    if (!host && href) {
      try {
        host = new URL(href).hostname.replace(/^www\./, '')
      } catch {}
    }
    const webImageHeight = `calc(${frameHeight} - 120px)`
    return (
      <div
        className="h-full w-full flex flex-col items-center justify-center gap-4 text-center"
        style={{ height: '100%' }}
      >
        {item.ogImage ? (
          <div className="w-full">
            <ImageBlock
              src={item.ogImage}
              alt={item.text || host || 'web'}
              height={webImageHeight}
            />
          </div>
        ) : null}
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="px-5 sm:px-6 underline font-inter text-xl md:text-2xl break-words"
            style={{ color: theme.cream }}
          >
            {item.text || host || href}
          </a>
        ) : (
          <p
            className="px-5 sm:px-6 font-inter text-lg md:text-xl"
            style={{ color: theme.cream }}
          >
            {item.text}
          </p>
        )}
      </div>
    )
  }

  if (item.type === 'video') {
    return (
      <VideoEmbed
        item={item}
        frameHeight={frameHeight}
        soundMuted={soundMuted}
        fullscreenLabel={fullscreenLabel}
        disableFullscreen={disableFullscreen}
        isFullscreenActive={isFullscreenActive}
        onOpenFullscreen={onOpenFullscreen}
        onCloseFullscreen={onCloseFullscreen}
        onVideoSoundUnlocked={onVideoSoundUnlocked}
        onPlaybackIssue={onPlaybackIssue}
      />
    )
  }

  return null
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

export function RandomExperience({ effectsTestMode = false }: { effectsTestMode?: boolean }) {
  const { dict, locale, locales, setLocale, t } = useI18n()
  const { addAction, addPoints, maybeSpawnDiamond, quizScore, score } = useScore()
  const { consent } = useCookieConsent()

  const [menuOpen, setMenuOpen] = useState(false)
  const [languagesOpen, setLanguagesOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const selectedTypes = ALL_ITEM_TYPES
  const [themeIdx, setThemeIdx] = useState(() => randIdx(THEMES.length))
  const [currentItem, setCurrentItem] = useState<DisplayItem | null>(null)
  const currentItemRef = useRef<DisplayItem | null>(null)
  const footerAdCounterRef = useRef(0)
  const [footerAdVisible, setFooterAdVisible] = useState(false)
  const [trigger, setTrigger] = useState(0)
  const [isSecond, setIsSecond] = useState(false)
  const [liked, setLiked] = useState(false)
  const [loading, setLoading] = useState(true)
  const loadPendingRef = useRef(false)
  const transitionLockedRef = useRef(false)
  const [transitionLocked, setTransitionLocked] = useState(false)
  const randomReadyQueueRef = useRef<PreparedRandomEntry[]>([])
  const randomReadyPromiseRef = useRef<Promise<void> | null>(null)
  const randomReadyGenerationRef = useRef(0)
  const randomReadyWaitersRef = useRef<Array<() => void>>([])
  const playbackIssueCountsRef = useRef<Record<string, number>>({})
  const playbackRecoveryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const initialLoadTriggeredRef = useRef(false)
  const [viewportWidth, setViewportWidth] = useState<number | null>(null)
  const [effectsProfile, setEffectsProfile] = useState<EffectsProfile>('standard')
  const [effectsTestStep, setEffectsTestStep] = useState(0)
  const effectsTestStepRef = useRef(0)
  const [progressionDraws, setProgressionDraws] = useState(0)
  const progressionDrawsRef = useRef(0)
  const [burgerGlitch, setBurgerGlitch] = useState(false)
  const [burgerPointPulse, setBurgerPointPulse] = useState(false)
  const [encourage3dEvent, setEncourage3dEvent] = useState<Encourage3DEvent | null>(null)
  const encourage3dSequenceRef = useRef(0)
  const previousEncourage3dMainRef = useRef<string | null>(null)
  const menuButtonRef = useRef<HTMLButtonElement | null>(null)
  const [heartGlitch, setHeartGlitch] = useState(false)
  const [waveMode, setWaveMode] = useState(false)
  const [waveRemaining, setWaveRemaining] = useState(0)
  const waveModeRef = useRef(false)
  const waveRemainingRef = useRef(0)
  const [waveTransitionActive, setWaveTransitionActive] = useState(false)
  const waveAnchorRef = useRef<WaveSimilarityHint | null>(null)
  const waveAnchorItemRef = useRef<Exclude<RandomContentItem, MiniGameItem> | null>(null)
  const waveQueueRef = useRef<RandomContentItem[]>([])
  const wavePreparationGenerationRef = useRef(0)
  const wavePreparationAbortRef = useRef<AbortController | null>(null)
  const wavePreparationPromiseRef = useRef<Promise<boolean> | null>(null)
  const wavePreparationKeyRef = useRef<string | null>(null)
  const wavePreparedAnchorKeyRef = useRef<string | null>(null)
  const waveHistoryKeysRef = useRef<Set<string>>(new Set())
  const waveHistoryIdsRef = useRef<Set<string>>(new Set())
  const waveShownAtRef = useRef(0)
  const [pageGlitchActive, setPageGlitchActive] = useState(false)
  const [pageGlitchCycle, setPageGlitchCycle] = useState(0)
  const [pageGlitchBars, setPageGlitchBars] = useState<GlitchBar[]>(() => [])
  const [fullscreenVideo, setFullscreenVideo] = useState<FullscreenVideoPayload | null>(null)
  const [soundMuted, setSoundMuted] = useState(false)
  const fullscreenTriggerRef = useRef(trigger)
  const [disableFullscreenButton, setDisableFullscreenButton] = useState(false)
  const adsAllowed = consent?.ads === true

  const progressionIntensity = useMemo(
    () => effectsTestMode
      ? progressionForStep(effectsTestStep)
      : progressionForDraws(progressionDraws),
    [effectsTestMode, effectsTestStep, progressionDraws],
  )
  const effectiveProgressionIntensity = effectsProfile === 'webkit-lite'
    ? progressionIntensity * 0.72
    : progressionIntensity

  useEffect(() => {
    if (!effectsTestMode) return
    let restored = 0
    try {
      restored = Number.parseInt(sessionStorage.getItem(EFFECTS_TEST_STORAGE_KEY) || '0', 10)
    } catch {
      restored = 0
    }
    const next = Math.max(0, Math.min(EFFECTS_TEST_MAX_STEPS, Number.isFinite(restored) ? restored : 0))
    effectsTestStepRef.current = next
    setEffectsTestStep(next)
  }, [effectsTestMode])

  const setTestProgress = useCallback((step: number) => {
    if (!effectsTestMode) return
    const next = Math.max(0, Math.min(EFFECTS_TEST_MAX_STEPS, Math.round(step)))
    effectsTestStepRef.current = next
    setEffectsTestStep(next)
    try {
      sessionStorage.setItem(EFFECTS_TEST_STORAGE_KEY, String(next))
    } catch {
      /* Test progression can still work without session storage. */
    }
  }, [effectsTestMode])

  useEffect(() => {
    if (!adsAllowed) {
      setFooterAdVisible(false)
      footerAdCounterRef.current = 0
    }
  }, [adsAllowed])

  useEffect(() => {
    currentItemRef.current = currentItem
  }, [currentItem])

  useEffect(() => {
    waveModeRef.current = waveMode
    waveRemainingRef.current = waveRemaining
  }, [waveMode, waveRemaining])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const readSoundPref = () => {
      try {
        return localStorage.getItem(SOUND_STORAGE_KEY) === 'true'
      } catch {
        return false
      }
    }
    const initial = readSoundPref()
    setSoundMuted(initial)
    setMuted(initial)
    const handler = (event: StorageEvent) => {
      if (event.key === SOUND_STORAGE_KEY && event.newValue != null) {
        const next = event.newValue === 'true'
        setSoundMuted(next)
        setMuted(next)
      }
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

  const toggleSound = () => {
    setSoundMuted((prev) => {
      const next = !prev
      setMuted(next)
      try {
        localStorage.setItem(SOUND_STORAGE_KEY, String(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }

  const unlockVideoSound = useCallback(() => {
    setSoundMuted(false)
    setMuted(false)
    try {
      localStorage.setItem(SOUND_STORAGE_KEY, 'false')
    } catch {
      /* ignore */
    }
  }, [])

  const theme = THEMES[themeIdx]
  const contentHeight = useMemo(() => {
    const base = 'clamp(260px, 45vh, 560px)'
    if (viewportWidth == null) return base
    if (viewportWidth >= 1400) return 'clamp(357px, 61vh, 697px)'
    if (viewportWidth >= 1200) return 'clamp(323px, 57.8vh, 646px)'
    if (viewportWidth >= 992) return 'clamp(289px, 53vh, 595px)'
    if (viewportWidth >= 768) return 'clamp(300px, 55vh, 640px)'
    return base
  }, [viewportWidth])

  const contentFrameStyle = useMemo(() => ({
    height: contentHeight,
    borderRadius: 0,
    overflow: 'visible',
    backgroundColor: 'transparent',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }), [contentHeight])

  useEffect(() => {
    setDisableFullscreenButton(shouldBypassNativeFullscreen())
    setEffectsProfile(shouldUseWebkitLiteEffects() ? 'webkit-lite' : 'standard')
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const update = () => setViewportWidth(window.innerWidth)
    update()
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.removeItem('random:selectedTypes')
    } catch {
      /* ignore */
    }
  }, [])

  const navLabels = useMemo(() => ({
    images: t('nav.images', 'images'),
    videos: t('nav.videos', 'videos'),
    web: t('nav.web', 'web'),
    quotes: t('nav.quotes', 'quotes'),
    jokes: t('nav.jokes', 'funny jokes'),
    facts: t('nav.facts', 'facts'),
    other: t('nav.other', 'other'),
    encourage: t('nav.encourage', 'keep going'),
  }), [t])

  const shareLabel = useMemo(() => t('modal.share', 'Share'), [t])
  const likeLabel = useMemo(() => t('modal.like', 'Like'), [t])
  const waveLabel = useMemo(() => t('modal.wave', 'Wave'), [t])
  const randomAgainLabel = useMemo(() => t('modal.randomAgain', 'RANDOM AGAIN'), [t])
  const likesLabel = useMemo(() => t('likes.title', 'Likes'), [t])
  const legalLabel = useMemo(() => t('legal.title', 'Legal notice'), [t])
  const languageLabel = useMemo(() => t('language.title', 'Language'), [t])
  const fullscreenLabel = useMemo(() => t('video.fullscreen', 'Fullscreen'), [t])
  const quizScoreText = useMemo(() => `${quizScore} PTS`, [quizScore])
  const scoreText = useMemo(() => `${score} PTS`, [score])
  const langVersionRef = useRef(0)
  const encourageQueueRef = useRef<string[]>([])
  const miniGameStateRef = useRef<{
    totalContent: number
    jokeDisplays: number
    gamesServed: number
    pool: MiniGameId[]
    gameLevels: Record<MiniGameId, number>
    globalLevel: number
    gamesAtCurrentLevel: number
  }>({
    totalContent: 0,
    jokeDisplays: 0,
    gamesServed: 0,
    pool: shuffleArray([...MINI_GAME_IDS]),
    gameLevels: Object.create(null) as Record<MiniGameId, number>,
    globalLevel: 1,
    gamesAtCurrentLevel: 0,
  })

const sequenceStateRef = useRef<RandomSequenceState>(createInitialSequenceState())
  const burgerGlitchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const burgerPointPulseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const heartGlitchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pageGlitchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const waveTransitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const initialRetryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const makePageGlitchBars = useCallback((mode: 'normal' | 'boost' = 'normal', progression = 0): GlitchBar[] => {
    const lite = effectsProfile === 'webkit-lite'
    const rawEnergy = mode === 'boost' ? Math.max(1, progression) : Math.max(0, progression)
    const energy = clampProgress(rawEnergy)
    const overdrive = clampOverdrive(rawEnergy - 1)
    const normalMin = lite ? 10 : 18
    const normalMax = lite ? 14 : 24
    const boostMin = lite ? 24 : 40
    const boostMax = lite ? 30 : 48
    const extraMin = Math.round(overdrive * (lite ? 7 : 12))
    const extraMax = Math.round(overdrive * (lite ? 9 : 15))
    const count = randomInt(
      Math.round(lerp(normalMin, boostMin, energy)) + extraMin,
      Math.round(lerp(normalMax, boostMax, energy)) + extraMax,
    )
    const stamp = Date.now()

    const gradientForSet = (colors: [string, string, string], variant: GlitchBar['variant']) => {
      const [c1, c2, c3] = colors
      if (variant === 'void') return 'linear-gradient(90deg, #020202 0% 100%)'
      if (variant === 'signal') {
        const stopA = randomBetween(14, 30)
        const stopB = randomBetween(stopA + 8, 54)
        const stopC = randomBetween(stopB + 4, 76)
        return `linear-gradient(90deg, transparent 0% ${stopA.toFixed(0)}%, ${c1} ${stopA.toFixed(0)}% ${stopB.toFixed(0)}%, #fff ${stopB.toFixed(0)}% ${(stopB + 3).toFixed(0)}%, #050505 ${(stopB + 3).toFixed(0)}% ${stopC.toFixed(0)}%, ${c2} ${stopC.toFixed(0)}% 100%)`
      }
      if (variant === 'block') {
        const stopA = randomBetween(18, 42)
        const stopB = randomBetween(stopA + 12, 82)
        return `linear-gradient(90deg, ${c1} 0% ${stopA.toFixed(0)}%, #030303 ${stopA.toFixed(0)}% ${(stopA + 5).toFixed(0)}%, ${c2} ${(stopA + 5).toFixed(0)}% ${stopB.toFixed(0)}%, ${c3} ${stopB.toFixed(0)}% 100%)`
      }
      const stopA = randomBetween(18, 46)
      const stopB = randomBetween(stopA + 5, 92)
      return `linear-gradient(90deg, transparent 0% 2%, ${c1} 2% ${stopA.toFixed(0)}%, ${c2} ${stopA.toFixed(0)}% ${stopB.toFixed(0)}%, transparent ${stopB.toFixed(0)}% 100%)`
    }

    return Array.from({ length: count }, (_, index) => {
      const palette = GLITCH_COLOR_SETS[randIdx(GLITCH_COLOR_SETS.length)]
      const roll = Math.random()
      const variant: GlitchBar['variant'] = roll > lerp(0.85, 0.7, energy) - overdrive * 0.08
        ? 'block'
        : roll > lerp(0.65, 0.52, energy) - overdrive * 0.07
          ? 'signal'
          : roll > lerp(0.55, 0.45, energy) - overdrive * 0.04
            ? 'void'
            : 'line'
      const wideThreshold = Math.round(lerp(4, 10, energy) + overdrive * 4)
      const wideChance = (variant === 'line' ? 0.38 : variant === 'signal' ? 0.58 : 0.26)
        + energy * 0.14
      const wide = index < wideThreshold || Math.random() < wideChance
      const widthValue = Math.min(140, (variant === 'block'
        ? randomBetween(4, lerp(18, 30, energy))
        : wide
          ? randomBetween(
              lerp(36, 56, energy),
              lerp(110, 132, energy),
            )
          : randomBetween(5, lerp(32, 46, energy))) * (1 + overdrive * 0.08))
      const maxLeft = Math.max(-6, 100 - widthValue)
      const leftValue = randomBetween(variant === 'block' ? -2 : -9, maxLeft)
      const topValue = randomBetween(1, 98)
      const heightValue = variant === 'block'
        ? randomBetween(lerp(4, 6, energy), lerp(15, 26, energy) + overdrive * 10)
        : variant === 'signal'
          ? randomBetween(1.8, lerp(4.2, 6.2, energy) + overdrive * 2)
          : variant === 'void'
            ? randomBetween(1.8, lerp(6, 10, energy) + overdrive * 1.2)
            : randomBetween(0.65, lerp(1.7, 2.7, energy) + overdrive * 0.8)
      const delay = Math.round(randomBetween(
        0,
        lerp(lite ? 40 : 60, lite ? 78 : 100, energy)
          + overdrive * (lite ? 18 : 30),
      ))
      const duration = Math.round(randomBetween(
        lerp(
          lite ? 160 : 190,
          lite ? 230 : 275,
          energy,
        ) + overdrive * (lite ? 45 : 70),
        lerp(
          lite ? 250 : 300,
          lite ? 390 : 480,
          energy,
        ) + overdrive * (lite ? 70 : 100),
      ))
      const shiftValue = randomBetween(
        lerp(wide ? 14 : 5, wide ? 30 : 13, energy),
        lerp(wide ? 30 : 16, wide ? 64 : 32, energy)
          + overdrive * (wide ? 28 : 14),
      )
      const yShiftValue = variant === 'block'
        ? randomBetween(-3.5, 3.5)
        : randomBetween(-1.2, 1.2)
      const opacity = parseFloat(
        randomBetween(
          variant === 'line' ? 0.42 : variant === 'void' ? 0.64 : 0.62,
          lerp(0.9, 0.96, energy),
        ).toFixed(2)
      )
      const popOpacity = parseFloat(Math.min(1, opacity + randomBetween(0.08, 0.28)).toFixed(2))

      return {
        id: `${stamp}-${index}-${Math.random().toString(16).slice(2, 6)}`,
        variant,
        top: `${topValue.toFixed(2)}%`,
        width: `${widthValue.toFixed(2)}%`,
        left: `${leftValue.toFixed(2)}%`,
        height: `${heightValue.toFixed(2)}px`,
        background: gradientForSet(palette, variant),
        delay,
        duration,
        shift: `${shiftValue.toFixed(1)}px`,
        yShift: `${yShiftValue.toFixed(1)}px`,
        opacity,
        popOpacity,
      }
    })
  }, [effectsProfile])

  const triggerBurgerGlitch = useCallback(() => {
    setBurgerGlitch(true)
    if (burgerGlitchTimeoutRef.current) clearTimeout(burgerGlitchTimeoutRef.current)
    burgerGlitchTimeoutRef.current = setTimeout(() => setBurgerGlitch(false), 380)
  }, [])

  const queueTestEncourage3D = useCallback((step: number) => {
    if (!effectsTestMode) return
    encourage3dSequenceRef.current += 1
    const next = createTestEncourage3DEvent(
      step,
      encourage3dSequenceRef.current,
      previousEncourage3dMainRef.current,
    )
    previousEncourage3dMainRef.current = next.main.id
    setMenuOpen(false)
    setShareOpen(false)
    setEncourage3dEvent(next)
  }, [effectsTestMode])

  const handleEncourage3DAward = useCallback((points: number) => {
    addPoints(points)
    triggerBurgerGlitch()
    setBurgerPointPulse(true)
    if (burgerPointPulseTimeoutRef.current) clearTimeout(burgerPointPulseTimeoutRef.current)
    burgerPointPulseTimeoutRef.current = setTimeout(() => setBurgerPointPulse(false), 620)
  }, [addPoints, triggerBurgerGlitch])

  const handleEncourage3DComplete = useCallback(() => {
    setEncourage3dEvent(null)
  }, [])

  const triggerHeartGlitch = useCallback(() => {
    setHeartGlitch(true)
    if (heartGlitchTimeoutRef.current) clearTimeout(heartGlitchTimeoutRef.current)
    heartGlitchTimeoutRef.current = setTimeout(() => setHeartGlitch(false), 420)
  }, [])

  const triggerPageGlitch = useCallback((mode: 'normal' | 'boost' = 'normal', progression = 0) => {
    const rawEnergy = mode === 'boost' ? Math.max(1, progression) : Math.max(0, progression)
    const energy = clampProgress(rawEnergy)
    const overdrive = clampOverdrive(rawEnergy - 1)
    const bars = makePageGlitchBars(mode, rawEnergy)
    setPageGlitchBars(bars)
    setPageGlitchCycle((cycle) => cycle + 1)
    setPageGlitchActive(true)
    if (pageGlitchTimeoutRef.current) clearTimeout(pageGlitchTimeoutRef.current)
    const longest = bars.reduce((max, bar) => Math.max(max, bar.duration + bar.delay), 0)
    const lite = effectsProfile === 'webkit-lite'
    const peak = lite ? 520 : 620
    const base = Math.round(lerp(lite ? 300 : 370, peak, energy) + overdrive * (lite ? 100 : 180))
    const tail = Math.round(lerp(40, 70, energy) + overdrive * 20)
    const total = Math.max(base, (longest || base) + tail)
    pageGlitchTimeoutRef.current = setTimeout(() => setPageGlitchActive(false), total)
  }, [effectsProfile, makePageGlitchBars])

  const triggerWaveTransition = useCallback(() => {
    if (waveTransitionTimeoutRef.current) clearTimeout(waveTransitionTimeoutRef.current)
    setWaveTransitionActive(false)
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        setWaveTransitionActive(true)
        waveTransitionTimeoutRef.current = setTimeout(() => {
          setWaveTransitionActive(false)
          waveTransitionTimeoutRef.current = null
        }, effectsProfile === 'webkit-lite' ? 360 : 520)
      })
    })
  }, [effectsProfile])

  const openFullscreen = useCallback((payload: FullscreenVideoPayload) => {
    setFullscreenVideo(payload)
  }, [])

  const closeFullscreen = useCallback(() => {
    setFullscreenVideo(null)
    exitNativeFullscreen()
  }, [])

  useEffect(() => {
    const initial = randIdx(THEMES.length)
    setThemeIdx(initial)
  }, [])

  useEffect(() => {
    const readyWaiters = randomReadyWaitersRef.current
    return () => {
      if (burgerGlitchTimeoutRef.current) clearTimeout(burgerGlitchTimeoutRef.current)
      if (heartGlitchTimeoutRef.current) clearTimeout(heartGlitchTimeoutRef.current)
      if (pageGlitchTimeoutRef.current) clearTimeout(pageGlitchTimeoutRef.current)
      if (waveTransitionTimeoutRef.current) clearTimeout(waveTransitionTimeoutRef.current)
      if (initialRetryTimeoutRef.current) clearTimeout(initialRetryTimeoutRef.current)
      if (playbackRecoveryTimeoutRef.current) clearTimeout(playbackRecoveryTimeoutRef.current)
      randomReadyGenerationRef.current += 1
      readyWaiters.splice(0).forEach((resolve) => resolve())
      wavePreparationAbortRef.current?.abort()
    }
  }, [])

  const encourageMessages = useMemo(() => {
    const fallback = FALLBACK_ENCOURAGE_MESSAGES
    if (!dict || typeof dict !== 'object') return fallback
    const dictionary = dict as Record<string, unknown>
    const encourageBlock = dictionary.encourage as { messages?: unknown }
    const candidate = encourageBlock?.messages
    if (!Array.isArray(candidate)) return fallback
    const cleaned = candidate.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    return cleaned.length ? cleaned : fallback
  }, [dict])

  useEffect(() => {
    encourageQueueRef.current = shuffleArray(encourageMessages)
  }, [encourageMessages])

  useEffect(() => {
    if (!fullscreenVideo) return undefined
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeFullscreen()
      }
    }
    const onFullscreenChange = () => {
      if (!getFullscreenElement()) setFullscreenVideo(null)
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('fullscreenchange', onFullscreenChange)
    document.addEventListener('webkitfullscreenchange', onFullscreenChange)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange)
    }
  }, [closeFullscreen, fullscreenVideo])

  useEffect(() => {
    if (fullscreenTriggerRef.current === trigger) return
    fullscreenTriggerRef.current = trigger
    if (fullscreenVideo) closeFullscreen()
  }, [closeFullscreen, fullscreenVideo, trigger])

  const pickEncourageMessage = useCallback(() => {
    if (!encourageQueueRef.current.length) {
      encourageQueueRef.current = shuffleArray(encourageMessages)
    }
    return encourageQueueRef.current.shift() ?? FALLBACK_ENCOURAGE_MESSAGES[0]
  }, [encourageMessages])

  const pickEncourageIcon = useCallback((encourageIndex: number) => {
    const groups = Math.max(1, Math.ceil(ENCOURAGE_ICON_TOTAL / ENCOURAGE_GROUP_SIZE))
    const bucket = Math.min(encourageIndex - 1, groups - 1)
    const start = bucket * ENCOURAGE_GROUP_SIZE + 1
    const end = Math.min(start + ENCOURAGE_GROUP_SIZE - 1, ENCOURAGE_ICON_TOTAL)
    const span = Math.max(1, end - start + 1)
    return `/encourage/${start + Math.floor(Math.random() * span)}.png`
  }, [])

  const buildEncourageItem = useCallback((encourageIndex: number): EncourageItem => ({
    type: 'encourage',
    text: pickEncourageMessage(),
    icon: pickEncourageIcon(encourageIndex),
  }), [pickEncourageIcon, pickEncourageMessage])

  const allowedTypes = useMemo(() => {
    const set = new Set<ItemType>(selectedTypes.length ? selectedTypes : ALL_ITEM_TYPES)
    return set
  }, [selectedTypes])

  const getNextSlot = useCallback((): SequenceSlot | null => {
    const state = sequenceStateRef.current
    let seq = state.cycle
    if (!seq.length) return { kind: 'content', itemType: 'image' }

    let step = state.step
    let round = state.round
    if (step >= seq.length) {
      seq = createRandomSequence()
      step = 0
      round += 1
    }
    const currentInterval = state.currentInterval ?? (ENCOURAGE_INTERVALS[0] ?? 15)
    const progress = state.sinceEncourage ?? 0
    const currentDraws = state.draws ?? 0
    const shouldEncourage = ENCOURAGE_PAGES_ENABLED && progress >= currentInterval

    if (shouldEncourage) {
      const encourageRound = round + 1
      const encourage = state.encourage + 1
      const normalizedStep = step % seq.length

      const nextIndex = state.intervalIndex != null ? state.intervalIndex + 1 : 1
      const nextInterval = ENCOURAGE_INTERVALS[nextIndex % ENCOURAGE_INTERVALS.length] ?? currentInterval

      sequenceStateRef.current = {
        cycle: seq,
        step: normalizedStep,
        round: encourageRound,
        encourage,
        draws: currentDraws,
        sinceEncourage: 0,
        currentInterval: nextInterval,
        intervalIndex: nextIndex,
      }
      return { kind: 'encourage', round: encourageRound, encourageIndex: encourage }
    }

    const resolveEntry = (entry: SequenceEntry): { itemType: ItemType; requireQuiz?: boolean } | null => {
      if (entry.kind === 'fixed') {
        return allowedTypes.has(entry.itemType) ? { itemType: entry.itemType } : null
      }
      if (entry.kind === 'quiz') {
        if (!allowedTypes.has(entry.itemType)) return null
        return { itemType: entry.itemType, requireQuiz: true }
      }
      if (entry.kind === 'text') {
        const available = TEXT_ITEM_TYPES.filter((type) => allowedTypes.has(type))
        if (!available.length) return null
        return { itemType: available[randIdx(available.length)] }
      }
      return null
    }

    let chosenSlot: { itemType: ItemType; requireQuiz?: boolean } | null = null
    let nextStep = step
    for (let attempt = 0; attempt < seq.length; attempt++) {
      const entry = seq[nextStep % seq.length]
      nextStep += 1
      const resolved = resolveEntry(entry)
      if (resolved) {
        chosenSlot = resolved
        break
      }
    }

    if (!chosenSlot) {
      const fallback = selectedTypes[0] ?? 'fact'
      chosenSlot = { itemType: fallback }
    }

    sequenceStateRef.current = {
      cycle: seq,
      step: nextStep,
      round,
      encourage: state.encourage,
      draws: currentDraws + 1,
      sinceEncourage: progress + 1,
      currentInterval,
      intervalIndex: state.intervalIndex ?? 0,
    }
    return {
      kind: 'content',
      itemType: chosenSlot.itemType,
      requireQuiz: chosenSlot.requireQuiz,
      strong: currentDraws < STRONG_POOL_INITIAL_DRAWS,
      videoPool:
        chosenSlot.itemType === 'video' && currentDraws < STRONG_POOL_INITIAL_DRAWS
          ? INITIAL_VIDEO_POOLS[currentDraws] ?? 'fresh'
          : undefined,
    }
  }, [allowedTypes, selectedTypes])

  const preloadQueuesRef = useRef<Record<ItemType, RandomContentItem[]>>({
    image: [],
    video: [],
    joke: [],
    fact: [],
    quote: [],
    web: [],
  })
  const recentKeysRef = useRef<string[]>([])
  const recentKeySetRef = useRef<Set<string>>(new Set())

  const clearPreloadedCaches = useCallback(() => {
    for (const type of ALL_ITEM_TYPES) {
      preloadQueuesRef.current[type] = []
    }
    recentKeysRef.current = []
    recentKeySetRef.current = new Set()
  }, [])

  const getContentKey = useCallback((item: RandomContentItem): string => {
    if (item.type === 'image') return ['image', item.url, item.pageUrl, item.link, item.thumbUrl].filter(Boolean).join('|')
    if (item.type === 'video') return ['video', item.url, item.provider, item.source?.url].filter(Boolean).join('|')
    if (item.type === 'quote') return ['quote', item.text, item.author, item.provider].filter(Boolean).join('|')
    if (item.type === 'joke') return ['joke', item.text, item.provider].filter(Boolean).join('|')
    if (item.type === 'fact') return ['fact', item.text, item.provider].filter(Boolean).join('|')
    if (item.type === 'web') return ['web', item.url, item.text, item.host].filter(Boolean).join('|')
    if (item.type === 'minigame') return ['minigame', item.gameId, item.level, item.seed].join('|')
    return `other:${JSON.stringify(item)}`
  }, [])

  const registerRecentKey = useCallback((key: string) => {
    if (!key) return
    const list = recentKeysRef.current
    const set = recentKeySetRef.current
    if (set.has(key)) {
      const idx = list.indexOf(key)
      if (idx >= 0) list.splice(idx, 1)
    }
    list.push(key)
    set.add(key)
    while (list.length > RECENT_SESSION_LIMIT) {
      const removed = list.shift()
      if (removed) set.delete(removed)
    }
  }, [])

  const isRecentKey = useCallback((key: string) => {
    if (!key) return false
    return recentKeySetRef.current.has(key)
  }, [])

  const persistRandomSession = useCallback(() => {
    if (typeof window === 'undefined') return
    const langKey = (locale || 'en') as Lang
    const payload: PersistedRandomSession = {
      version: RANDOM_SESSION_VERSION,
      timestamp: Date.now(),
      lang: langKey,
      currentItem: currentItemRef.current,
      ready: randomReadyQueueRef.current.slice(0, RANDOM_READY_TARGET),
      sequence: cloneSequenceState(sequenceStateRef.current),
      progressionDraws: progressionDrawsRef.current,
      recentKeys: recentKeysRef.current.slice(-RECENT_SESSION_LIMIT),
    }
    try {
      sessionStorage.setItem(`${RANDOM_SESSION_PREFIX}${langKey}`, JSON.stringify(payload))
    } catch {
      /* Session restoration must never block navigation. */
    }
  }, [locale])

  const restoreRandomSession = useCallback(() => {
    if (typeof window === 'undefined') return false
    const langKey = (locale || 'en') as Lang
    try {
      const raw = sessionStorage.getItem(`${RANDOM_SESSION_PREFIX}${langKey}`)
      if (!raw) return false
      const restored = parseRandomSession(raw, langKey)
      if (!restored) {
        sessionStorage.removeItem(`${RANDOM_SESSION_PREFIX}${langKey}`)
        return false
      }
      sequenceStateRef.current = cloneSequenceState(restored.sequence)
      progressionDrawsRef.current = restored.progressionDraws
      setProgressionDraws(restored.progressionDraws)
      randomReadyQueueRef.current = restored.ready.filter((entry) => (
        entry.item.type !== 'video' || !isVideoBlockedThisSession(entry.item)
      ))
      recentKeysRef.current = restored.recentKeys
      recentKeySetRef.current = new Set(restored.recentKeys)
      if (!restored.currentItem) return false
      if (restored.currentItem.type === 'video' && isVideoBlockedThisSession(restored.currentItem)) return false
      currentItemRef.current = restored.currentItem
      setCurrentItem(restored.currentItem)
      setLiked(restored.currentItem.type === 'encourage' || restored.currentItem.type === 'minigame'
        ? false
        : isLiked(restored.currentItem))
      setLoading(false)
      return true
    } catch {
      return false
    }
  }, [locale])

  const warmContentMedia = useCallback((item: DisplayItem): Promise<boolean> => {
    if (typeof window === 'undefined') return Promise.resolve(false)
    let url: string | null = null
    if (item.type === 'video') {
      const posterUrl = getImmersiveBackgroundImage(item, null)
      if (posterUrl) url = posterUrl
    } else if (item.type === 'image') {
      url = item.url || item.thumbUrl || null
    } else if (item.type === 'web' && item.ogImage) {
      url = item.ogImage
    } else if (item.type === 'encourage') {
      url = item.icon
    }
    return url ? preloadVisualUrl(url) : Promise.resolve(true)
  }, [])

  const waitForContentMedia = useCallback(async (item: DisplayItem) => {
    const timeoutMs = effectsProfile === 'webkit-lite' ? 260 : 360
    await Promise.race([
      warmContentMedia(item),
      new Promise<void>((resolve) => window.setTimeout(resolve, timeoutMs)),
    ])
  }, [effectsProfile, warmContentMedia])

  const drainPrefetchedItems = useCallback((type: ItemType) => {
    if (typeof window === 'undefined') return
    const langKey = (locale || 'en') as Lang
    const queue = preloadQueuesRef.current[type]
    const keys = buildPrefetchStorageKeys(langKey, type)
    for (const key of keys) {
      let bundle: PrefetchedBundle | null = null
      try {
        const raw = sessionStorage.getItem(key)
        if (!raw) continue
        bundle = parsePrefetchEntry(raw)
      } catch {
        bundle = null
      }
      if (!bundle) {
        try {
          sessionStorage.removeItem(key)
        } catch {
          /* ignore */
        }
        continue
      }
      if (bundle.lang && bundle.lang !== langKey) continue

      const consumeFromBundle = (): RandomContentItem | null => {
        if (Array.isArray(bundle.items) && bundle.items.length) {
          while (bundle.items.length) {
            const next = bundle.items.shift()
            if (next && next.type === type) return next
          }
          return null
        }
        if (bundle.item && bundle.item.type === type) return bundle.item
        return null
      }

      const item = consumeFromBundle()
      if (!item) {
        try {
          sessionStorage.removeItem(key)
        } catch {
          /* ignore */
        }
        continue
      }
      const candidateKey = getContentKey(item)
      if (!candidateKey) {
        try {
          sessionStorage.removeItem(key)
        } catch {
          /* ignore */
        }
        continue
      }
      const exists = queue.some((entry) => getContentKey(entry) === candidateKey)
      if (exists) {
        try {
          sessionStorage.removeItem(key)
        } catch {
          /* ignore */
        }
        continue
      }
      queue.push(item)
      try {
        if (Array.isArray(bundle.items) && bundle.items.length) {
          sessionStorage.setItem(key, JSON.stringify({ lang: bundle.lang, items: bundle.items }))
        } else {
          sessionStorage.removeItem(key)
        }
      } catch {
        /* ignore */
      }
      break
    }
  }, [getContentKey, locale])

const spawnMiniGameIfDue = useCallback((): MiniGameItem | null => {
  if (!MINIGAMES_ENABLED || MINI_GAME_FREQUENCY <= 0) return null
  const state = miniGameStateRef.current
    const upcoming = state.jokeDisplays + 1
    if (upcoming % MINI_GAME_FREQUENCY !== 0) return null
    if (!state.pool.length) {
      state.pool = shuffleArray([...MINI_GAME_IDS])
    }
    const id = state.pool.shift() ?? MINI_GAME_IDS[0]
    const gameLevel = state.gameLevels[id] ?? state.globalLevel
    const level = Math.max(state.globalLevel, gameLevel)
    const nextLevel = Math.min(level + 1, 20)
    state.gameLevels = {
      ...state.gameLevels,
      [id]: nextLevel,
    }
    state.gamesAtCurrentLevel += 1
    if (state.gamesAtCurrentLevel >= 4) {
      state.globalLevel = Math.min(state.globalLevel + 1, 20)
      state.gamesAtCurrentLevel = 0
    }
    return createMiniGameItem({ id, level })
  }, [])

  const takeFromQueue = useCallback((type: ItemType, predicate?: (item: RandomContentItem) => boolean): RandomContentItem | null => {
    const queue = preloadQueuesRef.current[type]
    const iterations = queue.length
    for (let index = 0; index < iterations; index++) {
      const next = queue.shift()
      if (!next) continue
      if (next.type === 'video' && isVideoBlockedThisSession(next)) continue
      const key = getContentKey(next)
      if (key && isRecentKey(key)) continue
      if (predicate && !predicate(next)) {
        queue.push(next)
        continue
      }
      return next
    }
    return null
  }, [getContentKey, isRecentKey])

  const finalizeCandidate = useCallback((candidate: RandomContentItem) => {
    const key = getContentKey(candidate)
    if (key) registerRecentKey(key)
    return candidate
  }, [getContentKey, registerRecentKey])

  const takePreparedWaveCandidate = useCallback((): Exclude<RandomContentItem, MiniGameItem> | null => {
    while (waveQueueRef.current.length) {
      const candidate = waveQueueRef.current.shift()
      if (!candidate || candidate.type === 'minigame') continue
      if (candidate.type === 'video' && isVideoBlockedThisSession(candidate)) continue
      if (waveAnchorItemRef.current && hasSameWaveIdentity(waveAnchorItemRef.current, candidate)) continue
      const key = getContentKey(candidate)
      if (!key || isRecentKey(key) || waveHistoryKeysRef.current.has(key)) continue
      waveHistoryKeysRef.current.add(key)
      if (typeof candidate._id === 'string') waveHistoryIdsRef.current.add(candidate._id)
      registerRecentKey(key)
      void warmContentMedia(candidate)
      const upcoming = waveQueueRef.current[0]
      if (upcoming) void warmContentMedia(upcoming)
      return candidate
    }
    return null
  }, [getContentKey, isRecentKey, registerRecentKey, warmContentMedia])

  const requestWaveTrail = useCallback(async (anchorItem: DisplayItem): Promise<boolean> => {
    wavePreparationAbortRef.current?.abort()
    const controller = new AbortController()
    wavePreparationAbortRef.current = controller
    const generation = wavePreparationGenerationRef.current + 1
    wavePreparationGenerationRef.current = generation
    waveQueueRef.current = []
    waveHistoryKeysRef.current.clear()
    waveHistoryIdsRef.current.clear()

    if (anchorItem.type === 'encourage' || anchorItem.type === 'minigame') {
      waveAnchorRef.current = null
      waveAnchorItemRef.current = null
      wavePreparedAnchorKeyRef.current = null
      return false
    }

    const anchor = createWaveHint(anchorItem)
    if (!hasWaveSignal(anchor)) {
      waveAnchorRef.current = null
      waveAnchorItemRef.current = null
      wavePreparedAnchorKeyRef.current = null
      return false
    }

    const anchorKey = getContentKey(anchorItem)
    const excludeIds = typeof anchorItem._id === 'string' ? [anchorItem._id] : []
    const requestTimeout = window.setTimeout(() => controller.abort(), 3000)
    try {
      const response = await fetchWave({
        anchor,
        anchorId: typeof anchorItem._id === 'string' ? anchorItem._id : undefined,
        lang: (locale || 'en') as Lang,
        excludeIds,
        limit: WAVE_TOTAL_STEPS + WAVE_RESERVE_STEPS,
        types: ALL_ITEM_TYPES,
        signal: controller.signal,
      })
      if (generation !== wavePreparationGenerationRef.current) return false

      const keys = new Set<string>()
      const candidates: Exclude<RandomContentItem, MiniGameItem>[] = []
      for (const candidate of response.items) {
        if (!candidate || candidate.type === 'minigame') continue
        if (candidate.type === 'video' && isVideoBlockedThisSession(candidate)) continue
        const key = getContentKey(candidate)
        if (!key || key === anchorKey || keys.has(key) || isRecentKey(key)) continue
        if (hasSameWaveIdentity(anchorItem, candidate)) continue
        if (candidates.some((existing) => areWaveItemsFromSameSeries(existing, candidate))) continue
        keys.add(key)
        candidates.push(candidate)
      }

      if (candidates.length < WAVE_TOTAL_STEPS) {
        waveAnchorRef.current = null
        waveAnchorItemRef.current = null
        waveQueueRef.current = []
        wavePreparedAnchorKeyRef.current = null
        return false
      }

      waveAnchorRef.current = anchor
      waveAnchorItemRef.current = anchorItem
      waveQueueRef.current = candidates.slice(0, WAVE_TOTAL_STEPS + WAVE_RESERVE_STEPS)
      const firstCandidate = waveQueueRef.current[0]
      if (firstCandidate) void warmContentMedia(firstCandidate)
      wavePreparedAnchorKeyRef.current = anchorKey
      if (anchorKey) waveHistoryKeysRef.current.add(anchorKey)
      if (typeof anchorItem._id === 'string') waveHistoryIdsRef.current.add(anchorItem._id)
      return true
    } catch {
      if (generation !== wavePreparationGenerationRef.current) return false
      waveAnchorRef.current = null
      waveAnchorItemRef.current = null
      waveQueueRef.current = []
      wavePreparedAnchorKeyRef.current = null
      return false
    } finally {
      window.clearTimeout(requestTimeout)
      if (wavePreparationAbortRef.current === controller) {
        wavePreparationAbortRef.current = null
      }
    }
  }, [getContentKey, isRecentKey, locale, warmContentMedia])

  const ensureWaveTrail = useCallback((anchorItem: DisplayItem): Promise<boolean> => {
    if (anchorItem.type === 'encourage' || anchorItem.type === 'minigame') return Promise.resolve(false)
    const anchorKey = getContentKey(anchorItem)
    if (
      anchorKey
      && wavePreparedAnchorKeyRef.current === anchorKey
      && waveQueueRef.current.length >= WAVE_TOTAL_STEPS
      && waveAnchorRef.current
    ) {
      return Promise.resolve(true)
    }
    if (
      anchorKey
      && wavePreparationKeyRef.current === anchorKey
      && wavePreparationPromiseRef.current
    ) {
      return wavePreparationPromiseRef.current
    }

    const pending = requestWaveTrail(anchorItem)
    wavePreparationKeyRef.current = anchorKey
    wavePreparationPromiseRef.current = pending
    void pending.finally(() => {
      if (wavePreparationPromiseRef.current === pending) {
        wavePreparationPromiseRef.current = null
        wavePreparationKeyRef.current = null
      }
    })
    return pending
  }, [getContentKey, requestWaveTrail])

  useEffect(() => {
    if (!currentItem || waveMode || loading) return undefined
    let disposed = false
    let timer: number | null = null
    const prepareWhenRandomQueueIsReady = () => {
      if (disposed) return
      if (randomReadyQueueRef.current.length < 2 && randomReadyPromiseRef.current) {
        timer = window.setTimeout(prepareWhenRandomQueueIsReady, 220)
        return
      }
      void ensureWaveTrail(currentItem)
    }
    timer = window.setTimeout(prepareWhenRandomQueueIsReady, 450)
    return () => {
      disposed = true
      if (timer != null) window.clearTimeout(timer)
    }
  }, [currentItem, ensureWaveTrail, loading, waveMode])

  const acquireItem = useCallback(async (
    type: ItemType,
    predicate?: (item: RandomContentItem) => boolean,
    options: { strong?: boolean; videoPool?: VideoPool } = {},
  ): Promise<RandomContentItem | null> => {
    if (type === 'joke' && !options.strong) {
      const miniGame = spawnMiniGameIfDue()
      if (miniGame) return miniGame
    }

    if (!options.strong) {
      const prefetched = takeFromQueue(type, predicate)
      if (prefetched) return finalizeCandidate(prefetched)
    }

    const attempts = type === 'video' ? 3 : predicate ? 2 : 1
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const res = await fetchRandom({
          types: [type] as RandomTypes,
          lang: (locale || 'en') as Lang,
          strong: Boolean(options.strong && !predicate),
          videoPool: options.videoPool,
          timeoutMs: 5000,
        })
        const item = res?.item
        if (!item || item.type !== type) continue
        if (item.type === 'video' && isVideoBlockedThisSession(item)) continue
        const key = getContentKey(item)
        if (key && isRecentKey(key)) continue
        if (predicate && !predicate(item)) continue
        return finalizeCandidate(item)
      } catch {
        /* The sequence-level fallback will try all available content types. */
      }
    }
    return null
  }, [finalizeCandidate, getContentKey, isRecentKey, locale, spawnMiniGameIfDue, takeFromQueue])

  const prepareRandomEntry = useCallback(async (): Promise<PreparedRandomEntry | null> => {
    const languageVersion = langVersionRef.current
    const previousState = cloneSequenceState(sequenceStateRef.current)
    sequenceStateRef.current = cloneSequenceState(previousState)
    const slot = getNextSlot()
    const preparedState = cloneSequenceState(sequenceStateRef.current)
    sequenceStateRef.current = previousState
    if (!slot) return null
    if (slot.kind === 'encourage') {
      sequenceStateRef.current = preparedState
      return { slot, item: buildEncourageItem(slot.encourageIndex) }
    }

    let item: RandomContentItem | null = null
    let resolvedType: ItemType | null = null
    const requiresQuizFact = Boolean(slot.requireQuiz && slot.itemType === 'fact')
    const useStrongPool = Boolean(slot.strong)
    const factPredicate = slot.itemType === 'fact'
      ? (requiresQuizFact ? isQuizFactItem : isTextFactItem)
      : undefined

    if (slot.itemType === 'joke' && !useStrongPool) {
      item = spawnMiniGameIfDue()
    }
    if (!item && !useStrongPool) {
      item = takeFromQueue(slot.itemType, factPredicate)
      resolvedType = item ? slot.itemType : null
      if (item) item = finalizeCandidate(item)
    }
    if (!item) {
      item = await acquireItem(slot.itemType, factPredicate, {
        strong: useStrongPool,
        videoPool: slot.videoPool,
      })
      resolvedType = item ? slot.itemType : null
    }
    if (languageVersion !== langVersionRef.current) return null
    if (!item && requiresQuizFact) {
      item = await acquireItem(slot.itemType)
      resolvedType = item ? slot.itemType : null
    }
    if (languageVersion !== langVersionRef.current) return null
    if (slot.itemType === 'video' && item?.type !== 'video') {
      item = null
      resolvedType = null
    }
    if (!item) {
      try {
        const fallbackResponse = await fetchRandom({
          types: selectedTypes as RandomTypes,
          lang: (locale || 'en') as Lang,
          preview: true,
          timeoutMs: 5000,
        })
        const fallbackItem = fallbackResponse?.item
        if (
          fallbackItem
          && fallbackItem.type !== 'minigame'
          && (fallbackItem.type !== 'video' || !isVideoBlockedThisSession(fallbackItem))
        ) {
          const fallbackKey = getContentKey(fallbackItem)
          if (fallbackKey && !isRecentKey(fallbackKey)) {
            item = finalizeCandidate(fallbackItem)
            resolvedType = fallbackItem.type
          }
        }
      } catch {
        /* Keep the current content when every source is temporarily unavailable. */
      }
    }
    if (languageVersion !== langVersionRef.current) return null
    if (!item) {
      return null
    }
    sequenceStateRef.current = resolvedType && resolvedType !== slot.itemType ? previousState : preparedState
    return { slot, item }
  }, [acquireItem, buildEncourageItem, finalizeCandidate, getContentKey, getNextSlot, isRecentKey, locale, selectedTypes, spawnMiniGameIfDue, takeFromQueue])

  const notifyRandomReady = useCallback(() => {
    const waiters = randomReadyWaitersRef.current.splice(0)
    waiters.forEach((resolve) => resolve())
  }, [])

  const waitForRandomReady = useCallback(() => {
    if (randomReadyQueueRef.current.length) return Promise.resolve()
    return new Promise<void>((resolve) => {
      const finish = () => {
        const index = randomReadyWaitersRef.current.indexOf(finish)
        if (index >= 0) randomReadyWaitersRef.current.splice(index, 1)
        resolve()
      }
      randomReadyWaitersRef.current.push(finish)
    })
  }, [])

  const fillRandomReadyQueue = useCallback((target = RANDOM_READY_TARGET) => {
    if (randomReadyQueueRef.current.length >= target) return randomReadyPromiseRef.current ?? Promise.resolve()
    if (randomReadyPromiseRef.current) return randomReadyPromiseRef.current

    const generation = randomReadyGenerationRef.current
    const runner = (async () => {
      let failedAttempts = 0
      let totalAttempts = 0
      while (randomReadyQueueRef.current.length < target && failedAttempts < 2 && totalAttempts < target * 3) {
        totalAttempts += 1
        let entry: PreparedRandomEntry | null = null
        try {
          entry = await prepareRandomEntry()
        } catch {
          entry = null
        }
        if (generation !== randomReadyGenerationRef.current) return
        if (!entry) {
          failedAttempts += 1
          continue
        }
        failedAttempts = 0
        const key = getContentKey(entry.item as RandomContentItem)
        const duplicate = key && randomReadyQueueRef.current.some((candidate) => (
          getContentKey(candidate.item as RandomContentItem) === key
        ))
        if (duplicate) continue
        randomReadyQueueRef.current.push(entry)
        if (randomReadyQueueRef.current.length === 1) void warmContentMedia(entry.item)
        persistRandomSession()
        notifyRandomReady()
      }
    })()

    randomReadyPromiseRef.current = runner
    void runner.finally(() => {
      if (randomReadyPromiseRef.current === runner) randomReadyPromiseRef.current = null
      notifyRandomReady()
    })
    return runner
  }, [getContentKey, notifyRandomReady, persistRandomSession, prepareRandomEntry, warmContentMedia])

  const takeRandomReadyEntry = useCallback(() => {
    let entry = randomReadyQueueRef.current.shift() ?? null
    while (entry?.item.type === 'video' && isVideoBlockedThisSession(entry.item)) {
      entry = randomReadyQueueRef.current.shift() ?? null
    }
    if (entry) {
      const upcoming = randomReadyQueueRef.current[0]
      if (upcoming) void warmContentMedia(upcoming.item)
      persistRandomSession()
    }
    return entry
  }, [persistRandomSession, warmContentMedia])

  useEffect(() => {
    langVersionRef.current += 1
    randomReadyGenerationRef.current += 1
    randomReadyQueueRef.current = []
    randomReadyPromiseRef.current = null
    sequenceStateRef.current = createInitialSequenceState()
    wavePreparationAbortRef.current?.abort()
    wavePreparationAbortRef.current = null
    wavePreparationPromiseRef.current = null
    wavePreparationKeyRef.current = null
    wavePreparedAnchorKeyRef.current = null
    notifyRandomReady()
    clearPreloadedCaches()
  }, [clearPreloadedCaches, locale, notifyRandomReady])

  useEffect(() => {
    selectedTypes.forEach((type) => drainPrefetchedItems(type))
  }, [drainPrefetchedItems, selectedTypes])

  const updateTheme = useCallback(() => {
    setThemeIdx((idx) => randDiffIdx(THEMES.length, idx))
  }, [])

  const waitForTransitionReveal = useCallback(() => (
    new Promise<void>((resolve) => window.setTimeout(resolve, effectsProfile === 'webkit-lite' ? 48 : 68))
  ), [effectsProfile])

  const waitForTransitionSettle = useCallback((kind: 'random' | 'wave' = 'random') => (
    new Promise<void>((resolve) => window.setTimeout(
      resolve,
      kind === 'wave'
        ? (effectsProfile === 'webkit-lite' ? 300 : 450)
        : (effectsProfile === 'webkit-lite' ? 220 : 330),
    ))
  ), [effectsProfile])

  const waitForNextPaint = useCallback(() => (
    new Promise<void>((resolve) => {
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        window.clearTimeout(fallback)
        resolve()
      }
      const fallback = window.setTimeout(finish, 80)
      window.requestAnimationFrame(finish)
    })
  ), [])

  const loadNext = useCallback(async (reward = false, advanceProgression = reward) => {
    if (loadPendingRef.current || transitionLockedRef.current) return false
    loadPendingRef.current = true
    transitionLockedRef.current = true
    setTransitionLocked(true)
    setLoading(true)
    let displayed = false
    let rawTransitionIntensity = progressionIntensity
    let transitionIntensity = effectiveProgressionIntensity

    try {
      let entry = takeRandomReadyEntry()
      if (!entry) {
        const waiting = waitForRandomReady()
        void fillRandomReadyQueue(1)
        await waiting
        entry = takeRandomReadyEntry()
      }
      if (!entry) return false

      await waitForContentMedia(entry.item)
      if (reward && advanceProgression) {
        if (effectsTestMode) {
          const nextStep = Math.min(EFFECTS_TEST_MAX_STEPS, effectsTestStepRef.current + 1)
          setTestProgress(nextStep)
          rawTransitionIntensity = progressionForStep(nextStep)
        } else {
          const nextDraws = Math.min(EFFECTS_PROGRESSION_MAX_DRAWS, progressionDrawsRef.current + 1)
          progressionDrawsRef.current = nextDraws
          setProgressionDraws(nextDraws)
          rawTransitionIntensity = progressionForDraws(nextDraws)
        }
        transitionIntensity = effectsProfile === 'webkit-lite'
          ? rawTransitionIntensity * 0.72
          : rawTransitionIntensity
      }
      triggerPageGlitch(entry.slot.kind === 'encourage' ? 'boost' : 'normal', transitionIntensity)
      await waitForTransitionReveal()

      setIsSecond((prev) => !prev)
      setTrigger((t) => t + 1)
      const displayedItem = entry.item
      currentItemRef.current = displayedItem
      setCurrentItem(displayedItem)
      displayed = true

      let contentItem: RandomContentItem | null = null
      if (displayedItem.type === 'encourage') {
        setLiked(false)
      } else {
        contentItem = displayedItem
        if (displayedItem.type === 'minigame') {
          setLiked(false)
        } else {
          setLiked(isLiked(displayedItem))
        }
      }

      if (contentItem) {
        const state = miniGameStateRef.current
        state.totalContent += 1
        if (contentItem.type === 'minigame') {
          state.jokeDisplays += 1
          state.gamesServed += 1
        } else if (contentItem.type === 'joke') {
          state.jokeDisplays += 1
        }
      }
      updateTheme()
      playRandom(rawTransitionIntensity)

      if (adsAllowed) {
        footerAdCounterRef.current = (footerAdCounterRef.current + 1) % 10
        if (footerAdCounterRef.current === 0 && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('random:footer-ad-cycle'))
        }
      } else {
        footerAdCounterRef.current = 0
      }

      if (reward) {
        addAction('random')
        if (displayedItem.type === 'encourage') {
          addAction('encourage')
        }
        maybeSpawnDiamond()
      }
      persistRandomSession()
      await waitForNextPaint()
      await waitForTransitionSettle('random')
      if (effectsTestMode && reward) {
        queueTestEncourage3D(effectsTestStepRef.current)
      }
      return true
    } catch {
      /* Keep the current item; the next prepared item remains usable. */
      return false
    } finally {
      loadPendingRef.current = false
      transitionLockedRef.current = false
      setTransitionLocked(false)
      if (displayed || currentItemRef.current) {
        setLoading(false)
      } else {
        setLoading(true)
        if (initialRetryTimeoutRef.current) clearTimeout(initialRetryTimeoutRef.current)
        initialRetryTimeoutRef.current = setTimeout(() => {
          initialRetryTimeoutRef.current = null
          void loadNext(false)
        }, 700)
      }
      void fillRandomReadyQueue()
    }
  }, [addAction, adsAllowed, effectsProfile, effectsTestMode, effectiveProgressionIntensity, fillRandomReadyQueue, maybeSpawnDiamond, persistRandomSession, progressionIntensity, queueTestEncourage3D, setTestProgress, takeRandomReadyEntry, triggerPageGlitch, updateTheme, waitForContentMedia, waitForNextPaint, waitForRandomReady, waitForTransitionReveal, waitForTransitionSettle])

  const handlePlaybackIssue = useCallback((item: VideoContentItem, issue: VideoPlaybackIssue) => {
    const current = currentItemRef.current
    if (!current || current.type !== 'video') return

    const key = getContentKey(item)
    const currentKey = getContentKey(current)
    if (!key || key !== currentKey) return

    const attempts = playbackIssueCountsRef.current[key] ?? 0
    if (attempts >= 1) return

    playbackIssueCountsRef.current[key] = attempts + 1
    reportVideoPlaybackIssue(item, issue)

    const recover = () => {
      const active = currentItemRef.current
      if (!active || active.type !== 'video' || getContentKey(active) !== key) return
      if (transitionLockedRef.current || loadPendingRef.current) {
        if (playbackRecoveryTimeoutRef.current) clearTimeout(playbackRecoveryTimeoutRef.current)
        playbackRecoveryTimeoutRef.current = setTimeout(() => {
          playbackRecoveryTimeoutRef.current = null
          recover()
        }, 100)
        return
      }

      if (waveModeRef.current) {
        const replacement = takePreparedWaveCandidate()
        if (replacement) {
          transitionLockedRef.current = true
          setTransitionLocked(true)
          void (async () => {
            try {
              await waitForContentMedia(replacement)
              triggerWaveTransition()
              triggerPageGlitch()
              await waitForTransitionReveal()
              setIsSecond((prev) => !prev)
              setTrigger((value) => value + 1)
              currentItemRef.current = replacement
              setCurrentItem(replacement)
              waveShownAtRef.current = Date.now()
              setLiked(isLiked(replacement))
              updateTheme()
              persistRandomSession()
              await waitForNextPaint()
              await waitForTransitionSettle('wave')
            } finally {
              transitionLockedRef.current = false
              setTransitionLocked(false)
            }
          })()
          return
        }
        waveModeRef.current = false
        waveRemainingRef.current = 0
        setWaveMode(false)
        setWaveRemaining(0)
        waveAnchorRef.current = null
        waveAnchorItemRef.current = null
        waveQueueRef.current = []
        wavePreparedAnchorKeyRef.current = null
      }
      void loadNext(false)
    }

    recover()
  }, [getContentKey, loadNext, persistRandomSession, takePreparedWaveCandidate, triggerPageGlitch, triggerWaveTransition, updateTheme, waitForContentMedia, waitForNextPaint, waitForTransitionReveal, waitForTransitionSettle])

  useEffect(() => {
    if (initialLoadTriggeredRef.current) return
    initialLoadTriggeredRef.current = true
    const restored = restoreRandomSession()
    if (restored) {
      const current = currentItemRef.current
      if (current) void warmContentMedia(current)
      const upcoming = randomReadyQueueRef.current[0]
      if (upcoming) void warmContentMedia(upcoming.item)
      void fillRandomReadyQueue()
      return
    }
    loadNext(false).catch(() => setLoading(false))
  }, [fillRandomReadyQueue, loadNext, restoreRandomSession, warmContentMedia])

  useEffect(() => {
    if (currentItem) persistRandomSession()
  }, [currentItem, persistRandomSession])

  useEffect(() => {
    if (!initialLoadTriggeredRef.current || !currentItemRef.current) return
    void fillRandomReadyQueue()
  }, [fillRandomReadyQueue, locale])

  useEffect(() => {
    const refill = () => {
      if (document.visibilityState === 'hidden') {
        persistRandomSession()
        return
      }
      void fillRandomReadyQueue()
      const current = currentItemRef.current
      if (current && !waveModeRef.current) {
        void ensureWaveTrail(current)
      }
    }
    const persist = () => persistRandomSession()
    window.addEventListener('pageshow', refill)
    window.addEventListener('pagehide', persist)
    document.addEventListener('visibilitychange', refill)
    return () => {
      window.removeEventListener('pageshow', refill)
      window.removeEventListener('pagehide', persist)
      document.removeEventListener('visibilitychange', refill)
    }
  }, [ensureWaveTrail, fillRandomReadyQueue, persistRandomSession])

  useEffect(() => {
    const current = currentItem
    if (current && current.type !== 'encourage' && current.type !== 'minigame') {
      setLiked(isLiked(current))
    } else {
      setLiked(false)
    }
  }, [currentItem])

  function applyLangOut(next: Lang) {
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
  }

  const langs = (Array.isArray(locales) && locales.length
    ? locales
    : ['en', 'fr', 'de', 'jp', 'es']) as Lang[]

  const mainStyle = useMemo<ThemeStyle>(() => {
    const baseIntensity = clampProgress(effectiveProgressionIntensity)
    const overdrive = clampOverdrive(effectiveProgressionIntensity - 1)
    const edgeOverdrive = clampOverdrive(progressionIntensity - 1) * (effectsProfile === 'webkit-lite' ? 0.68 : 1)
    const finalPush = clampProgress((progressionIntensity - 2) / 0.5)
    const finalProfileScale = effectsProfile === 'webkit-lite' ? 0.58 : 1
    const ambientShift = baseIntensity * 6 + overdrive * 4
    const transitionShift = baseIntensity * 14 + overdrive * 10
    const transitionY = baseIntensity * 4 + overdrive * 3
    const backgroundShift = baseIntensity * 10 + overdrive * 8
    const edgeShift = 6 + edgeOverdrive * 14
    const echoReach = 4 + edgeOverdrive * 28

    return {
      backgroundColor: theme.bg,
      color: theme.cream,
      '--theme-cream': theme.cream,
      '--theme-text': theme.text,
      '--random-progress': effectiveProgressionIntensity,
      '--random-progress-shift': `${ambientShift.toFixed(2)}px`,
      '--random-progress-shift-negative': `${(-ambientShift).toFixed(2)}px`,
      '--random-progress-transition-shift': `${transitionShift.toFixed(2)}px`,
      '--random-progress-transition-shift-negative': `${(-transitionShift).toFixed(2)}px`,
      '--random-progress-transition-shift-half': `${(transitionShift * 0.5).toFixed(2)}px`,
      '--random-progress-transition-shift-half-negative': `${(-transitionShift * 0.5).toFixed(2)}px`,
      '--random-progress-transition-shift-soft': `${(transitionShift * 0.36).toFixed(2)}px`,
      '--random-progress-transition-shift-soft-negative': `${(-transitionShift * 0.36).toFixed(2)}px`,
      '--random-progress-transition-y': `${transitionY.toFixed(2)}px`,
      '--random-progress-transition-y-negative': `${(-transitionY).toFixed(2)}px`,
      '--random-progress-chroma-shift': `${(baseIntensity * 16 + overdrive * 10).toFixed(2)}px`,
      '--random-progress-transition-duration': `${Math.round(420 + baseIntensity * 200 + overdrive * 180)}ms`,
      '--random-progress-transition-scale': 1 + baseIntensity * 0.025 + overdrive * 0.02,
      '--random-progress-bg-hit-scale': 1.12 + baseIntensity * 0.045 + overdrive * 0.03,
      '--random-progress-bg-hit-shift': `${backgroundShift.toFixed(2)}px`,
      '--random-progress-bg-hit-shift-negative': `${(-backgroundShift).toFixed(2)}px`,
      '--random-progress-bg-hit-shift-half': `${(backgroundShift * 0.55).toFixed(2)}px`,
      '--random-progress-bg-hit-shift-soft-negative': `${(-backgroundShift * 0.3).toFixed(2)}px`,
      '--random-progress-overlay-saturate': 1 + baseIntensity * 1.1 + overdrive * 0.5,
      '--random-progress-overlay-contrast': 1 + baseIntensity * 0.35 + overdrive * 0.2,
      '--random-progress-ambient-duration': `${Math.max(1.15, 11 - baseIntensity * 9.2 - overdrive * 1.25).toFixed(2)}s`,
      '--random-progress-bg-duration': `${Math.max(4.5, 18 - baseIntensity * 11 - overdrive * 2.5).toFixed(2)}s`,
      '--random-progress-noise-duration': `${Math.max(3.2, 18 - baseIntensity * 13 - overdrive * 1.8).toFixed(2)}s`,
      '--random-overdrive-edge-short': `${(18 + edgeOverdrive * 38).toFixed(2)}px`,
      '--random-overdrive-edge-medium': `${(30 + edgeOverdrive * 66).toFixed(2)}px`,
      '--random-overdrive-edge-long': `${(44 + edgeOverdrive * 104).toFixed(2)}px`,
      '--random-overdrive-edge-opacity': Number(Math.min(0.9, edgeOverdrive * 0.84).toFixed(3)),
      '--random-overdrive-edge-hit-opacity': Number(Math.min(1, 0.2 + edgeOverdrive * 0.8).toFixed(3)),
      '--random-overdrive-edge-duration': `${Math.max(0.92, 3.2 - edgeOverdrive * 2.28).toFixed(2)}s`,
      '--random-overdrive-edge-shift': `${edgeShift.toFixed(2)}px`,
      '--random-overdrive-edge-shift-negative': `${(-edgeShift).toFixed(2)}px`,
      '--random-overdrive-echo-opacity': Number(Math.min(0.92, edgeOverdrive * 0.92).toFixed(3)),
      '--random-overdrive-echo-duration': `${Math.round(560 + edgeOverdrive * 300)}ms`,
      '--random-overdrive-echo-reach': `${echoReach.toFixed(2)}px`,
      '--random-overdrive-echo-reach-negative': `${(-echoReach).toFixed(2)}px`,
      '--random-final-edge-opacity': Number((finalPush * 0.88 * finalProfileScale).toFixed(3)),
      '--random-final-edge-short': `${(34 + finalPush * 44 * finalProfileScale).toFixed(2)}px`,
      '--random-final-edge-medium': `${(72 + finalPush * 82 * finalProfileScale).toFixed(2)}px`,
      '--random-final-edge-long': `${(118 + finalPush * 122 * finalProfileScale).toFixed(2)}px`,
      '--random-final-edge-duration': `${Math.max(0.62, 1.4 - finalPush * 0.78 * finalProfileScale).toFixed(2)}s`,
    }
  }, [effectiveProgressionIntensity, effectsProfile, progressionIntensity, theme.bg, theme.cream, theme.text])

  const viewItem = currentItem
  const isPriming = !viewItem

  const currentImmersiveImage = useMemo(
    () => (isPriming ? null : getImmersiveBackgroundImage(viewItem, viewportWidth)),
    [isPriming, viewItem, viewportWidth]
  )
  const lastImmersiveImageRef = useRef<string | null>(currentImmersiveImage)

  useEffect(() => {
    if (currentImmersiveImage) lastImmersiveImageRef.current = currentImmersiveImage
  }, [currentImmersiveImage])

  const fallbackImmersiveImage = currentImmersiveImage ? null : lastImmersiveImageRef.current
  const immersiveBackground = useMemo(
    () => getImmersiveBackgroundData(viewItem, theme, false, isPriming, fallbackImmersiveImage, viewportWidth),
    [fallbackImmersiveImage, isPriming, theme, viewItem, viewportWidth]
  )
  const immersiveBackgroundStyle = useMemo<ImmersiveBackgroundStyle>(() => ({
    '--random-bg-image': cssImageUrl(immersiveBackground.image),
    '--random-bg-tone': immersiveBackground.tone,
    '--random-bg-accent': immersiveBackground.accent,
    '--random-bg-strength': Math.min(1, Number((immersiveBackground.strength * (1 + effectiveProgressionIntensity * 0.28)).toFixed(2))),
    '--random-bg-noise-strength': Math.min(1, Number((immersiveBackground.strength * (0.42 + effectiveProgressionIntensity * 0.24)).toFixed(2))),
  }), [effectiveProgressionIntensity, immersiveBackground])
  const immersiveSeed = useMemo(
    () => getImmersiveSeed(viewItem, immersiveBackground.image),
    [immersiveBackground.image, viewItem]
  )
  const immersiveFragments = useMemo(
    () => buildImmersiveFragments(immersiveBackground.image, immersiveSeed, viewportWidth, effectsProfile),
    [effectsProfile, immersiveBackground.image, immersiveSeed, viewportWidth]
  )
  const isEncourage = viewItem?.type === 'encourage'
  const categoryType: ItemType | null = useMemo(() => {
    if (!viewItem || viewItem.type === 'encourage') return null
    if (viewItem.type === 'minigame') return 'joke'
    return viewItem.type
  }, [viewItem])
  const isQuizView = Boolean(viewItem && viewItem.type === 'fact' && (viewItem as FactItem).variant === 'quiz')

  useEffect(() => {
    if (isEncourage && shareOpen) setShareOpen(false)
  }, [isEncourage, shareOpen])

  const categoryLabel = useMemo(() => {
    if (!categoryType) return null
    const labelMap: Record<ItemType, string> = {
      image: navLabels.images,
      video: navLabels.videos,
      web: navLabels.web,
      quote: navLabels.other,
      joke: navLabels.other,
      fact: navLabels.other,
    }
    return labelMap[categoryType]
  }, [categoryType, navLabels])

  const categoryIcon = !categoryType ? null : TYPE_ICONS[categoryType]
  const showXpForCategory = useMemo(() => {
    if (!XP_UI_ENABLED) return false
    if (!viewItem) return false
    if (viewItem.type === 'minigame') return true
    if (isQuizView) return false
    return false
  }, [isQuizView, viewItem])
  const isDesktopAd = (viewportWidth ?? 0) >= 1024
  const adHeight = isDesktopAd ? 90 : 50
  const adWidth = isDesktopAd ? 728 : 320
  const adVariant = isDesktopAd ? 'desktop' : 'mobile'
  const footerPadHeight = adsAllowed && footerAdVisible ? adHeight : 0
  const controlsDisabled = transitionLocked || Boolean(encourage3dEvent) || !viewItem || viewItem.type === 'encourage' || viewItem.type === 'minigame'
  const randomAgainDisabled = !viewItem || transitionLocked || Boolean(encourage3dEvent)
  const waveEligible = useMemo(() => {
    if (!viewItem || viewItem.type === 'encourage' || viewItem.type === 'minigame') return false
    return hasWaveSignal(createWaveHint(viewItem))
  }, [viewItem])
  const waveDisabled = controlsDisabled || transitionLocked || loading || (!waveMode && !waveEligible)

  const handleLike = useCallback(() => {
    const item = currentItemRef.current
    if (!item || item.type === 'encourage' || item.type === 'minigame') return
    if (liked) {
      removeLike(item)
      setLiked(false)
    } else {
      addLike(item, theme)
      setLiked(true)
      triggerHeartGlitch()
      if (waveModeRef.current && waveAnchorItemRef.current) {
        reportWaveFeedback(waveAnchorItemRef.current, item, 'like', waveShownAtRef.current)
      }
    }
    try {
      window.dispatchEvent(new StorageEvent('storage', { key: 'likes' }))
    } catch {
      /* ignore */
    }
  }, [liked, theme, triggerHeartGlitch])

  const handleRandomAgain = useCallback(() => {
    if (transitionLockedRef.current) return
    const wasWave = waveModeRef.current
    const waveCandidate = currentItemRef.current
    if (
      waveModeRef.current
      && waveAnchorItemRef.current
      && waveCandidate
      && waveCandidate.type !== 'encourage'
      && waveCandidate.type !== 'minigame'
    ) {
      reportWaveFeedback(
        waveAnchorItemRef.current,
        waveCandidate,
        waveRemainingRef.current <= 1 ? 'complete' : 'exit',
        waveShownAtRef.current,
      )
    }
    wavePreparationAbortRef.current?.abort()
    wavePreparationAbortRef.current = null
    wavePreparationGenerationRef.current += 1
    wavePreparationPromiseRef.current = null
    wavePreparationKeyRef.current = null
    wavePreparedAnchorKeyRef.current = null
    waveModeRef.current = false
    waveRemainingRef.current = 0
    setWaveMode(false)
    setWaveRemaining(0)
    setWaveTransitionActive(false)
    waveAnchorRef.current = null
    waveAnchorItemRef.current = null
    waveQueueRef.current = []
    waveHistoryKeysRef.current.clear()
    waveHistoryIdsRef.current.clear()
    waveShownAtRef.current = 0
    loadNext(true, !wasWave)
      .catch(() => undefined)
    const nextProgressionIntensity = effectsTestMode
      ? progressionForStep(wasWave
        ? effectsTestStepRef.current
        : Math.min(EFFECTS_TEST_MAX_STEPS, effectsTestStepRef.current + 1))
      : progressionForDraws(wasWave
        ? progressionDrawsRef.current
        : Math.min(EFFECTS_PROGRESSION_MAX_DRAWS, progressionDrawsRef.current + 1))
    playAgain(nextProgressionIntensity)
  }, [effectsTestMode, loadNext])

  const handleWave = useCallback(async () => {
    if (transitionLockedRef.current) return
    const current = currentItemRef.current
    if (!current || current.type === 'encourage' || current.type === 'minigame') return

    const enteringWave = !waveModeRef.current
    transitionLockedRef.current = true
    setTransitionLocked(true)

    try {
      if (enteringWave) {
        const prepared = await ensureWaveTrail(current)
        if (!prepared || !waveAnchorRef.current) return
      } else if (waveAnchorItemRef.current) {
        reportWaveFeedback(waveAnchorItemRef.current, current, 'continue', waveShownAtRef.current)
      }
      const next = takePreparedWaveCandidate()
      if (!next) {
        waveModeRef.current = false
        waveRemainingRef.current = 0
        setWaveMode(false)
        setWaveRemaining(0)
        return
      }

      const nextRemaining = enteringWave ? WAVE_TOTAL_STEPS : Math.max(1, waveRemainingRef.current - 1)
      waveModeRef.current = true
      waveRemainingRef.current = nextRemaining
      setWaveMode(true)
      setWaveRemaining(nextRemaining)
      if (enteringWave) playWaveEnter()
      else playWaveStep()

      await waitForContentMedia(next)
      triggerWaveTransition()
      triggerPageGlitch()
      await waitForTransitionReveal()
      setIsSecond((prev) => !prev)
      setTrigger((value) => value + 1)
      currentItemRef.current = next
      setCurrentItem(next)
      waveShownAtRef.current = Date.now()
      setLiked(isLiked(next))
      updateTheme()
      await waitForNextPaint()
      await waitForTransitionSettle('wave')
    } finally {
      transitionLockedRef.current = false
      setTransitionLocked(false)
    }
  }, [ensureWaveTrail, takePreparedWaveCandidate, triggerPageGlitch, triggerWaveTransition, updateTheme, waitForContentMedia, waitForNextPaint, waitForTransitionReveal, waitForTransitionSettle])

  const handlePrimaryAction = useCallback(() => {
    if (!waveModeRef.current || waveRemainingRef.current <= 1) {
      handleRandomAgain()
      return
    }
    handleWave()
  }, [handleRandomAgain, handleWave])

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  return (
    <main
      className={`random-page min-h-screen flex flex-col${effectsProfile === 'webkit-lite' ? ' random-page--lite-effects' : ''}${effectsTestMode ? ' random-page--effects-test' : ''}${progressionIntensity > 0 ? ' random-page--effects-progressing' : ''}${progressionIntensity > 1 ? ' random-page--effects-overdrive' : ''}${progressionIntensity > 2 ? ' random-page--effects-final' : ''}${pageGlitchActive ? ' random-page--glitching' : ''}${fullscreenVideo ? ' random-page--video-fullscreen' : ''}${waveMode ? ' random-page--wave' : ''}${waveTransitionActive ? ' random-page--wave-transition' : ''}`}
      style={mainStyle}
    >
      {effectsTestMode ? (
        <div className="effects-test-meter" aria-label={`Effects intensity ${effectsTestStep} of ${EFFECTS_TEST_MAX_STEPS}`}>
          <span>{String(effectsTestStep).padStart(2, '0')}</span>
          <span className="effects-test-meter__divider" aria-hidden="true" />
          <button type="button" onClick={() => setTestProgress(0)} aria-label="Reset effects intensity" title="Reset effects intensity">
            <RotateCcw size={15} strokeWidth={2.2} />
          </button>
        </div>
      ) : null}
      <div className="random-immersive-bg" style={immersiveBackgroundStyle} aria-hidden="true">
        <div className="random-immersive-bg__media" />
        <div className="random-immersive-bg__fragments">
          {immersiveFragments.map((fragment) => (
            <span key={fragment.id} className={fragment.className} style={fragment.style} />
          ))}
        </div>
        <div className="random-immersive-bg__tone" />
        <div className="random-immersive-bg__noise" />
      </div>
      <div
        key={pageGlitchCycle}
        className={`page-glitch-overlay${pageGlitchActive ? ' page-glitch-overlay--active' : ''}`}
        aria-hidden="true"
      >
        <div className="page-glitch-overlay__bars">
          {pageGlitchBars.map((bar) => {
            const shiftValue = parseFloat(bar.shift) || 12
            const yShiftValue = parseFloat(bar.yShift) || 0
            const style: GlitchBarStyle = {
              top: bar.top,
              height: bar.height,
              width: bar.width,
              left: bar.left,
              background: bar.background,
              animationDelay: `${bar.delay}ms`,
              animationDuration: `${bar.duration}ms`,
              '--glitch-bar-shift': bar.shift,
              '--glitch-bar-start-x': `${(-0.7 * shiftValue).toFixed(1)}px`,
              '--glitch-bar-mid-x': `${(-0.35 * shiftValue).toFixed(1)}px`,
              '--glitch-bar-tail-x': `${(-0.18 * shiftValue).toFixed(1)}px`,
              '--glitch-bar-y-shift': bar.yShift,
              '--glitch-bar-y-reverse': `${(-1 * yShiftValue).toFixed(1)}px`,
              '--glitch-bar-pop-opacity': bar.popOpacity,
              opacity: bar.opacity,
            }

            return (
              <span
                key={bar.id}
                className={`page-glitch-overlay__bar page-glitch-overlay__bar--${bar.variant}`}
                style={style}
              />
            )
          })}
        </div>
      </div>
      <header className="random-main-header relative z-10 flex items-center justify-between px-4 sm:px-6 pt-6 pb-4">
        <button
          ref={menuButtonRef}
          type="button"
          aria-label="Menu"
          onClick={() => {
            triggerBurgerGlitch()
            setMenuOpen(true)
          }}
          className={`random-menu-trigger flex items-center${burgerPointPulse ? ' random-menu-trigger--points' : ''}`}
          style={{ color: theme.text }}
        >
          <BurgerIcon color={theme.text} glitch={burgerGlitch} />
        </button>

        <div className="flex-1 flex justify-center">
          <LogoAnimated
            trigger={trigger}
            toSecond={isSecond}
            vhMobile={8}
            vhDesktop={8}
            gapMobile={4}
            gapDesktop={4}
          />
        </div>

        <button
          type="button"
          aria-label={waveMode ? 'Close Wave' : waveLabel}
          title={waveMode ? 'Close Wave' : waveLabel}
          onClick={() => {
            if (waveModeRef.current) {
              handleRandomAgain()
              return
            }
            void handleWave()
          }}
          className="wave-action flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-transform hover:scale-105 disabled:cursor-wait"
          disabled={waveDisabled}
          aria-pressed={waveMode}
          style={{
            backgroundColor: 'transparent',
            border: `2px solid ${theme.text}`,
            color: theme.text,
            opacity: waveDisabled ? 0.72 : 1,
          }}
        >
          <span className="wave-action__echo wave-action__echo--one" aria-hidden="true" />
          <span className="wave-action__echo wave-action__echo--two" aria-hidden="true" />
          <span className="wave-action__echo wave-action__echo--three" aria-hidden="true" />
          <span className="wave-action__icon" aria-hidden="true">
            {waveMode ? <X size={27} strokeWidth={2.25} /> : <MonoIcon src="/icons/wave.svg" color="#ffffff" size={27} />}
          </span>
        </button>
      </header>

      <div className="random-category-row relative z-10 px-4 sm:px-6" style={{ marginBottom: '10px' }}>
        {categoryLabel ? (
          <div className="flex gap-[2px]" style={{ height: '40px' }}>
            <div
              className="flex-1 px-4 font-semibold uppercase tracking-wide flex items-center justify-center gap-3"
              style={{
                backgroundColor: theme.text,
                color: theme.cream,
                fontFamily: "var(--font-inter-tight), 'Inter Tight', sans-serif",
              }}
            >
              {categoryIcon ? <MonoIcon src={categoryIcon} color={theme.cream} size={20} /> : null}
              <span>{categoryLabel}</span>
            </div>
            {isQuizView ? (
              <div
                className="px-4 flex items-center justify-center text-xs font-semibold uppercase"
                style={{
                  backgroundColor: theme.cream,
                  color: '#191916',
                  minWidth: '86px',
                  fontFamily: "var(--font-inter-tight), 'Inter Tight', sans-serif",
                }}
              >
                <span>{quizScoreText}</span>
              </div>
            ) : showXpForCategory ? (
              <div
                className="px-4 flex items-center justify-center"
                style={{
                  backgroundColor: theme.cream,
                  color: '#191916',
                  minWidth: '96px',
                  fontFamily: "var(--font-inter-tight), 'Inter Tight', sans-serif",
                }}
              >
                <ScoreCounter />
              </div>
            ) : null}
          </div>
        ) : (
          <div style={{ height: '40px' }} />
        )}
      </div>

      <section className="random-content-section relative z-10 flex flex-col items-center px-4 sm:px-6" style={{ gap: '10px' }}>
        <div className="random-content-frame w-full" style={contentFrameStyle}>
          {!viewItem ? (
            <div className="flex items-center justify-center w-full h-full">
              <span className="font-inter opacity-70">Loading…</span>
            </div>
          ) : (
            <ContentRenderer
              item={viewItem}
              theme={theme}
              frameHeight={contentHeight}
              viewportWidth={viewportWidth}
              soundMuted={soundMuted}
              fullscreenLabel={fullscreenLabel}
              disableFullscreen={disableFullscreenButton}
              isFullscreenActive={Boolean(fullscreenVideo)}
              onOpenFullscreen={openFullscreen}
              onCloseFullscreen={closeFullscreen}
              onVideoSoundUnlocked={unlockVideoSound}
              onPlaybackIssue={handlePlaybackIssue}
            />
          )}
        </div>

        {viewItem && viewItem.type !== 'encourage' ? (
          <div className="random-source-line w-full text-center text-sm md:text-base font-inter" style={{ color: theme.text }}>
            <SourceLine item={viewItem} />
          </div>
        ) : null}
      </section>

      <section className="random-action-section relative z-10 px-4 sm:px-6" style={{ margin: '10px 0', paddingBottom: footerPadHeight + 16 }}>
        <div className="flex items-center justify-between gap-4 w-full" style={{ flexWrap: 'wrap' }}>
          <button
            type="button"
            aria-label={likeLabel}
            onClick={handleLike}
            className="p-3"
            disabled={controlsDisabled}
          >
            <MonoIcon
              src="/icons/Heart.svg"
              color={liked ? '#FF4D78' : theme.cream}
              size={30}
              className={`heart-icon${liked ? ' heart-icon--liked' : ''}${heartGlitch ? ' heart-icon--glitch' : ''}`}
            />
          </button>

          <div className="flex-1 flex justify-center" style={{ minWidth: '160px', maxWidth: '260px' }}>
            <button
              type="button"
              onClick={handlePrimaryAction}
              disabled={randomAgainDisabled}
              aria-busy={randomAgainDisabled}
              className={`w-full px-6 py-3 rounded-[28px] shadow-md transition-transform uppercase font-tomorrow font-bold ${randomAgainDisabled ? 'cursor-wait' : 'hover:scale-[1.02]'}`}
              style={{
                backgroundColor: theme.text,
                color: theme.cream,
                fontWeight: 700,
                opacity: randomAgainDisabled ? 0.92 : 1,
              }}
            >
              <AnimatedButtonLabel
                text={waveMode ? `${randomAgainLabel} : ${waveRemaining}` : randomAgainLabel}
                color={theme.cream}
                trigger={trigger}
                toSecond={isSecond}
              />
            </button>
          </div>

          <button
            type="button"
            aria-label={shareLabel}
            onClick={() => {
              if (controlsDisabled) return
              setShareOpen(true)
            }}
            className="p-3"
            disabled={controlsDisabled}
          >
            <MonoIcon src="/icons/share.svg" color={theme.cream} size={28} />
          </button>
        </div>
      </section>

      {effectsTestMode && encourage3dEvent ? (
        <Encourage3DOverlay
          event={encourage3dEvent}
          menuTargetRef={menuButtonRef}
          onAward={handleEncourage3DAward}
          onComplete={handleEncourage3DComplete}
        />
      ) : null}

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
            <div
              className="flex items-center justify-end"
              style={{ color: theme.cream }}
            >
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
                  onClick={() => setLanguagesOpen((o) => !o)}
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

              <span
                className="text-lg font-semibold uppercase"
                style={{ color: '#191916' }}
              >
                {scoreText}
              </span>

              <button
                type="button"
                onClick={toggleSound}
                className="mt-2 w-full rounded-xl border border-white/25 px-3 py-2 text-sm font-semibold uppercase tracking-[0.15em]"
                style={{ color: theme.cream }}
                aria-pressed={!soundMuted}
              >
                Sound FX: {soundMuted ? 'Off' : 'On'}
              </button>
            </nav>
          </div>
        </div>
      ) : null}

      {fullscreenVideo ? (
        <div
          className="video-fullscreen-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={fullscreenVideo.title || fullscreenLabel}
        >
          <div className="video-fullscreen-glitch-bg" style={immersiveBackgroundStyle} aria-hidden="true">
            <div className="random-immersive-bg__media" />
            <div className="random-immersive-bg__fragments video-fullscreen-glitch-bg__fragments">
              {immersiveFragments.slice(0, 60).map((fragment) => (
                <div
                  key={`fullscreen-${fragment.id}`}
                  className={fragment.className}
                  style={fragment.style}
                />
              ))}
            </div>
            <div className="random-immersive-bg__tone" />
            <div className="random-immersive-bg__noise" />
          </div>
          <div className="video-fullscreen-backdrop" onClick={closeFullscreen} />
        </div>
      ) : null}

      <ShareMenu
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        theme={theme}
        themeIndex={themeIdx}
        item={viewItem}
      />

      {adsAllowed ? (
        <div
          className="random-footer-ad fixed bottom-0 left-0 right-0 flex items-center justify-center"
          style={{
            height: footerAdVisible ? adHeight : 0,
            backgroundColor: footerAdVisible ? '#ffffff' : 'transparent',
            color: '#111',
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            overflow: 'visible',
            pointerEvents: footerAdVisible ? 'auto' : 'none',
            zIndex: 120,
          }}
        >
          <div
            className="flex items-center justify-center"
            style={{
              width: adWidth,
              height: adHeight,
              position: footerAdVisible ? 'static' : 'absolute',
              bottom: 0,
            }}
          >
            <AadsFooterSlot
              variant={adVariant}
              enabled={adsAllowed}
              onVisibleChange={setFooterAdVisible}
            />
          </div>
        </div>
      ) : null}

      <style jsx>{`
        .encourage-layout {
          height: 100%;
          width: 100%;
          gap: clamp(12px, 4vw, 18px);
        }
        .encourage-icon-wrapper {
          display: flex;
          align-items: center;
          justify-content: center;
          flex: 0 0 auto;
          padding-block: clamp(4px, 1.2vh, 12px);
          width: clamp(140px, 60vw, 280px);
          height: clamp(170px, 35vh, 320px);
          position: relative;
          overflow: visible;
        }
        .encourage-icon {
          width: 100%;
          height: 100%;
          object-fit: contain;
          filter: drop-shadow(0 36px 48px rgba(0, 0, 0, 0.45));
          transform-origin: center;
          position: relative;
          z-index: 5;
        }
        .encourage-icon-wrapper::before,
        .encourage-icon-wrapper::after {
          content: '';
          position: absolute;
          inset: -14%;
          border-radius: 28px;
          pointer-events: none;
          mix-blend-mode: screen;
          opacity: 0;
          z-index: 4;
        }
        .encourage-icon-wrapper::before {
          background: repeating-linear-gradient(90deg, rgba(0, 255, 255, 0.9) 0 10px, rgba(0, 255, 255, 0) 10px 20px);
        }
        .encourage-icon-wrapper::after {
          background: repeating-linear-gradient(0deg, rgba(255, 0, 150, 0.85) 0 14px, rgba(123, 104, 238, 0) 14px 28px);
        }
        .encourage-copy-wrapper {
          flex: 1 1 auto;
          width: 100%;
          max-width: min(320px, 82vw);
          display: flex;
          align-items: center;
          justify-content: center;
          padding-inline: clamp(6px, 2vw, 14px);
        }
        .encourage-copy {
          max-width: 56ch;
          text-align: center;
          font-size: clamp(19px, 4.6vw, 24px);
          line-height: 1.34;
        }
        @media (min-width: 768px) {
          .encourage-layout {
            flex-direction: row;
            align-items: center;
            justify-content: center;
            gap: clamp(18px, 3.6vw, 26px);
          }
          .encourage-icon-wrapper {
            width: clamp(360px, 52vw, 540px);
            height: clamp(320px, 48vh, 520px);
            border-radius: 26px;
          }
          .encourage-copy-wrapper {
            flex: 1 1 clamp(320px, 44vw, 500px);
            max-width: clamp(320px, 44vw, 500px);
          }
          .encourage-copy {
            font-size: clamp(26px, 2.5vw, 34px);
          }
        }
        @media (min-width: 1024px) {
          .encourage-layout {
            justify-content: center;
            gap: clamp(22px, 3vw, 32px);
          }
          .encourage-icon-wrapper {
            width: clamp(630px, 64vw, 900px);
            height: clamp(570px, 60vh, 840px);
          }
          .encourage-copy-wrapper {
            flex: 1 1 clamp(420px, 46vw, 620px);
            max-width: clamp(420px, 46vw, 620px);
            justify-content: center;
            padding-inline: clamp(12px, 2vw, 18px);
          }
          .encourage-copy {
            font-size: clamp(36px, 3vw, 48px);
            line-height: 1.35;
          }
          .encourage-icon {
            height: auto;
          }
          .encourage-icon-wrapper::before,
          .encourage-icon-wrapper::after {
            inset: -14%;
          }
        }
        @keyframes encourage-pop {
          0% { transform: scale(0.82) rotate(-4deg); }
          54% { transform: scale(1.06) rotate(1.5deg); }
          100% { transform: scale(1) rotate(0deg); }
        }
        .encourage-layout.encourage-active .encourage-icon-wrapper::before {
          animation: encourage-glitch-before 2200ms steps(8, end);
        }
        .encourage-layout.encourage-active .encourage-icon-wrapper::after {
          animation: encourage-glitch-after 2200ms steps(8, end);
        }
        .encourage-layout.encourage-active .encourage-icon {
          animation: encourage-pop 520ms cubic-bezier(0.18, 0.89, 0.32, 1.28), encourage-shift 2200ms steps(8, end), encourage-flicker 2200ms linear;
        }
        @keyframes encourage-glitch-before {
          0% { opacity: 0; transform: translate(0,0) scale(1); filter: blur(0); }
          10% { opacity: 1; transform: translate(-42px, 26px) scale(1.14) skewX(-9deg); filter: blur(4.2px) saturate(2.2); }
          25% { opacity: 0.85; transform: translate(30px, -22px) scale(0.94) skewX(7deg); filter: blur(3.2px); }
          42% { opacity: 0.6; transform: translate(-22px, 16px) scale(1.06) skewX(-5deg); filter: blur(2.4px); }
          60% { opacity: 0.38; transform: translate(18px, -12px) scale(0.97) skewX(4deg); filter: blur(1.8px); }
          80% { opacity: 0.22; transform: translate(-14px, 9px) scale(1.04) skewX(-3deg); filter: blur(1.2px); }
          100% { opacity: 0; transform: translate(0,0) scale(1); filter: blur(0); }
        }
        @keyframes encourage-glitch-after {
          0% { opacity: 0; transform: translate(0,0) scale(1); filter: blur(0); }
          12% { opacity: 0.95; transform: translate(40px, -28px) scale(1.12) skewX(10deg); filter: blur(3.8px) saturate(2.2); }
          30% { opacity: 0.75; transform: translate(-32px, 24px) scale(0.92) skewX(-8deg); filter: blur(3px); }
          50% { opacity: 0.5; transform: translate(24px, -18px) scale(1.08) skewX(6deg); filter: blur(2.2px); }
          72% { opacity: 0.3; transform: translate(-18px, 12px) scale(0.95) skewX(-4deg); filter: blur(1.6px); }
          90% { opacity: 0.18; transform: translate(14px, -9px) scale(1.05) skewX(3deg); filter: blur(1.1px); }
          100% { opacity: 0; transform: translate(0,0) scale(1); filter: blur(0); }
        }
        @keyframes encourage-shift {
          0% { transform: translate3d(0,0,0); }
          18% { transform: translate3d(-34px, 24px, 0); }
          36% { transform: translate3d(28px, -20px, 0); }
          54% { transform: translate3d(-24px, 17px, 0); }
          72% { transform: translate3d(20px, -13px, 0); }
          90% { transform: translate3d(-15px, 9px, 0); }
          100% { transform: translate3d(0,0,0); }
        }
        @keyframes encourage-flicker {
          0%, 100% { filter: drop-shadow(0 36px 48px rgba(0, 0, 0, 0.45)) brightness(1); }
          12% { filter: drop-shadow(0 42px 56px rgba(0, 0, 0, 0.5)) brightness(1.9); }
          30% { filter: drop-shadow(0 34px 46px rgba(0, 0, 0, 0.4)) brightness(1.3); }
          48% { filter: drop-shadow(0 44px 60px rgba(0, 0, 0, 0.52)) brightness(1.7); }
          68% { filter: drop-shadow(0 38px 52px rgba(0, 0, 0, 0.46)) brightness(1.4); }
          86% { filter: drop-shadow(0 32px 44px rgba(0, 0, 0, 0.38)) brightness(1.8); }
        }
      `}</style>

      <style jsx global>{`
        .random-page {
          position: relative;
          isolation: isolate;
          overflow: hidden;
        }
        .random-immersive-bg {
          position: fixed;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          overflow: hidden;
          background: #020202;
          transition: background 300ms ease;
        }
        .random-immersive-bg::before {
          content: '';
          position: absolute;
          inset: -2% -5%;
          z-index: 3;
          pointer-events: none;
          background:
            linear-gradient(90deg, transparent 0 5%, rgba(0, 255, 240, 0.82) 5% 19%, rgba(2, 2, 2, 0.88) 19% 24%, rgba(255, 0, 122, 0.72) 24% 51%, transparent 51% 100%) 0 8% / 88% 2.4px no-repeat,
            linear-gradient(90deg, transparent 0 16%, rgba(244, 255, 0, 0.7) 16% 29%, rgba(255, 255, 255, 0.82) 29% 32%, rgba(36, 88, 255, 0.78) 32% 73%, transparent 73% 100%) 18% 72% / 90% 3px no-repeat,
            linear-gradient(90deg, rgba(255, 0, 122, 0.78) 0 14%, transparent 14% 31%, rgba(25, 255, 95, 0.72) 31% 62%, rgba(3, 3, 3, 0.92) 62% 68%, transparent 68% 100%) -10% 88% / 76% 4px no-repeat,
            linear-gradient(90deg, transparent 0 37%, rgba(255, 255, 255, 0.58) 37% 41%, rgba(0, 255, 240, 0.68) 41% 78%, transparent 78% 100%) 8% 24% / 94% 1.5px no-repeat;
          mix-blend-mode: screen;
          opacity: min(0.82, calc(var(--random-bg-strength, 0) * 0.9));
          transform: translate3d(0, 0, 0);
          animation: random-bg-signal-drift 8400ms steps(1, end) infinite;
        }
        .random-immersive-bg::after {
          content: '';
          position: absolute;
          inset: 0;
          z-index: 3;
          pointer-events: none;
          background:
            repeating-linear-gradient(180deg, rgba(90, 140, 255, 0.15) 0 0.34px, rgba(0, 0, 0, 0.28) 0.34px 0.68px, transparent 0.68px 1.02px),
            repeating-linear-gradient(180deg, transparent 0 1.7px, rgba(0, 255, 255, 0.08) 1.7px 1.95px, transparent 1.95px 3.15px, rgba(255, 0, 130, 0.055) 3.15px 3.4px, transparent 3.4px 4.9px),
            repeating-linear-gradient(180deg, transparent 0 5px, rgba(255, 255, 255, 0.035) 5px 5.18px, transparent 5.18px 7px),
            linear-gradient(180deg, rgba(0, 0, 0, 0.18), transparent 18%, rgba(0, 0, 0, 0.22) 54%, transparent 72%, rgba(0, 0, 0, 0.18));
          mix-blend-mode: screen;
          opacity: min(0.92, calc(var(--random-bg-strength, 0) * 1.06));
          transform: translateZ(0);
        }
        .random-immersive-bg__media {
          position: absolute;
          inset: -8%;
          z-index: 0;
          background-image: var(--random-bg-image, none);
          background-position: center;
          background-size: cover;
          filter: blur(5px) saturate(2.45) contrast(1.9) brightness(0.32);
          opacity: min(1, calc(var(--random-bg-strength, 0) * 1.3));
          transform: scale(1.12);
          transition: opacity 120ms ease, background-image 120ms ease, filter 120ms ease;
          animation: random-bg-drift 18s steps(8, end) infinite alternate;
          will-change: opacity, background-image, transform;
        }
        .random-page--effects-progressing .random-immersive-bg__media {
          animation-duration: var(--random-progress-bg-duration, 18s);
        }
        .random-immersive-bg__fragments {
          position: absolute;
          inset: 0;
          z-index: 2;
          overflow: hidden;
          opacity: var(--random-bg-strength, 0);
          transition: opacity 120ms ease;
          contain: strict;
          transform: translateZ(0);
        }
        .random-immersive-fragment {
          position: absolute;
          display: block;
          border-radius: 0;
          background-image: var(--random-bg-image, none);
          background-repeat: no-repeat;
          background-color: transparent;
          opacity: var(--fragment-opacity, 0.48);
          transform: var(--fragment-transform, translate3d(0, 0, 0));
          transform-origin: left center;
          animation: random-fragment-corrupt var(--fragment-duration, 5200ms) steps(1, end) infinite;
          animation-delay: var(--fragment-delay, 0ms);
          box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.035);
          transition: background-image 120ms ease;
          contain: layout paint;
          will-change: auto;
        }
        .random-immersive-fragment--tear {
          min-height: 0.35px;
          animation-name: random-line-corrupt;
          will-change: opacity, transform;
          box-shadow:
            0 0 0 1px color-mix(in srgb, var(--random-bg-accent, #b13cff) 12%, transparent),
            4px 0 0 rgba(0, 255, 255, 0.08),
            -3px 0 0 rgba(255, 0, 130, 0.08);
        }
        .random-immersive-fragment--fine {
          min-height: 0.12px;
          animation: none;
          box-shadow: none;
          will-change: auto;
        }
        .random-immersive-fragment--smear {
          box-shadow:
            0 0 0 1px rgba(255, 255, 255, 0.03),
            8px 0 0 rgba(0, 255, 255, 0.14),
            -7px 0 0 rgba(255, 0, 130, 0.14),
            15px 1px 0 rgba(255, 255, 255, 0.06);
        }
        .random-immersive-fragment--block {
          will-change: opacity, transform;
          box-shadow:
            0 0 0 1px rgba(255, 255, 255, 0.06),
            2px 0 0 rgba(0, 255, 255, 0.2),
            -2px 0 0 rgba(255, 0, 130, 0.18);
        }
        .random-immersive-fragment--cluster-block {
          animation-name: random-block-corrupt;
          box-shadow:
            0 0 0 1px rgba(255, 255, 255, 0.07),
            3px 0 0 rgba(0, 255, 255, 0.24),
            -3px 0 0 rgba(255, 0, 130, 0.22),
            0 4px 0 rgba(0, 0, 0, 0.34);
        }
        .random-immersive-fragment--void {
          background-image: none !important;
          animation-name: random-line-corrupt;
          will-change: opacity, transform;
          box-shadow:
            0 0 0 1px rgba(0, 0, 0, 0.95),
            6px 0 0 rgba(0, 255, 255, 0.05),
            -5px 0 0 rgba(255, 0, 120, 0.05);
        }
        .random-immersive-fragment--signal {
          animation-name: random-line-corrupt;
          will-change: opacity, transform;
          background-image:
            linear-gradient(90deg,
              var(--fragment-color, #00fff0) 0 42%,
              #ffffff 42% 48%,
              #030303 48% 52%,
              var(--fragment-alt-color, #ff007a) 52% 78%,
              transparent 78% 100%) !important;
          filter: saturate(1.8) contrast(1.8);
          box-shadow:
            0 0 0 1px rgba(255, 255, 255, 0.12),
            4px 0 0 rgba(0, 255, 255, 0.22),
            -4px 0 0 rgba(255, 0, 130, 0.22);
        }
        .random-immersive-fragment--signal-bar {
          background-image:
            linear-gradient(90deg,
              var(--fragment-color, #00fff0) 0 28%,
              #030303 28% 33%,
              var(--fragment-alt-color, #ff007a) 33% 48%,
              transparent 48% 55%,
              #ffffff 55% 58%,
              var(--fragment-color, #00fff0) 58% 100%) !important;
        }
        .random-immersive-fragment--hot {
          filter: saturate(3.2) contrast(2.1) brightness(1.12);
        }
        .random-immersive-bg__tone {
          position: absolute;
          inset: 0;
          z-index: 1;
          background:
            linear-gradient(180deg, rgba(0, 0, 0, 0.22), rgba(0, 0, 0, 0.57) 42%, rgba(0, 0, 0, 0.88)),
            radial-gradient(circle at 50% 42%, color-mix(in srgb, var(--random-bg-accent, #b13cff) 13%, transparent), transparent 52%);
          opacity: 1;
        }
        .random-immersive-bg__noise {
          position: absolute;
          inset: 0;
          z-index: 4;
          background:
            repeating-linear-gradient(180deg, rgba(32, 58, 160, 0.11) 0 0.42px, rgba(0, 0, 0, 0.1) 0.42px 0.84px, transparent 0.84px 1.4px),
            repeating-linear-gradient(180deg, transparent 0 3.5px, rgba(0, 255, 255, 0.06) 3.5px 3.75px, transparent 3.75px 6.5px, rgba(255, 0, 130, 0.045) 6.5px 6.75px, transparent 6.75px 9.5px),
            linear-gradient(180deg, transparent 0 7%, rgba(0, 255, 255, 0.12) 7.05% 7.14%, transparent 7.2% 13%, rgba(255, 0, 130, 0.1) 13.1% 13.24%, transparent 13.32% 24%, rgba(255, 255, 255, 0.06) 24.08% 24.16%, transparent 24.24% 38%, rgba(19, 255, 95, 0.09) 38.04% 38.14%, transparent 38.22% 61%, rgba(0, 255, 255, 0.12) 61.05% 61.2%, transparent 61.28% 72%, rgba(255, 0, 130, 0.09) 72.08% 72.18%, transparent 72.28% 87%, rgba(244, 255, 0, 0.08) 87.15% 87.3%, transparent 87.42%),
            linear-gradient(180deg, transparent 0 4%, rgba(0, 0, 0, 0.5) 4.08% 4.32%, transparent 4.48% 52%, rgba(0, 0, 0, 0.45) 52.1% 52.48%, transparent 52.64% 92%, rgba(0, 0, 0, 0.4) 92.05% 92.35%, transparent 92.52%);
          mix-blend-mode: screen;
          opacity: var(--random-bg-noise-strength, 0);
          animation: random-bg-noise-pop 18000ms steps(1, end) infinite;
        }
        .random-page--effects-progressing .random-immersive-bg__noise {
          animation-duration: var(--random-progress-noise-duration, 18s);
        }
        .video-embed-poster {
          position: absolute;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          background-position: center;
          background-size: cover;
          filter: saturate(1.4) contrast(1.15) brightness(0.62);
          transition: opacity 180ms ease;
        }
        .video-embed-poster::after {
          content: '';
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.38);
        }
        @keyframes random-bg-drift {
          0% { transform: translate3d(-0.8%, -0.5%, 0) scale(1.12); filter: blur(5px) saturate(2.45) contrast(1.9) brightness(0.32); }
          20% { transform: translate3d(1.1%, -0.2%, 0) scale(1.15); filter: blur(4px) saturate(2.9) contrast(2.2) brightness(0.28); }
          43% { transform: translate3d(-0.35%, 1%, 0) scale(1.13); filter: blur(6px) saturate(2.25) contrast(1.95) brightness(0.34); }
          71% { transform: translate3d(1.35%, 0.1%, 0) scale(1.16); filter: blur(4px) saturate(3.05) contrast(2.15) brightness(0.29); }
          100% { transform: translate3d(0.5%, 0.9%, 0) scale(1.13); filter: blur(5px) saturate(2.55) contrast(2) brightness(0.32); }
        }
        @keyframes random-bg-signal-drift {
          0%, 100% { transform: translate3d(-2%, 0, 0); opacity: min(0.82, calc(var(--random-bg-strength, 0) * 0.9)); }
          24% { transform: translate3d(3.5%, 0.2%, 0); opacity: min(0.94, calc(var(--random-bg-strength, 0) * 1.04)); }
          25% { transform: translate3d(-1%, -0.15%, 0); }
          61% { transform: translate3d(2%, 0, 0); opacity: min(0.76, calc(var(--random-bg-strength, 0) * 0.82)); }
          62% { transform: translate3d(-3.5%, 0.25%, 0); }
        }
        @keyframes random-bg-drift-lite {
          0%, 100% { transform: translate3d(-0.6%, -0.25%, 0) scale(1.12); }
          34% { transform: translate3d(0.8%, 0, 0) scale(1.14); }
          68% { transform: translate3d(-0.2%, 0.65%, 0) scale(1.13); }
        }
        @keyframes random-fragments-drift-lite {
          0%, 100% { transform: translate3d(0, 0, 0); }
          36% { transform: translate3d(5px, 0, 0); }
          37% { transform: translate3d(-3px, 1px, 0); }
          72% { transform: translate3d(2px, -1px, 0); }
        }
        @keyframes random-fragment-corrupt {
          0%, 91%, 100% {
            opacity: var(--fragment-opacity, 0.48);
            transform: var(--fragment-transform, translate3d(0, 0, 0));
          }
          92% {
            opacity: var(--fragment-pop-opacity, 0.92);
            transform: translate3d(var(--fragment-jump-x, 12px), var(--fragment-jump-y, 0), 0) var(--fragment-transform, translate3d(0, 0, 0));
          }
          93% {
            opacity: var(--fragment-opacity, 0.48);
            transform: translate3d(var(--fragment-reverse-x, -6px), 0, 0) var(--fragment-transform, translate3d(0, 0, 0));
          }
          94% {
            opacity: var(--fragment-pop-opacity, 0.92);
          }
        }
        @keyframes random-line-corrupt {
          0%, 100% {
            opacity: var(--fragment-opacity, 0.38);
            transform: var(--fragment-transform, translate3d(0, 0, 0));
          }
          44% {
            transform: translate3d(var(--fragment-jump-x, 8px), 0, 0) var(--fragment-transform, translate3d(0, 0, 0));
          }
          45% {
            opacity: var(--fragment-pop-opacity, 0.56);
            transform: translate3d(var(--fragment-reverse-x, -4px), 0, 0) var(--fragment-transform, translate3d(0, 0, 0));
          }
          46% {
            opacity: var(--fragment-opacity, 0.38);
          }
        }
        @keyframes random-block-corrupt {
          0%, 88%, 100% {
            opacity: var(--fragment-opacity, 0.72);
            transform: var(--fragment-transform, translate3d(0, 0, 0));
          }
          89% {
            opacity: var(--fragment-pop-opacity, 0.98);
            transform: translate3d(var(--fragment-jump-x, 12px), var(--fragment-jump-y, 0), 0) var(--fragment-transform, translate3d(0, 0, 0));
          }
          90% {
            opacity: var(--fragment-opacity, 0.72);
            transform: translate3d(var(--fragment-reverse-x, -6px), 0, 0) var(--fragment-transform, translate3d(0, 0, 0));
          }
        }
        @keyframes random-bg-noise-pop {
          0%, 100% { transform: translate3d(0, 0, 0); filter: saturate(1.2); }
          49% { transform: translate3d(6px, 0, 0); filter: saturate(1.5); }
          50% { transform: translate3d(-4px, 0, 0); filter: saturate(1.15); }
        }
        @supports not (color: color-mix(in srgb, red 50%, transparent)) {
          .random-immersive-bg__tone {
            background:
              linear-gradient(180deg, rgba(12, 12, 10, 0.1), rgba(12, 12, 10, 0.48) 46%, rgba(12, 12, 10, 0.86)),
              radial-gradient(circle at 50% 42%, rgba(255, 255, 255, 0.1), transparent 54%);
          }
          .random-immersive-fragment--tear {
            box-shadow:
              0 0 0 1px rgba(255, 255, 255, 0.04),
              8px 0 0 rgba(0, 255, 255, 0.12),
              -6px 0 0 rgba(255, 0, 130, 0.12);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .random-immersive-bg,
          .random-immersive-bg::before,
          .random-immersive-bg__media,
          .random-immersive-bg__fragments,
          .random-immersive-fragment,
          .random-immersive-bg__noise {
            transition: none;
            animation: none !important;
          }
          .random-page--wave .wave-action,
          .random-page--wave .wave-action__icon,
          .random-page--wave .wave-action__echo,
          .random-page--wave::before,
          .random-page--effects-overdrive::before,
          .random-page--wave .random-immersive-bg__media,
          .random-page--wave .random-immersive-bg__tone,
          .random-page--wave-transition .random-content-frame {
            animation: none !important;
          }
        }
        .page-glitch-overlay {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 60;
          opacity: 0;
          background-color: transparent;
          overflow: hidden;
          contain: strict;
        }
        .page-glitch-overlay::before,
        .page-glitch-overlay::after {
          content: '';
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: 0;
        }
        .page-glitch-overlay::before {
          background:
            repeating-linear-gradient(180deg, rgba(0, 255, 255, 0.18) 0 0.28px, rgba(0, 0, 0, 0.32) 0.28px 0.56px, transparent 0.56px 1.12px),
            repeating-linear-gradient(180deg, transparent 0 3px, rgba(255, 0, 130, 0.12) 3px 3.24px, transparent 3.24px 5.2px, rgba(255, 255, 255, 0.08) 5.2px 5.42px, transparent 5.42px 7.4px);
          mix-blend-mode: screen;
        }
        .page-glitch-overlay::after {
          background:
            linear-gradient(180deg, transparent 0 7%, rgba(0, 255, 255, 0.38) 7.05% 7.18%, transparent 7.24% 19%, rgba(255, 0, 130, 0.34) 19.06% 19.18%, transparent 19.26% 47%, rgba(255, 255, 255, 0.22) 47.04% 47.12%, transparent 47.18% 73%, rgba(255, 255, 0, 0.26) 73.06% 73.2%, transparent 73.28%),
            linear-gradient(180deg, transparent 0 31%, rgba(0, 0, 0, 0.52) 31.1% 31.58%, transparent 31.72% 64%, rgba(0, 0, 0, 0.46) 64.12% 64.42%, transparent 64.58%);
          mix-blend-mode: hard-light;
        }
        .page-glitch-overlay__bars {
          position: absolute;
          inset: 0;
          z-index: 2;
        }
        .page-glitch-overlay__bar {
          position: absolute;
          opacity: 0;
          border-radius: 0;
          will-change: transform, opacity;
          --glitch-bar-shift: 12px;
          --glitch-bar-y-shift: 0px;
          --glitch-bar-pop-opacity: 1;
          box-shadow:
            2px 0 0 rgba(0, 255, 255, 0.2),
            -2px 0 0 rgba(255, 0, 130, 0.18);
          transform: translate3d(0, 0, 0);
        }
        .page-glitch-overlay__bar--line {
          min-height: 0.35px;
          mix-blend-mode: screen;
          box-shadow:
            3px 0 0 rgba(0, 255, 255, 0.14),
            -3px 0 0 rgba(255, 0, 130, 0.12);
        }
        .page-glitch-overlay__bar--signal {
          mix-blend-mode: screen;
          filter: saturate(1.8) contrast(1.5);
          box-shadow:
            4px 0 0 rgba(0, 255, 255, 0.24),
            -4px 0 0 rgba(255, 0, 130, 0.22),
            0 0 10px rgba(255, 255, 255, 0.08);
        }
        .page-glitch-overlay__bar--block {
          mix-blend-mode: hard-light;
          filter: saturate(2.2) contrast(1.9);
          box-shadow:
            3px 0 0 rgba(0, 255, 255, 0.3),
            -3px 0 0 rgba(255, 0, 130, 0.28),
            0 4px 0 rgba(0, 0, 0, 0.38);
        }
        .page-glitch-overlay__bar--void {
          mix-blend-mode: normal;
          box-shadow:
            5px 0 0 rgba(0, 255, 255, 0.08),
            -5px 0 0 rgba(255, 0, 130, 0.08);
        }
        .random-page--lite-effects .random-immersive-bg__noise,
        .random-page--lite-effects .random-immersive-fragment {
          animation: none;
          will-change: auto;
        }
        .random-page--lite-effects .random-immersive-bg::before {
          mix-blend-mode: normal;
          opacity: min(0.62, calc(var(--random-bg-strength, 0) * 0.7));
          animation-duration: 11200ms;
        }
        .random-page--lite-effects .random-immersive-bg__media {
          animation: random-bg-drift-lite 18000ms steps(1, end) infinite;
          will-change: transform;
        }
        .random-page--lite-effects .random-immersive-bg__fragments {
          animation: random-fragments-drift-lite 12600ms steps(1, end) infinite;
          will-change: transform;
        }
        .random-page--lite-effects .page-glitch-overlay::before,
        .random-page--lite-effects .page-glitch-overlay::after,
        .random-page--lite-effects .page-glitch-overlay__bar {
          mix-blend-mode: normal;
        }
        .random-page--lite-effects .page-glitch-overlay__bar--signal,
        .random-page--lite-effects .page-glitch-overlay__bar--block {
          filter: none;
          box-shadow: 3px 0 0 rgba(0, 255, 255, 0.2), -3px 0 0 rgba(255, 0, 130, 0.18);
        }
        .video-embed-shell {
          position: relative;
          width: 100%;
          height: 100%;
        }
        .video-embed-player {
          position: relative;
          width: 100%;
          height: 100%;
          overflow: hidden;
          background: #000;
        }
        .video-embed-shell--fullscreen {
          position: fixed !important;
          inset: 0 !important;
          z-index: 1000;
          width: 100vw !important;
          height: 100vh !important;
          height: 100svh !important;
          height: 100dvh !important;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          background: rgba(0, 0, 0, 0.18);
          pointer-events: auto;
          overscroll-behavior: contain;
          touch-action: manipulation;
          isolation: isolate;
          transform: translateZ(0);
        }
        .video-embed-shell--fullscreen::before {
          content: '';
          position: absolute;
          inset: 0;
          z-index: 3;
          pointer-events: none;
          background:
            repeating-linear-gradient(
              180deg,
              rgba(0, 255, 255, 0.09) 0,
              rgba(0, 255, 255, 0.09) 0.4px,
              rgba(0, 0, 0, 0.22) 0.4px,
              rgba(0, 0, 0, 0.22) 0.8px,
              transparent 0.8px,
              transparent 1.6px
            ),
            linear-gradient(180deg, rgba(0, 0, 0, 0.16), rgba(0, 0, 0, 0.55));
          mix-blend-mode: screen;
          opacity: 0.18;
        }
        .video-embed-shell--fullscreen .video-embed-player {
          position: relative;
          z-index: 2;
          width: 100vw !important;
          height: 100vh !important;
          height: 100svh !important;
          height: 100dvh !important;
          max-width: 100vw;
          max-height: 100vh;
          max-height: 100svh;
          max-height: 100dvh;
          box-shadow: none;
          pointer-events: auto;
        }
        .video-embed-shell--fullscreen iframe,
        .video-embed-shell--fullscreen video {
          width: 100% !important;
          height: 100% !important;
          transform: translate(-50%, -50%) !important;
        }
        .video-fullscreen-overlay {
          position: fixed;
          inset: 0;
          z-index: 900;
          display: block;
          background: rgba(0, 0, 0, 0.52);
          overflow: hidden;
          pointer-events: none;
        }
        .video-fullscreen-glitch-bg {
          position: absolute;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          overflow: hidden;
          background: #020203;
        }
        .video-fullscreen-glitch-bg .random-immersive-bg__media {
          opacity: calc(var(--random-bg-strength, 0) * 0.86);
          filter: blur(7px) saturate(2.3) contrast(1.75) brightness(0.34);
        }
        .video-fullscreen-glitch-bg .random-immersive-bg__tone {
          background:
            linear-gradient(180deg, rgba(0, 0, 0, 0.28), rgba(0, 0, 0, 0.5) 48%, rgba(0, 0, 0, 0.72)),
            radial-gradient(circle at 50% 48%, color-mix(in srgb, var(--random-bg-accent, #b13cff) 14%, transparent), transparent 56%);
        }
        .video-fullscreen-glitch-bg .random-immersive-bg__noise {
          opacity: calc(var(--random-bg-noise-strength, 0) * 0.78);
        }
        .video-fullscreen-glitch-bg__fragments {
          opacity: calc(var(--random-bg-strength, 0) * 0.68);
        }
        .video-fullscreen-backdrop {
          position: absolute;
          inset: 0;
          z-index: 1;
          background: rgba(0, 0, 0, 0.24);
          cursor: zoom-out;
          pointer-events: none;
        }
        .video-fullscreen-close {
          position: absolute;
          top: max(12px, env(safe-area-inset-top));
          right: max(12px, env(safe-area-inset-right));
          height: 36px;
          width: 36px;
          border-radius: 50%;
          background: rgba(0, 0, 0, 0.6);
          color: #fff;
          font-size: 26px;
          line-height: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 5;
          touch-action: manipulation;
        }
        .video-fullscreen-brand {
          position: absolute;
          top: max(14px, calc(env(safe-area-inset-top) + 8px));
          left: 50%;
          z-index: 4;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          gap: 2px;
          height: clamp(18px, 3.2vh, 28px);
          max-width: calc(100vw - 140px);
          transform: translateX(-50%);
          opacity: 0.68;
          pointer-events: none;
          user-select: none;
          filter: drop-shadow(0 1px 4px rgba(0, 0, 0, 0.72));
        }
        .video-fullscreen-brand img {
          display: block;
          width: auto;
          height: 100%;
        }
        .random-page--video-fullscreen .random-footer-ad {
          opacity: 0;
          pointer-events: none;
        }
        .random-page--video-fullscreen {
          min-height: 100vh;
          min-height: 100dvh;
          overflow: hidden;
          overscroll-behavior: contain;
        }
        .random-page--video-fullscreen .random-main-header,
        .random-page--video-fullscreen .random-category-row,
        .random-page--video-fullscreen .random-action-section {
          opacity: 0;
          pointer-events: none;
        }
        .random-page--video-fullscreen .random-content-section {
          position: fixed !important;
          inset: 0 !important;
          z-index: 1000 !important;
          padding: 0 !important;
          gap: 0 !important;
          pointer-events: none;
        }
        .random-page--video-fullscreen .random-content-frame {
          width: 100vw !important;
          height: 100vh !important;
          height: 100svh !important;
          height: 100dvh !important;
          pointer-events: none;
        }
        .random-page--video-fullscreen .random-source-line {
          opacity: 0;
          pointer-events: none;
        }
        @media (max-width: 768px) {
          .video-embed-shell--fullscreen {
            padding: 0;
          }
          .video-embed-shell--fullscreen .video-embed-player {
            width: 100vw !important;
            height: 100vh !important;
            height: 100svh !important;
            height: 100dvh !important;
            max-width: 100vw;
            max-height: 100svh;
            max-height: 100dvh;
            box-shadow: none;
          }
          .video-fullscreen-close {
            top: 16px;
            right: 18px;
            background: rgba(0, 0, 0, 0.75);
          }
        }
        @media (orientation: landscape) and (max-height: 520px) {
          .video-embed-shell--fullscreen {
            padding: 0;
            height: 100dvh !important;
          }
          .video-embed-shell--fullscreen .video-embed-player {
            width: 100vw !important;
            height: 100vh !important;
            height: 100dvh !important;
            max-width: 100vw;
            max-height: 100dvh;
          }
        }
        .page-glitch-overlay--active {
          animation: page-glitch-fade var(--random-progress-transition-duration, 420ms) steps(1, end) forwards;
          filter:
            saturate(var(--random-progress-overlay-saturate, 1))
            contrast(var(--random-progress-overlay-contrast, 1));
        }
        .page-glitch-overlay--active::before {
          animation: page-glitch-scan var(--random-progress-transition-duration, 420ms) steps(1, end) forwards;
        }
        .page-glitch-overlay--active::after {
          animation: page-glitch-signal var(--random-progress-transition-duration, 420ms) steps(1, end) forwards;
        }
        .page-glitch-overlay--active .page-glitch-overlay__bar {
          animation-name: page-glitch-bar;
          animation-timing-function: steps(1, end);
          animation-fill-mode: forwards;
        }
        @keyframes page-glitch-fade {
          0% { opacity: 0; }
          8% { opacity: 0.96; }
          16% { opacity: 0.38; }
          24% { opacity: 0.9; }
          36% { opacity: 0.26; }
          56% { opacity: 0.78; }
          76% { opacity: 0.22; }
          100% { opacity: 0; }
        }
        @keyframes page-glitch-scan {
          0% {
            opacity: 0;
            transform: translate3d(0, 0, 0);
          }
          8% {
            opacity: 0.72;
            transform: translate3d(calc(7px + var(--random-progress-chroma-shift, 0px)), 0, 0);
          }
          15% {
            opacity: 0.28;
            transform: translate3d(calc(-5px - var(--random-progress-chroma-shift, 0px)), 0, 0);
          }
          28% {
            opacity: 0.64;
            transform: translate3d(calc(3px + var(--random-progress-transition-shift, 0px)), 0, 0);
          }
          52% {
            opacity: 0.36;
            transform: translate3d(calc(-2px + var(--random-progress-transition-shift-negative, 0px)), 0, 0);
          }
          100% {
            opacity: 0;
            transform: translate3d(0, 0, 0);
          }
        }
        @keyframes page-glitch-signal {
          0%, 100% {
            opacity: 0;
            transform: translate3d(0, 0, 0);
          }
          9% {
            opacity: 0.72;
            transform: translate3d(calc(-12px - var(--random-progress-chroma-shift, 0px)), 0, 0);
          }
          10% {
            opacity: 0;
          }
          31% {
            opacity: 0.5;
            transform: translate3d(calc(9px + var(--random-progress-chroma-shift, 0px)), 0, 0);
          }
          33% {
            opacity: 0;
          }
          58% {
            opacity: 0.42;
            transform: translate3d(calc(-6px + var(--random-progress-transition-shift-negative, 0px)), 0, 0);
          }
          60% {
            opacity: 0;
          }
        }
        @keyframes page-glitch-bar {
          0% {
            opacity: 0;
            transform: translate3d(var(--glitch-bar-start-x, -8px), var(--glitch-bar-y-shift, 0px), 0);
          }
          12% {
            opacity: var(--glitch-bar-pop-opacity, 1);
            transform: translate3d(var(--glitch-bar-shift, 12px), var(--glitch-bar-y-reverse, 0px), 0);
          }
          16% {
            opacity: 0;
          }
          34% {
            opacity: var(--glitch-bar-pop-opacity, 1);
            transform: translate3d(var(--glitch-bar-mid-x, -4px), var(--glitch-bar-y-shift, 0px), 0);
          }
          44% {
            opacity: 0;
          }
          63% {
            opacity: var(--glitch-bar-pop-opacity, 1);
            transform: translate3d(calc(0.45 * var(--glitch-bar-shift, 12px)), 0, 0);
          }
          71% {
            opacity: 0.28;
            transform: translate3d(var(--glitch-bar-tail-x, -2px), 0, 0);
          }
          100% {
            opacity: 0;
            transform: translate3d(0, 0, 0);
          }
        }
        .effects-test-meter {
          position: fixed;
          top: 50%;
          right: 6px;
          z-index: 140;
          width: 36px;
          min-height: 72px;
          transform: translateY(-50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border: 1px solid rgba(255, 251, 234, 0.55);
          background: rgba(0, 0, 0, 0.78);
          color: #fffbea;
          font-family: var(--font-tomorrow), sans-serif;
          font-size: 11px;
          font-weight: 700;
          line-height: 1;
        }
        .effects-test-meter__divider {
          width: 18px;
          height: 1px;
          background: rgba(255, 251, 234, 0.38);
        }
        .effects-test-meter button {
          display: inline-flex;
          width: 24px;
          height: 24px;
          align-items: center;
          justify-content: center;
          color: inherit;
        }
        .random-page--effects-progressing:not(.random-page--wave) .random-main-header,
        .random-page--effects-progressing:not(.random-page--wave) .random-category-row,
        .random-page--effects-progressing:not(.random-page--wave) .random-action-section {
          animation: random-progress-ambient var(--random-progress-ambient-duration, 11s) steps(1, end) infinite;
        }
        .random-page--effects-progressing:not(.random-page--wave) .random-category-row {
          animation-delay: -1.7s;
        }
        .random-page--effects-progressing:not(.random-page--wave) .random-action-section {
          animation-delay: -3.1s;
        }
        .random-page--effects-progressing.random-page--glitching:not(.random-page--wave) .random-main-header {
          animation: random-progress-header-hit var(--random-progress-transition-duration, 420ms) steps(1, end) both;
          will-change: transform;
        }
        .random-page--effects-progressing.random-page--glitching:not(.random-page--wave) .random-category-row {
          animation: random-progress-category-hit var(--random-progress-transition-duration, 420ms) steps(1, end) both;
          will-change: transform;
        }
        .random-page--effects-progressing .random-content-frame {
          position: relative;
          isolation: isolate;
        }
        .random-page--effects-progressing .random-content-frame::before,
        .random-page--effects-progressing .random-content-frame::after {
          content: '';
          position: absolute;
          inset: var(--random-overdrive-echo-reach-negative, -4px);
          z-index: 5;
          pointer-events: none;
          opacity: 0;
        }
        .random-page--effects-progressing .random-content-frame::before {
          background:
            linear-gradient(90deg, rgba(0, 234, 255, 0.96), rgba(255, 255, 255, 0.72) 36%, transparent 100%) left 0 top 5% / var(--random-overdrive-edge-long, 44px) 1px no-repeat,
            linear-gradient(90deg, rgba(216, 255, 0, 0.78), transparent 100%) left 0 top 19% / var(--random-overdrive-edge-short, 18px) 1px no-repeat,
            linear-gradient(90deg, rgba(0, 234, 255, 0.86), transparent 100%) left 0 bottom 31% / var(--random-overdrive-edge-medium, 30px) 1.4px no-repeat,
            linear-gradient(270deg, rgba(0, 234, 255, 0.92), rgba(255, 255, 255, 0.6) 42%, transparent 100%) right 0 top 27% / var(--random-overdrive-edge-medium, 30px) 1px no-repeat,
            linear-gradient(270deg, rgba(216, 255, 0, 0.74), transparent 100%) right 0 bottom 8% / var(--random-overdrive-edge-long, 44px) 1px no-repeat,
            linear-gradient(180deg, rgba(0, 234, 255, 0.82), transparent 100%) left 7% top 0 / 1px var(--random-overdrive-edge-short, 18px) no-repeat;
          filter: drop-shadow(4px 0 0 rgba(0, 234, 255, 0.2));
        }
        .random-page--effects-progressing .random-content-frame::after {
          background:
            linear-gradient(90deg, rgba(255, 22, 120, 0.92), rgba(137, 80, 255, 0.7) 44%, transparent 100%) left 0 top 12% / var(--random-overdrive-edge-medium, 30px) 1px no-repeat,
            linear-gradient(90deg, rgba(255, 22, 120, 0.84), transparent 100%) left 0 bottom 12% / var(--random-overdrive-edge-long, 44px) 1.4px no-repeat,
            linear-gradient(270deg, rgba(255, 22, 120, 0.96), rgba(255, 255, 255, 0.62) 38%, transparent 100%) right 0 top 4% / var(--random-overdrive-edge-long, 44px) 1px no-repeat,
            linear-gradient(270deg, rgba(137, 80, 255, 0.86), transparent 100%) right 0 top 61% / var(--random-overdrive-edge-short, 18px) 1px no-repeat,
            linear-gradient(270deg, rgba(255, 22, 120, 0.78), transparent 100%) right 0 bottom 28% / var(--random-overdrive-edge-medium, 30px) 1px no-repeat,
            linear-gradient(0deg, rgba(255, 22, 120, 0.8), transparent 100%) right 9% bottom 0 / 1px var(--random-overdrive-edge-medium, 30px) no-repeat;
          filter: drop-shadow(-4px 0 0 rgba(255, 22, 120, 0.18));
        }
        .random-page--effects-overdrive.random-page--glitching:not(.random-page--wave) .random-content-frame::before {
          animation: random-content-echo-a var(--random-overdrive-echo-duration, 560ms) steps(1, end) both;
        }
        .random-page--effects-overdrive.random-page--glitching:not(.random-page--wave) .random-content-frame::after {
          animation: random-content-echo-b var(--random-overdrive-echo-duration, 560ms) steps(1, end) both;
        }
        .random-page--effects-progressing.random-page--glitching:not(.random-page--wave) .random-content-frame {
          animation: random-progress-content-hit var(--random-progress-transition-duration, 420ms) steps(1, end) both;
          will-change: transform;
        }
        .random-page--effects-progressing.random-page--glitching:not(.random-page--wave) .random-action-section {
          animation: random-progress-action-hit var(--random-progress-transition-duration, 420ms) steps(1, end) both;
          will-change: transform;
        }
        .random-page--effects-progressing.random-page--glitching:not(.random-page--wave) .random-immersive-bg__media {
          animation: random-progress-bg-hit var(--random-progress-transition-duration, 420ms) steps(1, end) both;
          will-change: transform;
        }
        .random-page--effects-progressing.random-page--glitching:not(.random-page--wave) .random-immersive-bg__fragments {
          animation: random-progress-fragments-hit var(--random-progress-transition-duration, 420ms) steps(1, end) both;
          will-change: transform;
        }
        .random-page--lite-effects .page-glitch-overlay--active {
          filter: none;
        }
        @keyframes random-progress-ambient {
          0%, 18%, 100% { transform: translate3d(0, 0, 0); }
          19% { transform: translate3d(var(--random-progress-shift, 0px), 0, 0); }
          20%, 62% { transform: translate3d(0, 0, 0); }
          63% { transform: translate3d(var(--random-progress-shift-negative, 0px), 0, 0); }
          64% { transform: translate3d(0, 0, 0); }
        }
        @keyframes random-progress-header-hit {
          0%, 100% { transform: translate3d(0, 0, 0); }
          14% { transform: translate3d(var(--random-progress-transition-shift-negative, 0px), var(--random-progress-transition-y, 0px), 0); }
          28% { transform: translate3d(var(--random-progress-transition-shift, 0px), var(--random-progress-transition-y-negative, 0px), 0); }
          42% { transform: translate3d(var(--random-progress-transition-shift-half-negative, 0px), 0, 0); }
          52% { transform: translate3d(var(--random-progress-transition-shift-negative, 0px), var(--random-progress-transition-y, 0px), 0); }
          68% { transform: translate3d(var(--random-progress-transition-shift, 0px), 0, 0); }
        }
        @keyframes random-progress-category-hit {
          0%, 100% { transform: translate3d(0, 0, 0); }
          18% { transform: translate3d(var(--random-progress-transition-shift, 0px), 0, 0) scaleX(var(--random-progress-transition-scale, 1)); }
          38% { transform: translate3d(var(--random-progress-transition-shift-negative, 0px), var(--random-progress-transition-y-negative, 0px), 0); }
          61% { transform: translate3d(var(--random-progress-transition-shift, 0px), var(--random-progress-transition-y, 0px), 0); }
        }
        @keyframes random-progress-content-hit {
          0%, 100% { transform: translate3d(0, 0, 0); }
          12% { transform: translate3d(var(--random-progress-transition-shift-negative, 0px), var(--random-progress-transition-y, 0px), 0); }
          26% { transform: translate3d(var(--random-progress-transition-shift, 0px), var(--random-progress-transition-y-negative, 0px), 0); }
          42% { transform: translate3d(var(--random-progress-transition-shift-half-negative, 0px), 0, 0); }
          64% { transform: translate3d(var(--random-progress-transition-shift, 0px), 0, 0); }
          78% { transform: translate3d(0, 0, 0); }
        }
        @keyframes random-content-echo-a {
          0%, 100% { opacity: 0; transform: translate3d(0, 0, 0) scaleX(1); }
          12% { opacity: var(--random-overdrive-echo-opacity, 0); transform: translate3d(var(--random-overdrive-echo-reach-negative, -4px), 0, 0) scaleX(1.035); }
          26% { opacity: 0; transform: translate3d(var(--random-overdrive-echo-reach, 4px), 0, 0) scaleX(1); }
          43% { opacity: var(--random-overdrive-echo-opacity, 0); transform: translate3d(var(--random-overdrive-echo-reach, 4px), -2px, 0) scaleX(1.06); }
          61% { opacity: 0; transform: translate3d(0, 0, 0) scaleX(1); }
          76% { opacity: var(--random-overdrive-echo-opacity, 0); transform: translate3d(var(--random-overdrive-echo-reach-negative, -4px), 2px, 0) scaleX(1.025); }
          88% { opacity: 0; }
        }
        @keyframes random-content-echo-b {
          0%, 100% { opacity: 0; transform: translate3d(0, 0, 0) scaleX(1); }
          18% { opacity: 0; transform: translate3d(0, 0, 0) scaleX(1); }
          31% { opacity: var(--random-overdrive-echo-opacity, 0); transform: translate3d(var(--random-overdrive-echo-reach, 4px), 2px, 0) scaleX(1.045); }
          48% { opacity: 0; transform: translate3d(var(--random-overdrive-echo-reach-negative, -4px), 0, 0) scaleX(1); }
          66% { opacity: var(--random-overdrive-echo-opacity, 0); transform: translate3d(var(--random-overdrive-echo-reach-negative, -4px), -2px, 0) scaleX(1.07); }
          82% { opacity: 0; }
        }
        @keyframes random-progress-action-hit {
          0%, 100% { transform: translate3d(0, 0, 0); }
          16% { transform: translate3d(var(--random-progress-transition-shift-half, 0px), 0, 0); }
          36% { transform: translate3d(var(--random-progress-transition-shift-half-negative, 0px), var(--random-progress-transition-y, 0px), 0); }
          58% { transform: translate3d(var(--random-progress-transition-shift-soft, 0px), 0, 0); }
        }
        @keyframes random-progress-bg-hit {
          0%, 100% { transform: scale(1.12) translate3d(0, 0, 0); }
          12% { transform: scale(var(--random-progress-bg-hit-scale, 1.12)) translate3d(var(--random-progress-bg-hit-shift, 0px), 0, 0); }
          24% { transform: scale(1.12) translate3d(var(--random-progress-bg-hit-shift-negative, 0px), var(--random-progress-transition-y, 0px), 0); }
          43% { transform: scale(var(--random-progress-bg-hit-scale, 1.12)) translate3d(var(--random-progress-bg-hit-shift-half, 0px), var(--random-progress-transition-y-negative, 0px), 0); }
          68% { transform: scale(1.12) translate3d(var(--random-progress-bg-hit-shift-soft-negative, 0px), 0, 0); }
        }
        @keyframes random-progress-fragments-hit {
          0%, 100% { transform: translate3d(0, 0, 0); }
          14% { transform: translate3d(var(--random-progress-transition-shift, 0px), 0, 0); }
          29% { transform: translate3d(var(--random-progress-transition-shift-negative, 0px), var(--random-progress-transition-y-negative, 0px), 0); }
          48% { transform: translate3d(var(--random-progress-transition-shift-soft, 0px), var(--random-progress-transition-y, 0px), 0); }
          72% { transform: translate3d(var(--random-progress-transition-shift-soft-negative, 0px), 0, 0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .random-page--effects-progressing .random-main-header,
          .random-page--effects-progressing .random-category-row,
          .random-page--effects-progressing .random-action-section,
          .random-page--effects-progressing .random-content-frame,
          .random-page--effects-progressing .random-content-frame::before,
          .random-page--effects-progressing .random-content-frame::after,
          .random-page--effects-final::after {
            animation: none !important;
          }
        }
        .burger-icon {
          position: relative;
        }
        .random-menu-trigger {
          position: relative;
          width: 44px;
          height: 44px;
          justify-content: flex-start;
        }
        .random-menu-trigger::after {
          content: '';
          position: absolute;
          left: -8px;
          top: -5px;
          width: 43px;
          height: 36px;
          border: 2px solid currentColor;
          border-radius: 50%;
          opacity: 0;
          transform: scale(.28);
          pointer-events: none;
        }
        .random-menu-trigger--points::after {
          animation: encourage-menu-receive 580ms cubic-bezier(.16,.82,.28,1) forwards;
        }
        .burger-icon .burger-line {
          width: 100%;
          border-radius: 9999px;
          transition: transform 140ms ease, opacity 140ms ease;
        }
        .burger-icon--glitch .burger-line {
          animation: burger-glitch 360ms cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }
        .burger-icon--glitch .burger-line:nth-child(2) {
          animation-delay: 40ms;
        }
        .burger-icon--glitch .burger-line:nth-child(3) {
          animation-delay: 80ms;
        }
        @keyframes burger-glitch {
          0% {
            transform: translateX(0) skewX(0deg) scaleX(1);
            opacity: 1;
            box-shadow: none;
            filter: none;
          }
          20% {
            transform: translateX(-6px) skewX(-8deg) scaleX(1.06);
            opacity: 0.7;
            box-shadow: 4px 0 currentColor, -4px 0 rgba(255, 255, 255, 0.75);
            filter: hue-rotate(-10deg) saturate(1.45);
          }
          48% {
            transform: translateX(6px) skewX(7deg) scaleX(0.94);
            opacity: 0.6;
            box-shadow: -4px 0 currentColor, 4px 0 rgba(255, 255, 255, 0.55);
            filter: hue-rotate(9deg) saturate(1.35);
          }
          72% {
            transform: translateX(-3px) skewX(-5deg) scaleX(1.08);
            opacity: 0.85;
            box-shadow: 2px 0 currentColor, -2px 0 rgba(255, 255, 255, 0.4);
            filter: hue-rotate(-6deg) saturate(1.25);
          }
          100% {
            transform: translateX(0) skewX(0deg) scaleX(1);
            opacity: 1;
            box-shadow: none;
            filter: none;
          }
        }
        @keyframes encourage-menu-receive {
          0% { opacity: 0; transform: scale(.28); }
          24% { opacity: 1; transform: scale(1.24); }
          58% { opacity: .72; transform: scale(.92); }
          100% { opacity: 0; transform: scale(1.52); }
        }

        .heart-icon {
          transition: transform 200ms ease, filter 200ms ease;
        }
        .wave-action {
          position: relative;
          isolation: isolate;
          overflow: visible;
          transition: transform 180ms ease, opacity 180ms ease;
        }
        .random-page--wave .wave-action {
          animation: wave-button-pulse 1.28s cubic-bezier(0.42, 0, 0.25, 1) infinite;
        }
        .wave-action__icon {
          position: relative;
          z-index: 2;
          display: inline-flex;
          transform-origin: center;
        }
        .random-page--wave .wave-action__icon {
          animation: wave-icon-flow 0.72s ease-in-out infinite;
        }
        .wave-action__echo {
          position: absolute;
          inset: 0;
          z-index: -1;
          border: 2px solid #00eaff;
          border-radius: 50%;
          opacity: 0;
          pointer-events: none;
        }
        .wave-action__echo--two {
          border-color: #ff1678;
        }
        .wave-action__echo--three {
          border-color: #d8ff00;
        }
        .random-page--wave .wave-action__echo {
          animation: wave-echo 1.72s cubic-bezier(0.2, 0.62, 0.3, 1) infinite;
        }
        .random-page--wave .wave-action__echo--two {
          animation-delay: 0.36s;
        }
        .random-page--wave .wave-action__echo--three {
          animation-delay: 0.72s;
        }
        .random-page::before {
          content: '';
          position: fixed;
          inset: 0;
          z-index: 7;
          pointer-events: none;
          opacity: 0;
          box-shadow:
            inset 22px 0 54px rgba(0, 234, 255, 0.42),
            inset -22px 0 54px rgba(255, 22, 120, 0.38),
            inset 0 18px 42px rgba(216, 255, 0, 0.12),
            inset 0 -26px 58px rgba(104, 54, 255, 0.3);
          transition: opacity 440ms ease;
        }
        .random-page::after {
          content: '';
          position: fixed;
          inset: 0;
          z-index: 8;
          pointer-events: none;
          opacity: 0;
        }
        .random-page--effects-final:not(.random-page--wave)::after {
          opacity: var(--random-final-edge-opacity, 0);
          background:
            linear-gradient(90deg, rgba(255, 255, 255, 0.78), rgba(0, 234, 255, 0.82) 22%, transparent 100%) left 0 top 6% / var(--random-final-edge-long, 118px) 1.8px no-repeat,
            linear-gradient(90deg, rgba(216, 255, 0, 0.88), transparent 100%) left 0 top 23% / var(--random-final-edge-short, 34px) 2.4px no-repeat,
            linear-gradient(90deg, rgba(137, 80, 255, 0.84), rgba(0, 234, 255, 0.52) 46%, transparent 100%) left 0 top 38% / var(--random-final-edge-medium, 72px) 1.4px no-repeat,
            linear-gradient(90deg, rgba(0, 234, 255, 0.92), transparent 100%) left 0 top 64% / var(--random-final-edge-long, 118px) 2.1px no-repeat,
            linear-gradient(90deg, rgba(255, 22, 120, 0.8), rgba(255, 255, 255, 0.58) 34%, transparent 100%) left 0 top 79% / var(--random-final-edge-medium, 72px) 1.6px no-repeat,
            linear-gradient(90deg, rgba(216, 255, 0, 0.82), transparent 100%) left 0 top 93% / var(--random-final-edge-short, 34px) 2px no-repeat,
            linear-gradient(270deg, rgba(255, 22, 120, 0.94), rgba(255, 255, 255, 0.66) 26%, transparent 100%) right 0 top 13% / var(--random-final-edge-medium, 72px) 2px no-repeat,
            linear-gradient(270deg, rgba(0, 234, 255, 0.86), transparent 100%) right 0 top 29% / var(--random-final-edge-long, 118px) 1.5px no-repeat,
            linear-gradient(270deg, rgba(216, 255, 0, 0.86), rgba(137, 80, 255, 0.54) 42%, transparent 100%) right 0 top 47% / var(--random-final-edge-short, 34px) 2.5px no-repeat,
            linear-gradient(270deg, rgba(255, 22, 120, 0.9), transparent 100%) right 0 top 58% / var(--random-final-edge-medium, 72px) 1.7px no-repeat,
            linear-gradient(270deg, rgba(255, 255, 255, 0.76), rgba(0, 234, 255, 0.62) 31%, transparent 100%) right 0 top 74% / var(--random-final-edge-long, 118px) 2.2px no-repeat,
            linear-gradient(270deg, rgba(137, 80, 255, 0.9), transparent 100%) right 0 top 91% / var(--random-final-edge-medium, 72px) 1.5px no-repeat;
          filter: saturate(1.35) brightness(1.08);
          animation: random-final-perimeter var(--random-final-edge-duration, 1.4s) steps(4, end) infinite;
          will-change: transform, opacity;
        }
        .random-page--effects-final.random-page--glitching:not(.random-page--wave)::after {
          opacity: min(1, calc(var(--random-final-edge-opacity, 0) + 0.12));
        }
        .random-page--effects-overdrive:not(.random-page--wave)::before {
          opacity: var(--random-overdrive-edge-opacity, 0);
          background:
            linear-gradient(90deg, rgba(0, 234, 255, 0.8), transparent 100%) left 0 top 3% / var(--random-overdrive-edge-medium, 30px) 0.8px no-repeat,
            linear-gradient(90deg, rgba(216, 255, 0, 0.62), transparent 100%) left 0 top 11% / var(--random-overdrive-edge-short, 18px) 1px no-repeat,
            linear-gradient(90deg, rgba(0, 234, 255, 0.72), rgba(255, 255, 255, 0.3) 48%, transparent 100%) left 0 top 18% / var(--random-overdrive-edge-long, 44px) 1.2px no-repeat,
            linear-gradient(90deg, rgba(137, 80, 255, 0.64), transparent 100%) left 0 top 31% / var(--random-overdrive-edge-short, 18px) 0.7px no-repeat,
            linear-gradient(90deg, rgba(0, 234, 255, 0.82), transparent 100%) left 0 top 46% / var(--random-overdrive-edge-medium, 30px) 1px no-repeat,
            linear-gradient(90deg, rgba(216, 255, 0, 0.58), transparent 100%) left 0 top 59% / var(--random-overdrive-edge-long, 44px) 0.8px no-repeat,
            linear-gradient(90deg, rgba(0, 234, 255, 0.68), transparent 100%) left 0 top 71% / var(--random-overdrive-edge-short, 18px) 1.3px no-repeat,
            linear-gradient(90deg, rgba(255, 255, 255, 0.5), rgba(0, 234, 255, 0.42) 28%, transparent 100%) left 0 top 84% / var(--random-overdrive-edge-medium, 30px) 0.7px no-repeat,
            linear-gradient(90deg, rgba(216, 255, 0, 0.62), transparent 100%) left 0 top 96% / var(--random-overdrive-edge-long, 44px) 1px no-repeat,
            linear-gradient(270deg, rgba(255, 22, 120, 0.84), transparent 100%) right 0 top 7% / var(--random-overdrive-edge-short, 18px) 1.2px no-repeat,
            linear-gradient(270deg, rgba(137, 80, 255, 0.7), transparent 100%) right 0 top 16% / var(--random-overdrive-edge-long, 44px) 0.8px no-repeat,
            linear-gradient(270deg, rgba(255, 22, 120, 0.74), rgba(255, 255, 255, 0.32) 44%, transparent 100%) right 0 top 27% / var(--random-overdrive-edge-medium, 30px) 1px no-repeat,
            linear-gradient(270deg, rgba(216, 255, 0, 0.54), transparent 100%) right 0 top 39% / var(--random-overdrive-edge-short, 18px) 0.7px no-repeat,
            linear-gradient(270deg, rgba(255, 22, 120, 0.88), transparent 100%) right 0 top 53% / var(--random-overdrive-edge-long, 44px) 1.3px no-repeat,
            linear-gradient(270deg, rgba(137, 80, 255, 0.66), transparent 100%) right 0 top 66% / var(--random-overdrive-edge-medium, 30px) 0.8px no-repeat,
            linear-gradient(270deg, rgba(255, 22, 120, 0.7), transparent 100%) right 0 top 78% / var(--random-overdrive-edge-short, 18px) 1px no-repeat,
            linear-gradient(270deg, rgba(255, 255, 255, 0.48), rgba(255, 22, 120, 0.38) 32%, transparent 100%) right 0 top 89% / var(--random-overdrive-edge-long, 44px) 0.7px no-repeat,
            linear-gradient(270deg, rgba(137, 80, 255, 0.68), transparent 100%) right 0 top 98% / var(--random-overdrive-edge-medium, 30px) 1.1px no-repeat;
          box-shadow:
            inset 6px 0 16px rgba(0, 234, 255, 0.16),
            inset -6px 0 16px rgba(255, 22, 120, 0.16);
          animation: random-overdrive-perimeter var(--random-overdrive-edge-duration, 3.4s) steps(5, end) infinite;
          will-change: transform, opacity;
        }
        .random-page--effects-overdrive.random-page--glitching:not(.random-page--wave)::before {
          opacity: var(--random-overdrive-edge-hit-opacity, 0.18);
        }
        .random-page--wave::before {
          opacity: 0.72;
          animation: wave-perimeter 3.4s ease-in-out infinite;
        }
        .random-page--wave .random-immersive-bg__media {
          filter: blur(10px) saturate(2.25) contrast(1.3) brightness(0.46);
          opacity: min(1, calc(var(--random-bg-strength, 0) * 1.6));
          transform: scale(1.2);
          animation: wave-background-breathe 5.2s ease-in-out infinite alternate;
        }
        .random-page--wave .random-immersive-bg__fragments {
          filter: blur(1px) saturate(1.55);
          opacity: min(1, calc(var(--random-bg-strength, 0) * 0.46));
        }
        .random-page--wave .random-immersive-bg__tone {
          filter: saturate(1.8) hue-rotate(8deg);
          animation: wave-tone-breathe 3.8s ease-in-out infinite alternate;
        }
        .random-page--wave .random-content-frame {
          filter:
            drop-shadow(10px 0 18px rgba(0, 234, 255, 0.2))
            drop-shadow(-10px 0 18px rgba(255, 22, 120, 0.18));
          transition: filter 440ms ease, transform 440ms ease;
        }
        .random-page--wave-transition .random-content-frame {
          animation: wave-content-surge 500ms cubic-bezier(0.18, 0.72, 0.22, 1) both;
        }
        .random-page--wave-transition::before {
          animation: wave-entry-flash 600ms ease-out both;
        }
        @keyframes wave-button-pulse {
          0%, 100% { transform: scale(1); }
          40% { transform: scale(1.13); }
          58% { transform: scale(0.97); }
          72% { transform: scale(1.055); }
        }
        @keyframes wave-icon-flow {
          0%, 100% { transform: translateX(-3px) skewX(-7deg) scaleX(0.9); }
          50% { transform: translateX(3px) skewX(7deg) scaleX(1.12); }
        }
        @keyframes wave-echo {
          0% { transform: scale(0.88); opacity: 0; filter: blur(0); }
          14% { opacity: 0.76; }
          72% { opacity: 0.12; }
          100% { transform: scale(2.35); opacity: 0; filter: blur(1.5px); }
        }
        @keyframes wave-perimeter {
          0%, 100% { opacity: 0.54; filter: saturate(1); }
          50% { opacity: 0.86; filter: saturate(1.7); }
        }
        @keyframes random-overdrive-perimeter {
          0%, 100% {
            transform: translate3d(0, 0, 0);
            filter: saturate(1) brightness(0.9);
          }
          32% {
            transform: translate3d(0, var(--random-overdrive-edge-shift-negative, -6px), 0);
            filter: saturate(1.5) brightness(1.12);
          }
          66% {
            transform: translate3d(0, var(--random-overdrive-edge-shift, 6px), 0);
            filter: saturate(1.85) brightness(1.2);
          }
        }
        @keyframes random-final-perimeter {
          0%, 100% {
            transform: translate3d(0, 0, 0) scaleX(1);
            filter: saturate(1.2) brightness(0.96);
          }
          24% {
            transform: translate3d(0, -8px, 0) scaleX(0.93);
            filter: saturate(1.8) brightness(1.18);
          }
          49% {
            transform: translate3d(0, 5px, 0) scaleX(1.04);
            filter: saturate(2.1) brightness(1.26);
          }
          76% {
            transform: translate3d(0, -3px, 0) scaleX(0.97);
            filter: saturate(1.55) brightness(1.08);
          }
        }
        @keyframes wave-background-breathe {
          0% { transform: translate3d(-1.2%, 0, 0) scale(1.18); }
          100% { transform: translate3d(1.2%, -0.7%, 0) scale(1.23); }
        }
        @keyframes wave-tone-breathe {
          0% { opacity: 0.72; transform: scale(1); }
          100% { opacity: 1; transform: scale(1.035); }
        }
        @keyframes wave-content-surge {
          0% { transform: scale(1); opacity: 1; }
          34% { transform: scale(0.94) translateX(-12px); opacity: 0.38; }
          58% { transform: scale(1.035) translateX(8px); opacity: 0.84; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes wave-entry-flash {
          0% { opacity: 0; }
          28% { opacity: 1; }
          100% { opacity: 0.66; }
        }
        .random-page--lite-effects.random-page--wave::before {
          opacity: 0.58;
          animation: none;
          box-shadow:
            inset 12px 0 28px rgba(0, 234, 255, 0.3),
            inset -12px 0 28px rgba(255, 22, 120, 0.28);
        }
        .random-page--lite-effects.random-page--effects-overdrive:not(.random-page--wave)::before {
          box-shadow:
            inset 4px 0 12px rgba(0, 234, 255, 0.14),
            inset -4px 0 12px rgba(255, 22, 120, 0.14);
          animation-timing-function: steps(2, end);
        }
        .random-page--lite-effects.random-page--effects-final:not(.random-page--wave)::after {
          background:
            linear-gradient(90deg, rgba(255, 255, 255, 0.72), rgba(0, 234, 255, 0.76) 26%, transparent 100%) left 0 top 8% / var(--random-final-edge-long, 118px) 1.6px no-repeat,
            linear-gradient(90deg, rgba(216, 255, 0, 0.8), transparent 100%) left 0 top 36% / var(--random-final-edge-short, 34px) 2.1px no-repeat,
            linear-gradient(90deg, rgba(255, 22, 120, 0.76), transparent 100%) left 0 top 81% / var(--random-final-edge-medium, 72px) 1.5px no-repeat,
            linear-gradient(270deg, rgba(255, 22, 120, 0.86), rgba(255, 255, 255, 0.58) 30%, transparent 100%) right 0 top 19% / var(--random-final-edge-medium, 72px) 1.8px no-repeat,
            linear-gradient(270deg, rgba(0, 234, 255, 0.8), transparent 100%) right 0 top 57% / var(--random-final-edge-long, 118px) 1.4px no-repeat,
            linear-gradient(270deg, rgba(137, 80, 255, 0.82), transparent 100%) right 0 top 92% / var(--random-final-edge-short, 34px) 1.9px no-repeat;
          animation-timing-function: steps(2, end);
        }
        .random-page--lite-effects.random-page--effects-overdrive .random-content-frame::after {
          display: none;
        }
        .random-page--lite-effects.random-page--effects-overdrive.random-page--glitching:not(.random-page--wave) .random-content-frame::before {
          animation-timing-function: steps(2, end);
        }
        .random-page--lite-effects.random-page--wave .random-immersive-bg__media {
          filter: blur(7px) saturate(1.7) contrast(1.2) brightness(0.44);
          transform: scale(1.14);
          animation: wave-background-breathe-lite 7200ms steps(1, end) infinite alternate;
        }
        .random-page--lite-effects.random-page--wave .random-immersive-bg__tone {
          filter: none;
          animation: none;
        }
        .random-page--lite-effects.random-page--wave .random-immersive-bg__fragments {
          filter: none;
          animation: random-fragments-drift-lite 8200ms steps(1, end) infinite;
        }
        .random-page--lite-effects.random-page--wave .random-content-frame {
          filter: none;
          transition: none;
        }
        .random-page--lite-effects.random-page--wave-transition .random-content-frame {
          animation: wave-content-surge-lite 340ms cubic-bezier(0.18, 0.72, 0.22, 1) both;
        }
        @keyframes wave-content-surge-lite {
          0% { transform: translate3d(0, 0, 0) scale(1); opacity: 1; }
          42% { transform: translate3d(-8px, 0, 0) scale(0.97); opacity: 0.42; }
          68% { transform: translate3d(5px, 0, 0) scale(1.015); opacity: 0.88; }
          100% { transform: translate3d(0, 0, 0) scale(1); opacity: 1; }
        }
        @keyframes wave-background-breathe-lite {
          0% { transform: translate3d(-0.8%, 0, 0) scale(1.14); }
          50% { transform: translate3d(0.9%, -0.35%, 0) scale(1.16); }
          100% { transform: translate3d(-0.15%, 0.55%, 0) scale(1.15); }
        }
        .heart-icon--liked {
          transform: scale(1.05);
        }
        .heart-icon--glitch {
          animation: heart-glitch 420ms steps(4, jump-start) forwards;
        }
        @keyframes heart-glitch {
          0% {
            transform: scale(1) translate(0, 0);
            filter: none;
          }
          18% {
            transform: scale(1.2) translate(-4px, 2px);
            filter: hue-rotate(-18deg) saturate(1.55) drop-shadow(0 0 10px rgba(255, 255, 255, 0.35));
          }
          38% {
            transform: scale(0.9) translate(4px, -3px);
            filter: hue-rotate(14deg) saturate(1.6) drop-shadow(0 0 12px rgba(255, 77, 120, 0.45));
          }
          58% {
            transform: scale(1.24) translate(-3px, 3px);
            filter: hue-rotate(-12deg) saturate(1.7) drop-shadow(0 0 16px rgba(255, 255, 255, 0.4));
          }
          82% {
            transform: scale(0.92) translate(3px, -2px);
            filter: hue-rotate(10deg) saturate(1.45) drop-shadow(0 0 10px rgba(255, 77, 120, 0.35));
          }
          100% {
            transform: scale(1) translate(0, 0);
            filter: none;
          }
        }
      `}</style>
    </main>
  )
}

export default RandomExperience
