import { NextResponse, type NextRequest } from 'next/server'

const ALLOWED_ORIGIN = process.env.BETTER_AUTH_URL

export function proxy(request: NextRequest) {
  const response = NextResponse.next()
  const origin = request.headers.get('origin')

  if (origin && origin !== request.nextUrl.origin && origin !== ALLOWED_ORIGIN) {
    console.warn('[security] blocked cross-origin request', { path: request.nextUrl.pathname, origin })
    return new NextResponse('Forbidden', { status: 403 })
  }

  const contentLength = Number(request.headers.get('content-length') || 0)
  if (contentLength > 12 * 1024 * 1024) {
    console.warn('[security] rejected oversized request', { path: request.nextUrl.pathname, contentLength })
    return new NextResponse('Payload too large', { status: 413 })
  }

  response.headers.set('Cache-Control', 'no-store')
  return response
}

export const config = {
  matcher: ['/api/:path*', '/((?!_next/static|_next/image|favicon.ico).*)'],
}
