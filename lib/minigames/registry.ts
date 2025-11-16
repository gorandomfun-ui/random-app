import type { MiniGameId, MiniGameItem } from '@/lib/random/clientTypes'

export const MINI_GAME_IDS: MiniGameId[] = [
  'tap-to-not-tap',
  'emoji-echo',
  'useless-progress-bar',
  'left-or-right',
  'fake-loading-race',
  'color-off-by-one',
  'steady-spots',
]

export function normaliseGameId(index: number): MiniGameId {
  const total = MINI_GAME_IDS.length
  if (total === 0) {
    throw new Error('Mini-game registry is empty')
  }
  const safeIndex = ((index % total) + total) % total
  return MINI_GAME_IDS[safeIndex]
}

export function createMiniGameItem(params: { id: MiniGameId; level: number; seed?: string }): MiniGameItem {
  const { id, level, seed } = params
  return {
    type: 'minigame',
    gameId: id,
    level,
    seed:
      seed ??
      [
        id,
        level,
        Date.now().toString(36),
        Math.random().toString(36).slice(2, 8),
      ].join(':'),
  }
}
