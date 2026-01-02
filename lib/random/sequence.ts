import type { ItemType } from '@/lib/random/types'

export type SequenceEntry =
  | { kind: 'fixed'; itemType: ItemType }
  | { kind: 'choices'; types: ItemType[] }
  | { kind: 'quiz'; itemType: Extract<ItemType, 'fact'> }

export const FIXED_SEQUENCE: SequenceEntry[] = [
  { kind: 'fixed', itemType: 'image' },
  { kind: 'fixed', itemType: 'video' },
  { kind: 'fixed', itemType: 'image' },
  { kind: 'fixed', itemType: 'video' },
  { kind: 'fixed', itemType: 'image' },
  { kind: 'fixed', itemType: 'web' },
  { kind: 'choices', types: ['quote', 'joke', 'fact'] },
  { kind: 'fixed', itemType: 'video' },
  { kind: 'fixed', itemType: 'image' },
  { kind: 'fixed', itemType: 'video' },
  { kind: 'fixed', itemType: 'image' },
  { kind: 'fixed', itemType: 'web' },
  { kind: 'quiz', itemType: 'fact' },
]
