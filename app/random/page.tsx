import RandomExperience from './RandomExperience'

export const dynamic = 'force-dynamic'

export default function RandomExperiencePage() {
  return <RandomExperience
    discoveryMode={process.env.RANDOM_POOL_V2_ENABLED !== '0'}
    waveDiscoveryMode={process.env.RANDOM_WAVE_V2_ENABLED !== '0'}
  />
}
