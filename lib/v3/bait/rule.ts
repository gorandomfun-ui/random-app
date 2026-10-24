/**
 * Piracy bait on Dailymotion, told from an account's own uploads.
 *
 * Found on 24 October: account x1cfbdd uploaded 38 "videos" on 19 November 2013, within ten hours, every one exactly
 * 302 seconds long, without a description or a tag — a still picture saying in Japanese that the video "moved to
 * p.tl/…", then a fake "Start movie" player. Not videos: bait for a pirate site, titled after real shows.
 *
 * The signature is in the uploads, not the titles, which are the point of the bait: at least ten listed, all of the very
 * same length to the second, none with a word under it. Measured the same day over the 1,998 accounts that had brought
 * an undescribed video in the last 24 hours, their hundred latest uploads each: 1,662 listed ten or more, 487 of them
 * without a single description, and one only had all its uploads of one length — x1awub0, 25 uploads of 312 s put up
 * within three hours on 27 May 2013, a fake player on its picture under the same encoder's mark as x1cfbdd's: the same
 * farm. The nearest real accounts show why each half of the rule is needed: 86 of a hundred clips at 15 s, none
 * described (three lengths, not one); a cooking channel with all its hundred videos at 52 s (half of them described);
 * 97 of a hundred at 61 s, all described. Hence "all", never a share, and both together. And a hundred uploads, not
 * ten: on their ten latest only, two real accounts would have looked like bait (ten clips of 40 s, ten of 15 s, all
 * undescribed); on fifty or a hundred, none.
 *
 * What it does not judge: fewer than ten uploads (three videos of one length prove nothing), and an upload without a
 * length — a live, a video still processing — never counts as "the same length": the same day, a channel's ten latest
 * uploads were ten undescribed lives at 0 s.
 *
 * Pure: the question to Dailymotion is lib/v3/bait/ask.ts, the lists lib/v3/bait/store.ts.
 */

/** Below this many uploads listed, the account is not judged. */
export const MIN_UPLOADS = 10

/** An upload as Dailymotion lists it (`/user/<id>/videos`). */
export type Upload = {
  id?: string | null
  title?: string | null
  description?: string | null
  /** Seconds. */
  duration?: number | null
  /** Seconds since 1970. */
  created_time?: number | null
}

/** `few`: too few uploads listed to say anything; asked again later if the account comes back (lib/v3/bait/store.ts). */
export type BaitVerdict = 'bait' | 'clean' | 'few'

export type Judgement = {
  verdict: BaitVerdict
  listed: number
  /** The one length every upload of a bait account has. */
  seconds?: number
}

/**
 * Known before the line's first night, how each was found: x1cfbdd by hand (its four videos in the base deleted by hand),
 * x1awub0 by the measure above (one video in the base, come in by the look-alikes on 23 October). The door refuses them
 * whether the list holds them or not; the line lists them once and sets aside what the base still holds of them.
 */
export const SEED_BAIT_ACCOUNTS: Readonly<Record<string, string>> = {
  'dailymotion:x1cfbdd': 'trouvé à la main le 24 octobre',
  'dailymotion:x1awub0': 'trouvé le 24 octobre par la mesure de la règle',
}

/** No word at all: missing, empty, or only spaces and line breaks. */
export function emptyText(text: string | null | undefined): boolean {
  return !/\S/.test(text ?? '')
}

/** A length that can be compared: a positive number of seconds; a live's 0 or a missing length is none. */
function lengthOf(upload: Upload): number | null {
  const seconds = upload.duration
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 1 ? seconds : null
}

export function judgeAccount(uploads: readonly Upload[]): Judgement {
  const listed = uploads.length
  if (listed < MIN_UPLOADS) return { verdict: 'few', listed }
  const seconds = lengthOf(uploads[0])
  if (seconds === null) return { verdict: 'clean', listed }
  for (const upload of uploads) {
    if (lengthOf(upload) !== seconds || !emptyText(upload.description)) return { verdict: 'clean', listed }
  }
  return { verdict: 'bait', listed, seconds }
}

/** What the list and the journal say of a bait account, in the owner's words. */
export function baitReason(judgement: Judgement): string {
  return `${judgement.listed} vidéos listées, toutes de ${judgement.seconds} s exactement, aucune description`
}
