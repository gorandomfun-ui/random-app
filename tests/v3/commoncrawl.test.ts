import assert from 'node:assert/strict'
import test from 'node:test'
import { gzipSync } from 'node:zlib'

import { blocksFor, countriesFrom, countryOfDay, parseClusterLine, recordsOf, rootPagesIn } from '../../lib/v3/web/commoncrawl'

const cluster = [
  'cl,zzz)/ 20260909041627\tcdx-00022.gz\t0\t100\t1',
  'cm,armp)/details 20260912042556\tcdx-00023.gz\t100\t200\t2',
  'cm,unv-ebolowa)/index.php 20260912231831\tcdx-00023.gz\t300\t250\t3',
  'cn,aaa)/ 20260913000000\tcdx-00023.gz\t550\t300\t4',
  'cn,bbb)/ 20260913000001\tcdx-00024.gz\t0\t300\t5',
]

test('a cluster line gives its block; a country takes its blocks and the one before them, where its first hosts may hide', () => {
  assert.deepEqual(parseClusterLine(cluster[1]), { surt: 'cm,armp)/details', file: 'cdx-00023.gz', offset: 100, length: 200 })
  assert.equal(parseClusterLine('garbage'), null)
  assert.deepEqual(blocksFor(cluster, 'cm').map((block) => block.offset), [0, 100, 300])
  assert.deepEqual(blocksFor(cluster, 'cn').map((block) => block.offset), [300, 550, 0])
  assert.deepEqual(blocksFor(cluster, 'cl').map((block) => block.offset), [0])
  assert.deepEqual(blocksFor(cluster, 'pe'), [])
})

const record = (url: string, status = '200', mime = 'text/html') => `cm,x)/ 20260910000000 ${JSON.stringify({ url, status, mime, 'mime-detected': mime })}`

test('a block\'s records give the live front pages of the country: one per host, https preferred, nothing else', () => {
  const lines = [
    record('http://www.douala-plomberie.cm/'),
    record('https://douala-plomberie.cm/'),
    record('https://bafoussam.cm'),
    record('https://bafoussam.cm/a-propos'),
    record('http://kribi.cm/', '301'),
    record('http://garoua.cm/', '200', 'application/pdf'),
    record('http://192.168.1.1/'),
    record('http://yaounde.cm:8080/'),
    record('http://limbe.com/'),
    record('https://ngaoundere.cm/?utm=1'),
    'not a record',
  ]
  const seen = new Map()
  const pages = rootPagesIn(lines, 'cm', seen)
  assert.deepEqual(pages.map((page) => page.host), ['douala-plomberie.cm', 'bafoussam.cm', 'ngaoundere.cm'])
  assert.equal(seen.get('douala-plomberie.cm')?.url, 'https://douala-plomberie.cm/')
  assert.deepEqual(rootPagesIn([record('https://bafoussam.cm/')], 'cm', seen), [])
  const gz = gzipSync(Buffer.from(lines.slice(0, 2).join('\n')))
  assert.equal(recordsOf(gz).length, 2)
})

test('the countries take turns, one a day', () => {
  const countries = ['cm', 'sn', 'pe']
  const day = (n: number) => new Date(n * 86_400_000 + 1000)
  assert.equal(countryOfDay(countries, day(0)), 'cm')
  assert.equal(countryOfDay(countries, day(1)), 'sn')
  assert.equal(countryOfDay(countries, day(5)), 'pe')
  assert.equal(countryOfDay(countries, day(6)), 'cm')
  assert.deepEqual(countriesFrom(countries, 2, day(5)), ['pe', 'cm'])
  assert.deepEqual(countriesFrom(countries, 9, day(1)), ['sn', 'pe', 'cm'])
  assert.deepEqual(countriesFrom([], 3, day(1)), [])
})
