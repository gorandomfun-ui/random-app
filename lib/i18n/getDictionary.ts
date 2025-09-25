export type Locale = 'en' | 'fr' | 'de' | 'ja'

export const LOCALES: Locale[] = ['en', 'fr', 'de', 'ja']
export const DEFAULT_LOCALE: Locale = 'en'

type Dictionary = Record<string, unknown>

export async function getDictionary(locale: Locale): Promise<Dictionary> {
  const file = locale === 'ja' ? 'jp' : locale
  const mod = await import(`./dictionaries/${file}.json`)
  const dict = mod.default as unknown
  return typeof dict === 'object' && dict !== null ? (dict as Dictionary) : {}
}
