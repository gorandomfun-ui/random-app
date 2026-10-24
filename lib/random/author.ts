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
/** An account's own page, as Dailymotion's API gives it: its name, never its id. */
const DAILYMOTION_PAGE = /^https:\/\/www\.dailymotion\.com\/[\w.-]+$/

function split(channelKey: string | null | undefined): { provider: string; id: string } | null {
  const at = channelKey ? channelKey.indexOf(':') : -1
  if (!channelKey || at < 1) return null
  return { provider: channelKey.slice(0, at), id: channelKey.slice(at + 1) }
}

/** Whether a channel key names a real author the légende can send somewhere: a YouTube channel, a Dailymotion account, a Bilibili uploader. */
export function knownChannelKey(channelKey: string | null | undefined): boolean {
  const key = split(channelKey)
  if (!key) return false
  if (key.provider === 'youtube') return YOUTUBE_CHANNEL.test(key.id)
  if (key.provider === 'dailymotion') return DAILYMOTION_ACCOUNT.test(key.id)
  if (key.provider === 'bilibili') return BILIBILI_UPLOADER.test(key.id)
  return false
}

/**
 * Dailymotion account pages by video, as Dailymotion's API names them (`owner.url`) when the page asks about a video it
 * shows. An account's id opens "Not Found" there (`dailymotion.com/x1cfbdd`, 24 October: seven accounts of seven); only
 * its name opens its page (`dailymotion.com/c1115830`).
 */
const dailymotionOwners = new Map<string, string>()

/** Keeps the account page Dailymotion gave for one of its videos. */
export function rememberDailymotionOwner(videoId: string, url: unknown): void {
  if (videoId && typeof url === 'string' && DAILYMOTION_PAGE.test(url)) dailymotionOwners.set(videoId, url)
}

/**
 * An author's channel page at its platform. A Dailymotion author needs the video it was met with: their page once
 * Dailymotion has named it, and until then the video's own page there, which names its author and links to them.
 */
export function authorChannelUrl(channelKey: string | null | undefined, dailymotionVideoId?: string | null): string | null {
  const key = split(channelKey)
  if (!key || !knownChannelKey(channelKey)) return null
  if (key.provider === 'youtube') return `https://www.youtube.com/channel/${key.id}`
  if (key.provider === 'bilibili') return `https://space.bilibili.com/${key.id}`
  if (!dailymotionVideoId) return null
  return dailymotionOwners.get(dailymotionVideoId) ?? `https://www.dailymotion.com/video/${dailymotionVideoId}`
}

/** The platform's name, as the channel button says it. */
export function authorPlatform(channelKey: string | null | undefined): string | null {
  const key = split(channelKey)
  if (!key || !knownChannelKey(channelKey)) return null
  return key.provider === 'youtube' ? 'YouTube' : key.provider === 'dailymotion' ? 'Dailymotion' : 'Bilibili'
}

/** Whether the légende offers the author's videos in Random: enough of them here; otherwise the name opens the channel. */
export const offersAuthorSeries = (authorMore: number | null | undefined): boolean => typeof authorMore === 'number' && authorMore >= AUTHOR_SERIES_MIN
