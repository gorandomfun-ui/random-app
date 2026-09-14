import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

test('private curation status renders actual counters on demand and never sends a mutation', async () => {
  const root = process.cwd(), temporary = mkdtempSync(path.join(root, '.curation-ui-test-'))
  const output = path.join(temporary, 'status.cjs'), require = createRequire(pathToFileURL(path.join(root, 'package.json')))
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://test.invalid/admin/curation/status' })
  const previous = new Map(), remember = name => { previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name)) }
  let app
  try {
    await build({ entryPoints: [path.join(root, 'app/admin/curation/status/page.tsx')], outfile: output,
      bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom', 'react/jsx-runtime'],
      plugins: [{ name: 'next-link-boundary', setup(builder) {
        builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'stub' }))
        builder.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: "import React from 'react'; export default p=>React.createElement('a',p,p.children)" }))
      } }],
    })
    for (const name of ['window', 'document', 'navigator']) { remember(name); Object.defineProperty(globalThis, name, { value: dom.window[name], configurable: true }) }
    remember('fetch')
    const requests = [], id = '123456789012345678901234'
    let inserts = 0
    globalThis.fetch = async (input, init = {}) => {
      requests.push({ url: String(input), method: init.method ?? 'GET' })
      if (!String(input).includes('?')) return Response.json({ references: [{ itemId: id, title: 'A$AP Rocky', subject: 'A$AP Rocky' }] })
      return Response.json({ active: true, itemId: id, title: 'A$AP Rocky', subject: 'A$AP Rocky', tentative: true,
        state: 'scheduled', sampledTasks: 2, measuredTasks: inserts ? 1 : 0, outdatedTasks: 1,
        taskSampleCapped: false, inserted: inserts, matched: inserts, lastAttemptAt: null, recentTasks: [] })
    }
    const Page = require(output).default
    app = createRoot(document.getElementById('root')); app.render(React.createElement(Page))
    const until = async fn => { const end = Date.now() + 3000; while (!fn()) { if (Date.now() > end) throw new Error('Status UI timeout'); await new Promise(r => setTimeout(r, 15)) } }
    await until(() => [...document.querySelectorAll('button')].some(b => b.textContent === 'A$AP Rocky'))
    assert.equal(requests.length, 1)
    const button = [...document.querySelectorAll('button')].find(b => b.textContent === 'A$AP Rocky')
    button.click()
    await until(() => document.body.textContent.includes('0 nouvelles vidéos insérées'))
    assert.ok(document.body.textContent.includes('Recherches programmées'))
    assert.ok(document.body.textContent.includes('anciennes tâches'))
    inserts = 7
    const refresh = [...document.querySelectorAll('button')].find(b => b.textContent === 'Actualiser')
    refresh.click()
    await until(() => document.body.textContent.includes('7 nouvelles vidéos insérées'))
    assert.ok(requests.every(r => r.method === 'GET'))
  } finally {
    app?.unmount(); dom.window.close()
    for (const [name, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name] }
    rmSync(temporary, { recursive: true, force: true })
  }
})

test('the status route rejects unauthenticated reads before accessing owner data', async () => {
  const root = process.cwd(), temporary = mkdtempSync(path.join(root, '.curation-route-test-'))
  const output = path.join(temporary, 'route.cjs'), require = createRequire(pathToFileURL(path.join(root, 'package.json')))
  try {
    await build({ entryPoints: [path.join(root, 'app/api/discovery/curation/status/route.ts')], outfile: output,
      bundle: true, platform: 'node', format: 'cjs', packages: 'external', tsconfig: path.join(root, 'tsconfig.json'),
      plugins: [{ name: 'db-boundary', setup(builder) {
        builder.onResolve({ filter: /^@\/lib\/db$/ }, () => ({ path: 'db', namespace: 'stub' }))
        builder.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: "export async function getDb(){throw new Error('Database must not be reached')};" }))
      } }],
    })
    const { GET } = require(output)
    for (const suffix of ['', '?itemId=123456789012345678901234']) {
      const response = await GET(new Request('https://test.invalid/api/discovery/curation/status' + suffix))
      assert.equal(response.status, 401); assert.equal(response.headers.get('Cache-Control'), 'no-store')
      assert.deepEqual(await response.json(), { error: 'Unauthorized' })
    }
  } finally { rmSync(temporary, { recursive: true, force: true }) }
})
