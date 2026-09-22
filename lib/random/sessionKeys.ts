/**
 * Where the Random page and the home keep a session in the tab. The page
 * holds one session per language; the home's advance waits under its own
 * key until the page adopts it.
 */

export const RANDOM_SESSION_TTL_MS = 6 * 60 * 60 * 1000
export const DISCOVERY_SESSION_PREFIX = 'random-discovery-v2-'
export const CURATION_SESSION_PREFIX = 'random-curation-v2-'
export const HOME_ADVANCE_PREFIX = 'random-home-advance-'

export const randomSessionKey = (lang: string, curation: boolean) => `${curation ? CURATION_SESSION_PREFIX : DISCOVERY_SESSION_PREFIX}${lang}`
export const homeAdvanceKey = (lang: string, curation: boolean) => `${HOME_ADVANCE_PREFIX}${curation ? 'curation-' : ''}${lang}`
