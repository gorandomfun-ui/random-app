import {
  CONSENT_KEY,
  LEGACY_CONSENT_KEY,
  denied,
  hasOptionalConsent,
  normalizeConsent,
  parseConsent,
  recordConsent,
  type ConsentRecord,
} from './consent'

export const REFUSAL_SESSION_KEY = 'random.consent.refusal.session.v1'
const AWAY_KEY = 'random.consent.away.v1'
export const VISIT_AWAY_MS = 30 * 60 * 1000

export type ConsentStores = {
  persistent: Storage | null
  session: Storage | null
}

export function browserConsentStores(): ConsentStores {
  let persistent: Storage | null = null
  let session: Storage | null = null
  try {
    persistent = window.localStorage
  } catch {
    /* The in-memory choice remains effective. */
  }
  try {
    session = window.sessionStorage
  } catch {
    /* The in-memory choice remains effective. */
  }
  return { persistent, session }
}

function get(storage: Storage | null, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null
  } catch {
    return null
  }
}

function set(storage: Storage | null, key: string, value: string) {
  try {
    storage?.setItem(key, value)
  } catch {
    /* Do not undo an effective in-memory choice. */
  }
}

function remove(storage: Storage | null, key: string) {
  try {
    storage?.removeItem(key)
  } catch {
    /* Storage may be blocked by the browser. */
  }
}

/** Grants persist; a full refusal belongs only to the current tab visit. */
export function persistConsent(stores: ConsentStores, record: ConsentRecord): void {
  if (hasOptionalConsent(record.choices)) {
    set(stores.persistent, CONSENT_KEY, JSON.stringify(record))
    remove(stores.session, REFUSAL_SESSION_KEY)
  } else {
    // Write the refusal first, then remove any previous grant (also notifies other tabs).
    set(stores.session, REFUSAL_SESSION_KEY, JSON.stringify(record))
    remove(stores.persistent, CONSENT_KEY)
  }
  remove(stores.persistent, LEGACY_CONSENT_KEY)
}

/** Marks departure only; never schedules a prompt during active navigation. */
export function markVisitAway(stores: ConsentStores, now = Date.now()): void {
  set(stores.session, AWAY_KEY, String(now))
}

/** A fresh tab has no session refusal. A retained tab renews its visit after 30 minutes away. */
export function resumeVisit(
  stores: ConsentStores,
  now = Date.now(),
  memoryAway: number | null = null,
): boolean {
  const raw = get(stores.session, AWAY_KEY)
  const away = raw === null ? memoryAway : Number(raw)
  remove(stores.session, AWAY_KEY)
  const renewed =
    away !== null && Number.isFinite(away) && away >= 0 && now - away >= VISIT_AWAY_MS
  if (renewed) remove(stores.session, REFUSAL_SESSION_KEY)
  return renewed
}

/** Move old durable full refusals into this visit, preserving positive and partial choices. */
export function readStoredConsent(
  stores: ConsentStores,
  now = Date.now(),
  gpc = false,
): ConsentRecord | null {
  const persistent = parseConsent(get(stores.persistent, CONSENT_KEY), now)
  if (persistent) {
    const value = { ...persistent, choices: normalizeConsent(persistent.choices, gpc) }
    if (!hasOptionalConsent(value.choices) || persistent.choices.ads !== value.choices.ads) {
      persistConsent(stores, value)
    }
    if (hasOptionalConsent(value.choices)) remove(stores.session, REFUSAL_SESSION_KEY)
    return value
  }

  const session = parseConsent(get(stores.session, REFUSAL_SESSION_KEY), now)
  // A positive grant never comes from the refusal-only session slot.
  return session && !hasOptionalConsent(session.choices) ? session : null
}

/** Revocation in another tab must immediately stop optional services here as well. */
export function recordRemoteRefusal(
  stores: ConsentStores,
  now = Date.now(),
): ConsentRecord {
  const value = recordConsent(denied(), now)
  set(stores.session, REFUSAL_SESSION_KEY, JSON.stringify(value))
  return value
}
