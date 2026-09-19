/**
 * Phase 5.A — fills subjects_v3 from the hand-written themes and from the
 * entities people read about on Wikipedia.
 *
 * Without --apply it writes nothing and only reports what it found.
 *   node --env-file=.env.local --import tsx scripts/v3/build-subjects.ts --days=40
 *   node --env-file=.env.local --import tsx scripts/v3/build-subjects.ts --days=40 --apply
 *
 * Only free APIs are used; there is no key and no quota to spend.
 */

import { MongoClient } from 'mongodb'

import { buildEntitySubject, buildThemeSubjects, mergeSubjects, writeSubjects, type BuiltSubject } from '@/lib/v3/subjects/build'
import { WIKI_LANGUAGES, fetchTopArticles, sampleDates, type WikiLanguage } from '@/lib/v3/subjects/wikipedia'
import { fetchWikidataSubjects } from '@/lib/v3/subjects/wikidata'
import { duplicateThemeSlugs } from '@/lib/v3/subjects/themes'

/** Wikimedia rate-limits hard; 120ms silently lost six languages out of nine. */
const PAUSE_MS = 1_100

function numericFlag(name: string, fallback: number): number {
  const raw = process.argv.find((argument) => argument.startsWith(`--${name}=`))
  if (!raw) return fallback
  const value = Number(raw.split('=')[1])
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback
}

const pause = () => new Promise((resolve) => setTimeout(resolve, PAUSE_MS))

/**
 * Saves what one language produced, as soon as it is produced.
 *
 * The run takes hours, and it used to write only at the very end: a closed lid
 * or a dropped connection threw away everything it had gathered. Subjects are
 * upserted, so a partial dictionary only ever adds to the one already in place.
 */
type LanguageWriter = (language: string, subjects: BuiltSubject[]) => Promise<void>

async function collectEntities(
  daysPerLanguage: number,
  onLanguageDone?: LanguageWriter,
): Promise<{ subjects: BuiltSubject[]; failures: string[] }> {
  const collected: BuiltSubject[] = []
  const failures: string[] = []

  for (const language of WIKI_LANGUAGES) {
    const startOfLanguage = collected.length
    const dates = sampleDates(daysPerLanguage)
    const titles = new Set<string>()
    let dayErrors = 0

    for (const date of dates) {
      try {
        const articles = await fetchTopArticles(language as WikiLanguage, date)
        for (const article of articles) titles.add(article.title)
      } catch (error) {
        dayErrors += 1
        if (dayErrors === 1) console.log(`  ${language} : ${(error as Error).message}`)
      }
      await pause()
    }

    const list = Array.from(titles)
    const batches: string[][] = []
    for (let index = 0; index < list.length; index += 50) {
      batches.push(list.slice(index, index + 50))
    }

    let found = 0
    let batchErrors = 0
    for (const batch of batches) {
      try {
        const entities = await fetchWikidataSubjects(language, batch)
        for (const entity of entities) {
          const subject = buildEntitySubject(entity)
          if (subject) {
            collected.push(subject)
            found += 1
          }
        }
      } catch (error) {
        batchErrors += 1
        if (batchErrors === 1) console.log(`  ${language} : ${(error as Error).message}`)
      }
      await pause()
    }

    const note = dayErrors || batchErrors ? ` — ${dayErrors} jours et ${batchErrors} lots en échec` : ''
    console.log(`  ${language} : ${titles.size} articles vus, ${found} sujets retenus${note}`)

    // Silence here is what hid the previous failed run.
    if (!found) failures.push(`${language} n_a produit aucun sujet`)

    if (onLanguageDone && found) {
      await onLanguageDone(language, collected.slice(startOfLanguage))
    }
  }

  return { subjects: collected, failures }
}

function summarise(subjects: BuiltSubject[]): void {
  const byKind = new Map<string, number>()
  const byUniverse = new Map<string, number>()
  let ambiguous = 0

  for (const subject of subjects) {
    byKind.set(subject.kind, (byKind.get(subject.kind) ?? 0) + 1)
    byUniverse.set(subject.universe, (byUniverse.get(subject.universe) ?? 0) + 1)
    if (subject.ambiguous) ambiguous += 1
  }

  console.log('\nPar nature :')
  for (const [kind, count] of [...byKind].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${kind.padEnd(8)} ${count}`)
  }

  console.log('\nPar univers :')
  for (const [universe, count] of [...byUniverse].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${universe.padEnd(16)} ${count}`)
  }

  console.log(`\nSujets ambigus (nom court et courant, second indice requis) : ${ambiguous}`)
}

async function main(): Promise<void> {
  const duplicates = duplicateThemeSlugs()
  if (duplicates.length) throw new Error(`Thèmes en double : ${duplicates.join(', ')}`)

  const apply = process.argv.includes('--apply')
  const days = numericFlag('days', 20)

  console.log(apply ? 'Mode : ÉCRITURE dans subjects_v3\n' : 'Mode : rapport à blanc, aucune écriture\n')

  const themes = buildThemeSubjects()
  console.log(`Thèmes écrits à la main : ${themes.length}`)

  const uri = process.env.MONGODB_URI || process.env.MONGO_URI
  if (apply && !uri) throw new Error('MONGODB_URI manquant')
  const dbName = process.env.MONGODB_DB || process.env.MONGO_DB || 'randomdb'
  const client = apply ? new MongoClient(uri as string, { serverSelectionTimeoutMS: 20000 }) : null
  if (client) await client.connect()

  try {
    if (client) {
      const written = await writeSubjects(client.db(dbName), mergeSubjects(themes))
      console.log(`  thèmes enregistrés : ${written.inserted} créés, ${written.updated} mis à jour`)
    }

    console.log(`\nWikipédia — ${days} journées échantillonnées par langue :`)
    const { subjects: entities, failures } = await collectEntities(days, client
      ? async (language, subjects) => {
          const written = await writeSubjects(client.db(dbName), mergeSubjects(subjects))
          console.log(`     ↳ ${language} enregistré : ${written.inserted} créés, ${written.updated} mis à jour`)
        }
      : undefined)

  const all = mergeSubjects([...themes, ...entities])
  console.log(`\nTotal après dédoublonnage : ${all.length} sujets (${themes.length + entities.length} avant)`)

  if (failures.length) {
    console.log(`\n⚠️  ${failures.length} langue(s) sans résultat :`)
    for (const failure of failures) console.log(`   - ${failure}`)
  }
  summarise(all)

  console.log('\nÉchantillon de 15 sujets :')
  for (const subject of all.slice(themes.length, themes.length + 15)) {
    console.log(`  ${subject._id}`)
    console.log(`     univers : ${subject.universe} · alias : ${subject.aliases.slice(0, 5).join(', ')}`)
  }

    if (!client) {
      console.log('\nRelancer avec --apply pour écrire dans subjects_v3.')
      return
    }

    // Each language was saved as it finished; this last pass is what merges the
    // aliases a subject picked up in several languages.
    const result = await writeSubjects(client.db(dbName), all)
    console.log(`\nÉcrit dans ${dbName}.subjects_v3 : ${result.inserted} créés, ${result.updated} mis à jour.`)

    // Said at the end rather than thrown, because the subjects are already in
    // place and throwing them away would help nobody.
    if (failures.length > WIKI_LANGUAGES.length / 3) {
      console.log(`\nATTENTION : ${failures.length}/${WIKI_LANGUAGES.length} langues en échec ; le dictionnaire est incomplet.`)
    }
  } finally {
    if (client) await client.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
