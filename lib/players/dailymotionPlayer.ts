/**
 * RANDOM's own Dailymotion players.
 *
 * On 28 September 2026 Dailymotion answered 403 to its generic player
 * (`geo.dailymotion.com/player.html`) for everyone, from France as from the
 * United States, while its own API still gave that address: 62 % of the
 * drawable videos turned black. A player of one's own is now required,
 * `geo.dailymotion.com/player/<player id>.html?video=<video id>`.
 *
 * Both players were created through the Dailymotion Platform API on the
 * owner's partner account (x69yyk2) and hold what the address used to carry:
 * controls on, no autonext, no recommendations, no sharing, no title. The
 * address now carries only the video and the autoplay. The sound can no longer
 * be asked in the address, so there are two players — one that starts with
 * the sound, one that starts muted — and giving the sound back is switching
 * from the one to the other, as the page already did by changing the address.
 */

export const DAILYMOTION_PLAYERS = { sound: 'x1nqci', muted: 'x1nqcm' } as const

export function dailymotionEmbedUrl(videoId: string, muted: boolean): string {
  const params = new URLSearchParams({ video: videoId, autoplay: 'true' })
  return `https://geo.dailymotion.com/player/${muted ? DAILYMOTION_PLAYERS.muted : DAILYMOTION_PLAYERS.sound}.html?${params.toString()}`
}
