import type { ItemType } from './types'

export type SequenceEntry =
  | { kind: 'fixed'; itemType: ItemType }
  | { kind: 'quiz'; itemType: 'fact' }
  | { kind: 'text' }

export const RANDOM_SEQUENCE_SIZE = 40
export const RANDOM_SEQUENCE_QUIZ_COUNT = 2
export const TWO_WEB_CYCLE_CHANCE = 0.25

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
