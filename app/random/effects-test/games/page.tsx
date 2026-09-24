import type { Metadata } from 'next'
import { cookies } from 'next/headers'

import MockGallery from '@/components/games/MockGallery'
import { EFFECTS_TEST_COOKIE, hasEffectsTestAccess, isEffectsTestConfigured } from '@/lib/effectsTestAccess'
import EffectsTestLogin from '../EffectsTestLogin'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Jeux — maquette',
  robots: { index: false, follow: false },
}

/** The games' still screens, behind the same door as the effects test page. */
export default function GamesMockPage() {
  const cookieStore = cookies()
  if (!hasEffectsTestAccess(cookieStore.get(EFFECTS_TEST_COOKIE)?.value)) {
    return <EffectsTestLogin configured={isEffectsTestConfigured()} />
  }
  return <MockGallery />
}
