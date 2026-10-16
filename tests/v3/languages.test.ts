import assert from 'node:assert/strict'
import test from 'node:test'

import { placeOf } from '../../lib/v3/ingest/mix'
import { contradicts, LANGUAGES } from '../../lib/v3/ingest/lines/languages'

test("a declared language is refused only when the title clearly reads another (16 October: a Turkish serial declared Finnish)", () => {
  assert.equal(contradicts('fi', 'Eşref Rüya 37. Bölüm full izle tek parça yeni bölüm'), true, 'Turkish declared Finnish (the detector reads it as Lingala)')
  assert.equal(contradicts('da', 'Yalı Çapkını 45. Bölüm tek parça izle'), true)
  assert.equal(contradicts('pl', 'Как приготовить лучший борщ дома'), true, 'Cyrillic under a Polish declaration')
  assert.equal(contradicts('sv', 'واخيرا بعد 5 سنوات خليت منصور'), true, 'Arabic under a Swedish declaration')
  assert.equal(contradicts('el', 'Πώς να φτιάξεις τον καλύτερο μουσακά στο σπίτι'), false)
  assert.equal(contradicts('ro', 'Cum să faci cele mai bune sarmale acasă în bucătărie'), false, 'Romanian s-comma and cedilla are not Turkish')
  assert.equal(contradicts('no', 'This is a film, and I am the director of it, watch it now'), true, 'English declared Norwegian')
  assert.equal(contradicts('sv', 'Så här lagar du den bästa köttbullen hemma i köket'), false)
  // The detector reads Norwegian and Danish as Dutch, Finnish as Ilocano: it never has to agree, only not to contradict.
  assert.equal(contradicts('no', 'Slik lager du den beste fiskesuppen hjemme på kjøkkenet'), false)
  assert.equal(contradicts('fi', 'Näin teet parhaan lohikeiton kotona keittiössä nopeasti'), false)
  // Kin taken for one another: Ukrainian read as Russian, Catalan as Spanish.
  assert.equal(contradicts('uk', 'Как приготовить лучший борщ дома на кухне быстро'), false)
  assert.equal(contradicts('ca', 'Cómo preparar la mejor paella en casa en la cocina'), false)
  assert.equal(contradicts('sv', 'Holy'), false, 'too short to tell: the doors decide')
})

test('the languages asked are the scarce ones of the base, never a place kept to a share', () => {
  for (const language of LANGUAGES) assert.equal(placeOf({ title: 'Some title here', lang: language }), null, language)
  for (const absent of ['en', 'fr', 'pt', 'tr', 'ar', 'ja', 'ko', 'zh', 'hi', 'id', 'th', 'vi', 'de', 'it', 'es', 'ru']) assert.ok(!(LANGUAGES as readonly string[]).includes(absent), absent)
})
