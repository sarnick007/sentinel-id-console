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
  riskScore: z.number().int().min(0).max(100).optional(),
  riskLevel: z.enum(['LOW', 'REVIEW', 'HIGH']).optional(),
  riskReasons: z.array(z.string().max(220)).max(8).optional(),
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

function filenameMismatch(documentType: string, filename: string) {
  const normalized = filename.toLowerCase().replace(/[^a-z0-9]+/g, ' ')
  const markers: Record<string, string[]> = {
    passport: ['passport', 'mrz'],
    aadhaar: ['aadhaar', 'aadhar', 'uidai'],
    'pan-card': ['pan card', 'pancard'],
    'driving-license': ['driving', 'license', 'licence', ' dl '],
    'voter-id': ['voter', 'epic'],
    'national-id': ['national id', 'nationalid'],
    'residence-permit': ['residence', 'permit'],
    other: [],
  }
  const expected = markers[documentType] || []
  const otherTypes = Object.entries(markers).filter(([type]) => type !== documentType && type !== 'other' && markers[type].some((marker) => normalized.includes(marker)))
  const matchedExpected = expected.some((marker) => normalized.includes(marker))
  return otherTypes.length > 0 && !matchedExpected ? otherTypes[0][0] : null
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
    const image = Buffer.from(await file.arrayBuffer())
    const result = await worker.recognize(image)
    return result.data.text.replace(/\s+/g, ' ').trim().slice(0, 4000)
  } finally {
    await worker.terminate()
  }
}

function readImageDimensions(type: string, bytes: Buffer) {
  if (type === 'image/png' && bytes.length >= 24) return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
  if (type === 'image/webp' && bytes.length >= 30 && bytes.subarray(12, 16).toString('ascii') === 'VP8X') return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) }
  if (type !== 'image/jpeg') return null
  let offset = 2
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue }
    const marker = bytes[offset + 1]
    const length = bytes.readUInt16BE(offset + 2)
    if (length < 2 || offset + length + 2 > bytes.length) break
    if (marker >= 0xc0 && marker <= 0xc3) return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) }
    offset += length + 2
  }
  return null
}

function instantFallback(documentType: string, file: File, bytes: Buffer, documentHash: string) {
  const dimensions = readImageDimensions(file.type, bytes)
  const pixelCount = dimensions ? dimensions.width * dimensions.height : 0
  const hasUsableDimensions = pixelCount >= 900_000 && pixelCount <= 80_000_000
  const tooSmall = dimensions ? dimensions.width < 700 || dimensions.height < 450 : false
  const suspiciousAspect = dimensions ? dimensions.width / dimensions.height > 4.5 || dimensions.height / dimensions.width > 4.5 : false
  const isPdf = file.type === 'application/pdf'
  const pdfHeaderValid = !isPdf || bytes.subarray(0, 5).toString('ascii') === '%PDF-'
  const pdfTrailerValid = !isPdf || bytes.lastIndexOf(Buffer.from('%%EOF')) >= Math.max(0, bytes.length - 2_048)
  const integrityScore = bytes.length > 20_000 ? 18 : bytes.length > 2_048 ? 10 : 3
  const formatScore = pdfHeaderValid && pdfTrailerValid ? 18 : 4
  const dimensionScore = dimensions ? (hasUsableDimensions ? 25 : 10) : isPdf ? 18 : 4
  const qualityScore = !tooSmall && !suspiciousAspect ? 12 : 3
  const riskPenalty = suspiciousAspect ? 16 : tooSmall ? 10 : 0
  const confidence = Math.max(18, Math.min(82, formatScore + integrityScore + dimensionScore + qualityScore - riskPenalty))
  const findings = [
    'OCR/AI analysis was unavailable within the response budget; this is a deterministic quality/evidence score.',
    dimensions ? `Image dimensions detected: ${dimensions.width} × ${dimensions.height}.` : isPdf ? 'PDF container structure detected; page dimensions require rendering.' : 'Image dimensions could not be verified from the file header.',
  ]
  const failedChecks = [
    'Machine-readable authenticity evidence was not evaluated.',
    ...(isPdf && !pdfHeaderValid ? ['PDF header is invalid.'] : []),
    ...(isPdf && !pdfTrailerValid ? ['PDF end-of-file marker is missing or malformed.'] : []),
    ...(tooSmall ? ['Image resolution is low for reliable forensic inspection.'] : []),
    ...(suspiciousAspect ? ['Unusual aspect ratio requires manual review.'] : []),
  ]
  return { verdict: 'MANUAL_REVIEW' as const, confidence, summary: 'Instant preflight completed. This variable quality score is not an authenticity verdict; use authoritative QR, MRZ, issuer, or secondary verification before acceptance.', ocrFields: [{ field: 'Upload integrity', value: 'File format and byte structure validated', status: 'present' as const }, ...(dimensions ? [{ field: 'Image dimensions', value: `${dimensions.width} × ${dimensions.height}`, status: 'present' as const }] : [])], aiFindings: findings, failedChecks, rulesApplied: rules[documentType] || rules.other, provider: 'instant preflight fallback', model: 'format-integrity-v2', documentHash: `${documentHash.slice(0, 12)}…` }
}

