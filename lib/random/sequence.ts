import type { ItemType } from '@/lib/random/types'

export type SequenceEntry =
  | { kind: 'fixed'; itemType: ItemType }
  | { kind: 'choices'; types: ItemType[]; preferQuizFact?: boolean }
  | { kind: 'quiz'; itemType: Extract<ItemType, 'fact'> }

export const FIXED_SEQUENCE: SequenceEntry[] = [
  { kind: 'fixed', itemType: 'video' },
  { kind: 'fixed', itemType: 'video' },
  { kind: 'fixed', itemType: 'image' },
  { kind: 'fixed', itemType: 'video' },
  { kind: 'fixed', itemType: 'image' },
  { kind: 'fixed', itemType: 'video' },
  { kind: 'fixed', itemType: 'web' },
  { kind: 'fixed', itemType: 'video' },
  { kind: 'fixed', itemType: 'image' },
  { kind: 'choices', types: ['fact', 'joke', 'quote'], preferQuizFact: true },
  { kind: 'fixed', itemType: 'video' },
  { kind: 'fixed', itemType: 'image' },
]
