/**
 * How much of one page a like may take from a single source.
 *
 * Nothing at insertion limits how many videos one channel or one near-identical
 * family contributes, so a like on an AI clip that a hundred channels reposted
 * would bring back a hundred of the same. A page fetched for a like keeps at
 * most a few per channel and per family; the rest was never worth storing.
 */

import { nearFamilyKey } from '../v3/families'
import { subjectInSource, type Subject } from './subjects'

export const MAX_PER_CHANNEL = 3
export const MAX_PER_FAMILY = 2

type Sourced = { title?: string; channelId?: string; source?: { name?: string } }

export function capPerSource<T extends Sourced>(videos: T[]): T[] {
  const byChannel = new Map<string, number>()
  const byFamily = new Map<string, number>()
  return videos.filter((video) => {
    const channel = video.channelId || video.source?.name || ''
    const family = nearFamilyKey(video.title ?? '')
    const channelCount = channel ? byChannel.get(channel) ?? 0 : 0
    const familyCount = byFamily.get(family) ?? 0
    if (channelCount >= MAX_PER_CHANNEL || familyCount >= MAX_PER_FAMILY) return false
    if (channel) byChannel.set(channel, channelCount + 1)
    byFamily.set(family, familyCount + 1)
    return true
  })
}

/**
 * Only videos that name the subject in their title.
 *
 * Reupload farms slip the searched word into the description of whatever they
 * post — a Costa Rican news bulletin, four copies of a 1970 record — and a
 * search on a bare name brings them back by the page. Genuine finds name the
 * subject: a concert filmed from the crowd is called "Santana live", a report
 * on the town is called "Santana dos Garrotes". The digging is untouched; the
 * padding is not.
 */
export function keepTitled<T extends { title?: string }>(videos: T[], subject: Subject): T[] {
  return videos.filter((video) => Boolean(video.title) && subjectInSource(video.title ?? '', subject))
}
