/**
 * A line's own label stored as the source is no source a visitor knows: the dig writes its base there ("dig:people",
 * "dig:keywords"… on its 131,718 videos since 29 September) and the line under the video showed it (the owner, 16 October:
 * "pourquoi il y a marqué dig people dans la source ?"). The platform's name instead, as for every other line's videos.
 */
const INTERNAL_SOURCE = /^dig:/

/** The source name a visitor reads: the stored one, unless it is a line's own label — the fallback (the platform) then. */
export function shownSourceName(stored: string | undefined, fallback: string): string {
  return stored && !INTERNAL_SOURCE.test(stored) ? stored : fallback
}