function localFallback(documentType: string, ocrText: string, failed: string[], documentHash: string) {
  const normalized = ocrText.toUpperCase().replace(/[|]/g, 'I')
  const emptyEvidence = ocrText.length === 0
  const fields: Array<{ field: string; value: string; status: 'present' }> = []
  let evidencePoints = 0
  let summary: string

  if (documentType === 'aadhaar') {
    const hasIssuer = /(AADHAAR|UIDAI|आधार|UNIQUE IDENTIFICATION|GOVERNMENT OF INDIA)/i.test(normalized)
    const aadhaarNumber = /(?:\d[ -]?){12}/.test(normalized)
    const hasDate = /\b(?:DOB|YOB|DATE OF BIRTH|YEAR OF BIRTH|\d{2}[/-]\d{2}[/-]\d{4})\b/i.test(normalized)
    const hasGender = /\b(MALE|FEMALE|TRANSGENDER|पुरुष|महिला)\b/i.test(normalized)
    const hasQrSignal = /QR|VID|VIRTUAL ID|MERA AADHAAR/i.test(normalized)
    if (hasIssuer) fields.push({ field: 'Issuer', value: 'Aadhaar/UIDAI evidence detected', status: 'present' })
    if (aadhaarNumber) fields.push({ field: 'Identity number', value: '12-digit Aadhaar-like number detected', status: 'present' })
    if (hasDate) fields.push({ field: 'Date evidence', value: 'DOB/YOB/date pattern detected', status: 'present' })
    if (hasGender) fields.push({ field: 'Gender', value: 'Gender label detected', status: 'present' })
    if (hasQrSignal) fields.push({ field: 'Security signal', value: 'QR/VID-related text detected', status: 'present' })
    evidencePoints = (hasIssuer ? 22 : 0) + (aadhaarNumber ? 20 : 0) + (hasDate ? 8 : 0) + (hasGender ? 6 : 0) + (hasQrSignal ? 10 : 0)
    summary = hasIssuer ? 'Local OCR found multiple Aadhaar evidence signals. Authenticity still requires secure QR/issuer verification.' : emptyEvidence ? 'OCR could not read this image; authoritative Aadhaar verification is still required.' : 'OCR evidence was extracted locally; secure issuer or QR verification is still required.'
  } else {
    fields.push({ field: 'Document type', value: `${documentType} selected`, status: 'present' })
    if (ocrText) fields.push({ field: 'OCR evidence', value: `${ocrText.length} characters extracted`, status: 'present' })
    evidencePoints = Math.min(40, (ocrText ? 12 : 0) + (ocrText.length > 80 ? 8 : 0))
    summary = emptyEvidence ? 'OCR could not read this image. No authenticity conclusion was made.' : 'Generic OCR evidence was extracted locally; document-specific authenticity verification is still required.'
  }

  if (ocrText && documentType === 'aadhaar') fields.push({ field: 'OCR evidence', value: `${ocrText.length} characters extracted`, status: 'present' })
  return { verdict: 'MANUAL_REVIEW' as const, confidence: Math.min(74, evidencePoints), summary, ocrFields: fields, aiFindings: ['Local OCR fallback used because AI analysis was unavailable.'], failedChecks: failed.length ? failed : ['AI visual/tamper analysis unavailable; authenticity not established.'], rulesApplied: rules[documentType] || rules.other, provider: 'local OCR fallback', model: 'tesseract.js', documentHash: `${documentHash.slice(0, 12)}…` }
}

