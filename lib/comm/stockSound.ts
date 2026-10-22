/**
 * Sounds taken from stock videos: Pixabay's and Pexels' permissive clips that
 * carry an audio track — street, rain, a crowd, a loop someone recorded — used
 * for the promo's sound whatever the picture shows. The platforms do not say
 * which clips have sound, so the server probes: the head of a candidate file
 * (a range of 256 KB) holds the moov box, whose audio track lists its sample
 * sizes — a silent track encodes to a few bytes a frame, a real one to
 * hundreds. What is probed is kept in comm_sounds, found or silent, so no
 * file is read twice; the page draws from the finds and the server probes
 * again only while the catalogue is thin. The file itself goes to the
 * browser through the proxy route, by its catalogue key, never by a free
 * address.
 */

import type { Db } from 'mongodb'

export const COMM_SOUNDS = 'comm_sounds'
/** Words whose clips tend to be filmed with their sound on: a street, rain, a crowd, drums — not a drone shot of a mountain. */
export const SOUND_WORDS = ['music', 'concert', 'rain', 'street', 'traffic', 'crowd', 'waves', 'birds', 'fireworks', 'drums', 'market', 'train', 'city', 'storm', 'river', 'wind', 'party', 'factory', 'arcade', 'typing', 'kitchen', 'engine', 'festival', 'subway']
export const SOUND_HOSTS = ['cdn.pixabay.com', 'videos.pexels.com']
/** The largest file worth passing through: a minute of a small rendition. */
export const SOUND_MAX_BYTES = 6 * 1024 * 1024
const PROBE_BYTES = 262144
/** Below this many finds, a draw probes new candidates first. */
export const CATALOGUE_FLOOR = 12

/** The judgement's version: rows judged by an older rule are probed again when met. */
export const JUDGE_VERSION = 2
/**
 * A find, and what the browser heard of it: an encoder at a constant bitrate pads silence into full-size
 * frames, so the head's verdict is not the last word — the page decodes the file, and reports it loud or
 * silent; loud ones are drawn first, silent ones never again.
 */
export type StockSound = { key: string; provider: 'pixabay' | 'pexels'; id: string; page: string; author: string; url: string; duration: number; bytes: number; word: string; sound: boolean; v: number; probedAt: Date; heard?: 'loud' | 'silent' }
export type Candidate = Omit<StockSound, 'sound' | 'v' | 'probedAt' | 'heard'>
/** What the page receives: the file by the proxy, the credit, the length. */
export type StockSoundInfo = { id: string; provider: string; page: string; author: string; src: string; duration: number }

export function soundHostAllowed(url: string): boolean {
  try { const u = new URL(url); return u.protocol === 'https:' && SOUND_HOSTS.includes(u.hostname) } catch { return false }
}

/** An audio frame of silence encodes to a few bytes; real sound to hundreds. The mean sample size that separates them. */
export const SILENT_SAMPLE_BYTES = 40
const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl'])
type Box = { type: string; body: number; end: number }

/** The boxes of an MP4 between two offsets, as far as the bytes go. */
function boxesIn(bytes: Uint8Array, start: number, end: number): Box[] {
  const out: Box[] = []
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let at = start
  while (at + 8 <= end) {
    let size = view.getUint32(at), body = at + 8
    const type = String.fromCharCode(bytes[at + 4], bytes[at + 5], bytes[at + 6], bytes[at + 7])
    if (size === 1) { if (at + 16 > end) break; size = view.getUint32(at + 8) ? Number.MAX_SAFE_INTEGER : view.getUint32(at + 12); body = at + 16 }
    else if (size === 0) size = end - at
    if (size < 8) break
    out.push({ type, body, end: Math.min(end, at + size) })
    at += size
  }
  return out
}

