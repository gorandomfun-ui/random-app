import test from 'node:test'
import assert from 'node:assert/strict'

import { depthId, DRY_BEFORE_RESET, MAX_PAGE, nextDepth } from '@/lib/v3/pools/depth'

/**
 * The rule that decides how deep a pool query goes next time. Reading the first
 * page every night was giving two thirds duplicates; this is what replaces it.
 */

test('une page qui rapporte fait descendre d_un cran', () => {
  assert.deepEqual(nextDepth({ page: 1, dry: 0 }, 25, 20), { page: 2, dry: 0 })
  assert.deepEqual(nextDepth({ page: 7, dry: 1 }, 25, 9), { page: 8, dry: 0 }, 'et efface les pages sèches')
})

test('une page presque vide compte comme sèche, sans bloquer la descente', () => {
  const after = nextDepth({ page: 3, dry: 0 }, 25, 1)
  assert.equal(after.dry, 1)
  assert.equal(after.page, 4, 'on essaie quand même la suivante')
})

test('deux pages sèches de suite renvoient la requête en haut, là où arrive le neuf', () => {
  let state = { page: 5, dry: 0 }
  for (let i = 0; i < DRY_BEFORE_RESET; i += 1) state = nextDepth(state, 25, 0)
  assert.deepEqual(state, { page: 1, dry: 0 })
})

test('la profondeur ne dépasse pas ce que la plateforme sert', () => {
  assert.deepEqual(nextDepth({ page: MAX_PAGE, dry: 0 }, 25, 25), { page: 1, dry: 0 })
})

test('une recherche sans résultat ne fait pas avancer à l_aveugle vers le vide', () => {
  const first = nextDepth({ page: 2, dry: 0 }, 0, 0)
  assert.equal(first.dry, 1, 'zéro résultat est sec')
  const second = nextDepth(first, 0, 0)
  assert.equal(second.page, 1, 'et deux de suite ramènent en haut')
})

test('chaque requête et chaque tri ont leur propre profondeur', () => {
  const base = { line: 'pools', provider: 'dailymotion' }
  const a = depthId({ ...base, query: 'safari', sort: 'recent' })
  const b = depthId({ ...base, query: 'safari', sort: 'relevance' })
  const c = depthId({ ...base, query: 'volcan', sort: 'recent' })
  assert.notEqual(a, b)
  assert.notEqual(a, c)
  assert.equal(a, depthId({ ...base, query: 'SAFARI', sort: 'recent' }), 'la casse ne crée pas un doublon')
})
