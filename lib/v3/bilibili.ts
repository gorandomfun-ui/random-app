/**
 * Bilibili for a computer (16 October): its videos live in a collection no card reads but the world card, for a computer
 * (lib/discovery/wheel.ts), written by lib/v3/ingest/lines/bilibili.ts. Its player plays nothing on a phone outside China.
 */
export const BILIBILI = 'bilibili_videos'

/**
 * Whether every computer gets Bilibili in the world card, or only the curator's. On since 17 October, once the owner saw it
 * play with its sound on his computer — in the mix, one language among the others, never every time ("elles seront juste
 * dans le mix ?").
 */
export const BILIBILI_FOR_EVERYONE = true

/** A computer, as far as the address bar's browser says: never a phone nor an Android tablet (an iPad says it is a Mac). */
export function onComputer(userAgent: string | null | undefined): boolean {
  const ua = userAgent ?? ''
  return Boolean(ua) && !/Mobi|Android|iPhone|iPod|iPad|Silk|Kindle|Opera Mini/i.test(ua)
}
