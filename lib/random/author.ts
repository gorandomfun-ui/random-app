/**
 * A video's author, as the légende offers them (the owner, 22 October): a touch on their name gives a few more of their
 * videos inside Random, when the site holds enough of them, or their channel at its platform; with too few here, the
 * name opens the channel straight away.
 *
 * An author is known by the site's channel key: `youtube:UC…`, `dailymotion:x…` (a real account, never one of the
 * categories old Dailymotion entries kept in its place), `bilibili:<mid>`.
 */

/** The fewest of an author's other videos the site must hold for the légende to offer them in Random. */
export const AUTHOR_SERIES_MIN = 3
/** How many of them one series shows ("5 autres vidéos dans Random"); also how far the draw counts them. */
export const AUTHOR_SERIES_SIZE = 5

const YOUTUBE_CHANNEL = /^UC[\w-]{20,}$/
const DAILYMOTION_ACCOUNT = /^x[a-z0-9]+$/i
const BILIBILI_UPLOADER = /^\d+$/

function split(channelKey: string | null | undefined): { provider: string; id: string } | null {
  const at = channelKey ? channelKey.indexOf(':') : -1
  if (!channelKey || at < 1) return null
  return { provider: channelKey.slice(0, at), id: channelKey.slice(at + 1) }
}

/** Whether a channel key is one the légende can send to a channel page. */
export function knownChannelKey(channelKey: string | null | undefined): boolean {
  return authorChannelUrl(channelKey) !== null
}

/** An author's channel page at its platform; a Dailymotion account's id opens its page there. */
export function authorChannelUrl(channelKey: string | null | undefined): string | null {
  const key = split(channelKey)
  if (!key) return null
  if (key.provider === 'youtube' && YOUTUBE_CHANNEL.test(key.id)) return `https://www.youtube.com/channel/${key.id}`
  if (key.provider === 'dailymotion' && DAILYMOTION_ACCOUNT.test(key.id)) return `https://www.dailymotion.com/${key.id}`
  if (key.provider === 'bilibili' && BILIBILI_UPLOADER.test(key.id)) return `https://space.bilibili.com/${key.id}`
  return null
}

/** The platform's name, as the channel button says it. */
export function authorPlatform(channelKey: string | null | undefined): string | null {
  const key = split(channelKey)
  if (!key || !knownChannelKey(channelKey)) return null
  return key.provider === 'youtube' ? 'YouTube' : key.provider === 'dailymotion' ? 'Dailymotion' : 'Bilibili'
}

/** Whether the légende offers the author's videos in Random: enough of them here; otherwise the name opens the channel. */
export const offersAuthorSeries = (authorMore: number | null | undefined): boolean => typeof authorMore === 'number' && authorMore >= AUTHOR_SERIES_MIN
