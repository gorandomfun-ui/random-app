/**
 * The home's advance: the first draws of a Random session, made with the
 * discovery engine while the visitor is still on the home, so the first
 * click is instant and the next ones wait for nothing.
 *
 * The home creates the session (seed, score) and the format cycle, asks
 * for the first three draws together, then one more at a time up to eight
 * while the visitor stays — an advance, never a stream — and stops as soon
 * as they leave. Each draw is kept in the tab with the session, its media
 * warmed. The Random page adopts the session and the advance and goes on
 * filling its own queue. Nothing is prepared when the tab already holds a
 * Random session: coming back from the page keeps what it has in its queue.
 */

import { DiscoveryController, makeRandomLoader } from './controller'
import { newSession, planDraw, projectDraw, type Intent, type Session } from './pool'
import { parseSession } from './sessionCodec'
import type { Candidate } from './types'
import type { RandomContentItem } from '@/lib/random/clientTypes'
import type { ItemType } from '@/lib/random/types'
import {
  ALL_ITEM_TYPES, cloneSequenceState, createSequenceState, isSequenceEntry, nextSlot,
  type RandomSequenceState, type SequenceSlot,
} from '@/lib/random/sequence'
import { RANDOM_SESSION_TTL_MS, homeAdvanceKey, randomSessionKey } from '@/lib/random/sessionKeys'
import { seenKeys } from '@/utils/seenMemory'

/** The most the home prepares: an advance, not a flow. */
export const RANDOM_HOME_PREFETCH_MAX = 8
/** Asked for together, before anything is known of them, so the first click is instant. */
export const HOME_PREFETCH_PARALLEL = 3
const ADVANCE_VERSION = 1
const REQUEST_TIMEOUT_MS = 8000

export type HomeAdvanceEntry = {
  slot: Extract<SequenceSlot, { kind: 'content' }>
  ticket: Intent
  candidate: Candidate<RandomContentItem>
  sequenceAfter: RandomSequenceState
}
export type HomeAdvance = {
  version: typeof ADVANCE_VERSION
  timestamp: number
  lang: string
  /** The session before any of the entries: the page reserves them again, in order. */
  session: Session
  /** The cycle before any of the entries. */
  sequence: RandomSequenceState
  entries: HomeAdvanceEntry[]
}

function storage(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage
  } catch {
    return null
  }
}

/** A fresh Random session already in the tab: the page keeps its own queue, the home prepares nothing. */
export function hasRandomSession(lang: string, curation: boolean, now = Date.now()): boolean {
  const raw = storage()?.getItem(randomSessionKey(lang, curation))
  if (!raw) return false
  try {
    const parsed = JSON.parse(raw) as { timestamp?: unknown; discovery?: unknown }
    return typeof parsed.timestamp === 'number' && now - parsed.timestamp <= RANDOM_SESSION_TTL_MS && parsed.discovery != null
  } catch {
    return false
  }
}

const isObject = (value: unknown): value is Record<string, unknown> => value != null && typeof value === 'object' && !Array.isArray(value)

function parseSequence(value: unknown): RandomSequenceState | null {
  if (!isObject(value) || !Array.isArray(value.cycle) || !value.cycle.length || !value.cycle.every(isSequenceEntry)) return null
  const numbers = ['step', 'round', 'encourage', 'draws', 'sinceEncourage', 'currentInterval', 'intervalIndex']
  if (!numbers.every((key) => typeof value[key] === 'number' && Number.isFinite(value[key]))) return null
  return cloneSequenceState(value as unknown as RandomSequenceState)
}

function parseEntry(value: unknown): HomeAdvanceEntry | null {
  if (!isObject(value) || !isObject(value.slot) || !isObject(value.ticket) || !isObject(value.candidate)) return null
  const slot = value.slot as Partial<Extract<SequenceSlot, { kind: 'content' }>>
  if (slot.kind !== 'content' || !ALL_ITEM_TYPES.includes(slot.itemType as ItemType)) return null
  const ticket = value.ticket as Partial<Intent>
  if (typeof ticket.revision !== 'number' || ticket.type !== slot.itemType) return null
  const candidate = value.candidate as Partial<Candidate<RandomContentItem>>
  if (typeof candidate.key !== 'string' || candidate.type !== slot.itemType || !isObject(candidate.payload) || candidate.payload.type !== slot.itemType) return null
  const sequenceAfter = parseSequence(value.sequenceAfter)
  if (!sequenceAfter) return null
  return { slot: slot as HomeAdvanceEntry['slot'], ticket: ticket as Intent, candidate: candidate as Candidate<RandomContentItem>, sequenceAfter }
}

