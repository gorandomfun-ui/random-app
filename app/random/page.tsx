import { cookies } from 'next/headers'
import RandomExperience from './RandomExperience'
import { CURATOR_COOKIE, validCuratorToken } from '@/lib/discovery/curatorAuth'

export const dynamic = 'force-dynamic'

export default function RandomExperiencePage() {
  const curationMode = validCuratorToken(cookies().get(CURATOR_COOKIE)?.value)
  return <RandomExperience
    discoveryMode={curationMode || process.env.RANDOM_POOL_V2_ENABLED !== '0'}
    waveDiscoveryMode={curationMode || process.env.RANDOM_WAVE_V2_ENABLED !== '0'}
    curationMode={curationMode}
  />
}
