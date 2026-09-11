import type { Session } from './pool'
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
      for (const field of ['authorKey', 'seriesKey', 'duplicateKey']) if (seen[field] != null && (typeof seen[field] !== 'string' || seen[field].length > 2048)) return null
    }
  }
  const s = value as unknown as Session
  if (s.visuals > s.displayed || s.mixedVisuals > s.visuals || s.coolTickets > s.visuals ||
    s.editorialTickets + s.autonomousTickets !== s.coolTickets) return null
  return s
}
