import { NextRequest } from 'next/server'
import { GET as videosGET } from '@/app/api/ingest/videos/route'
import { GET as imagesGET } from '@/app/api/ingest/images/route'
import { GET as webGET } from '@/app/api/ingest/web/route'
import { GET as quotesGET } from '@/app/api/ingest/quotes/route'

type TestResult = { name: string; status: number; body: unknown }

async function main() {
  const key = (process.env.ADMIN_INGEST_KEY || 'RANDOMAPPADMINKEY2024').trim()
  process.env.ADMIN_INGEST_KEY = key
  process.env.YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || 'dummy'
  process.env.GOOGLE_CSE_KEY = process.env.GOOGLE_CSE_KEY || 'dummy'
  process.env.GOOGLE_CSE_CX = process.env.GOOGLE_CSE_CX || 'dummy'
  process.env.GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || 'dummy'

  const originalFetch = global.fetch
  global.fetch = async (...fetchArgs: Parameters<typeof fetch>): Promise<Response> => {
    try {
      void fetchArgs
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
    } catch (error) {
      console.error('Mock fetch failed', error)
      throw error
    }
  }

  const headers = new Headers({ 'x-admin-ingest-key': key })

  async function runVideos(): Promise<TestResult> {
    const url = new URL('http://localhost/api/ingest/videos')
    url.searchParams.set('mode', 'search')
    url.searchParams.set('per', '1')
    url.searchParams.set('pages', '1')
    url.searchParams.set('dry', '1')
    url.searchParams.set('count', '3')
    const req = new NextRequest(url.toString(), { headers })
    const res = await videosGET(req)
    const body = await res.json()
    return { name: 'videos', status: res.status, body }
  }

  async function runImages(): Promise<TestResult> {
    const url = new URL('http://localhost/api/ingest/images')
    url.searchParams.set('dry', '1')
    url.searchParams.set('per', '5')
    const req = new Request(url.toString(), { headers })
    const res = await imagesGET(req)
    const body = await res.json()
    return { name: 'images', status: res.status, body }
  }

  async function runWeb(): Promise<TestResult> {
    const url = new URL('http://localhost/api/ingest/web')
    url.searchParams.set('dry', '1')
    url.searchParams.set('per', '2')
    url.searchParams.set('pages', '1')
    const req = new NextRequest(url.toString(), { headers })
    const res = await webGET(req)
    const body = await res.json()
    return { name: 'web', status: res.status, body }
  }

  async function runQuotes(): Promise<TestResult> {
    const url = new URL('http://localhost/api/ingest/quotes')
    url.searchParams.set('pages', '1')
    const req = new NextRequest(url.toString(), { headers })
    const res = await quotesGET(req)
    const body = await res.json()
    return { name: 'quotes', status: res.status, body }
  }

  const results = await Promise.allSettled([
    runVideos(),
    runImages(),
    runWeb(),
    runQuotes(),
  ])

  results.forEach((result) => {
    if (result.status === 'fulfilled') {
      console.log(`\n[${result.value.name}] status=${result.value.status}`)
      console.dir(result.value.body, { depth: null })
    } else {
      console.error('\n[error]', result.reason)
    }
  })

  global.fetch = originalFetch
}

main().catch((error) => {
  console.error('Test run failed', error)
  process.exitCode = 1
})
