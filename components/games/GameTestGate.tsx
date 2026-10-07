import { cookies } from 'next/headers'

import EffectsTestLogin from '@/app/random/effects-test/EffectsTestLogin'
import ArcadePage from '@/components/games/ArcadePage'
import { hasEffectsTestAccess, isEffectsTestConfigured } from '@/lib/effectsTestAccess'
import { GAMES_TEST_COOKIE } from '@/lib/games/access'
import type { RacingWorld } from '@/lib/games/racing-worlds'
import type { GameName } from '@/lib/games/scores'
import { getRandomTheme } from '@/lib/theme'

/** A game's test page: behind the effects test password, then the game in its Random page, in one of the site's colours; `startLevel` to begin further on. */
export default function GameTestGate({ game, startLevel, startWorld }: { game: GameName; startLevel?: number; startWorld?: RacingWorld }) {
  if (!hasEffectsTestAccess(cookies().get(GAMES_TEST_COOKIE)?.value)) {
    return <EffectsTestLogin configured={isEffectsTestConfigured()} title="Games test" endpoint="/api/games-test/access" />
  }
  return <ArcadePage game={game} themeIndex={getRandomTheme().index} startLevel={startLevel} startWorld={startWorld} />
}
