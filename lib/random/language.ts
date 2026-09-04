import type { Document, Filter } from 'mongodb'

import type { RandomSelectOptions } from './types'

const CONTENT_LANGS = new Set(['en', 'fr', 'de', 'es', 'jp'])

export function buildContentLanguageMatch<T extends Document>(
  lang: RandomSelectOptions['lang'],
): Filter<T> {
  const normalized = typeof lang === 'string' ? lang.trim().toLowerCase() : ''
  if (!CONTENT_LANGS.has(normalized)) return {} as Filter<T>

  return {
    $or: [
      { languageScope: { $exists: false } },
      { languageScope: null },
      { languageScope: 'universal' },
      { languageScope: 'localized', lang: normalized },
    ],
  } as unknown as Filter<T>
}

export function combineContentMatches<T extends Document>(
  ...matches: Array<Filter<T> | null | undefined>
): Filter<T> {
  const active = matches.filter((match): match is Filter<T> => Boolean(match && Object.keys(match).length))
  if (!active.length) return {} as Filter<T>
  if (active.length === 1) return active[0]
  return { $and: active } as Filter<T>
}
