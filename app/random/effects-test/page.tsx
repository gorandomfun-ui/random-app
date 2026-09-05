import type { Metadata } from 'next'
import { cookies } from 'next/headers'

import { EFFECTS_TEST_COOKIE, hasEffectsTestAccess, isEffectsTestConfigured } from '@/lib/effectsTestAccess'
import RandomExperience from '../RandomExperience'
import EffectsTestLogin from './EffectsTestLogin'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Effects test',
  robots: { index: false, follow: false },
}

export default function EffectsTestPage() {
  const cookieStore = cookies()
  const hasAccess = hasEffectsTestAccess(cookieStore.get(EFFECTS_TEST_COOKIE)?.value)

  if (!hasAccess) {
    return <EffectsTestLogin configured={isEffectsTestConfigured()} />
  }

  return <RandomExperience effectsTestMode />
}
