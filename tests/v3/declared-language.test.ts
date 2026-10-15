import assert from 'node:assert/strict'
import test from 'node:test'

import { buildVideoDocument, declaredLanguage } from '../../lib/ingest/videoDocument'

test("a platform's language code comes down to its language; what is not one gives nothing", () => {
  assert.equal(declaredLanguage('en-US'), 'en')
  assert.equal(declaredLanguage('pt-BR'), 'pt')
  assert.equal(declaredLanguage('es-419'), 'es')
  assert.equal(declaredLanguage('zh-Hant'), 'zh')
  assert.equal(declaredLanguage('fil'), 'fil', 'three letters stay three, never cut to "fi" (Finnish)')
  assert.equal(declaredLanguage('FR'), 'fr')
  for (const nothing of ['und', 'zxx', 'mul', '', 'english', 42, null, undefined]) assert.equal(declaredLanguage(nothing), undefined, String(nothing))
})

test('the declared language is written on the video, whichever line found it (13 October: it was lost at the writing)', () => {
  const base = { videoId: 'abc', url: 'https://youtu.be/abc', provider: 'youtube' as const, title: 'Blade Runner 2099 - NYCC Trailer | Prime Video' }
  assert.equal(buildVideoDocument({ ...base, declaredLang: 'en-US' })?.lang, 'en', 'a DigVideo carries it as declaredLang')
  assert.equal(buildVideoDocument({ ...base, lang: 'id' })?.lang, 'id', 'the charts carry it as lang')
  assert.equal(buildVideoDocument(base)?.lang, undefined, 'none declared, none written')
  assert.equal(buildVideoDocument({ ...base, declaredLang: 'und' })?.lang, undefined)
})
