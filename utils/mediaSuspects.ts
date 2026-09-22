import type { DisplayItem } from '@/lib/random/clientTypes'
import { isImageBlockedThisSession } from './imageSuspects'
import { isVideoBlockedThisSession } from './videoSuspects'

/** A video or an image this session already saw fail: never served again in it. */
export function isMediaBlockedThisSession(item: Partial<DisplayItem> | null | undefined): boolean {
  if (!item) return false
  if (item.type === 'video') return isVideoBlockedThisSession(item)
  if (item.type === 'image') return isImageBlockedThisSession(item)
  return false
}
