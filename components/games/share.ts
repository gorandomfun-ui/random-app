/**
 * Sharing a game: its title card as a picture, the score, a link. The card is
 * made ahead, so the share sheet opens within the tap; without a share sheet,
 * the text and the link are copied.
 */

import { isDaytime } from '@/lib/games/engine'
import type { GameName } from '@/lib/games/scores'

export const GAME_TITLES: Record<GameName, string> = { catcher: 'RANDOM CATCHER', eater: 'RANDOM EATER', attacks: 'RANDOM ATTACKS' }

/** The game's title card as a PNG file, drawn twice as large. */
export async function titleCard(game: GameName, accent: string, best: number): Promise<File | null> {
  // ATTACKS' title is its picture: waited for, so the card is not drawn without it
  if (game === 'attacks') await (await import('@/lib/games/attacks-art')).attacksArtReady(['titleWide', 'rover'])
  const b = game === 'attacks'
    ? (await import('@/lib/games/attacks')).renderAttacksTitle('landscape', accent, 'zen', { level: 1, best, frame: 0, blink: true })
    : (await import('@/lib/games/screens')).renderTitle(game, 'landscape', accent, { level: 1, best, frame: 0, blink: true, day: isDaytime() })
  const small = document.createElement('canvas')
  small.width = b.width
  small.height = b.height
  small.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(b.data), b.width, b.height), 0, 0)
  const big = document.createElement('canvas')
  big.width = b.width * 2
  big.height = b.height * 2
  const ctx = big.getContext('2d')
  if (!ctx) return null
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(small, 0, 0, big.width, big.height)
  const blob = await new Promise<Blob | null>((resolve) => big.toBlob(resolve, 'image/png'))
  return blob ? new File([blob], `random-${game}.png`, { type: 'image/png' }) : null
}

/** Shares; returns 'copied' when it fell back to copying, 'shared' or 'cancelled' otherwise. */
export async function shareGame(game: GameName, text: string, url: string, card: File | null): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  try {
    if (card && navigator.canShare?.({ files: [card] })) {
      await navigator.share({ files: [card], title: GAME_TITLES[game], text: `${text}\n${url}` })
      return 'shared'
    }
    if (typeof navigator.share === 'function') {
      await navigator.share({ title: GAME_TITLES[game], text, url })
      return 'shared'
    }
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') return 'cancelled'
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`)
    return 'copied'
  } catch { return 'failed' }
}
