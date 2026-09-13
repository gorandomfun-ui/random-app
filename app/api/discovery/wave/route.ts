import { getDbSafe } from '@/lib/random/data'
import { normalizeWaveDocument, type WaveDocument } from '@/lib/random/waveEngine'
import { waveHandler } from '@/lib/discovery/handlers'
export const runtime = 'nodejs'
export const maxDuration = 30
export const POST = waveHandler({
  enabled: () => process.env.RANDOM_WAVE_V2_ENABLED !== '0', getDb: getDbSafe,
  decode: row => normalizeWaveDocument(row as WaveDocument),
})
