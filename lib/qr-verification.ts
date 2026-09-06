import jsQR from 'jsqr'

export type QrVerification = {
  detected: boolean
  payload?: string
  status: 'not-detected' | 'decoded' | 'conflict' | 'unverified'
  findings: string[]
  fields: Array<{ field: string; value: string; status: 'present' | 'missing' | 'inconsistent' }>
}

function parsePayload(payload: string) {
  const trimmed = payload.trim()
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>
    return Object.entries(parsed).filter(([, value]) => ['string', 'number'].includes(typeof value)).map(([key, value]) => [key, String(value)] as const)
  } catch {
    return trimmed.split(/[|\n;,]/).map((part) => part.split(/\s*[:=]\s*/, 2)).filter(([key, value]) => key && value).map(([key, value]) => [key, value] as const)
  }
}

export function verifyQrPayload(payload: string, documentType: string, ocrText: string): QrVerification {
  const fields = parsePayload(payload)
  const normalized = `${payload} ${ocrText}`.toUpperCase()
  const findings = ['QR data was decoded locally; decoding does not prove issuer authenticity.']
  const resultFields: QrVerification['fields'] = []
  const typeMarkers: Record<string, RegExp> = {
    passport: /PASSPORT|MRZ|P</,
    aadhaar: /AADHAAR|UIDAI|VID|MERA AADHAAR|GOVERNMENT OF INDIA/,
    'pan-card': /PAN CARD|INCOME TAX/,
    'driving-license': /DRIVING|LICEN[CS]E|RTO/,
    'voter-id': /VOTER|EPIC|ELECTION/,
    'national-id': /NATIONAL ID|IDENTITY CARD/,
    'residence-permit': /RESIDENCE|PERMIT|IMMIGRATION/,
    other: /./,
  }
  if (documentType !== 'other' && !typeMarkers[documentType].test(normalized)) {
    resultFields.push({ field: 'QR document type', value: 'Payload does not identify the selected document type', status: 'inconsistent' })
    findings.push('Decoded QR content conflicts with the selected document type.')
    return { detected: true, payload, status: 'conflict', findings, fields: resultFields }
  }
  for (const [key, value] of fields.slice(0, 8)) {
    const ocrMatch = ocrText.length > 0 && (ocrText.toUpperCase().includes(value.toUpperCase()) || value.length < 4)
    resultFields.push({ field: `QR ${key}`, value: value.slice(0, 160), status: ocrMatch ? 'present' : 'inconsistent' })
    if (!ocrMatch && value.length >= 4) findings.push(`QR field ${key} was not found in visible OCR text.`)
  }
  const hasConflict = resultFields.some((field) => field.status === 'inconsistent')
  return { detected: true, payload, status: hasConflict ? 'conflict' : 'decoded', findings, fields: resultFields }
}

export async function decodeQrFromImage(file: File, ocrText: string, documentType: string): Promise<QrVerification> {
  if (!file.type.startsWith('image/')) return { detected: false, status: 'not-detected', findings: ['QR scanning is currently available for image uploads; PDF QR evidence requires rendering before verification.'], fields: [] }
  const imageData = await createImageData(file)
  if (!imageData) return { detected: false, status: 'not-detected', findings: ['Image could not be rendered for QR scanning.'], fields: [] }
  const decoded = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' })
  return decoded ? verifyQrPayload(decoded.data, documentType, ocrText) : { detected: false, status: 'not-detected', findings: ['No QR code was detected in the uploaded image.'], fields: [] }
}

async function createImageData(file: File): Promise<ImageData | null> {
  const buffer = Buffer.from(await file.arrayBuffer())
  const sharp = await import('sharp').catch(() => null)
  if (!sharp) return null
  const { data, info } = await sharp.default(buffer).raw().ensureAlpha().toBuffer({ resolveWithObject: true })
  return new ImageData(new Uint8ClampedArray(data), info.width, info.height)
}
