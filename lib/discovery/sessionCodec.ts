import type { Session } from './pool'
import { canonicalMediaKey } from './catalog'
import { EXPOSURE_LIMIT } from './diversity'
import type { Format } from './types'
const FORMATS: Format[] = ['video', 'image', 'quote', 'joke', 'fact', 'web']
function isObject(value: unknown): value is Record<string, unknown> { return value != null && typeof value === 'object' && !Array.isArray(value) }
export function parseSession(value: unknown): Session | null {
  if (!isObject(value) || value.version !== 2) return null
  for (const key of ['seed', 'revision', 'displayed', 'visuals', 'mixedVisuals', 'coolTickets', 'editorialTickets', 'autonomousTickets']) {
    const n = value[key]; if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 0 || n > 0xffffffff) return null
  }
  for (const key of ['recent', 'visualHistory']) {
    if (!Array.isArray(value[key]) || value[key].length > 40) return null
    for (const seen of value[key]) {
      if (!isObject(seen) || typeof seen.key !== 'string' || seen.key.length > 2048 ||
        typeof seen.family !== 'string' || seen.family.length > 80 || !FORMATS.includes(seen.type as Format) || typeof seen.stock !== 'boolean') return null
      for (const field of ['authorKey', 'seriesKey', 'duplicateKey', 'pattern']) if (seen[field] != null && (typeof seen[field] !== 'string' || seen[field].length > 2048)) return null
    }
  }
  if (value.exposures != null) {
    if (!Array.isArray(value.exposures) || value.exposures.length > EXPOSURE_LIMIT) return null
    for (const entry of value.exposures) {
      if (!isObject(entry) || !['video', 'image'].includes(String(entry.type)) ||
        typeof entry.family !== 'string' || entry.family.length > 80 ||
        !Array.isArray(entry.practices) || entry.practices.length > 6 ||
        entry.practices.some(x => typeof x !== 'string' || x.length > 80) ||
        !Array.isArray(entry.terms) || entry.terms.length > 12 ||
        entry.terms.some(x => !Number.isSafeInteger(x) || x < 0 || x > 0xffffffff)) return null
      if (entry.pattern != null && (typeof entry.pattern !== 'string' || entry.pattern.length > 80)) return null
      if (entry.publicationYear != null && (!Number.isSafeInteger(entry.publicationYear) ||
        Number(entry.publicationYear) < 1800 || Number(entry.publicationYear) > 2200)) return null
      if (entry.metadata != null && (typeof entry.metadata !== 'string' || !/^\d{1,10}:\d{1,10}$/.test(entry.metadata))) return null
      for (const field of ['author', 'series', 'subject', 'content']) if (entry[field] != null &&
        (!Number.isSafeInteger(entry[field]) || Number(entry[field]) < 0 || Number(entry[field]) > 0xffffffff)) return null
    }
  }
  const s = value as unknown as Session
  if (s.visuals > s.displayed || s.mixedVisuals > s.visuals || s.coolTickets > s.visuals ||
    s.editorialTickets + s.autonomousTickets !== s.coolTickets) return null
  const canonical = (entry: Session['recent'][number]) => entry.type === 'image' && entry.key.startsWith('image:http')
    ? { ...entry, key: canonicalMediaKey({ type: 'image', url: entry.key.slice(6) }) } : entry
  return { ...s, recent: s.recent.map(canonical), visualHistory: s.visualHistory.map(canonical) }
}
