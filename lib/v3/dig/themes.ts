/**
 * The theme list of the keywords base: readable subjects, a bit offbeat, fun,
 * weird, retro, home-made. Kept in `themes.json` so the owner can read it and
 * ask for additions; each theme is dug like a name, then combined with the
 * angle words (era, place, situation) one search at a time.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { subjectId } from '../tagging/normalize'
import { isUniverse, type Universe } from '../types'
import { themeAngles } from './angles'
import type { NewSubject } from './queue'

export type Theme = {
  slug: string
  /** What the owner reads. */
  fr: string
  /** What is searched: the theme's words, in English unless `lang` says otherwise. */
  en: string
  /** The spellings the door accepts in a title, description or tags. */
  aliases: string[]
  universe: Universe
  lang?: string
}

export function readThemes(path = join(process.cwd(), 'lib/v3/dig/themes.json')): Theme[] {
  const rows = JSON.parse(readFileSync(path, 'utf8')) as Array<Partial<Theme>>
  return rows.map((row) => validateTheme(row))
}

export function validateTheme(row: Partial<Theme>): Theme {
  if (!row.slug || !row.fr || !row.en) throw new Error(`thème incomplet : ${JSON.stringify(row).slice(0, 80)}`)
  if (!isUniverse(row.universe)) throw new Error(`univers inconnu pour ${row.slug} : ${String(row.universe)}`)
  const aliases = [...new Set([row.en, row.fr, ...(row.aliases ?? [])].map((alias) => alias.trim()).filter((alias) => alias.length >= 3))]
  return { slug: row.slug, fr: row.fr, en: row.en, aliases, universe: row.universe, ...(row.lang ? { lang: row.lang } : {}) }
}

/** A theme as the queue takes it: a known-level subject with every angle ahead of it. */
export function themeSubject(theme: Theme): NewSubject {
  return {
    _id: `topic:${theme.slug}`, label: theme.en, aliases: theme.aliases, kind: 'topic', base: 'keywords', fame: 'known',
    universe: theme.universe, ...(theme.lang ? { lang: theme.lang } : {}), angles: themeAngles(), priority: 15, source: { fr: theme.fr },
  }
}

/** The id a theme gets in the subject dictionary: the same as in the queue. */
export const themeId = (theme: Theme) => subjectId('topic', theme.slug)
