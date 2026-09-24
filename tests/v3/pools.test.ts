import test from 'node:test'
import assert from 'node:assert/strict'

import { POOL_QUERIES, POOL_UNIVERSES, QUERIES_PER_NIGHT, queriesForDay } from '@/lib/v3/pools/facets'
import { computeUniverseRecap, recapNote } from '@/lib/v3/pools/recap'
import { GLOBAL_EXCLUDE_WORDS, wordsRegex } from '@/lib/v3/cool/registers'

test('chaque pool a ses requêtes : nombreuses, uniques, sans mot refusé', () => {
  const refused = wordsRegex(GLOBAL_EXCLUDE_WORDS)
  for (const universe of POOL_UNIVERSES) {
    const list = POOL_QUERIES[universe]
    assert.ok(list.length >= 48, `${universe} : ${list.length} requêtes`)
    assert.equal(new Set(list).size, list.length, `${universe} : doublons`)
    for (const query of list) assert.ok(!refused.test(query), `${universe} : « ${query} » porte un mot refusé`)
  }
})

test('une nuit demande huit requêtes par univers, la fenêtre glisse d_un jour à l_autre et fait le tour', () => {
  const day = new Date('2026-09-25T02:40:00Z')
  const tonight = queriesForDay('music', day)
  assert.equal(tonight.length, QUERIES_PER_NIGHT)
  assert.deepEqual(queriesForDay('music', day), tonight, 'la même nuit, les mêmes requêtes')
  const tomorrow = queriesForDay('music', new Date(day.getTime() + 86_400_000))
  assert.ok(tomorrow.every((query) => !tonight.includes(query)), 'le lendemain, d_autres')
  const seen = new Set<string>()
  for (let offset = 0; offset < 30; offset += 1) for (const query of queriesForDay('music', new Date(day.getTime() + offset * 86_400_000))) seen.add(query)
  assert.equal(seen.size, POOL_QUERIES.music.length, 'en un mois, toute la liste est passée')
})

test('l_indice d_univers d_une ligne prime sur les mots du titre, jamais sur un sujet connu', async () => {
  const { tagItem } = await import('@/lib/v3/tagging/tagItem')
  const { buildSubjectIndex } = await import('@/lib/v3/tagging/subjectIndex')
  const index = buildSubjectIndex([])
  const now = new Date('2026-09-25T00:00:00Z')
  assert.equal(tagItem({ type: 'video', title: 'Rendez-vous samedi soir', provider: 'dailymotion' }, index, now).universe, 'other')
  assert.equal(tagItem({ type: 'video', title: 'Rendez-vous samedi soir', provider: 'dailymotion', universeHint: 'events-parties' }, index, now).universe, 'events-parties')
  assert.equal(tagItem({ type: 'video', title: 'Best goals of the season', provider: 'dailymotion', universeHint: 'music' }, index, now).universe, 'music', 'la ligne sait ce qu_elle a cherché')
  assert.equal(tagItem({ type: 'video', title: 'Best goals of the season', provider: 'dailymotion' }, index, now).universe, 'sport', 'sans indice, les mots du titre')
})

test('le récap : tailles et entrées par univers, et sa ligne lisible', async () => {
  const db = {} as import('mongodb').Db
  const recap = await computeUniverseRecap(db, new Date('2026-09-25T02:40:00Z'), {
    sizes: async () => ({ music: 43568, gaming: 16629, other: 259712 }),
    added: async () => ({ music: 1240, gaming: 860, other: 2000 }),
  })
  assert.equal(recap.day, '2026-09-25')
  // The French thousands separator is a narrow no-break space.
  const plain = (text: string) => text.replace(/[\u202f\u00a0]/g, ' ')
  assert.equal(plain(recapNote(recap)), 'musique +1 240 (43 568) · gaming +860 (16 629) · non classé +2 000')
  assert.equal(recapNote({ ...recap, added: {} }), 'rien d_entré')
})
