/** What a dig knows of a video before the door: the raw video, plus what the door and the level need. */

import type { RawVideo } from '@/lib/ingest/videos'

export type DigVideo = RawVideo & {
  title: string
  seconds: number
  live: boolean
  /** The language the provider declares, when it does. */
  declaredLang?: string
  /** How many videos the channel has published in all, when the provider says: an outlet has thousands (lib/v3/dig/outlet.ts). */
  channelVideos?: number
}
