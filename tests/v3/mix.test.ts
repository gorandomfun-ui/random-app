import assert from 'node:assert/strict'
import test from 'node:test'

import { Mix, placeOf } from '../../lib/v3/ingest/mix'

test("where a video is from: the platform's declared language first, then the script, then the title only when clearly not English", () => {
  // Declared by the platform, as it gives it or as stored.
  assert.equal(placeOf({ title: 'Blade Runner 2099 - NYCC Trailer | Prime Video', lang: 'en-US' }), null)
  assert.equal(placeOf({ title: 'ela queria andar de moto a noite', lang: 'pt-BR' }), 'BR')
  assert.equal(placeOf({ title: 'WUANJAY dapat IKAN PARI', lang: 'id' }), 'ID')
  assert.equal(placeOf({ title: 'Kayahan - Alınma Ağlıyorsam', lang: 'tr' }), null, 'a Turkish song declared Turkish is not taken for Filipino')
  assert.equal(placeOf({ title: 'Some title', lang: 'fil' }), 'PH')
  assert.equal(placeOf({ title: 'Some title', lang: 'tgl' }), 'PH', 'the detector\'s three-letter codes too')
  // The script tells, whatever was declared.
  assert.equal(placeOf({ title: 'नवरात्रि का पहला दिन', lang: 'en' }), 'IN')
  assert.equal(placeOf({ title: 'ลุยตลาดเช้า' }), 'TH')
  // No declared language: the title, only when it is clearly not English (13 October's misreadings).
  for (const english of ['Blade Runner 2099 - NYCC Trailer | Prime Video', 'Surviving My First Pokemon Nuzlocke', 'Funny Happenings at SCHOOL, Bombing at School', 'Contemporary | TeRRa Dance | Workshop', 'chess board that castles itself!']) {
    assert.equal(placeOf({ title: english }), null, english)
  }
  assert.equal(placeOf({ title: 'Coisas que NÃO SÃO COMESTÍVEIS mas dão uma vontade incontrolável de morder' }), 'BR')
  assert.equal(placeOf({ title: 'Pembalap muda Indonesia juara dunia untuk pertama kalinya' }), 'ID')
  assert.equal(placeOf({ title: '물놀이가 하고 싶었던 수달' }), null, 'Korean is not among them')
})

test('the mix reads the declared language: an English video declared English is never held back as Brazilian', () => {
  const mix = new Mix(0.15, 0.06, 2)
  let english = 0, brazil = 0
  for (let index = 0; index < 100; index += 1) {
    if (mix.accepts({ title: `Contemporary Dance Workshop number ${index}`, seconds: 600, lang: 'en' })) english += 1
    if (mix.accepts({ title: `Uma tarde no parque com os amigos ${index}`, seconds: 600, lang: 'pt' })) brazil += 1
  }
  assert.equal(english, 100)
  assert.ok(brazil >= 6 && brazil <= 16, `Brazil kept to its share, not excluded (${brazil})`)
})
