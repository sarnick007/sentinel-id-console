import { gateway, generateObject } from 'ai'
import { createHash } from 'node:crypto'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createWorker } from 'tesseract.js'
import { auth } from '@/lib/auth'

export const runtime = 'nodejs'
export const maxDuration = 120

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
  if (/SCREENSHOT|SAMPLE|SPECIMEN|DEMO|EDITED|PHOTOSHOP/.test(normalized)) failed.push('Document contains sample, screenshot, or editing markers.')
  if (documentType === 'pan-card' && !/[A-Z]{5}[0-9]{4}[A-Z]/.test(normalized)) failed.push('PAN structure was not detected in OCR text.')
  if (documentType === 'passport' && !/[A-Z0-9<]{20,}/.test(normalized)) failed.push('Passport MRZ-like text was not detected in OCR text.')
  if (documentType === 'aadhaar' && !/(AADHAAR|UIDAI|आधार|UNIQUE IDENTIFICATION)/.test(normalized)) failed.push('Aadhaar/UIDAI issuer evidence was not detected in OCR text.')
  if (documentType === 'driving-license' && !/(DRIVING|LICENCE|LICENSE|DL)/.test(normalized)) failed.push('Driving-licence issuer evidence was not detected in OCR text.')
  if (documentType === 'voter-id' && !/(ELECTION|EPIC|VOTER|निर्वाचन)/.test(normalized)) failed.push('Voter/EPIC issuer evidence was not detected in OCR text.')
  return failed
}

async function runLocalOcr(file: File) {
  if (!file.type.startsWith('image/')) return ''
  const worker = await createWorker('eng', 1, { logger: () => undefined })
  try {
    const result = await worker.recognize(Buffer.from(await file.arrayBuffer()))
    return result.data.text.replace(/\s+/g, ' ').trim().slice(0, 4000)
  } finally {
    await worker.terminate()
  }
}

function localFallback(documentType: string, ocrText: string, failed: string[], documentHash: string) {
  const normalized = ocrText.toUpperCase()
  const fields = ocrText ? [{ field: 'OCR text', value: ocrText.slice(0, 180), status: 'present' as const }] : []
  const hasIssuer = documentType === 'aadhaar' && /(AADHAAR|UIDAI|आधार|UNIQUE IDENTIFICATION)/i.test(normalized)
  const confidence = Math.min(58, Math.max(18, ocrText.length > 80 ? 48 : 24))
  return { verdict: 'MANUAL_REVIEW' as const, confidence, summary: hasIssuer ? 'Local OCR extracted document evidence, but authenticity requires secure QR/issuer verification.' : 'Local OCR extracted limited evidence; complete issuer or secondary verification before accepting this document.', ocrFields: fields, aiFindings: ['Local OCR fallback used because AI analysis was unavailable.'], failedChecks: failed.length ? failed : ['AI visual/tamper analysis unavailable; authenticity not established.'], rulesApplied: rules[documentType] || rules.other, provider: 'local OCR fallback', model: 'tesseract.js', documentHash: `${documentHash.slice(0, 12)}…` }
}

function applyStrictGate(documentType: string, object: z.infer<typeof verdictSchema>, failed: string[]) {
  const presentFields = object.ocrFields.filter((field) => field.status === 'present').length
  const hasReliableOcr = presentFields >= 2
  const hasConflict = object.ocrFields.some((field) => field.status === 'missing' || field.status === 'inconsistent')
  const requiresAuthorityEvidence = ['aadhaar', 'passport', 'national-id', 'residence-permit'].includes(documentType)
  const hasAuthorityEvidence = object.aiFindings.some((finding) => /(QR|MRZ|signature|digitally signed|machine-readable|issuer)/i.test(finding))
  const evidencePenalty = failed.length * 12 + (hasConflict ? 12 : 0) + (!hasReliableOcr ? 24 : 0)
  const calibratedConfidence = Math.max(0, Math.min(100, object.confidence - evidencePenalty))
  if (object.verdict === 'GENUINE' && (!hasReliableOcr || hasConflict || failed.length || (requiresAuthorityEvidence && !hasAuthorityEvidence))) {
    return { ...object, verdict: 'MANUAL_REVIEW' as const, confidence: Math.min(calibratedConfidence, 64), summary: 'Evidence is insufficient for a genuine verdict. Complete authoritative issuer verification or secondary inspection.' }
  }
  if (object.verdict === 'GENUINE' && (!requiresAuthorityEvidence || hasAuthorityEvidence)) {
    return { ...object, confidence: Math.min(calibratedConfidence, 92), summary: `${object.summary} This is an evidence score, not proof of authenticity.` }
  }
  return { ...object, confidence: calibratedConfidence }
}

