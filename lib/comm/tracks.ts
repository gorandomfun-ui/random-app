/**
 * The promo's sound tracks: the curator's own royalty-free files (Pixabay
 * Music, YouTube's audio library…), kept in Blob under promo/tracks/, one
 * file one track, sent there straight from the browser with a short token.
 * The promo draws one per film and glitches it itself, in time with the
 * picture. Both sides of the tool read these rules: the route that signs the
 * token and lists the folder, and the page that drops the files.
 */

export const TRACKS_PREFIX = 'promo/tracks/'
/** The largest track accepted: a few minutes of MP3 or a minute of WAV stay well under. */
export const TRACK_MAX_BYTES = 30 * 1024 * 1024
const EXT: Record<string, string> = { 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'm4a', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav', 'audio/ogg': 'ogg', 'audio/flac': 'flac', 'audio/x-flac': 'flac' }
const TYPE_OF_EXT: Record<string, string> = { mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac' }
export const TRACK_CONTENT_TYPES = Object.keys(EXT)

export type Track = { url: string; name: string; bytes: number }

/** True for a pathname inside the tracks folder: a slug and a known extension, nothing else. */
export const trackPathOk = (pathname: string) => /^promo\/tracks\/[a-z0-9][a-z0-9-]{0,80}\.(mp3|m4a|wav|ogg|flac)$/.test(pathname)
/** The name shown for a track: its slug with spaces. */
export const trackNameOf = (pathname: string) => pathname.slice(TRACKS_PREFIX.length).replace(/\.[a-z0-9]+$/, '').replace(/-/g, ' ')
/** The content type a track is stored with, from its extension. */
export const trackTypeOf = (pathname: string) => TYPE_OF_EXT[pathname.slice(pathname.lastIndexOf('.') + 1)] ?? 'audio/mpeg'

/** The Blob pathname for a file the curator drops: its name as a slug, its extension from its type or its name; null for a file that is not a track. */
export function trackPathFor(file: { name: string; type: string }): string | null {
  const type = (file.type || '').split(';')[0].trim().toLowerCase()
  const ext = EXT[type] ?? file.name.match(/\.(mp3|m4a|wav|ogg|flac)$/i)?.[1].toLowerCase() ?? ''
  if (!ext) return null
  const slug = file.name.replace(/\.[^.]+$/, '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'piste'
  return `${TRACKS_PREFIX}${slug}.${ext}`
}

// ----- the browser side

export async function listTracks(): Promise<{ tracks: Track[]; blob: boolean }> {
  try {
    const body = (await (await fetch('/api/admin/comm/tracks', { cache: 'no-store' })).json()) as { tracks?: Track[]; blob?: boolean }
    return { tracks: body.tracks ?? [], blob: body.blob !== false }
  } catch { return { tracks: [], blob: false } }
}

/** Sends a track straight to the tracks folder; the same name replaces the earlier file. */
export async function uploadTrack(file: File, onProgress?: (fraction: number) => void): Promise<Track | { error: string; message: string }> {
  const pathname = trackPathFor(file)
  if (!pathname) return { error: 'type', message: `Format non pris en charge : ${file.name} (mp3, m4a, wav, ogg, flac).` }
  try {
    const { upload } = await import('@vercel/blob/client')
    const result = await upload(pathname, file, { access: 'public', handleUploadUrl: '/api/admin/comm/tracks', contentType: trackTypeOf(pathname), onUploadProgress: onProgress ? ({ percentage }) => onProgress(percentage / 100) : undefined })
    return { url: result.url, name: trackNameOf(pathname), bytes: file.size }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { error: 'upload', message: /no-blob|Blob n’est pas configuré|BLOB_READ_WRITE_TOKEN/i.test(message) ? 'Le stockage Blob n’est pas configuré sur le projet.' : `Envoi impossible : ${message}` }
  }
}

export async function deleteTrack(url: string): Promise<boolean> {
  try { return (await fetch('/api/admin/comm/tracks', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) })).ok } catch { return false }
}
