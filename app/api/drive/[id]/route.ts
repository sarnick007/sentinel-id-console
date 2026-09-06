import { NextResponse } from 'next/server'
import { getToken } from '@vercel/connect'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'

const CONNECTOR_UID = 'google/officer-google-drive'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const token = await getToken(CONNECTOR_UID, { subject: { type: 'user', id: session.user.id }, scopes: ['https://www.googleapis.com/auth/drive.readonly'] })
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent((await params).id)}?alt=media`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
    if (!response.ok) return NextResponse.json({ error: 'Drive download failed.' }, { status: 502 })
    return new NextResponse(await response.arrayBuffer(), { headers: { 'Content-Type': response.headers.get('content-type') || 'application/octet-stream', 'Cache-Control': 'no-store' } })
  } catch { return NextResponse.json({ error: 'Google Drive is unavailable.' }, { status: 502 }) }
}