/** The audio tracks' mean sample size, from the moov box in the head: null without a moov box, -1 without an audio track. */
export function audioSampleMean(bytes: Uint8Array): number | null {
  const moov = boxesIn(bytes, 0, bytes.length).find((b) => b.type === 'moov')
  if (!moov) return null
  let best = -1
  const walk = (box: Box, audio: boolean) => {
    for (const child of boxesIn(bytes, box.body, box.end)) {
      if (child.type === 'hdlr') { const handler = String.fromCharCode(...bytes.subarray(child.body + 8, child.body + 12)); if (handler === 'soun') audio = true }
      if (child.type === 'stsz' && audio) {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
        if (child.body + 12 > bytes.length) continue
        const sampleSize = view.getUint32(child.body + 4), count = view.getUint32(child.body + 8)
        let mean = sampleSize
        if (!sampleSize) {
          const available = Math.min(count, Math.floor((Math.min(child.end, bytes.length) - child.body - 12) / 4))
          if (available < 10) continue
          let sum = 0
          for (let i = 0; i < available; i += 1) sum += view.getUint32(child.body + 12 + i * 4)
          mean = sum / available
        }
        best = Math.max(best, mean)
      }
      if (CONTAINERS.has(child.type)) walk(child, child.type === 'trak' ? false : audio)
    }
  }
  walk(moov, false)
  return best
}

/**
 * True when the head of an MP4 shows an audio track with sound in it; false when its moov box is there
 * without one, or with a silent one; null when the moov box is not in the head (it may sit at the end
 * of the file), which tells nothing.
 */
export function hasSoundHead(bytes: Uint8Array): boolean | null {
  const mean = audioSampleMean(bytes)
  return mean === null ? null : mean >= SILENT_SAMPLE_BYTES
}

export const infoOf = (s: Pick<StockSound, 'key' | 'provider' | 'page' | 'author' | 'duration'>): StockSoundInfo => ({ id: s.key, provider: s.provider, page: s.page, author: s.author, src: `/api/admin/comm/stocksound/${encodeURIComponent(s.key)}`, duration: s.duration })

type PixabayHit = { id: number; pageURL: string; duration: number; user?: string; videos?: Record<string, { url?: string; size?: number; width?: number }> }
type PexelsVideo = { id: number; duration: number; url: string; user?: { name?: string }; video_files: Array<{ link: string; width?: number; file_type?: string; size?: number }> }

/** Pixabay's clips for a word: the small rendition when it stays light, the tiny one otherwise. */
export async function pixabayCandidates(key: string, word: string, fetchFn: typeof fetch = fetch): Promise<Candidate[]> {
  const response = await fetchFn(`https://pixabay.com/api/videos/?key=${encodeURIComponent(key)}&q=${encodeURIComponent(word)}&per_page=50&safesearch=true&page=${1 + Math.floor(Math.random() * 3)}`, { signal: AbortSignal.timeout(8000) })
  if (!response.ok) return []
  const body = (await response.json()) as { hits?: PixabayHit[] }
  const out: Candidate[] = []
  for (const h of body.hits ?? []) {
    if (!(h.duration >= 4 && h.duration <= 90)) continue
    const small = h.videos?.small, tiny = h.videos?.tiny
    const file = small?.url && (small.size ?? 0) > 0 && (small.size ?? 0) <= SOUND_MAX_BYTES ? small : tiny?.url && (tiny.size ?? 0) <= SOUND_MAX_BYTES ? tiny : null
    if (!file?.url || !soundHostAllowed(file.url)) continue
    out.push({ key: `pixabay:${h.id}`, provider: 'pixabay', id: String(h.id), page: h.pageURL, author: h.user ?? 'Pixabay', url: file.url, duration: h.duration, bytes: file.size ?? 0, word })
  }
  return out
}

/** Pexels' clips for a word: the lightest mp4 up to 640 wide. */
export async function pexelsCandidates(key: string, word: string, fetchFn: typeof fetch = fetch): Promise<Candidate[]> {
  const response = await fetchFn(`https://api.pexels.com/videos/search?query=${encodeURIComponent(word)}&per_page=40&page=${1 + Math.floor(Math.random() * 3)}`, { headers: { Authorization: key }, signal: AbortSignal.timeout(8000) })
  if (!response.ok) return []
  const body = (await response.json()) as { videos?: PexelsVideo[] }
  const out: Candidate[] = []
  for (const v of body.videos ?? []) {
    if (!(v.duration >= 4 && v.duration <= 90)) continue
    const files = v.video_files.filter((f) => (f.file_type ?? '').includes('mp4') && (f.width ?? 0) <= 640 && soundHostAllowed(f.link) && (f.size ?? 0) <= SOUND_MAX_BYTES).sort((a, b) => (a.width ?? 0) - (b.width ?? 0))
    const f = files[files.length - 1]
    if (!f) continue
    out.push({ key: `pexels:${v.id}`, provider: 'pexels', id: String(v.id), page: v.url, author: v.user?.name ?? 'Pexels', url: f.link, duration: v.duration, bytes: f.size ?? 0, word })
  }
  return out
}

