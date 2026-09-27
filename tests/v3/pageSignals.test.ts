import assert from 'node:assert/strict'
import test from 'node:test'

import { notASiteReason, pageImages, readPage } from '../../lib/v3/web/pageSignals'

test("a page's name, line and preview are read whatever the attribute order", () => {
  const html = `<html><head><title>Plomberie Ngando &amp; Fils – Douala</title>
    <meta content="Dépannage 7j/7 à Akwa" name="description">
    <meta content="/img/camion.jpg" property="og:image"></head>
    <body><script>var x = 1</script><h1>Plomberie Ngando</h1><p>Chauffe-eau, fuites, sanitaires, depuis 1998 à Douala.</p></body></html>`
  const reading = readPage(html, 'https://plomberie-ngando.cm/')
  assert.equal(reading.title, 'Plomberie Ngando & Fils – Douala')
  assert.equal(reading.description, 'Dépannage 7j/7 à Akwa')
  assert.equal(reading.ogImage, 'https://plomberie-ngando.cm/img/camion.jpg')
  assert.ok(reading.words >= 10)
  assert.equal(notASiteReason(reading, html), null)
})

test('a long og:title gives way to the site name', () => {
  const html = `<meta property="og:site_name" content="Ozark Music Hall"><meta property="og:title" content="Upcoming concerts, tickets, private events and everything else happening this season">`
  assert.equal(readPage(html, 'https://ozarkmusichall.com/').title, 'Ozark Music Hall')
})

test('a parked domain, a placeholder or an empty page is not a site; "coming soon" in the text is just news', () => {
  const parked = '<title>example.cm</title><body>This domain may be for sale. Buy this domain today.</body>'
  assert.match(String(notASiteReason(readPage(parked, 'https://example.cm/'), parked)), /^parked/)
  const soon = '<title>Coming Soon</title><body></body>'
  assert.match(String(notASiteReason(readPage(soon, 'https://x.cm/'), soon)), /^placeholder/)
  assert.equal(notASiteReason(readPage('<body></body>', 'https://x.cm/'), ''), 'empty')
  const shop = '<title>Boulangerie Soleil</title><body>Nos pains, nos gâteaux. Nouveaux croissants coming soon ! Ouvert du lundi au samedi à Yaoundé.</body>'
  assert.equal(notASiteReason(readPage(shop, 'https://soleil.cm/'), shop), null)
})

test("a page's pictures, big announced ones first, backgrounds last, without logos or trackers", () => {
  const html = `<header><img src="/img/logo.png"><img src="/icons/phone.svg"></header>
    <div class="hero" style="background-image: url('/img/atelier.jpg')"></div>
    <img data-src="https://cdn.example.cm/camion.jpg" src="data:image/gif;base64,R0lGOD">
    <img srcset="/img/equipe-400.jpg 400w, /img/equipe-1200.jpg 1200w" src="/img/equipe-400.jpg">
    <img src="https://www.facebook.com/tr?id=1">`
  // Pictures in <img> first (announced big ones ahead), then backgrounds.
  assert.deepEqual(pageImages(html, 'https://plomberie-ngando.cm/'), [
    'https://plomberie-ngando.cm/img/equipe-1200.jpg',
    'https://cdn.example.cm/camion.jpg',
    'https://plomberie-ngando.cm/img/equipe-400.jpg',
    'https://plomberie-ngando.cm/img/atelier.jpg',
  ])
})
