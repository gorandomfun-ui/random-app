import test from 'node:test'
import assert from 'node:assert/strict'

import { fitText, seedTemplates, validateTemplate, FAMILY_SIZES, type Template } from '@/lib/comm/templates'
import { iconDataUri, logoDataUri, paletteOf, resolveColor, loadFonts, LOGO_SIZES } from '@/lib/comm/brand'
import { buildSlide, rng } from '@/lib/comm/render'
import { renderSlidePng, pictureDataUri } from '@/lib/comm/png'
import { imageSizeOf } from '@/lib/comm/imageSize'

const palette = paletteOf(2)

/** A small red PNG, enough for the renderer to have a picture. */
const PNG_1x1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='

const base = (overrides: Partial<Parameters<typeof buildSlide>[0]> = {}) => ({
  template: seedTemplates()[0], palette, logo: 'white' as const, text: 'Trouvé sur Random', credit: 'Retro Busker', source: 'YouTube · youtu.be/abc',
  media: PNG_1x1, mediaSize: { width: 1, height: 1 }, mode: 'full' as const, glitch: null, seed: 'test', ...overrides,
})

test('les dix gabarits de départ sont valides, chaque famille a son cadre glitch, chacun avec crédit et source', () => {
  const seeds = seedTemplates()
  assert.equal(seeds.length, 10)
  for (const template of seeds) assert.deepEqual(validateTemplate(template), [], template.key)
  assert.deepEqual(seeds.map((t) => t.family), ['9:16', '9:16', '9:16', '4:5', '4:5', '4:5', '1:1', '1:1', '16:9', '16:9'])
  assert.equal(new Set(seeds.map((t) => t.key)).size, 10)
  const glitch = seeds.filter((t) => t.key.endsWith('-glitch'))
  assert.equal(glitch.length, 4)
  for (const t of glitch) { assert.ok(t.layers.some((l) => l.type === 'backdrop'), 'un fond fait de l’image'); assert.ok(t.layers.some((l) => l.type === 'glitch' && l.zone === 'frame' && l.intensity > 0)) }
})

test('un gabarit sans crédit ou sans source est refusé, comme une couleur hors palette', () => {
  const template = seedTemplates()[0]
  const noCredit = { ...template, layers: template.layers.filter((l) => l.type !== 'credit') }
  assert.ok(validateTemplate(noCredit).some((e) => e.includes('credit')))
  const noSource = { ...template, layers: template.layers.filter((l) => l.type !== 'source') }
  assert.ok(validateTemplate(noSource).some((e) => e.includes('source')))
  const offPalette = { ...template, layers: template.layers.map((l) => (l.type === 'band' ? { ...l, color: '#ff0000' } : l)) } as unknown as Template
  assert.ok(validateTemplate(offPalette).some((e) => e.includes('hors palette')))
  assert.ok(validateTemplate({ ...template, key: 'Bad Key' }).some((e) => e.includes('clé')))
  assert.deepEqual(validateTemplate(null), ['pas un objet'])
  assert.ok(validateTemplate({ ...template, layers: [] }).includes('aucune couche'))
})

test('un texte trop long rétrécit jusqu_au plancher, puis est coupé et signalé', () => {
  const short = fitText('Trouvé sur Random', { font: 'Tomorrow', size: 60, maxWidthPx: 950, lines: 2, uppercase: true })
  assert.equal(short.size, 60); assert.equal(short.truncated, false); assert.deepEqual(short.lines, ['TROUVÉ SUR RANDOM'])
  const longer = fitText('Une phrase un peu plus longue qui ne tient pas sur deux lignes à cette taille', { font: 'Tomorrow', size: 60, maxWidthPx: 950, lines: 2 })
  assert.ok(longer.size < 60 && longer.size >= 30, String(longer.size)); assert.equal(longer.truncated, false)
  const huge = fitText('mot '.repeat(200), { font: 'Tomorrow', size: 60, maxWidthPx: 950, lines: 2 })
  assert.equal(huge.truncated, true); assert.equal(huge.size, 30); assert.equal(huge.lines.length, 2); assert.ok(huge.lines[1].endsWith('…'))
  assert.deepEqual(fitText('   ', { font: 'InterTight', size: 30, maxWidthPx: 500, lines: 1 }).lines, [])
})

