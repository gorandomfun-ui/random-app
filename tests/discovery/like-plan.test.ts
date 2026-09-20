import test from 'node:test'
import assert from 'node:assert/strict'
import { baseSteps, planLikeTurn, MAX_TURNS, type LikeSeed } from '@/lib/discovery/likePlan'
import { capPerSource, MAX_PER_CHANNEL, MAX_PER_FAMILY } from '@/lib/discovery/likeCaps'

const NOW = Date.UTC(2026, 8, 20, 12)
const seed = (words: string[], expansion?: string[]): LikeSeed => ({
  subject: { key: 'entity:pioneer-laserdisc', label: 'Pioneer DVL-V888 LaserDisc', aliases: ['pioneer dvl v888 laserdisc'], kind: 'entity', evidence: 'title' },
  words, expansion, title: 'Pioneer DVL-V888 LaserDisc / DVD Player Auto Reverse', scope: { ownerId: 'owner', referenceKey: 'youtube:abc' },
})

test('le plan va du nom à la paire puis au mot seul, sans liste d_angles', () => {
  const steps = baseSteps(seed(['pioneer', 'dvl', 'v888', 'laserdisc']), NOW)
  assert.deepEqual(steps.map(s => s.label),
    ['name:pioneer dvl v888 laserdisc', 'pair:pioneer laserdisc', 'word:pioneer', 'word:laserdisc'],
    'les fragments de code modèle ne prennent pas la place des mots')
  const name = steps[0]
  assert.equal(name.youtube.length, 2, 'le nom : le plus vu, puis le plus récent')
  assert.deepEqual(name.youtube.map(s => s.kind === 'search' ? s.order : ''), ['viewCount', 'date'])
  assert.ok(name.youtube.every(s => s.kind === 'search' && s.query === '"pioneer dvl v888 laserdisc"'), 'une entité est cherchée entre guillemets')
  assert.equal(name.dailymotion.length, 1, 'Dailymotion suit le même mécanisme')
  assert.deepEqual(name.images, ['pioneer dvl v888 laserdisc'], 'les images sont directes')
  assert.equal(steps[1].youtube[0].kind === 'search' && steps[1].youtube[0].query, 'pioneer laserdisc')
  assert.deepEqual(steps[2].images, [], 'un mot seul ne vaut pas une recherche d_images')
})

test('les tours suivants suivent les mots qui reviennent autour, puis le like est épuisé', () => {
  const s = seed(['pioneer', 'laserdisc'], ['player', 'restoration', 'repair'])
  assert.equal(planLikeTurn(s, 4, NOW)?.label, 'around:player')
  assert.equal(planLikeTurn(s, 5, NOW)?.label, 'around:restoration')
  assert.equal(planLikeTurn(s, 6, NOW), null, 'le plafond de tours tient, même avec des mots restants')
  assert.equal(planLikeTurn(seed(['a', 'b'], ['c', 'd', 'e', 'f']), MAX_TURNS, NOW), null, 'jamais plus de MAX_TURNS tours')
})

test('un mot court reste un mot, un fragment de code non', () => {
  const { searchableWords } = require('@/lib/discovery/likePlan') as typeof import('@/lib/discovery/likePlan')
  assert.deepEqual(searchableWords(['tnt', 'commercials', 'compilation', 'september', '23', '2003'], 'TNT Commercials Compilation September 23, 2003'), ['tnt', 'commercials', 'compilation', 'september'])
  assert.deepEqual(searchableWords(['black', 'car', 'red', 'tail'], 'a black car with a red tail light'), ['black', 'car', 'red', 'tail'])
})

test('une date n_est pas un sujet : le plan démarre à la paire', () => {
  const dated: LikeSeed = {
    subject: { key: 'entity:september-23', label: 'September 23', aliases: ['september 23'], kind: 'entity', evidence: 'title' },
    words: ['tnt', 'commercials', 'compilation'], title: 'TNT Commercials Compilation September 23, 2003',
    scope: { ownerId: 'owner', referenceKey: 'youtube:tnt' },
  }
  assert.deepEqual(baseSteps(dated, NOW).map(s => s.label), ['pair:tnt commercials', 'word:tnt', 'word:commercials'])
})

test('un sujet sans mots n_a que le nom', () => {
  assert.deepEqual(baseSteps(seed([]), NOW).map(s => s.label), ['name:pioneer dvl v888 laserdisc'])
})

test('chaque étape porte un focus que le worker peut vérifier', () => {
  const step = planLikeTurn(seed(['black', 'car']), 1, NOW)!
  const focus = step.youtube[0].focus!
  assert.deepEqual(focus.subject.aliases, ['black', 'car'])
  assert.equal(focus.referenceKey, 'youtube:abc')
})

test('une page ne garde que quelques vidéos par chaîne et par famille', () => {
  const same = (n: number, channelId: string, title: string) => Array.from({ length: n }, (_, i) => ({ channelId, title: `${title} ${i}` }))
  const kept = capPerSource([...same(6, 'UCa', 'AI cat video'), ...same(2, 'UCb', 'Something else entirely')])
  assert.ok(kept.filter(v => v.channelId === 'UCa').length <= MAX_PER_CHANNEL, 'au plus quelques-unes par chaîne')
  assert.equal(kept.filter(v => v.channelId === 'UCb').length, 2, 'les autres passent')
  const twins = Array.from({ length: 5 }, () => ({ channelId: `UC${Math.random()}`, title: 'Exact same repost title' }))
  assert.ok(capPerSource(twins).length <= MAX_PER_FAMILY, 'les quasi-doublons sont plafonnés même sur des chaînes différentes')
})
