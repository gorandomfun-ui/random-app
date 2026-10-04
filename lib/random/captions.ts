/**
 * Which subtitles a YouTube video shows, by the owner's rule (4 October):
 * the app's language when the video has it; otherwise English, translated by
 * YouTube when the video has no English track ("des vidéos en coréen, on
 * traduit en anglais si possible"); and none when the video already speaks
 * English, nor when it speaks the app's own language.
 *
 * Why the page has to choose: with subtitles on and no track in the asked
 * language, YouTube shows the first track of its list, often German, whatever
 * the browser's language (measured in Chrome on 4 October). The player tells
 * the page its tracks (`apiInfoDelivery`, the captions namespace) but lists
 * only the tracks people wrote, never its automatic ones: the language the
 * video speaks comes with the item (`spokenLang`, set by the draw), and the
 * automatic track of that language is asked for by its code.
 *
 * Nothing here runs on the server; the draw adds a two-letter code, that is all.
 */

export type CaptionTrack = Record<string, unknown> & { languageCode?: unknown; kind?: unknown }
export type CaptionChoice = { show: CaptionTrack } | { off: true }

/** YouTube's two-letter code for the app's language: the app says `jp`, YouTube `ja`. */
export function youtubeLanguage(lang: unknown): string {
  const code = base(lang)
  if (!code) return 'en'
  return code === 'jp' ? 'ja' : code
}

/** The first part of a language code, lower case: `de-DE` → `de`, `pt_BR` → `pt`. */
function base(code: unknown): string | undefined {
  if (typeof code !== 'string') return undefined
  const head = code.trim().toLowerCase().split(/[-_]/)[0]
  return /^[a-z]{2,3}$/.test(head) ? head : undefined
}

const written = (track: CaptionTrack) => typeof track.languageCode === 'string' && track.kind !== 'asr'

/**
 * The track to show, or none.
 * - `app`: the app's language, as `youtubeLanguage` gives it.
 * - `spoken`: the language the video speaks, two letters, when known.
 * - `tracks`: the player's list (the written tracks only).
 * - `shown`: the track the player put on by itself; an automatic one in the app's language tells what the video speaks.
 */
export function chooseCaptions(input: { app: string; spoken?: unknown; tracks: readonly CaptionTrack[]; shown?: CaptionTrack | null }): CaptionChoice {
  const app = youtubeLanguage(input.app)
  const tracks = input.tracks.filter(written)
  const automatic = input.shown && input.shown.kind === 'asr' ? base(input.shown.languageCode) : undefined
  const spoken = base(input.spoken) ?? automatic
  const off: CaptionChoice = { off: true }
  // The video speaks the app's language: nothing to read.
  if (spoken === app) return off
  const own = tracks.find((track) => base(track.languageCode) === app)
  if (own) return { show: own }
  // No track in the app's language: English is the common one, and an English video needs none.
  if (spoken === 'en') return off
  const english = tracks.find((track) => base(track.languageCode) === 'en')
  if (english) return { show: english }
  // Translated into English by YouTube: from the video's own written track, else its automatic one, else any written track.
  const source = (spoken ? tracks.find((track) => base(track.languageCode) === spoken) : undefined)
    ?? (spoken ? { languageCode: spoken, kind: 'asr', vss_id: `a.${spoken}` } : tracks[0])
  return source ? { show: { ...source, translationLanguage: { languageCode: 'en' } } } : off
}

/** The message that puts the choice on the player (the frame's own `setOption`; an empty track turns subtitles off). */
export function captionCommand(choice: CaptionChoice): { event: 'command'; func: 'setOption'; args: [string, string, CaptionTrack] } {
  return { event: 'command', func: 'setOption', args: ['captions', 'track', 'show' in choice ? choice.show : {}] }
}