function addRiskAssessment(object: Record<string, unknown>, failed: string[], provider: string) {
  const findings = Array.isArray(object.aiFindings) ? object.aiFindings.filter((item): item is string => typeof item === 'string') : []
  const hasAuthoritySignal = [...failed, ...findings].some((item) => /(QR|MRZ|issuer|digitally signed|machine-readable)/i.test(item))
  const riskReasons = [...failed, ...findings.filter((item) => /(screenshot|sample|edited|seam|inconsistent|missing|unavailable|tamper|timeout)/i.test(item))].slice(0, 8)
  const baseRisk = failed.length * 14 + (hasAuthoritySignal ? 0 : 18) + (provider.includes('fallback') || provider.includes('timeout') ? 10 : 0)
  const riskScore = Math.max(0, Math.min(100, baseRisk))
  return { ...object, riskScore, riskLevel: riskScore >= 60 ? 'HIGH' as const : riskScore >= 25 ? 'REVIEW' as const : 'LOW' as const, riskReasons: riskReasons.length ? riskReasons : ['No high-risk signal was detected in the available evidence; authoritative verification is still recommended.'] }
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
  const supportedTypes = new Set(['aadhaar', 'passport', 'pan-card', 'driving-license', 'voter-id', 'national-id', 'residence-permit', 'other'])
  if (!supportedTypes.has(documentType)) return NextResponse.json({ error: 'Unsupported document type.' }, { status: 400 })
  if (!(file instanceof File) || file.size === 0 || file.size > maxBytes) return NextResponse.json({ error: 'Invalid file' }, { status: 400 })
  const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
  if (!allowed.has(file.type)) return NextResponse.json({ error: 'Unsupported file type' }, { status: 415 })

  const bytes = Buffer.from(await file.arrayBuffer())
  if (bytes.length === 0) return NextResponse.json({ error: 'The uploaded file is empty.' }, { status: 400 })
  const isPdf = bytes.subarray(0, 5).toString('ascii') === '%PDF-'
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  const isPng = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  const isWebp = bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  if (!((file.type === 'application/pdf' && isPdf) || (file.type === 'image/jpeg' && isJpeg) || (file.type === 'image/png' && isPng) || (file.type === 'image/webp' && isWebp))) return NextResponse.json({ error: 'File content does not match its declared type.' }, { status: 415 })
  const documentHash = createHash('sha256').update(bytes).digest('hex')
  const filenameType = filenameMismatch(documentType, file.name)
  if (filenameType) {
    const expectedLabel = documentType.replace(/-/g, ' ')
    const detectedLabel = filenameType.replace(/-/g, ' ')
    return NextResponse.json({ verdict: 'MANUAL_REVIEW' as const, confidence: 0, summary: `Selected document type does not match the uploaded filename. Selected: ${expectedLabel}; detected filename marker: ${detectedLabel}. Select the correct type and upload the document again.`, ocrFields: [{ field: 'Document type match', value: 'Mismatch detected from filename marker', status: 'inconsistent' as const }], aiFindings: ['Analysis was stopped before scoring because the selected type and uploaded filename conflict.'], failedChecks: ['Document type mismatch requires correction before authenticity analysis.'], rulesApplied: rules[documentType] || rules.other, provider: 'deterministic preflight', model: 'document-type-gate-v1', documentHash: `${documentHash.slice(0, 12)}…` }, { status: 200 })
  }
  const instant = instantFallback(documentType, file, bytes, documentHash)
  const budget = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('analysis budget exceeded')), 900))
  let localOcr = ''
  try { localOcr = await Promise.race([runLocalOcr(file), budget]) } catch {     return NextResponse.json({ ...addRiskAssessment(instant, instant.failedChecks, instant.provider), retention: 'none' }, { status: 200 }) }
  try {
    const prompt = `Analyze this ${documentType} using OCR extraction and visual tamper analysis. Local OCR text (treat as untrusted, verify against the image): ${localOcr || '[none]'}. Apply these checks: ${rules[documentType] || rules.other}. Return a confidence percentage, verdict, concise findings, and extracted fields. This is an aid for a trained officer, not an authoritative government verification.`
    const system = 'You are a conservative document-forensics assistant. Analyze only visible evidence. Do not claim a document is genuine from appearance alone. A missing secure QR/MRZ/digital signature or insufficient OCR must produce MANUAL_REVIEW, never GENUINE. Treat screenshots, recaptured screens, composites, mismatched typography, inconsistent dates/numbers, image seams, altered portraits, and issuer/security-feature absence as risk evidence. Separate OCR extraction from visual tamper findings. Never invent a field, security feature, issuer confirmation, or government lookup. Do not expose sensitive data beyond short OCR field values.'
    const requestOptions = (modelId: string) => ({
      model: gateway(modelId),
      schema: verdictSchema,
      temperature: 0,
      system,
      messages: [{ role: 'user' as const, content: [{ type: 'text' as const, text: prompt }, { type: 'file' as const, data: bytes, mediaType: file.type }] }],
      abortSignal: AbortSignal.timeout(1_800),
    })
    let object: z.infer<typeof verdictSchema>
    let modelUsed = 'google/gemini-2.5-flash'
    try {
      ({ object } = await generateObject(requestOptions(modelUsed)))
    } catch {
      modelUsed = 'google/gemini-2.5-flash-lite';
      ({ object } = await generateObject(requestOptions(modelUsed)))
    }
    const modelEvidence = object.ocrFields.map((field) => `${field.field}: ${field.value}`).join(' ')
    const failed = deterministicFindings(documentType, `${localOcr} ${modelEvidence}`)
    const safeObject = applyStrictGate(documentType, object, failed)
    const evidenceBalanced = safeObject.confidence < 70 && failed.length === 0 ? { ...safeObject, confidence: 70 } : safeObject
    return NextResponse.json({ ...addRiskAssessment(evidenceBalanced, failed, 'Vercel AI Gateway'), failedChecks: failed, rulesApplied: rules[documentType] || rules.other, provider: 'Vercel AI Gateway', model: modelUsed, documentHash: `${documentHash.slice(0, 12)}…`, retention: 'none' })
  } catch (error) {
    const failed = deterministicFindings(documentType, localOcr)
    const fallback = localOcr.trim().length >= 8 ? localFallback(documentType, localOcr, failed, documentHash) : instant
    const timedOut = error instanceof Error && /timeout|timed out|abort/i.test(error.message)
    const fallbackProvider = timedOut ? 'local OCR fallback · AI timeout' : fallback.provider
    return NextResponse.json({ ...addRiskAssessment({ ...fallback, aiFindings: [timedOut ? 'AI analysis timed out; local evidence was preserved.' : 'AI analysis was unavailable; local evidence was preserved.'] }, failed, fallbackProvider), provider: fallbackProvider, retention: 'none' }, { status: 200 })
  }
}

export async function POST(request: Request) {
  try {
    return await analyzePost(request)
  } catch {
    return NextResponse.json({ error: 'Analysis service failed safely. Retry the upload or refer the document for manual inspection.', code: 'ANALYSIS_SERVICE_ERROR' }, { status: 503 })
  }
}
