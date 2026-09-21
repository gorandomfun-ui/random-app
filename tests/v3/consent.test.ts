import test from 'node:test'
import assert from 'node:assert/strict'

import { denied, impliedConsent, normalizeConsent } from '@/lib/privacy/consent'

test('dans l_UE rien d_optionnel ne tourne avant un choix ; ailleurs, pubs et lecteurs sont permis par défaut', () => {
  assert.equal(impliedConsent('eu'), null)
  assert.deepEqual(impliedConsent('us'), { ...denied(), ads: true, media: true })
  assert.deepEqual(impliedConsent('other'), { ...denied(), ads: true, media: true })
})

test('le signal Global Privacy Control coupe la pub même hors UE', () => {
  const implied = impliedConsent('us')!
  assert.equal(normalizeConsent(implied, true).ads, false)
  assert.equal(normalizeConsent(implied, true).media, true, 'les lecteurs vidéo ne sont pas de la publicité')
  assert.equal(normalizeConsent(implied, false).ads, true)
})
