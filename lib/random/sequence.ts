import { ENCOURAGE_PAGES_ENABLED } from '@/lib/features'
import type { ItemType, VideoPool } from './types'

export type SequenceEntry =
  | { kind: 'fixed'; itemType: ItemType }
  | { kind: 'quiz'; itemType: 'fact' }
  | { kind: 'text' }

export const RANDOM_SEQUENCE_SIZE = 40
export const RANDOM_SEQUENCE_QUIZ_COUNT = 2
export const TWO_WEB_CYCLE_CHANCE = 0.25

export const ALL_ITEM_TYPES: ItemType[] = ['image', 'video', 'quote', 'joke', 'fact', 'web']
export const TEXT_ITEM_TYPES: ItemType[] = ['fact', 'joke', 'quote']
export const ENCOURAGE_INTERVALS = [22, 24, 28, 24, 26, 28]
export const STRONG_POOL_INITIAL_DRAWS = 20
export const INITIAL_VIDEO_POOLS: Partial<Record<number, VideoPool>> = {
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

/** What the cycle asks for next: a content of one format, or an encouragement page. */
export type SequenceSlot =
  | { kind: 'content'; itemType: ItemType; requireQuiz?: boolean; strong?: boolean; videoPool?: VideoPool }
  | { kind: 'encourage'; round: number; encourageIndex: number }

export type RandomSequenceState = {
  cycle: SequenceEntry[]
  step: number
  round: number
  encourage: number
  draws: number
  sinceEncourage: number
  currentInterval: number
  intervalIndex: number
}

function repeat(entry: SequenceEntry, count: number): SequenceEntry[] {
  return Array.from({ length: count }, () => ({ ...entry }))
}

function shuffle<T>(values: T[], random: () => number): T[] {
  const result = [...values]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    ;[result[index], result[swapIndex]] = [result[swapIndex], result[index]]
  }
  return result
}

export function createRandomSequence(random: () => number = Math.random): SequenceEntry[] {
  const webCount = random() < TWO_WEB_CYCLE_CHANCE ? 2 : 1
  let videoCount = 25
  let imageCount = 10

  if (webCount === 2) {
    videoCount -= 1
    imageCount -= 1
  } else if (random() < 0.5) {
    videoCount -= 1
  } else {
    imageCount -= 1
  }

  return shuffle([
    ...repeat({ kind: 'fixed', itemType: 'video' }, videoCount),
    ...repeat({ kind: 'fixed', itemType: 'image' }, imageCount),
    ...repeat({ kind: 'fixed', itemType: 'web' }, webCount),
    ...repeat({ kind: 'quiz', itemType: 'fact' }, RANDOM_SEQUENCE_QUIZ_COUNT),
    ...repeat({ kind: 'text' }, 3),
  ], random)
}

export const createSequenceState = (random: () => number = Math.random): RandomSequenceState => ({
  cycle: createRandomSequence(random),
  step: 0,
  round: 0,
  encourage: 0,
  draws: 0,
  sinceEncourage: 0,
  currentInterval: ENCOURAGE_INTERVALS[0] ?? 15,
  intervalIndex: 0,
})

export const cloneSequenceState = (state: RandomSequenceState): RandomSequenceState => ({
  ...state,
  cycle: state.cycle.map((entry) => ({ ...entry })),
})

export const isSequenceEntry = (value: unknown): value is SequenceEntry => {
  if (!value || typeof value !== 'object') return false
  const entry = value as Partial<SequenceEntry>
  if (entry.kind === 'text') return true
  if (entry.kind === 'quiz') return entry.itemType === 'fact'
  return entry.kind === 'fixed' && ALL_ITEM_TYPES.includes(entry.itemType as ItemType)
}

/**
 * The next slot of the cycle and the state after it. The page and the home
 * read the cycle the same way: an encouragement page when its interval is
 * reached, else the next entry of the cycle that an allowed type resolves,
 * a new cycle when this one is spent.
 */
export function nextSlot(
  state: RandomSequenceState,
  allowedTypes: Set<ItemType>,
  selectedTypes: ItemType[],
  random: () => number = Math.random,
): { slot: SequenceSlot; state: RandomSequenceState } {
  let seq = state.cycle
  if (!seq.length) return { slot: { kind: 'content', itemType: 'image' }, state }

  let step = state.step
  let round = state.round
  if (step >= seq.length) {
    seq = createRandomSequence(random)
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

    return {
      slot: { kind: 'encourage', round: encourageRound, encourageIndex: encourage },
      state: {
        cycle: seq,
        step: normalizedStep,
        round: encourageRound,
        encourage,
        draws: currentDraws,
        sinceEncourage: 0,
        currentInterval: nextInterval,
        intervalIndex: nextIndex,
      },
    }
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
      return { itemType: available[Math.floor(random() * available.length)] }
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

  return {
    slot: {
      kind: 'content',
      itemType: chosenSlot.itemType,
      requireQuiz: chosenSlot.requireQuiz,
      strong: currentDraws < STRONG_POOL_INITIAL_DRAWS,
      videoPool:
        chosenSlot.itemType === 'video' && currentDraws < STRONG_POOL_INITIAL_DRAWS
          ? INITIAL_VIDEO_POOLS[currentDraws] ?? 'fresh'
          : undefined,
    },
    state: {
      cycle: seq,
      step: nextStep,
      round,
      encourage: state.encourage,
      draws: currentDraws + 1,
      sinceEncourage: progress + 1,
      currentInterval,
      intervalIndex: state.intervalIndex ?? 0,
    },
  }
}
