import test from 'node:test'
import assert from 'node:assert/strict'

import { APP_SHARE, appCardUrl, appHandoverUrl, appQrUrl, appShareLinks, appShareUrl, platformOf, storyDestinationOf } from '@/lib/share/app'
import type { ShareLocale } from '@/lib/share/presentation'

const LOCALES: ShareLocale[] = ['en', 'fr', 'de', 'es', 'jp']

test('chaque langue a son invitation, courte, et ses mots', () => {
  for (const locale of LOCALES) {
    const words = APP_SHARE[locale]
    assert.ok(words.slogan.length > 10 && words.slogan.length <= 60, `${locale} : ${words.slogan}`)
    for (const key of ['messages', 'saveImage', 'copyText', 'copied', 'storyFromPhone', 'scanToShare', 'tapToPost', 'back', 'image', 'animatedVideo', 'preparing', 'shareVideo', 'saveVideo'] as const) assert.ok(words[key], `${locale}.${key}`)
  }
})

test('le lien partagé est la home dans la langue du partageur ; la carte porte langue, format et thème', () => {
  assert.equal(appShareUrl('https://gorandom.fun/', 'fr'), 'https://gorandom.fun/?lang=fr')
  assert.equal(appCardUrl('https://gorandom.fun', 'jp', 'story', 3), 'https://gorandom.fun/api/share/app?lang=jp&format=story&theme=3')
  assert.equal(appCardUrl('https://gorandom.fun', 'en', 'og'), 'https://gorandom.fun/api/share/app?lang=en&format=og')
})

test('X et WhatsApp reçoivent l_invitation et le lien ; Messages prend la forme du téléphone', () => {
  const other = appShareLinks('https://gorandom.fun', 'en', 'other')
  assert.ok(other.x.startsWith('https://twitter.com/intent/tweet?text=Come%20explore.'), other.x)
  assert.ok(other.x.endsWith('&url=https%3A%2F%2Fgorandom.fun%2F%3Flang%3Den'))
  assert.ok(other.whatsapp.includes('Only%20random%20discovery.%20https%3A%2F%2Fgorandom.fun'))
  assert.ok(other.messages.startsWith('sms:?body=Come%20explore.'), 'Android : sms:?body=')
  const ios = appShareLinks('https://gorandom.fun', 'en', 'ios')
  assert.ok(ios.messages.startsWith('sms:&body=Come%20explore.'), 'iOS : sms:&body=')
  assert.equal(platformOf('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'), 'ios')
  assert.equal(platformOf('Mozilla/5.0 (Linux; Android 14)'), 'other')
  assert.equal(platformOf(null), 'other')
})

test('l_invitation japonaise voyage encodée, jamais tronquée', () => {
  const links = appShareLinks('https://gorandom.fun', 'jp', 'ios', 0)
  assert.equal(decodeURIComponent(links.whatsapp.split('text=')[1]), `${APP_SHARE.jp.slogan} https://gorandom.fun/?lang=jp`)
  assert.equal(links.card.story, 'https://gorandom.fun/api/share/app?lang=jp&format=story&theme=0')
})

test('depuis un ordinateur, le QR code tend au téléphone la home avec le panneau ouvert sur la story', () => {
  const handover = appHandoverUrl('https://gorandom.fun', 'fr', 'instagram')
  assert.equal(handover, 'https://gorandom.fun/?lang=fr&share=instagram')
  assert.equal(appQrUrl('https://gorandom.fun', handover), 'https://gorandom.fun/api/share/qr?to=https%3A%2F%2Fgorandom.fun%2F%3Flang%3Dfr%26share%3Dinstagram')
  assert.equal(storyDestinationOf('tiktok'), 'tiktok')
  assert.equal(storyDestinationOf('facebook'), null)
  assert.equal(storyDestinationOf(null), null)
})
