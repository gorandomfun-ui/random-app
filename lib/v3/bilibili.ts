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

/**
 * Whether every phone gets Bilibili in the world card's mix, or only the curator's (17 October: its phone player plays a
 * whole video given the video's two numbers, `aid` and `cid`, after a touch on its play button; the owner tests it in the
 * app, in the mix — "tu remets pas que Bilibili").
 */
export const BILIBILI_ON_PHONES = false

/** Whether the world card has Bilibili among its languages for one visitor: every computer; a phone, the curator's until phones are switched on. */
export function bilibiliInMix(computer: boolean, curator: boolean): boolean {
  if (computer) return BILIBILI_FOR_EVERYONE || curator
  return BILIBILI_ON_PHONES || curator
}

/**
 * A Bilibili picture shows only when it does not know the page asking for it: 403 with our address as the referrer, 200
 * without (16 October). Kept https; the page shows it with no referrer.
 */
export const bilibiliPicture = (url: unknown): string | undefined => (typeof url === 'string' && /^(https?:)?\/\/[\w.-]+\.hdslb\.com\//.test(url) ? url.replace(/^(https?:)?\/\//, 'https://') : undefined)

/** A computer, as far as the address bar's browser says: never a phone nor an Android tablet (an iPad says it is a Mac). */
export function onComputer(userAgent: string | null | undefined): boolean {
  const ua = userAgent ?? ''
  return Boolean(ua) && !/Mobi|Android|iPhone|iPod|iPad|Silk|Kindle|Opera Mini/i.test(ua)
}