/** The advance kept in the tab for this language, when it is whole and fresh. */
export function parseHomeAdvance(raw: string, lang: string, now = Date.now()): HomeAdvance | null {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!isObject(parsed) || parsed.version !== ADVANCE_VERSION || parsed.lang !== lang) return null
    if (typeof parsed.timestamp !== 'number' || now - parsed.timestamp > RANDOM_SESSION_TTL_MS) return null
    const session = parseSession(parsed.session)
    const sequence = parseSequence(parsed.sequence)
    if (!session || !sequence || !Array.isArray(parsed.entries)) return null
    const entries: HomeAdvanceEntry[] = []
    for (const entry of parsed.entries) {
      const valid = parseEntry(entry)
      if (!valid) break
      entries.push(valid)
    }
    return { version: ADVANCE_VERSION, timestamp: parsed.timestamp, lang, session, sequence, entries }
  } catch {
    return null
  }
}

export function readHomeAdvance(lang: string, curation: boolean, now = Date.now()): HomeAdvance | null {
  const raw = storage()?.getItem(homeAdvanceKey(lang, curation))
  return raw ? parseHomeAdvance(raw, lang, now) : null
}

export function clearHomeAdvance(lang: string, curation: boolean): void {
  try {
    storage()?.removeItem(homeAdvanceKey(lang, curation))
  } catch {
    /* nothing to clear */
  }
}

function writeHomeAdvance(key: string, advance: HomeAdvance): void {
  try {
    storage()?.setItem(key, JSON.stringify(advance))
  } catch {
    /* A full storage loses the advance, never the visit. */
  }
}

const youtubeId = (url: string) => /(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/)([A-Za-z0-9_-]{11})/.exec(url)?.[1] ?? null
const dailymotionId = (url: string) => /(?:dailymotion\.com\/(?:video|embed\/video)\/|dai\.ly\/)([A-Za-z0-9]+)/.exec(url)?.[1] ?? null

/** What the page shows first of a content: its thumbnail, or the image itself. */
export function mediaUrlOf(item: RandomContentItem): string | null {
  if (item.type === 'image') return item.thumbUrl || item.url || null
  if (item.type === 'video') {
    if (item.thumbUrl) return item.thumbUrl
    const youtube = youtubeId(item.url)
    if (youtube) return `https://img.youtube.com/vi/${youtube}/hqdefault.jpg`
    const dailymotion = dailymotionId(item.url)
    return dailymotion ? `https://www.dailymotion.com/thumbnail/video/${dailymotion}` : null
  }
  if (item.type === 'web') return item.ogImage ?? null
  return null
}

function warm(item: RandomContentItem): void {
  const url = mediaUrlOf(item)
  if (!url || typeof Image === 'undefined') return
  try {
    const image = new Image()
    image.decoding = 'async'
    image.src = url
  } catch {
    /* warming is a favour, never a failure */
  }
}

export type HomePrefetchOptions = {
  curation?: boolean
  request?: typeof fetch
  random?: () => number
  now?: () => number
  max?: number
}
export type HomePrefetch = { stop: () => void; done: Promise<void> }

const running = new Set<string>()
const factVariant = (slot: SequenceSlot) => (slot.kind === 'content' && slot.itemType === 'fact' ? (slot.requireQuiz ? 'quiz' : 'text') : undefined)

/**
 * Starts the advance for this home visit and returns what stops it. Nothing
 * starts when the tab already holds a Random session or an advance, or when
 * one is being made.
 */
