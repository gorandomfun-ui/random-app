import test from 'node:test'
import assert from 'node:assert/strict'

import { luminance, parseColor, readTone, stylesheetUrls, toneFromCss, toneFromHtml, toneOf } from '@/lib/v3/web/tone'

test('couleurs : hex, rgb, noms ; rien pour un dégradé ou du transparent', () => {
  assert.deepEqual(parseColor('#fff'), { r: 255, g: 255, b: 255 })
  assert.deepEqual(parseColor('#121212'), { r: 18, g: 18, b: 18 })
  assert.deepEqual(parseColor('rgb(10, 20, 30)'), { r: 10, g: 20, b: 30 })
  assert.equal(parseColor('rgba(0,0,0,0.2)'), null, 'presque transparent : on ne sait pas')
  assert.equal(parseColor('linear-gradient(#000, #fff)'), null)
  assert.equal(parseColor('transparent'), null)
  assert.equal(parseColor('var(--bg)'), null)
  assert.equal(toneOf(parseColor('white')!), 'light')
  assert.equal(toneOf(parseColor('#1a1a1a')!), 'dark')
  assert.ok(luminance({ r: 128, g: 128, b: 128 }) < 0.4, 'un gris moyen est sombre pour un logo crème')
})

test('la page dit son fond : style du body, bgcolor, bloc de style, color-scheme, dans cet ordre', () => {
  assert.deepEqual(toneFromHtml('<html><body style="margin:0;background:#000 url(x.png)">'), { tone: 'dark', evidence: 'body style background' })
  assert.equal(toneFromHtml('<html><body bgcolor="#FFFFFF">').tone, 'light')
  assert.deepEqual(toneFromHtml('<html><head><style>h1{color:red} body { background-color: #f7f7f7; }</style></head><body>').tone, 'light')
  assert.equal(toneFromHtml('<html><head><style>html,body{background:#111}</style><meta name="theme-color" content="#ffffff"></head>').tone, 'dark', 'le bloc de style prime sur theme-color')
  assert.equal(toneFromHtml('<meta name="color-scheme" content="dark">').tone, 'dark')
  assert.equal(toneFromHtml('<meta name="color-scheme" content="light dark">').tone, null, 'les deux : on ne sait pas')
  assert.equal(toneFromHtml('<meta name="theme-color" content="#0d3df0">').tone, null, 'theme-color est une couleur de marque, pas un fond')
  assert.equal(toneFromHtml('<html><body><p>rien</p></body></html>').tone, null)
})

test('une feuille de style : la première règle body ou html qui donne un fond', () => {
  assert.equal(toneFromCss('/* c */ .x{background:#000} body{color:#333;background:#fff}').tone, 'light')
  assert.equal(toneFromCss('body{background:url(a.png) no-repeat #202020}').tone, 'dark', 'la couleur dans un raccourci')
  assert.equal(toneFromCss('body{background:var(--bg)}').tone, null)
  assert.deepEqual(stylesheetUrls('<link rel="stylesheet" href="/a.css"><link href="b.css" rel="preload stylesheet"><link rel="icon" href="i.png">', 'https://x.org/p/'), ['https://x.org/a.css', 'https://x.org/p/b.css'])
  assert.equal(stylesheetUrls('<link rel=stylesheet href=1.css><link rel=stylesheet href=2.css><link rel=stylesheet href=3.css><link rel=stylesheet href=4.css><link rel=stylesheet href=5.css>', 'https://x.org/').length, 4, 'quatre feuilles au plus')
})

test('lecture d_un site : la page, puis ses feuilles de style', async () => {
  const pages: Record<string, string> = {
    'https://site.test/': '<html><head><link rel="stylesheet" href="/s.css"></head><body><p>hi</p></body></html>',
    'https://site.test/s.css': 'body{background:#0b0b0b}',
  }
  const request = (async (input: string | URL | Request) => new Response(pages[String(input)] ?? '', { status: pages[String(input)] ? 200 : 404 })) as typeof fetch
  const reading = await readTone('https://site.test/', { request })
  assert.equal(reading.tone, null, 'un body noir dans une feuille de style ne prouve pas un site sombre')
  pages['https://site.test/s.css'] = 'body{background:#fff}'
  const light = await readTone('https://site.test/', { request })
  assert.equal(light.tone, 'light')
  assert.ok(light.evidence?.startsWith('stylesheet:'))
  assert.equal((await readTone('https://site.test/none', { request })).tone, null)
})
