import { NextResponse, type NextRequest } from 'next/server'

const normalizeOrigin = (value?: string) => {
  if (!value) return undefined
  try { return new URL(value).origin } catch { return undefined }
}

const allowedOrigins = new Set([
  normalizeOrigin(process.env.BETTER_AUTH_URL),
  normalizeOrigin(process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`),
  normalizeOrigin(process.env.V0_RUNTIME_URL),
  normalizeOrigin(process.env.V0_DEV_APP_URL),
  normalizeOrigin(process.env.V0_BUILD_URL),
  normalizeOrigin(process.env.V0_SANDBOX_URL),
].filter((origin): origin is string => Boolean(origin)))

export function proxy(request: NextRequest) {
  const response = NextResponse.next()
  const origin = normalizeOrigin(request.headers.get('origin') || undefined)
  const sameOrigin = origin === request.nextUrl.origin

  if (origin && !sameOrigin && !allowedOrigins.has(origin)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: { 'Cache-Control': 'no-store' } })
  }

  const contentLength = Number(request.headers.get('content-length') || 0)
  if (contentLength > 12 * 1024 * 1024) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413, headers: { 'Cache-Control': 'no-store' } })
  }

  response.headers.set('Cache-Control', 'no-store')
  return response
}

export const config = {
  matcher: ['/api/:path*', '/((?!_next/static|_next/image|favicon.ico).*)'],
}
