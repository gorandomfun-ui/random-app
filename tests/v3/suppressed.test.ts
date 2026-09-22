import test from 'node:test'
import assert from 'node:assert/strict'

import { candidateFromRow } from '@/lib/discovery/catalog'
import { base } from '@/lib/discovery/mongo'
import { hardEligible, newSession, planDraw } from '@/lib/discovery/pool'
import { SERVABLE as COOL_SERVABLE } from '@/lib/v3/cool/start'
import { SERVABLE, SHOWABLE } from '@/lib/v3/wave/find'
import { blockImageForSession, isImageBlockedThisSession } from '@/utils/imageSuspects'
import { isMediaBlockedThisSession } from '@/utils/mediaSuspects'
import { blockVideoForSession } from '@/utils/videoSuspects'

/** A media the provider said is gone is `isSuppressed`; every path that draws a content must leave it out. */

test('le random normal : le filtre de base refuse un contenu supprimé, pour chaque type', () => {
  for (const type of ['video', 'image', 'web', 'quote', 'joke', 'fact'] as const) {
    assert.deepEqual(base(type, 'en', Date.now()).isSuppressed, { $ne: true }, type)
  }
  assert.deepEqual(base('video', 'en', Date.now()).obsoleteVideoStatus, { $ne: 'obsolete' })
})

test('le random normal : un contenu supprimé lu quand même n_est jamais éligible', () => {
  const now = Date.now()
  const row = { _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', type: 'image', provider: 'giphy', url: 'https://media.giphy.com/media/abc123/giphy.gif', isSuppressed: true }
  const candidate = candidateFromRow(row, row, now)
  assert.equal(candidate.suppressed, true)
  const state = newSession(1)
  assert.equal(hardEligible(candidate, planDraw(state, 'image'), state), false)
  assert.equal(hardEligible(candidateFromRow({ ...row, isSuppressed: false }, row, now), planDraw(state, 'image'), state), true)
})

test('le cool pool et la Wave : leurs filtres refusent un contenu supprimé', () => {
  assert.deepEqual(COOL_SERVABLE.isSuppressed, { $ne: true })
  assert.deepEqual(SERVABLE.isSuppressed, { $ne: true })
  assert.deepEqual(SHOWABLE.isSuppressed, { $ne: true })
})

test('une image qui a échoué est bloquée pour la session, comme une vidéo', () => {
  const image = { type: 'image' as const, _id: 'img-1', url: 'https://media.giphy.com/media/x/giphy.gif' }
  assert.equal(isMediaBlockedThisSession(image), false)
  blockImageForSession(image)
  assert.equal(isImageBlockedThisSession(image), true)
  assert.equal(isMediaBlockedThisSession(image), true)
  const video = { type: 'video' as const, _id: 'vid-1', url: 'https://www.dailymotion.com/video/x8abc12' }
  assert.equal(isMediaBlockedThisSession(video), false)
  blockVideoForSession(video)
  assert.equal(isMediaBlockedThisSession(video), true)
  assert.equal(isMediaBlockedThisSession({ type: 'quote' as const, text: 'x', author: 'y', provider: 'p' }), false, 'un texte ne se bloque pas')
})
