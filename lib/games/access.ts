/**
 * The door to the games' test pages under /admin: the same password as the
 * effects test page, its own cookie, sent only to /admin, since the effects
 * test cookie only travels under /random/effects-test.
 */

export const GAMES_TEST_COOKIE = 'random_games_test_access'
export const GAMES_TEST_PATH = '/admin'
