import { NextResponse, type NextRequest } from 'next/server'

const LOCAL_ONLY_STATIC_PATHS = new Set([
  '/local-ingest.html',
  '/erase-obsolete-images.html',
  '/erase-obsolete-videos.html',
])

function isLocalHost(hostname: string): boolean {
  const value = hostname.toLowerCase()
  return (
    value === 'localhost' ||
    value === '127.0.0.1' ||
    value === '0.0.0.0' ||
    value === '::1' ||
    value === '[::1]' ||
    value.endsWith('.localhost')
  )
}

function normalizeHostHeader(value: string): string {
  const first = value.split(',')[0]?.trim().toLowerCase() || ''
  if (!first) return ''
  if (first.startsWith('[')) {
    const closeBracket = first.indexOf(']')
    return closeBracket >= 0 ? first.slice(0, closeBracket + 1) : first
  }
  return first.split(':')[0] || first
}

function requestHostname(request: NextRequest): string {
  const forwardedHost = request.headers.get('x-forwarded-host')
  const host = request.headers.get('host')
  return normalizeHostHeader(forwardedHost || host || request.nextUrl.hostname)
}

function isLocalOnlyPath(pathname: string): boolean {
  if (LOCAL_ONLY_STATIC_PATHS.has(pathname)) return true
  if (!pathname.startsWith('/admin')) return false
  return pathname !== '/admin/ingest-reports' && !pathname.startsWith('/admin/ingest-reports/')
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const hostname = requestHostname(request)

  if (isLocalOnlyPath(pathname) && !isLocalHost(hostname)) {
    return new NextResponse('Not found', { status: 404 })
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/local-ingest.html',
    '/erase-obsolete-images.html',
    '/erase-obsolete-videos.html',
  ],
}
