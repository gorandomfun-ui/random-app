import type { ExpressionLocale, ExpressionTone } from '@/data/noroscopeExpressions'

import { NOROSCOPE_SUMMARIES_DE } from './de'
import { NOROSCOPE_SUMMARIES_EN } from './en'
import { NOROSCOPE_SUMMARIES_FR } from './fr'
import { NOROSCOPE_SUMMARIES_JP } from './jp'

type Summaries = Record<ExpressionLocale, Record<ExpressionTone, string[]>>

export const NOROSCOPE_SUMMARIES: Summaries = {
  en: NOROSCOPE_SUMMARIES_EN,
  fr: NOROSCOPE_SUMMARIES_FR,
  de: NOROSCOPE_SUMMARIES_DE,
  jp: NOROSCOPE_SUMMARIES_JP,
}
