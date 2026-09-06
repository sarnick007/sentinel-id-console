import { gateway, generateObject } from 'ai'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'

export const runtime = 'nodejs'

const maxBytes = 10 * 1024 * 1024
const verdictSchema = z.object({
  verdict: z.enum(['GENUINE', 'LIKELY_FAKE', 'MANUAL_REVIEW']),
  confidence: z.number().int().min(0).max(100),
  summary: z.string().max(500),
  ocrFields: z.array(z.object({ field: z.string().max(80), value: z.string().max(180), status: z.enum(['present', 'missing', 'inconsistent']) })).max(20),
  aiFindings: z.array(z.string().max(220)).max(8),
})

const rules: Record<string, string[]> = {
  passport: ['Compare MRZ with visible name, nationality, date of birth, document number, and expiry.', 'Check MRZ character structure and check digits.', 'Look for portrait/VIZ mismatch, altered typography, image seams, and inconsistent dates.'],
  aadhaar: ['Look for a verifiable secure QR payload; a visible QR alone is not proof of authenticity.', 'Compare name, date of birth/year, gender, and number formatting across fields.', 'Treat screenshots, cropped cards, missing issuer context, or altered layout as review signals.'],
  'pan-card': ['Validate PAN structure: five letters, four digits, and one letter.', 'Compare name and date fields for alignment and consistency.', 'Treat missing issuer context, altered portrait, or print-layer anomalies as review signals.'],
  'voter-id': ['Validate EPIC-style identifier structure and issuer/state context where visible.', 'Compare name, relation field, date/age, and portrait for consistency.', 'Treat layout, font, image seam, and issuer inconsistencies as review signals.'],
  'driving-license': ['Compare licence number, issuing state/RTO, name, dates, and category fields.', 'Check issue/expiry chronology and consistent date formatting.', 'Treat altered photo, number typography, laminate seams, or missing security context as review signals.'],
  'national-id': ['Compare identity number, issuer, name, date, and portrait fields.', 'Check machine-readable or digitally signed evidence when present.', 'Treat screenshots and missing issuer/security context as insufficient evidence.'],
  'residence-permit': ['Compare permit number, issuer, holder, portrait, and validity dates.', 'Check chronological consistency and machine-readable fields.', 'Treat altered photo, layout, and security-feature anomalies as review signals.'],
  other: ['Extract visible identity fields and compare repeated values.', 'Check document layout, typography, portrait, dates, and issuer context.', 'Never mark unsupported formats genuine without authoritative verification.'],
}

function deterministicFindings(documentType: string, text: string) {
  const normalized = text.toUpperCase()
  const failed: string[] = []
  if (text.length < 24) failed.push('OCR evidence is too sparse for a reliable authenticity decision.')
  if (/SCREENSHOT|SAMPLE|SPECIMEN|DEMO/.test(normalized)) failed.push('Document appears to contain sample or screenshot markers.')
  if (documentType === 'pan-card' && !/[A-Z]{5}[0-9]{4}[A-Z]/.test(normalized)) failed.push('PAN structure was not detected in OCR text.')
  if (documentType === 'passport' && !/[A-Z0-9<]{20,}/.test(normalized)) failed.push('Passport MRZ-like text was not detected in OCR text.')
  return failed
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const form = await request.formData()
  const file = form.get('file')
  const documentType = String(form.get('documentType') || 'other')
  if (!(file instanceof File) || file.size === 0 || file.size > maxBytes) return NextResponse.json({ error: 'Invalid file' }, { status: 400 })
  const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
  if (!allowed.has(file.type)) return NextResponse.json({ error: 'Unsupported file type' }, { status: 415 })

  const bytes = Buffer.from(await file.arrayBuffer())
  try {
    const { object } = await generateObject({
      model: gateway('google/gemini-2.5-flash'),
      schema: verdictSchema,
      temperature: 0,
      system: 'You are a conservative document-forensics assistant. Analyze only visible evidence. Do not claim a document is genuine from appearance alone. A missing secure QR/MRZ/digital signature or insufficient OCR must produce MANUAL_REVIEW, never GENUINE. Do not expose sensitive data beyond short OCR field values.',
      messages: [{ role: 'user', content: [{ type: 'text', text: `Analyze this ${documentType} using OCR extraction and visual tamper analysis. Apply these checks: ${rules[documentType] || rules.other}. Return a confidence percentage, verdict, concise findings, and extracted fields. This is an aid for a trained officer, not an authoritative government verification.` }, { type: 'file', data: bytes, mediaType: file.type }] }],
    })
    const failed = deterministicFindings(documentType, object.ocrFields.map((field) => `${field.field}: ${field.value}`).join(' '))
    const safeObject = failed.length && object.verdict === 'GENUINE' ? { ...object, verdict: 'MANUAL_REVIEW' as const, confidence: Math.min(object.confidence, 68), summary: 'Insufficient or conflicting evidence; secondary inspection is required.' } : object
    return NextResponse.json({ ...safeObject, failedChecks: failed, rulesApplied: rules[documentType] || rules.other, provider: 'Vercel AI Gateway', model: 'google/gemini-2.5-flash' })
  } catch {
    return NextResponse.json({ verdict: 'MANUAL_REVIEW', confidence: 0, summary: 'Automated analysis was unavailable. Do not treat this document as genuine without secondary verification.', ocrFields: [], aiFindings: [], failedChecks: ['OCR or AI analysis unavailable.'], rulesApplied: rules[documentType] || rules.other, provider: 'fallback', model: 'unavailable' })
  }
}
