import RandomExperience from '@/app/random/RandomExperience'
import { CURATION_APP_PATHS } from '@/lib/navigation/appPaths'

export default function CurationRandomPage() {
  return (
    <RandomExperience
      discoveryMode
      waveDiscoveryMode
      curationMode
      navigationPaths={CURATION_APP_PATHS}
    />
  )
}