test('les couleurs viennent du thème : blanc = crème du site, noir = base profonde', () => {
  assert.equal(resolveColor('palette.accent', palette), '#E5972B')
  assert.equal(resolveColor('white', palette), '#F8F5E6'); assert.equal(resolveColor('black', palette), '#121210'); assert.equal(resolveColor('palette.bg', palette), '#191916')
  assert.equal(paletteOf(99).index, 0)
})

test('le logo se compose des lettres en SVG, en noir ou en blanc ; les icônes prennent la couleur demandée', async () => {
  const horizontal = await logoDataUri('horizontal', '#F8F5E6')
  assert.ok(horizontal?.startsWith('data:image/svg+xml;base64,'))
  const svg = Buffer.from(horizontal!.slice('data:image/svg+xml;base64,'.length), 'base64').toString('utf8')
  assert.equal((svg.match(/<path /g) ?? []).length, 6); assert.ok(svg.includes(`viewBox="0 0 ${LOGO_SIZES.horizontal.width} ${LOGO_SIZES.horizontal.height}"`)); assert.ok(svg.includes('fill="#F8F5E6"'))
  const vertical = Buffer.from((await logoDataUri('vertical', '#121210'))!.slice(26), 'base64').toString('utf8')
  assert.ok(vertical.includes(`viewBox="0 0 ${LOGO_SIZES.vertical.width} ${LOGO_SIZES.vertical.height}"`)); assert.ok(vertical.includes('fill="#121210"'))
  const icon = Buffer.from((await iconDataUri('heart', '#E5972B'))!.slice(26), 'base64').toString('utf8')
  assert.ok(icon.includes('#E5972B')); assert.ok(!icon.includes('#fefbe8'))
  assert.equal(await iconDataUri('nope', '#fff'), null)
  const fonts = await loadFonts()
  assert.deepEqual(fonts.map((f) => `${f.name}:${f.weight}`), ['Tomorrow:700', 'Tomorrow:900', 'InterTight:400', 'InterTight:700'])
})

test('l_arbre d_une slide porte le texte, le crédit, la source ; l_overlay laisse le média dehors', async () => {
  const full = await buildSlide(base())
  const html = JSON.stringify(full.element)
  assert.ok(html.includes('TROUVÉ SUR RANDOM')); assert.ok(html.includes('Retro Busker')); assert.ok(html.includes('YouTube · youtu.be/abc')); assert.ok(html.includes(PNG_1x1))
  assert.equal(full.truncated, false); assert.equal(full.width, 1080); assert.equal(full.height, 1920)
  const overlay = await buildSlide(base({ mode: 'overlay' }))
  assert.ok(!JSON.stringify(overlay.element).includes(PNG_1x1))
  const same = rng('abc'), again = rng('abc')
  assert.equal(same(), again())
})

test('chaque gabarit de départ rend un PNG aux dimensions de sa famille, logo noir comme blanc', async () => {
  for (const template of seedTemplates()) {
    for (const logo of ['black', 'white'] as const) {
      if (logo === 'black' && template.key.endsWith('-glitch')) continue
      const out = await renderSlidePng(base({ template, logo, glitch: template.key === 'carre' ? 0.6 : null }))
      const size = imageSizeOf(new Uint8Array(out.png))
      assert.deepEqual(size, FAMILY_SIZES[template.family], `${template.key} ${logo}`)
      assert.ok(out.png.byteLength > 2000)
    }
  }
})

test('une image injoignable laisse un rendu sans image, jamais une erreur', async () => {
  assert.equal(await pictureDataUri('https://127.0.0.1:9/nope.png'), null)
  assert.equal(await pictureDataUri('ftp://x'), null)
  const out = await renderSlidePng(base({ media: null, mediaSize: null }))
  assert.deepEqual(imageSizeOf(new Uint8Array(out.png)), { width: 1080, height: 1920 })
})

test('un texte très long dans un gabarit : réduit puis coupé, et le rendu le dit', async () => {
  const out = await renderSlidePng(base({ text: 'mot '.repeat(300) }))
  assert.equal(out.truncated, true); assert.ok(out.textSize <= 30)
})
