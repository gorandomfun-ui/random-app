export type Consent = {
  necessary: true
  analytics: boolean
  ads: boolean
  personalization: boolean
  media: boolean
}

export type ConsentRecord = {
  version: 2
  savedAt: number
  expiresAt: number
  choices: Consent
}

export const CONSENT_KEY = 'random.consent.v2'
export const LEGACY_CONSENT_KEY = 'random.consent.v1'
export const CONSENT_DURATION_MS = 180 * 24 * 60 * 60 * 1000

export const denied = (): Consent => ({
  necessary: true,
  analytics: false,
  ads: false,
  personalization: false,
  media: false,
})

export function normalizeConsent(value: Consent, gpc = false): Consent {
  return {
    necessary: true,
    analytics: false,
    personalization: false,
    ads: !gpc && value.ads === true,
    media: value.media === true,
  }
}

export function hasOptionalConsent(value: Consent): boolean {
  return value.media === true || value.ads === true
}

export function recordConsent(value: Consent, now = Date.now(), gpc = false): ConsentRecord {
  return {
    version: 2,
    savedAt: now,
    expiresAt: now + CONSENT_DURATION_MS,
    choices: normalizeConsent(value, gpc),
  }
}

export function parseConsent(raw: string | null, now = Date.now()): ConsentRecord | null {
  if (!raw || raw.length > 4096) return null
  try {
    const record = JSON.parse(raw)
    if (
      record?.version !== 2 ||
      !Number.isFinite(record.savedAt) ||
      !Number.isFinite(record.expiresAt) ||
      record.savedAt > now ||
      record.expiresAt <= now ||
      record.expiresAt <= record.savedAt ||
      record.expiresAt - record.savedAt > CONSENT_DURATION_MS
    ) {
      return null
    }
    const choices = record.choices
    if (
      !choices ||
      choices.necessary !== true ||
      ['analytics', 'ads', 'personalization', 'media'].some(
        (key) => typeof choices[key] !== 'boolean',
      )
    ) {
      return null
    }
    return {
      version: 2,
      savedAt: record.savedAt,
      expiresAt: record.expiresAt,
      choices: normalizeConsent(choices),
    }
  } catch {
    return null
  }
}

// V1 had neither a timestamp nor proof distinguishing automatic grants from user choice.
// Never silently migrate a positive V1 permission. No service starts during the new choice.

/** Grant only optional media. Preserve the expiry of already-made choices.
 * A click to allow a video is not a new advertising permission or renewal.
 */
export function grantMediaConsent(
  current: ConsentRecord | null,
  now = Date.now(),
  gpc = false,
): ConsentRecord {
  if (
    current &&
    hasOptionalConsent(current.choices) &&
    parseConsent(JSON.stringify(current), now)
  ) {
    return {
      ...current,
      choices: normalizeConsent({ ...current.choices, media: true }, gpc),
    }
  }
  return recordConsent({ ...denied(), media: true }, now, gpc)
}
