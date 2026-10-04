import assert from 'node:assert/strict'
import test from 'node:test'

import { captionCommand, chooseCaptions, youtubeLanguage, type CaptionTrack } from '../../lib/random/captions'
import { spokenLanguage } from '../../lib/discovery/spoken'

const track = (languageCode: string, kind = ''): CaptionTrack => ({ languageCode, languageName: languageCode, kind, vss_id: `.${languageCode}` })
// Rick Astley's list as the player gave it on 4 October: German first, no French.
const rick = [track('de-DE'), track('en'), track('es-419'), track('ja'), track('pt-BR')]
const shownCode = (choice: ReturnType<typeof chooseCaptions>) => ('show' in choice ? `${choice.show.languageCode}${(choice.show.translationLanguage as { languageCode?: string } | undefined)?.languageCode ? `→${(choice.show.translationLanguage as { languageCode: string }).languageCode}` : ''}` : 'off')

test('the app says jp, YouTube ja; a regional code keeps its language', () => {
  assert.equal(youtubeLanguage('jp'), 'ja')
  assert.equal(youtubeLanguage('fr-FR'), 'fr')
  assert.equal(youtubeLanguage(''), 'en')
  assert.equal(youtubeLanguage(undefined), 'en')
})

test("the app's language when the video has it, whatever the video speaks", () => {
  assert.equal(shownCode(chooseCaptions({ app: 'jp', spoken: 'en', tracks: rick })), 'ja')
  assert.equal(shownCode(chooseCaptions({ app: 'es', tracks: rick })), 'es-419')
})

test('an English video without the app language: no subtitles, never the first track of the list', () => {
  assert.equal(shownCode(chooseCaptions({ app: 'fr', spoken: 'en', tracks: rick })), 'off')
})

test('a video in the app language needs none, told by the draw or by the automatic track the player put on', () => {
  assert.equal(shownCode(chooseCaptions({ app: 'fr', spoken: 'fr', tracks: [track('en')] })), 'off')
  assert.equal(shownCode(chooseCaptions({ app: 'fr', tracks: [], shown: track('fr', 'asr') })), 'off')
})

test('otherwise English: the written English track first', () => {
  assert.equal(shownCode(chooseCaptions({ app: 'fr', spoken: 'de', tracks: [track('de'), track('en')] })), 'en')
})

test('a Korean video with no English: its automatic track translated into English', () => {
  const choice = chooseCaptions({ app: 'fr', spoken: 'ko', tracks: [] })
  assert.deepEqual(choice, { show: { languageCode: 'ko', kind: 'asr', vss_id: 'a.ko', translationLanguage: { languageCode: 'en' } } })
})

test("a written track in the video's own language is translated rather than the automatic one", () => {
  assert.equal(shownCode(chooseCaptions({ app: 'fr', spoken: 'ko', tracks: [track('zh'), track('ko')] })), 'ko→en')
})

test('language unknown: any written track translated into English, or nothing at all', () => {
  assert.equal(shownCode(chooseCaptions({ app: 'fr', tracks: [track('de-DE')] })), 'de-DE→en')
  assert.equal(shownCode(chooseCaptions({ app: 'fr', tracks: [] })), 'off')
})

test('the English app follows the same rule', () => {
  assert.equal(shownCode(chooseCaptions({ app: 'en', spoken: 'en', tracks: rick })), 'off')
  assert.equal(shownCode(chooseCaptions({ app: 'en', spoken: 'ko', tracks: [] })), 'ko→en')
})

test("the player's own automatic tracks in the list are never picked as written ones", () => {
  assert.equal(shownCode(chooseCaptions({ app: 'fr', spoken: 'de', tracks: [track('fr', 'asr'), track('en')] })), 'en')
})

test('the command the frame understands; an empty track turns subtitles off', () => {
  assert.deepEqual(captionCommand({ off: true }), { event: 'command', func: 'setOption', args: ['captions', 'track', {}] })
  assert.deepEqual(captionCommand({ show: track('en') }).args[2], track('en'))
})

test('the spoken language of a served video: the platform, then the wheel, then the title; two letters or nothing', () => {
  assert.equal(spokenLanguage({ declaredLang: 'kor', title: 'Rick Astley - Never Gonna Give You Up (Official Music Video)' }), 'ko')
  assert.equal(spokenLanguage({ lang: 'deu' }), 'de')
  assert.equal(spokenLanguage({ title: 'Silikonfugen: Silikon entfernen und richtig ziehen | Profi-Anleitung' }), 'de')
  assert.equal(spokenLanguage({ title: '반기문 전유엔사무총장의 영어발음과 유창성 그리고 후지카메라 이야기' }), 'ko')
  assert.equal(spokenLanguage({ lang: 'arb' }), 'ar')
  assert.equal(spokenLanguage({ title: 'short' }), undefined)
  assert.equal(spokenLanguage({ lang: 'xyz' }), undefined)
})
