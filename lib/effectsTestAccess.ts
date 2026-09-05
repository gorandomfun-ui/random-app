import { createHash, timingSafeEqual } from 'node:crypto'

export const EFFECTS_TEST_COOKIE = 'random_effects_test_access'
export const EFFECTS_TEST_COOKIE_MAX_AGE = 24 * 60 * 60
const DEFAULT_EFFECTS_TEST_PASSWORD_HASH = '8bf9f0aaa9c9f49ff14361e5d693b543b6e40e7907e507aba2692310f826cf08'

function configuredPassword(): string {
  return (process.env.EFFECTS_TEST_PASSWORD || '').trim()
}

function hash(value: string): string {
  return createHash('sha256').update(`random-effects-test:${value}`).digest('hex')
}

function equalTokens(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function configuredToken(): string {
  const password = configuredPassword()
  if (password) return hash(password)
  return (process.env.EFFECTS_TEST_PASSWORD_HASH || '').trim() || DEFAULT_EFFECTS_TEST_PASSWORD_HASH
}

export function isEffectsTestConfigured(): boolean {
  return configuredToken().length > 0
}

export function matchesEffectsTestPassword(candidate: unknown): boolean {
  if (typeof candidate !== 'string') return false
  return equalTokens(hash(candidate), configuredToken())
}

export function getEffectsTestAccessToken(): string | null {
  return configuredToken() || null
}

export function hasEffectsTestAccess(cookieValue: string | undefined): boolean {
  const token = getEffectsTestAccessToken()
  return Boolean(token && cookieValue && equalTokens(cookieValue, token))
}
