import RandomExperience from './RandomExperience'

export const dynamic = 'force-dynamic'

export default function RandomExperiencePage() {
  return <RandomExperience
    discoveryMode={process.env.RANDOM_POOL_V2_ENABLED !== '0'}
    // The v3 Wave, not the discovery one. RANDOM_WAVE_V2_ENABLED was "1" in
    // production, which sent every draw down the discovery branch — so the v3
    // Wave, its rules and its word level were never once called by the site.
    // Set this to true to go back to the discovery wave.
    waveDiscoveryMode={false}
  />
}
