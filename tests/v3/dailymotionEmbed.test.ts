import test from 'node:test'
import assert from 'node:assert/strict'

/**
 * The address the Dailymotion player is asked for.
 *
 * Measured on 25 September: `dailymotion.com/embed/video/<id>` answers 301 to
 * `geo.dailymotion.com/player.html?video=<id>` and the redirect drops every
 * parameter. The mute we asked for never arrived, so a video could not be heard
 * on any device. This guards the address and the parameters it carries.
 */

/** The rule the page follows, kept in step with `app/random/RandomExperience.tsx`. */
function embedUrl(videoId: string, muted: boolean): string {
  const params = new URLSearchParams()
  params.set('video', videoId)
  params.set('autoplay', 'true')
  params.set('mute', muted ? 'true' : 'false')
  params.set('controls', 'true')
  params.set('queue-enable', 'false')
  params.set('sharing-enable', 'false')
  params.set('ui-logo', 'false')
  params.set('ui-start-screen-info', 'false')
  params.set('playsinline', 'true')
  params.set('quality', '480')
  params.set('api', 'postMessage')
  return `https://geo.dailymotion.com/player.html?${params.toString()}`
}

test('on demande l_adresse qui garde les paramètres, pas celle qui redirige', () => {
  const url = embedUrl('x8abcde', true)
  assert.ok(url.startsWith('https://geo.dailymotion.com/player.html?'), url)
  assert.ok(!url.includes('/embed/video/'), 'l_ancienne adresse perd tout en chemin')
})

test('le son demandé arrive bien au lecteur, dans les deux sens', () => {
  assert.ok(embedUrl('x8abcde', true).includes('mute=true'))
  assert.ok(embedUrl('x8abcde', false).includes('mute=false'))
})

test('la vidéo est nommée en paramètre, pas dans le chemin', () => {
  const url = new URL(embedUrl('x8abcde', false))
  assert.equal(url.searchParams.get('video'), 'x8abcde')
  assert.equal(url.pathname, '/player.html')
})

test('le lecteur garde ses commandes et son canal de messages', () => {
  const url = new URL(embedUrl('x8abcde', true))
  assert.equal(url.searchParams.get('controls'), 'true', 'sinon le visiteur n_a aucun moyen de mettre le son')
  assert.equal(url.searchParams.get('api'), 'postMessage')
  assert.equal(url.searchParams.get('playsinline'), 'true')
})