export function startHomePrefetch(lang: string, options: HomePrefetchOptions = {}): HomePrefetch {
  const curation = options.curation ?? false
  const key = homeAdvanceKey(lang, curation)
  const now = options.now ?? Date.now
  const idle: HomePrefetch = { stop: () => undefined, done: Promise.resolve() }
  if (running.has(key) || hasRandomSession(lang, curation, now()) || (readHomeAdvance(lang, curation, now())?.entries.length ?? 0) >= HOME_PREFETCH_PARALLEL) return idle

  const random = options.random ?? Math.random
  const max = Math.min(RANDOM_HOME_PREFETCH_MAX, Math.max(1, options.max ?? RANDOM_HOME_PREFETCH_MAX))
  const load = makeRandomLoader<RandomContentItem>(lang, options.request, seenKeys)
  const controller = new DiscoveryController<RandomContentItem>(newSession(Math.floor(random() * 0xffffffff)))
  const allowed = new Set<ItemType>(ALL_ITEM_TYPES)
  const abort = new AbortController()
  let stopped = false

  const sequence = createSequenceState(random)
  const advance: HomeAdvance = { version: ADVANCE_VERSION, timestamp: now(), lang, session: controller.snapshot(), sequence: cloneSequenceState(sequence), entries: [] }
  let cursor = sequence
  // The next content slot of the cycle; an encouragement page belongs to the page, so the advance stops before one.
  const plan = (): { slot: HomeAdvanceEntry['slot']; after: RandomSequenceState } | null => {
    const next = nextSlot(cursor, allowed, ALL_ITEM_TYPES, random)
    if (next.slot.kind !== 'content') return null
    cursor = next.state
    return { slot: next.slot, after: next.state }
  }
  const fits = (candidate: Candidate<RandomContentItem> | null, type: ItemType) => Boolean(candidate && candidate.payload?.type === type)
  const loader = async (session: Session, type: ItemType, signal: AbortSignal, variant?: 'quiz' | 'text') => {
    const candidate = await load(session, type, signal, variant)
    return fits(candidate, type) ? candidate : null
  }
  const keep = (slot: HomeAdvanceEntry['slot'], ticket: Intent, candidate: Candidate<RandomContentItem>, after: RandomSequenceState) => {
    advance.entries.push({ slot, ticket, candidate, sequenceAfter: cloneSequenceState(after) })
    warm(candidate.payload)
    writeHomeAdvance(key, advance)
  }

  const run = async () => {
    // The first three together: their tickets and counters are known before their contents are.
    const first: { slot: HomeAdvanceEntry['slot']; after: RandomSequenceState; state: Session; ticket: Intent }[] = []
    let projected = controller.projected
    for (let index = 0; index < Math.min(HOME_PREFETCH_PARALLEL, max); index += 1) {
      const planned = plan()
      if (!planned) break
      const ticket = planDraw(projected, planned.slot.itemType)
      first.push({ ...planned, state: projected, ticket })
      projected = projectDraw(projected, ticket, planned.slot.itemType)
    }
    const timer = setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS)
    const results = await Promise.all(first.map(({ state, slot }) => loader(state, slot.itemType, abort.signal, factVariant(slot)).catch(() => null)))
    clearTimeout(timer)
    for (const [index, planned] of first.entries()) {
      if (stopped) return
      let candidate = results[index]
      if (candidate) {
        try {
          controller.adopt(planned.ticket, candidate)
        } catch {
          // The same content twice among the three: this position is drawn again, alone, with what is now known.
          candidate = null
        }
      }
      if (!candidate) {
        const prepared = await controller.prepare(planned.slot.itemType, loader, factVariant(planned.slot)).catch(() => null)
        if (stopped || !prepared) return
        candidate = prepared.candidate
      }
      keep(planned.slot, planned.ticket, candidate, planned.after)
    }
    // Then one at a time, while the visitor stays.
    while (!stopped && advance.entries.length < max) {
      const planned = plan()
      if (!planned) return
      const ticket = planDraw(controller.projected, planned.slot.itemType)
      const prepared = await controller.prepare(planned.slot.itemType, loader, factVariant(planned.slot)).catch(() => null)
      if (stopped || !prepared) return
      keep(planned.slot, ticket, prepared.candidate, planned.after)
    }
  }

  running.add(key)
  const done = run().catch(() => undefined).finally(() => running.delete(key))
  return {
    stop: () => {
      stopped = true
      abort.abort()
      controller.invalidate()
    },
    done,
  }
}

/**
 * The page takes the advance: a controller on the home's session, the
 * entries reserved again in order, stopping at the first that no longer
 * fits — a video blocked since, a ticket out of step.
 */
export function adoptHomeAdvance(
  advance: HomeAdvance,
  accept: (candidate: Candidate<RandomContentItem>) => boolean = () => true,
): { controller: DiscoveryController<RandomContentItem>; entries: HomeAdvanceEntry[] } {
  const controller = new DiscoveryController<RandomContentItem>(advance.session)
  const entries: HomeAdvanceEntry[] = []
  for (const entry of advance.entries) {
    if (!accept(entry.candidate)) break
    try {
      controller.adopt(entry.ticket, entry.candidate)
    } catch {
      break
    }
    entries.push(entry)
  }
  return { controller, entries }
}
