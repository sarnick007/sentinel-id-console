import { Pool } from 'pg'
import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

export async function GET() {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const result = await pool.query('select id, "jobId", action, detail, "createdAt" from audit_event where "userId" = $1 order by "createdAt" desc limit 200', [session.user.id])
    return NextResponse.json(result.rows)
  } catch {
    return NextResponse.json({ error: 'Unable to load audit history' }, { status: 500 })
  }
}
