import { NextResponse } from 'next/server'
import { getToken, startAuthorization, UserAuthorizationRequiredError } from '@vercel/connect'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'

const CONNECTOR_UID = 'google/officer-google-drive'
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly'

async function getUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Unauthorized')
  return session.user
}

async function getOrigin() {
  if (process.env.NODE_ENV !== 'production' && process.env.V0_RUNTIME_URL) return process.env.V0_RUNTIME_URL
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  const requestHeaders = await headers()
  return `${requestHeaders.get('x-forwarded-proto') ?? 'https'}://${requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host')}`
}

export async function GET() {
  try {
    const user = await getUser()
    const subject = { type: 'user' as const, id: user.id }
    let token: string
    try {
      token = await getToken(CONNECTOR_UID, { subject, scopes: [DRIVE_SCOPE] })
    } catch (error) {
      if (!(error instanceof UserAuthorizationRequiredError)) throw error
      const authorization = await startAuthorization(CONNECTOR_UID, { subject, scopes: [DRIVE_SCOPE] }, { callbackUrl: `${await getOrigin()}/api/drive/callback` })
      return NextResponse.json({ authorizationUrl: authorization.url }, { status: 401 })
    }

    const params = new URLSearchParams({
      q: "trashed = false and (mimeType = 'application/pdf' or mimeType contains 'image/')",
      pageSize: '30',
      orderBy: 'modifiedTime desc',
      spaces: 'drive',
      corpora: 'user',
      fields: 'files(id,name,mimeType,size,modifiedTime)',
    })
    const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, cache: 'no-store' })
    if (!response.ok) {
      const detail = await response.text()
      console.error('[v0] Google Drive files.list failed:', response.status, detail)
      let message = 'Google Drive could not be read.'
      try {
        const payload = JSON.parse(detail) as { error?: { message?: string } }
        if (payload.error?.message) message = `Google Drive: ${payload.error.message}`
      } catch { /* Keep a safe generic message when Google returns non-JSON. */ }
      return NextResponse.json({ error: message }, { status: 502 })
    }
    return NextResponse.json(await response.json())
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error && error.message === 'Unauthorized' ? 'Unauthorized' : 'Google Drive is unavailable.' }, { status: error instanceof Error && error.message === 'Unauthorized' ? 401 : 502 })
  }
}
