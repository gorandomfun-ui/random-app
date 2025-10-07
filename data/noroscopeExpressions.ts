export type ExpressionTone = 'positive' | 'positiveMedium' | 'negativeMedium' | 'negative'
export type ExpressionLocale = 'en' | 'fr' | 'de' | 'jp'

export type NoroscopeExpressions = Record<ExpressionTone, Partial<Record<ExpressionLocale, string[]>>>

/**
 * Fill each locale array with ~100 short expressions (<= 10 words) conveying the requested tone.
 * Expressions should be human-written, feel natural for the locale, and carry the appropriate polarity.
 */
export const NOROSCOPE_EXPRESSIONS: NoroscopeExpressions = {
  positive: {
    en: [],
    fr: [],
    de: [],
    jp: [],
  },
  positiveMedium: {
    en: [],
    fr: [],
    de: [],
    jp: [],
  },
  negativeMedium: {
    en: [],
    fr: [],
    de: [],
    jp: [],
  },
  negative: {
    en: [],
    fr: [],
    de: [],
    jp: [],
  },
}
