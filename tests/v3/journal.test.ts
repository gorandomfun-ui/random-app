import test from 'node:test'
import assert from 'node:assert/strict'

import {
  SATURATION_RETIRE_THRESHOLD,
  emptyCounters,
  judge,
  saturationRate,
} from '@/lib/v3/ingest/journal'

test('un passage qui n_insère rien n_est pas un succès', () => {
  // C_est ce mensonge qui a laissé la ligne "tendances" morte depuis le 11/09
  // sans que rien ne l_indique.
  const rien = { ...emptyCounters(), scanned: 120, inserted: 0 }
  assert.equal(judge(rien, [], false), 'skipped')
})

test('mais tout en doublons est un vrai succès', () => {
  // Rien de neuf à prendre n_est pas une panne : la source était déjà connue.
  const doublons = { ...emptyCounters(), scanned: 120, inserted: 0, duplicates: 120 }
  assert.equal(judge(doublons, [], false), 'ok')
})

test('un passage arrêté par son échéance est partiel, pas en échec', () => {
  const coupé = { ...emptyCounters(), scanned: 300, inserted: 40 }
  assert.equal(judge(coupé, [], true), 'partial')
})

test('des erreurs sans aucune insertion valent un échec', () => {
  const cassé = { ...emptyCounters(), scanned: 0, inserted: 0 }
  assert.equal(judge(cassé, ['quota épuisé'], false), 'failed')
})

test('des erreurs avec des insertions valent un passage partiel', () => {
  const mitigé = { ...emptyCounters(), scanned: 200, inserted: 30 }
  assert.equal(judge(mitigé, ['un fournisseur en panne'], false), 'partial')
})

test('un passage sans rien à examiner est ignoré, pas en échec', () => {
  assert.equal(judge(emptyCounters(), [], false), 'skipped')
})

test('une requête qui ne ramène que du déjà-saturé est repérée', () => {
  const mauvaise = { scanned: 50, rejected: { saturation: 40 } }
  assert.ok(saturationRate(mauvaise) > SATURATION_RETIRE_THRESHOLD, 'à retirer')

  const bonne = { scanned: 50, rejected: { saturation: 5 } }
  assert.ok(saturationRate(bonne) < SATURATION_RETIRE_THRESHOLD)

  assert.equal(saturationRate({ scanned: 0, rejected: {} }), 0, 'pas de division par zéro')
})