/** The head of a candidate read, and judged. */
export async function probe(url: string, fetchFn: typeof fetch = fetch): Promise<boolean | null> {
  try {
    const response = await fetchFn(url, { headers: { Range: `bytes=0-${PROBE_BYTES - 1}` }, signal: AbortSignal.timeout(6000) })
    if (!response.ok) return null
    const bytes = new Uint8Array(await response.arrayBuffer())
    return hasSoundHead(bytes.subarray(0, PROBE_BYTES))
  } catch { return null }
}

let indexed: Promise<unknown> | null = null
const collection = (db: Db) => {
  const col = db.collection<StockSound>(COMM_SOUNDS)
  if (!indexed) indexed = col.createIndex({ key: 1 }, { unique: true }).catch(() => { indexed = null })
  return col
}

/** New candidates probed within a time budget, each kept with its verdict; the number of finds. */
export async function discover(db: Db, keys: { pixabay: string; pexels: string }, budgetMs = 7000, fetchFn: typeof fetch = fetch): Promise<number> {
  const started = Date.now()
  const col = collection(db)
  const word = SOUND_WORDS[Math.floor(Math.random() * SOUND_WORDS.length)]
  const providers = (['pixabay', 'pexels'] as const).filter((p) => keys[p]).sort(() => Math.random() - 0.5)
  let found = 0
  for (const provider of providers) {
    if (Date.now() - started > budgetMs) break
    const candidates = provider === 'pixabay' ? await pixabayCandidates(keys.pixabay, word, fetchFn) : await pexelsCandidates(keys.pexels, word, fetchFn)
    const known = new Set((await col.find({ key: { $in: candidates.map((c) => c.key) }, v: JUDGE_VERSION }, { projection: { key: 1 } }).toArray()).map((r) => r.key))
    for (const c of candidates.sort(() => Math.random() - 0.5)) {
      if (known.has(c.key)) continue
      if (Date.now() - started > budgetMs) break
      const verdict = await probe(c.url, fetchFn)
      if (verdict === null) continue
      await col.updateOne({ key: c.key }, { $set: { ...c, sound: verdict, v: JUDGE_VERSION, probedAt: new Date() } }, { upsert: true })
      if (verdict) found += 1
    }
    if (found >= 3) break
  }
  return found
}

/** A few finds at random — those heard loud first, then the unheard; the catalogue probed first while it is thin. */
export async function drawSounds(db: Db, n: number, keys: { pixabay: string; pexels: string }, fetchFn: typeof fetch = fetch): Promise<{ sounds: StockSoundInfo[]; catalogue: number; found: number }> {
  const col = collection(db)
  let found = 0
  const finds = { sound: true, v: JUDGE_VERSION }
  let catalogue = await col.countDocuments(finds)
  // Probed again while the finds are few, or while few of them have been heard loud by a page.
  const heardLoud = await col.countDocuments({ ...finds, heard: 'loud' })
  if ((catalogue < CATALOGUE_FLOOR || heardLoud < 4) && (keys.pixabay || keys.pexels)) { found = await discover(db, keys, 7000, fetchFn); catalogue = await col.countDocuments(finds) }
  const loud = await col.aggregate<StockSound>([{ $match: { ...finds, heard: 'loud' } }, { $sample: { size: Math.max(1, n - 1) } }]).toArray()
  const unheard = loud.length < n ? await col.aggregate<StockSound>([{ $match: { ...finds, heard: { $exists: false } } }, { $sample: { size: n - loud.length } }]).toArray() : []
  return { sounds: [...loud, ...unheard].map(infoOf), catalogue, found }
}

/** What the browser heard of a find: loud ones are drawn first from now on, silent ones set aside. */
export async function markHeard(db: Db, key: string, loud: boolean): Promise<boolean> {
  const result = await collection(db).updateOne({ key }, { $set: loud ? { heard: 'loud' } : { heard: 'silent', sound: false } })
  return result.matchedCount > 0
}

/** One find by its key, for the proxy. */
export async function soundByKey(db: Db, key: string): Promise<StockSound | null> {
  const row = await collection(db).findOne({ key, sound: true, v: JUDGE_VERSION })
  return row && soundHostAllowed(row.url) ? row : null
}
