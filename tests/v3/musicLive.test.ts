import assert from 'node:assert/strict'
import test from 'node:test'

import { isMusicResult, liveQueriesForDay } from '../../lib/v3/music/live'

const DAY = new Date('2026-09-27T11:40:00Z')

test('a day asks the same live music queries all day, other ones the next day', () => {
  const counts = { dailymotion: 16, youtubeLive: 7, youtubeClips: 3 }
  const today = liveQueriesForDay(DAY, counts)
  assert.deepEqual(liveQueriesForDay(new Date('2026-09-27T20:00:00Z'), counts), today)
  const tomorrow = liveQueriesForDay(new Date('2026-09-28T11:40:00Z'), counts)
  assert.notDeepEqual(tomorrow.dailymotion, today.dailymotion)
  assert.equal(today.dailymotion.length, 16)
  assert.equal(today.youtube.filter((search) => search.kind === 'live').length, 7)
  assert.equal(today.youtube.filter((search) => search.kind === 'clip').length, 3)
  assert.equal(new Set(today.dailymotion).size, 16, 'no query twice')
})

test('the queries read like concerts and clips, never like a stream or a playlist', () => {
  const seen = new Set<string>()
  for (let offset = 0; offset < 30; offset += 1) {
    const plan = liveQueriesForDay(new Date(DAY.getTime() + offset * 86_400_000), { dailymotion: 16, youtubeLive: 7, youtubeClips: 3 })
    for (const query of [...plan.dailymotion, ...plan.youtube.map((search) => search.query)]) {
      assert.ok(!/stream|playlist|lyrics|karaoke|full album/i.test(query), query)
      seen.add(query)
    }
    for (const clip of plan.youtube.filter((search) => search.kind === 'clip')) assert.match(clip.query, /2026/)
  }
  assert.ok(seen.size > 600, `${seen.size} different queries in a month`)
})

test('a live music result is kept only if it is music: the place alone brings its news', () => {
  // What the first run brought on 27 September.
  const keep: Array<[string, string]> = [
    ['Horo', 'horo live'],
    ['Cumbia Ya!: Borrachera Argentina Tour 2004', 'cumbia argentina'],
    ['incredible string band " When You Find Out"', 'string band papouasie'],
    ['Isa Pini Paro Horo Live Ko Studio 2013', 'horo mariage bulgarie'],
    ['Fado TV no Coimbra do Choupal', 'fado boda coimbra'],
    ['Arriba Misiones en vivo', 'chamamé ao vivo misiones'],
    ['Femua à Abidjan : la rumba congolaise à l\'honneur', 'rumba congolaise kinshasa'],
    ['Colourful Music of Rajasthan _ Best Rajasthani Folk Songs 2016', 'rajasthani folk village rajasthan'],
    ['Nuevo videoclip oficial 2026', 'videoclip oficial 2026 paraguay'],
  ]
  const drop: Array<[string, string]> = [
    ['Presidente cubano encabeza multitudinaria marcha propalestinos en La Habana', 'son cubano la habana'],
    ['La COP17 en Mongolie s\'achève avec 1,3 milliard de dollars', 'khoomei mongolie'],
    ['INKBIRD Smart Thermometer Test on Spatchcock Chicken: Wireless BBQ Review', 'cajun lafayette'],
    ['FILM HOROR TERBARU 2024 MAMA', 'horo live'],
    ['Papouasie', 'string band papouasie'],
    ['Agenda des Sorties du 11 au 13 septembre 2026', 'éthio-jazz fête de village ethiopie'],
  ]
  assert.deepEqual(keep.filter(([title, query]) => !isMusicResult(title, query)), [])
  assert.deepEqual(drop.filter(([title, query]) => isMusicResult(title, query)), [])
})
