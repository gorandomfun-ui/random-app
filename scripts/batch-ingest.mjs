#!/usr/bin/env node

let host = process.env.HOST || ''
const key = process.env.ADMIN_INGEST_KEY || process.env.KEY || ''
const vercelBypassToken = process.env.VERCEL_BYPASS_TOKEN || ''
const vercelBypassCookie = process.env.VERCEL_BYPASS_COOKIE || ''
const cookieJar = []

const rawArgs = process.argv.slice(2)
const argSet = new Set(rawArgs)
const explicitFlags = ['--quotes', '--facts', '--jokes', '--only-jokes', '--only-facts', '--only-quotes']
let runQuotes = true
let runFacts = true
let runJokes = true

const onlyArg = rawArgs.find((arg) => arg.startsWith('--only'))
if (onlyArg) {
  const value = onlyArg.includes('=') ? onlyArg.split('=')[1] : rawArgs[rawArgs.indexOf(onlyArg) + 1]
  const selection = (value || '').split(',').map((token) => token.trim()).filter(Boolean)
  if (selection.length) {
    runQuotes = selection.includes('quotes')
    runFacts = selection.includes('facts')
    runJokes = selection.includes('jokes')
  }
}

const hasSpecificSelection = explicitFlags.some((flag) => argSet.has(flag))
if (hasSpecificSelection) {
  runQuotes = argSet.has('--quotes') || argSet.has('--only-quotes')
  runFacts = argSet.has('--facts') || argSet.has('--only-facts')
  runJokes = argSet.has('--jokes') || argSet.has('--only-jokes')
}

if (!host || !key) {
  console.error('❌ HOST et ADMIN_INGEST_KEY doivent être définis (ex: HOST="https://…" ADMIN_INGEST_KEY="…")')
  process.exit(1)
}

if (!/^https?:\/\//i.test(host)) {
  host = `https://${host}`
}

async function ensureBypassCookie() {
  if (!vercelBypassToken) return
  if (cookieJar.length) return

  if (vercelBypassCookie) {
    cookieJar.push(vercelBypassCookie.split(';')[0])
  }
  cookieJar.push(`__vercel_protection_bypass=${vercelBypassToken}`)

  if (!vercelBypassCookie) {
    try {
      const probeUrl = new URL(host)
      probeUrl.searchParams.set('x-vercel-set-bypass-cookie', 'true')
      probeUrl.searchParams.set('x-vercel-protection-bypass', vercelBypassToken)
      const probeRes = await fetch(probeUrl.toString(), { redirect: 'manual' })
      const setCookies = probeRes.headers.getSetCookie?.() || probeRes.headers.raw?.()['set-cookie'] || []
      for (const entry of setCookies) {
        const cookie = entry.split(';')[0]
        if (cookie.toLowerCase().startsWith('vercel-bypass=')) {
          cookieJar.push(cookie)
        }
      }
    } catch (error) {
      console.warn('⚠️ Unable to auto-fetch bypass cookie:', error instanceof Error ? error.message : error)
    }
  }
}

async function call(endpoint) {
  await ensureBypassCookie()
  const urlObject = new URL(endpoint, host)
  const url = urlObject.toString()
  console.log(`→ ${url}`)
  const headers = { 'x-admin-ingest-key': key }
  if (cookieJar.length) {
    headers.Cookie = cookieJar.join('; ')
  }
  const res = await fetch(url, { headers })
  const text = await res.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    body = text
  }
  console.dir(body, { depth: null })
  if (!res.ok) {
    throw new Error(`Request failed (${res.status})`)
  }
}

async function main() {
  if (runQuotes) {
    await call('/api/ingest/quotes?sites=toscrape,typefit,passiton,zenquotes,github-db,github-programming,github-famous&pages=30')
  }

  if (runFacts) {
    const factSites = 'awesomefacts,useless,numbers,cat,meow,dog,urban'
    const chunks = [200, 200, 200, 200]
    for (const amount of chunks) {
      await call(`/api/ingest/facts?n=${amount}&sites=${factSites}`)
    }
  }

  if (runJokes) {
    await call('/api/ingest/jokes?limit=800&sources=dataset,funnyquotes,official,icanhaz,jokeapi')
  }
}

main().catch((error) => {
  console.error('Batch ingest failed:', error)
  process.exit(1)
})
