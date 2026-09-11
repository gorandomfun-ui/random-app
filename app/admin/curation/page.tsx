import { cookies } from 'next/headers'
import RandomExperience from '@/app/random/RandomExperience'
import { CURATOR_COOKIE, curatorConfigured, validCuratorToken } from '@/lib/discovery/curatorAuth'
import CuratorLogin from './Login'
export const dynamic = 'force-dynamic'
export const metadata = { title: 'Random — Curation privée', robots: { index: false, follow: false } }
export default function CurationPage() {
  if (!validCuratorToken(cookies().get(CURATOR_COOKIE)?.value)) return <CuratorLogin configured={curatorConfigured()} />
  return <RandomExperience discoveryMode waveDiscoveryMode curationMode />
}
