export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

type CheckResult = {
  name: string
  status: 'ok' | 'missing-key' | 'error'
  durationMs?: number
  detail?: string
  items?: number
}

const DEFAULT_TIMEOUT = Number(process.env.RANDOM_PROVIDER_TIMEOUT_MS || 4000)

async function fetchWithTiming(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const started = Date.now()
  try {
    const res = await fetch(url, { ...init, signal: controller.signal })
    const durationMs = Date.now() - started
    return { res, durationMs }
  } finally {
    clearTimeout(timer)
  }
}

async function checkGiphy(timeout: number): Promise<CheckResult> {
  const key = process.env.GIPHY_API_KEY
  if (!key) return { name: 'giphy', status: 'missing-key' }
  try {
    const url = `https://api.giphy.com/v1/gifs/search?api_key=${key}&q=weird&limit=3&rating=g`
    const { res, durationMs } = await fetchWithTiming(url, { cache: 'no-store' }, timeout)
    if (!res.ok) return { name: 'giphy', status: 'error', durationMs, detail: `HTTP ${res.status}` }
    const json: any = await res.json()
    const items = Array.isArray(json?.data) ? json.data.length : 0
    return { name: 'giphy', status: 'ok', durationMs, items }
  } catch (error: any) {
    return { name: 'giphy', status: 'error', detail: error?.message || 'request failed' }
  }
}

async function checkTenor(timeout: number): Promise<CheckResult> {
  const key = process.env.TENOR_API_KEY
  if (!key) return { name: 'tenor', status: 'missing-key' }
  try {
    const url = `https://tenor.googleapis.com/v2/search?key=${key}&q=weird&limit=3&media_filter=gif`
    const { res, durationMs } = await fetchWithTiming(url, { cache: 'no-store' }, timeout)
    if (!res.ok) return { name: 'tenor', status: 'error', durationMs, detail: `HTTP ${res.status}` }
    const json: any = await res.json()
    const items = Array.isArray(json?.results) ? json.results.length : 0
    return { name: 'tenor', status: 'ok', durationMs, items }
  } catch (error: any) {
    return { name: 'tenor', status: 'error', detail: error?.message || 'request failed' }
  }
}

async function checkPexels(timeout: number): Promise<CheckResult> {
  const key = process.env.PEXELS_API_KEY
  if (!key) return { name: 'pexels', status: 'missing-key' }
  try {
    const url = `https://api.pexels.com/v1/search?query=weird&per_page=3`
    const { res, durationMs } = await fetchWithTiming(url, { cache: 'no-store', headers: { Authorization: key } }, timeout)
    if (!res.ok) return { name: 'pexels', status: 'error', durationMs, detail: `HTTP ${res.status}` }
    const json: any = await res.json()
    const items = Array.isArray(json?.photos) ? json.photos.length : 0
    return { name: 'pexels', status: 'ok', durationMs, items }
  } catch (error: any) {
    return { name: 'pexels', status: 'error', detail: error?.message || 'request failed' }
  }
}

async function checkPixabay(timeout: number): Promise<CheckResult> {
  const key = process.env.PIXABAY_API_KEY
  if (!key) return { name: 'pixabay', status: 'missing-key' }
  try {
    const url = `https://pixabay.com/api/?key=${key}&q=weird&per_page=3&safesearch=true`
    const { res, durationMs } = await fetchWithTiming(url, { cache: 'no-store' }, timeout)
    if (!res.ok) return { name: 'pixabay', status: 'error', durationMs, detail: `HTTP ${res.status}` }
    const json: any = await res.json()
    const items = Array.isArray(json?.hits) ? json.hits.length : 0
    return { name: 'pixabay', status: 'ok', durationMs, items }
  } catch (error: any) {
    return { name: 'pixabay', status: 'error', detail: error?.message || 'request failed' }
  }
}

async function checkUnsplash(timeout: number): Promise<CheckResult> {
  const key = process.env.UNSPLASH_ACCESS_KEY
  if (!key) return { name: 'unsplash', status: 'missing-key' }
  try {
    const url = `https://api.unsplash.com/search/photos?client_id=${key}&query=weird&per_page=3`
    const { res, durationMs } = await fetchWithTiming(url, { cache: 'no-store' }, timeout)
    if (!res.ok) return { name: 'unsplash', status: 'error', durationMs, detail: `HTTP ${res.status}` }
    const json: any = await res.json()
    const items = Array.isArray(json?.results) ? json.results.length : 0
    return { name: 'unsplash', status: 'ok', durationMs, items }
  } catch (error: any) {
    return { name: 'unsplash', status: 'error', detail: error?.message || 'request failed' }
  }
}

async function checkYouTube(timeout: number): Promise<CheckResult> {
  const key = process.env.YOUTUBE_API_KEY
  if (!key) return { name: 'youtube', status: 'missing-key' }
  try {
    const params = new URLSearchParams({
      key,
      part: 'snippet',
      q: 'weird',
      type: 'video',
      maxResults: '3',
      videoEmbeddable: 'true',
    })
    const url = `https://www.googleapis.com/youtube/v3/search?${params.toString()}`
    const { res, durationMs } = await fetchWithTiming(url, { cache: 'no-store' }, timeout)
    if (!res.ok) return { name: 'youtube', status: 'error', durationMs, detail: `HTTP ${res.status}` }
    const json: any = await res.json()
    const items = Array.isArray(json?.items) ? json.items.length : 0
    return { name: 'youtube', status: 'ok', durationMs, items }
  } catch (error: any) {
    return { name: 'youtube', status: 'error', detail: error?.message || 'request failed' }
  }
}

async function checkMongo(): Promise<{ status: 'ok' | 'error'; detail?: string }> {
  try {
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI
    if (!uri) return { status: 'error', detail: 'MONGO_URI missing' }
    const db = await getDb(process.env.MONGODB_DB || process.env.MONGO_DB || 'randomapp')
    const count = await db.collection('items').countDocuments({})
    return { status: 'ok', detail: `items: ${count}` }
  } catch (error: any) {
    return { status: 'error', detail: error?.message || 'db error' }
  }
}

export async function GET() {
  const timeout = DEFAULT_TIMEOUT

  const [mongo, ...providerResults] = await Promise.all([
    checkMongo(),
    checkGiphy(timeout),
    checkTenor(timeout),
    checkPexels(timeout),
    checkPixabay(timeout),
    checkUnsplash(timeout),
    checkYouTube(timeout),
  ])

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    timeoutMs: timeout,
    mongo,
    providers: providerResults,
  })
}
