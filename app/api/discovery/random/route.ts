import { getDbSafe } from '@/lib/random/data'
import { normalizeWaveDocument, type WaveDocument } from '@/lib/random/waveEngine'
import { randomHandler } from '@/lib/discovery/handlers'
import { recordDailyUsage } from '@/lib/metrics/usage'
import { curatorRequestAllowed } from '@/lib/discovery/curatorAuth'
export const runtime = 'nodejs'
export const POST = randomHandler({
  enabled: () => process.env.RANDOM_POOL_V2_ENABLED === '1', getDb: getDbSafe,
  decode: row => normalizeWaveDocument(row as WaveDocument),
  onSelected: async (item, lang, req) => {
    // Same aggregate counting point as the legacy Random API. Private curation is excluded.
    if (!curatorRequestAllowed(req)) await recordDailyUsage({ type: item.type, lang: lang as 'en' | 'fr' | 'de' | 'es' | 'jp', provider: item.provider })
  },
})
