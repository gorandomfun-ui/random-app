#!/usr/bin/env node

let host = process.env.HOST || ''
const key = process.env.ADMIN_INGEST_KEY || process.env.KEY || ''
const vercelBypassToken = process.env.VERCEL_BYPASS_TOKEN || ''

if (!host || !key) {
  console.error('❌ HOST et ADMIN_INGEST_KEY doivent être définis (ex: HOST="https://…" ADMIN_INGEST_KEY="…")')
  process.exit(1)
}

if (!/^https?:\/\//i.test(host)) {
  host = `https://${host}`
}

async function call(endpoint) {
  const urlObject = new URL(endpoint, host)
  const url = urlObject.toString()
  console.log(`→ ${url}`)
  const headers = { 'x-admin-ingest-key': key }
  if (vercelBypassToken) {
    headers.Cookie = `__vercel_protection_bypass=${vercelBypassToken}; x-vercel-set-bypass-cookie=true`
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
  const quoteParams = '/api/ingest/quotes?sites=toscrape,typefit,passiton,zenquotes,github-db,github-programming,github-famous&pages=30'
  const factParams = '/api/ingest/facts?n=800&sites=awesomefacts,useless,numbers,cat,meow,dog,urban'
  const jokeParams = '/api/ingest/jokes?limit=800&sources=dataset,funnyquotes,official,icanhaz,jokeapi'

  await call(quoteParams)
  await call(factParams)
  await call(jokeParams)
}

main().catch((error) => {
  console.error('Batch ingest failed:', error)
  process.exit(1)
})
