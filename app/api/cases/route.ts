import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) throw new Error('Unauthorized')
  return session.user.id
}

export async function GET() {
  try {
    const userId = await getUserId()
    const result = await pool.query('select id, "fileName", "fileType", status, score, verdict, "createdAt", "updatedAt" from document_job where "userId" = $1 order by "updatedAt" desc limit 100', [userId])
    return NextResponse.json(result.rows)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error && error.message === 'Unauthorized' ? 'Unauthorized' : 'Unable to load cases' }, { status: error instanceof Error && error.message === 'Unauthorized' ? 401 : 500 })
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getUserId()
    const body = await request.json()
    const fileName = typeof body.fileName === 'string' ? body.fileName.slice(0, 160) : 'document'
    const fileType = typeof body.fileType === 'string' ? body.fileType.slice(0, 80) : 'unknown'
    const score = Number.isInteger(body.score) ? Math.max(0, Math.min(100, body.score)) : null
    const verdict = typeof body.verdict === 'string' ? body.verdict.slice(0, 40) : null
    const id = randomUUID()
    await pool.query('insert into document_job (id, "userId", "fileName", "fileType", status, score, verdict, "createdAt", "updatedAt") values ($1, $2, $3, $4, $5, $6, $7, now(), now())', [id, userId, fileName, fileType, 'REVIEW', score, verdict])
    await pool.query('insert into audit_event (id, "userId", "jobId", action, detail) values ($1, $2, $3, $4, $5)', [randomUUID(), userId, id, 'CASE_CREATED', `Screening case created for ${fileType}`])
    return NextResponse.json({ id }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error && error.message === 'Unauthorized' ? 'Unauthorized' : 'Unable to create case' }, { status: error instanceof Error && error.message === 'Unauthorized' ? 401 : 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const userId = await getUserId()
    const body = await request.json()
    const id = typeof body.id === 'string' ? body.id : ''
    const status = ['REVIEW', 'ASSIGNED', 'RESOLVED'].includes(body.status) ? body.status : null
    if (!id || !status) return NextResponse.json({ error: 'Invalid case update' }, { status: 400 })
    const result = await pool.query('update document_job set status = $1, "updatedAt" = now() where id = $2 and "userId" = $3 returning id', [status, id, userId])
    if (!result.rowCount) return NextResponse.json({ error: 'Case not found' }, { status: 404 })
    await pool.query('insert into audit_event (id, "userId", "jobId", action, detail) values ($1, $2, $3, $4, $5)', [randomUUID(), userId, id, 'CASE_STATUS_CHANGED', `Case status changed to ${status}`])
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Unable to update case' }, { status: 500 })
  }
}
