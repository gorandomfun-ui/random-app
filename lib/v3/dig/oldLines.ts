/**
 * The dig's door, applied after the fact to videos the old lines stored.
 *
 * On 2 October the install of the server's units re-enabled every old line
 * by mistake (legacy, pools, trend, music-live, authors): twenty-three
 * thousand videos in a day, through the common door (title, routine,
 * series, spam) but not the dig's. The owner (that night): "on peut pas les
 * trier ?" — so here are the dig's rules a stored row can still be judged
 * by: its title (lib/v3/dig/door.ts, lib/v3/cool/themes.ts) and the week's
 * cap per channel (lib/v3/dig/guards.ts). What fails is set aside, never
 * deleted; the sweep script (scripts/v3/old-lines-sweep.ts) can give it back.
 */

import { isCelebrityNews, isLetsPlay, isStillAlbum } from './door'
import { WEEKLY_PER_CHANNEL } from './guards'
import { isCleanTitle } from '../cool/clean'
import { isTrailerTitle } from '../cool/themes'

/** The lines the server re-enabled by mistake on 2 October. */
export const OLD_LINES = ['legacy', 'pools', 'trend', 'music-live', 'authors'] as const

export type StoredVideo = { _id: unknown; title?: unknown; channelTitle?: unknown; channelKey?: string; universe?: string }
export type Rule = 'titre' | 'bande-annonce' | 'album fixe' | 'actu people' | "let's play" | 'chaîne cette semaine'
export type Sorted<T extends StoredVideo> = { kept: T[]; aside: Array<{ video: T; rule: Rule }>; byRule: Record<Rule, number> }

/** A YouTube "Topic" channel publishes art tracks: a still image and a song. */
const TOPIC_CHANNEL = / - Topic$/

/** What the title alone refuses, as the dig's door would have. */
export function titleRule(video: Pick<StoredVideo, 'title' | 'channelTitle'>): Rule | null {
  const title = String(video.title ?? '')
  const channelTitle = typeof video.channelTitle === 'string' ? video.channelTitle : undefined
  if (!isCleanTitle(title)) return 'titre'
  if (isTrailerTitle(title)) return 'bande-annonce'
  if (isStillAlbum({ title, channelTitle }) || (channelTitle && TOPIC_CHANNEL.test(channelTitle))) return 'album fixe'
  if (isCelebrityNews(title)) return 'actu people'
  if (isLetsPlay(title)) return "let's play"
  return null
}

/**
 * The rows in the order they were stored: the title rules first, then the
 * week's cap — a channel keeps its first `cap` videos, the rest are set
 * aside — so a channel's own share is judged on what the titles let through.
 */
export function sortOldLines<T extends StoredVideo>(rows: readonly T[], cap = WEEKLY_PER_CHANNEL): Sorted<T> {
  const byRule: Record<Rule, number> = { titre: 0, 'bande-annonce': 0, 'album fixe': 0, 'actu people': 0, "let's play": 0, 'chaîne cette semaine': 0 }
  const kept: T[] = []
  const aside: Array<{ video: T; rule: Rule }> = []
  const perChannel = new Map<string, number>()
  for (const video of rows) {
    const rule = titleRule(video)
    if (rule) { aside.push({ video, rule }); byRule[rule] += 1; continue }
    const channel = video.channelKey ?? (typeof video.channelTitle === 'string' ? video.channelTitle : '')
    if (channel) {
      const seen = (perChannel.get(channel) ?? 0) + 1
      perChannel.set(channel, seen)
      if (seen > cap) { aside.push({ video, rule: 'chaîne cette semaine' }); byRule['chaîne cette semaine'] += 1; continue }
    }
    kept.push(video)
  }
  return { kept, aside, byRule }
}
