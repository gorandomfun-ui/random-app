// lib/i18n/config.ts

// Les langues que tu gères dans /lib/i18n/dictionaries/{fr,en,de,jp}.ts
export type Language = 'fr' | 'en' | 'de' | 'jp'

/** Normalise un code type 'fr-FR' -> 'fr', 'ja-JP'/'jp' -> 'jp', etc. */
export function normalizeLocale(input?: string): Language {
  const v = (input || '').toLowerCase()
  if (v.startsWith('fr')) return 'fr'
  if (v.startsWith('de')) return 'de'
  if (v.startsWith('ja') || v.startsWith('jp')) return 'jp'
  return 'en'
}

/**
 * Charge dynamiquement le dictionnaire {fr|en|de|jp}.ts
 * IMPORTANT: on n’ajoute PAS l’extension .ts/.json dans l’import dynamique.
 */
export async function getDictionary(lang?: string) {
  const code = normalizeLocale(lang)
  try {
    // tes dicos sont des modules TS qui exportent default { ... }
    const dictionary = await import(`./dictionaries/${code}`)
    return dictionary.default
  } catch {
    const dictionary = await import(`./dictionaries/en`)
    return dictionary.default
  }
}