async function analyzePost(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const form = await request.formData()
  const file = form.get('file')
  const documentType = String(form.get('documentType') || 'other')
  if (!(file instanceof File) || file.size === 0 || file.size > maxBytes) return NextResponse.json({ error: 'Invalid file' }, { status: 400 })
  const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
  if (!allowed.has(file.type)) return NextResponse.json({ error: 'Unsupported file type' }, { status: 415 })

  const bytes = Buffer.from(await file.arrayBuffer())
  if (bytes.length === 0) return NextResponse.json({ error: 'The uploaded file is empty.' }, { status: 400 })
  const documentHash = createHash('sha256').update(bytes).digest('hex')
  let localOcr = ''
  try { localOcr = await Promise.race([runLocalOcr(file), new Promise<string>((resolve) => setTimeout(() => resolve(''), 25_000))]) } catch { localOcr = '' }
  try {
    const prompt = `Analyze this ${documentType} using OCR extraction and visual tamper analysis. Local OCR text (treat as untrusted, verify against the image): ${localOcr || '[none]'}. Apply these checks: ${rules[documentType] || rules.other}. Return a confidence percentage, verdict, concise findings, and extracted fields. This is an aid for a trained officer, not an authoritative government verification.`
    const system = 'You are a conservative document-forensics assistant. Analyze only visible evidence. Do not claim a document is genuine from appearance alone. A missing secure QR/MRZ/digital signature or insufficient OCR must produce MANUAL_REVIEW, never GENUINE. Treat screenshots, recaptured screens, composites, mismatched typography, inconsistent dates/numbers, image seams, altered portraits, and issuer/security-feature absence as risk evidence. Separate OCR extraction from visual tamper findings. Never invent a field, security feature, issuer confirmation, or government lookup. Do not expose sensitive data beyond short OCR field values.'
    const requestOptions = (modelId: string) => ({
      model: gateway(modelId),
      schema: verdictSchema,
      temperature: 0,
      system,
      messages: [{ role: 'user' as const, content: [{ type: 'text' as const, text: prompt }, { type: 'file' as const, data: bytes, mediaType: file.type }] }],
      abortSignal: AbortSignal.timeout(28_000),
    })
    let object: z.infer<typeof verdictSchema>
    let modelUsed = 'google/gemini-2.5-flash'
    try {
      ({ object } = await generateObject(requestOptions(modelUsed)))
    } catch {
      modelUsed = 'google/gemini-2.5-flash-lite';
      ({ object } = await generateObject(requestOptions(modelUsed)))
    }
    const failed = deterministicFindings(documentType, object.ocrFields.map((field) => `${field.field}: ${field.value}`).join(' '))
    const safeObject = applyStrictGate(documentType, object, failed)
    return NextResponse.json({ ...safeObject, failedChecks: failed, rulesApplied: rules[documentType] || rules.other, provider: 'Vercel AI Gateway', model: modelUsed, documentHash: `${documentHash.slice(0, 12)}…` })
  } catch (error) {
    const failed = deterministicFindings(documentType, localOcr)
    const fallback = localFallback(documentType, localOcr, failed, documentHash)
    const timedOut = error instanceof Error && /timeout|timed out|abort/i.test(error.message)
    return NextResponse.json({ ...fallback, provider: timedOut ? 'local OCR fallback · AI timeout' : fallback.provider, aiFindings: [timedOut ? 'AI analysis timed out; local evidence was preserved.' : 'AI analysis was unavailable; local evidence was preserved.'] }, { status: 200 })
  }
}

export async function POST(request: Request) {
  try {
    return await analyzePost(request)
  } catch {
    return NextResponse.json({ error: 'Analysis service failed safely. Retry the upload or refer the document for manual inspection.', code: 'ANALYSIS_SERVICE_ERROR' }, { status: 503 })
  }
}
