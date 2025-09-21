export type Locale = "en" | "fr" | "de" | "ja"

export const LOCALES: Locale[] = ["en", "fr", "de", "ja"]
export const DEFAULT_LOCALE: Locale = "en"

export async function getDictionary(locale: Locale): Promise<Record<string, any>> {
  const file = locale === "ja" ? "jp" : locale
  const mod = await import(`./dictionaries/${file}.json`)
  return mod.default
}
