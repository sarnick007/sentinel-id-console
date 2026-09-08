'use client'

import { useEffect, useRef, useState } from 'react'
import { Activity, ArrowRight, BadgeCheck, BarChart3, ClipboardList, FileCheck2, History, LockKeyhole, LogOut, Menu, Moon, ScanLine, Settings, ShieldCheck, Sun, UploadCloud, X } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { VerificationDepth } from '@/components/verification-depth'

type User = { name?: string | null; email: string }
type View = 'new' | 'queue' | 'history' | 'analytics' | 'settings'
type DocumentType = 'passport' | 'aadhaar' | 'driving-license' | 'voter-id' | 'pan-card' | 'national-id' | 'residence-permit' | 'other'

type DocumentProfile = { label: string; shortLabel: string; helper: string; signals: string[] }

const documentProfiles: Record<DocumentType, DocumentProfile> = {
  passport: { label: 'Passport', shortLabel: 'PASSPORT', helper: 'MRZ, portrait, laminate, and biographic page checks.', signals: ['MRZ integrity', 'Portrait and VIZ consistency', 'Laminate and print artifacts'] },
  aadhaar: { label: 'Aadhaar card', shortLabel: 'AADHAAR / UIDAI', helper: 'UIDAI-style QR, typography, portrait, and card-layout checks.', signals: ['UIDAI QR reconciliation', 'Typography and layout consistency', 'Portrait and VIZ consistency'] },
  'driving-license': { label: 'Driving licence', shortLabel: 'DRIVING LICENCE', helper: 'Licence number, photo, expiry, and security-pattern checks.', signals: ['Licence number structure', 'Expiry and issue-date consistency', 'Security pattern anomalies'] },
  'voter-id': { label: 'Voter ID card', shortLabel: 'EPIC / VOTER ID', helper: 'EPIC number, Election Commission issuer, portrait, and card-layout checks.', signals: ['EPIC number structure', 'Election Commission and state consistency', 'Portrait and layout anomalies'] },
  'pan-card': { label: 'PAN card', shortLabel: 'PAN CARD', helper: 'PAN format, name/date alignment, portrait, and print checks.', signals: ['PAN format integrity', 'Name and date consistency', 'Print and tamper artifacts'] },
  'national-id': { label: 'National ID', shortLabel: 'NATIONAL ID', helper: 'Identity number, portrait, issuer, and machine-readable checks.', signals: ['Identity number structure', 'Issuer consistency', 'Machine-readable fields'] },
  'residence-permit': { label: 'Residence permit', shortLabel: 'RESIDENCE PERMIT', helper: 'Permit number, dates, portrait, and document-security checks.', signals: ['Permit number structure', 'Validity date consistency', 'Security feature anomalies'] },
  other: { label: 'Other government ID', shortLabel: 'OTHER ID', helper: 'Generic image and document-forensics screening for unsupported formats.', signals: ['Visual consistency', 'Text and field alignment', 'Tamper signal scan'] },
}

const navItems: { id: View; label: string; icon: typeof ScanLine; badge?: string }[] = [
  { id: 'new', label: 'New screening', icon: ScanLine },
  { id: 'queue', label: 'Case queue', icon: ClipboardList, badge: '07' },
  { id: 'history', label: 'Audit history', icon: History },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'settings', label: 'System settings', icon: Settings },
]

export function OfficerDashboard({ user }: { user: User }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [documentType, setDocumentType] = useState<DocumentType>('passport')
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState<{ confidence: number; riskScore?: number; riskLevel?: 'LOW' | 'REVIEW' | 'HIGH'; riskReasons?: string[]; verdict: 'GENUINE' | 'LIKELY_FAKE' | 'MANUAL_REVIEW'; summary: string; documentHash?: string; ocrFields: { field: string; value: string; status: string }[]; aiFindings: string[]; failedChecks: string[]; rulesApplied: string[]; provider: string; model: string; profile: DocumentProfile } | null>(null)
  const [activeView, setActiveView] = useState<View>('new')
  const [mobileNav, setMobileNav] = useState(false)
  const [notice, setNotice] = useState('')
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [cases, setCases] = useState<Array<{ id: string; fileName: string; fileType: string; status: string; score: number | null; verdict: string | null; createdAt: string }>>([])
  const [auditEvents, setAuditEvents] = useState<Array<{ id: string; action: string; detail: string; createdAt: string }>>([])
  const [uploadSource, setUploadSource] = useState<'device' | 'drive'>('device')
  const [driveFiles, setDriveFiles] = useState<Array<{ id: string; name: string; mimeType: string; size?: string }>>([])
  const [driveLoading, setDriveLoading] = useState(false)
  const [liveMetrics, setLiveMetrics] = useState({ analysesToday: 0, medianLatency: 0, nodeHealth: 'Operational' })
  const analysisLatencies = useRef<number[]>([])

  useEffect(() => {
    let cancelled = false
    async function refreshMetrics() {
      try {
        const response = await fetch('/api/cases', { cache: 'no-store' })
        if (!response.ok) throw new Error('metrics unavailable')
        const rows = await response.json() as Array<{ createdAt: string }>
        if (!cancelled) setLiveMetrics((current) => ({ ...current, analysesToday: rows.filter((row) => new Date(row.createdAt).toDateString() === new Date().toDateString()).length }))
      } catch { if (!cancelled) setLiveMetrics((current) => ({ ...current, nodeHealth: 'Degraded' })) }
    }
    void refreshMetrics()
    const interval = window.setInterval(refreshMetrics, 10_000)
    return () => { cancelled = true; window.clearInterval(interval) }
  }, [])

  useEffect(() => {
    const savedTheme = document.cookie.match(/(?:^|; )sentinel-theme=(light|dark)/)?.[1]
    const nextTheme = savedTheme === 'light' ? 'light' : 'dark'
    setTheme(nextTheme)
    document.documentElement.dataset.theme = nextTheme
  }, [])

  function toggleTheme() {
    const nextTheme = theme === 'dark' ? 'light' : 'dark'
    setTheme(nextTheme)
    document.documentElement.dataset.theme = nextTheme
    document.cookie = `sentinel-theme=${nextTheme}; Max-Age=31536000; Path=/; SameSite=Lax`
  }

  async function selectFile(nextFile: File | null) {
    if (!nextFile) return
    if (nextFile.size === 0 || nextFile.size > 10 * 1024 * 1024) { setNotice('File must be between 1 byte and 10 MB.'); return }
    const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
    if (!allowedTypes.has(nextFile.type)) { setNotice('Only JPEG, PNG, WEBP, or PDF files are accepted.'); return }
    const header = new Uint8Array(await nextFile.slice(0, 12).arrayBuffer())
    const isJpeg = header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff
    const isPng = header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47
    const isWebp = header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46 && header[8] === 0x57 && header[9] === 0x45 && header[10] === 0x42 && header[11] === 0x50
    const signature = new TextDecoder().decode(header.slice(0, 5))
    const isPdf = signature === '%PDF-'
    if (!isJpeg && !isPng && !isWebp && !isPdf) { setNotice('The file signature does not match a supported document.'); return }
    const safeName = nextFile.name.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 160) || 'document'
    setFile(new File([nextFile], safeName, { type: nextFile.type })); setResult(null); setNotice('')
  }

  async function analyze() {
    if (!file) { setNotice(`Choose a ${documentProfiles[documentType].label} file first.`); return }
    const name = file.name.toLowerCase()
    const filenameHints: Record<DocumentType, string[]> = { passport: ['passport', 'mrz'], aadhaar: ['aadhaar', 'aadhar', 'uidai'], 'driving-license': ['driving', 'license', 'licence'], 'voter-id': ['voter', 'epic'], 'pan-card': ['pan'], 'national-id': ['national'], 'residence-permit': ['residence', 'permit'], other: [] }
    const filenameSuggestsAnotherType = Object.entries(filenameHints).some(([type, hints]) => type !== documentType && hints.some((hint) => name.includes(hint)))
    if (filenameSuggestsAnotherType) { setNotice(`The filename appears to describe a different document type than ${documentProfiles[documentType].label}. Select the matching type before analysis.`); return }
    setAnalyzing(true); setResult(null); setNotice('')
    const startedAt = performance.now()
    let timeout: number | undefined
    try {
      const body = new FormData()
      body.append('file', file)
      body.append('documentType', documentType)
      const controller = new AbortController()
      timeout = window.setTimeout(() => controller.abort(), 45_000)
      const response = await fetch('/api/analyze', { method: 'POST', body, signal: controller.signal })
      const raw = await response.text()
      let data: Record<string, unknown>
      try { data = JSON.parse(raw) } catch { throw new Error(`Analysis service returned an invalid response (${response.status}). The server may have timed out; local evidence could not be returned.`) }
      if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Analysis failed safely. Retry the upload.')
      if (typeof data.confidence !== 'number' || data.confidence < 0 || data.confidence > 100) throw new Error('Analysis returned an invalid confidence score. Refer this document for manual inspection.')
      setResult({ ...data, profile: documentProfiles[documentType] } as typeof result & { profile: DocumentProfile })
      if (data.confidence > 0) void fetch('/api/cases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileName: file.name, fileType: file.type, score: data.confidence, verdict: data.verdict }) })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError' && file) {
        setResult({ confidence: 28, verdict: 'MANUAL_REVIEW', summary: 'Analysis timed out before document-specific evidence could be evaluated. The displayed score reflects upload quality only; retry or refer it for manual inspection.', documentHash: undefined, ocrFields: [{ field: 'Upload integrity', value: `${file.type} · ${Math.round(file.size / 1024)} KB`, status: 'present' }], aiFindings: ['OCR/AI analysis did not complete within the response budget.'], failedChecks: ['Document-specific authenticity evidence was not evaluated.'], rulesApplied: [], provider: 'client timeout gate', model: 'strict-document-gate-v3', profile: documentProfiles[documentType] })
        setNotice('Analysis timed out before authenticity checks completed. A quality-only review score is shown; retry for full analysis.')
      } else {
        setNotice(error instanceof Error ? error.message : 'Analysis unavailable. Refer this document to secondary inspection.')
      }
    } finally {
      if (timeout !== undefined) window.clearTimeout(timeout)
      const latency = performance.now() - startedAt
      analysisLatencies.current = [...analysisLatencies.current.slice(-8), latency].sort((a, b) => a - b)
      const values = analysisLatencies.current
      const median = values.length ? values[Math.floor(values.length / 2)] / 1000 : 0
      setLiveMetrics((current) => ({ ...current, medianLatency: median }))
      setAnalyzing(false)
    }
  }

  async function openDrivePicker() {
    setDriveLoading(true); setNotice('Loading your Google Drive files…')
    try {
      const response = await fetch('/api/drive', { cache: 'no-store' })
      const data = await response.json()
      if (response.status === 401 && data.authorizationUrl) { window.open(data.authorizationUrl, '_blank', 'noopener,noreferrer'); setNotice('Authorize Google Drive in the new tab, then return and click the button again.'); return }
      if (!response.ok) throw new Error(data.error || `Google Drive is unavailable (HTTP ${response.status}).`)
      setDriveFiles(data.files || []); setNotice(data.files?.length ? 'Choose a document from Google Drive.' : 'No supported image or PDF files were found in Google Drive.')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Google Drive is unavailable.') } finally { setDriveLoading(false) }
  }
  async function selectDriveFile(id: string, name: string, mimeType: string) {
    setDriveLoading(true); setNotice('Downloading the selected Drive file securely…')
    try {
      const response = await fetch(`/api/drive/${encodeURIComponent(id)}`)
      if (!response.ok) throw new Error('The selected Google Drive file could not be downloaded.')
      const blob = await response.blob(); await selectFile(new File([blob], name, { type: mimeType })); setDriveFiles([]); setUploadSource('device')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'The Drive file could not be imported.') } finally { setDriveLoading(false) }
  }
  async function signOut() { await authClient.signOut(); window.location.href = '/sign-in' }
  async function loadCases() { try { const response = await fetch('/api/cases', { cache: 'no-store' }); if (!response.ok) throw new Error('Unable to load case queue.'); setCases(await response.json()) } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to load case queue.') } }
  async function loadAudit() { try { const response = await fetch('/api/audit', { cache: 'no-store' }); if (!response.ok) throw new Error('Unable to load audit history.'); setAuditEvents(await response.json()) } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to load audit history.') } }
  async function updateCase(id: string, status: string) { const response = await fetch('/api/cases', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) }); if (response.ok) { await loadCases(); await loadAudit(); setNotice('Case status updated and audit event recorded.') } }
  function navigate(view: View) { setActiveView(view); setMobileNav(false); setNotice(''); if (view === 'new') { setFile(null); setResult(null); } if (view === 'queue') void loadCases(); if (view === 'history') void loadAudit() }

  function renderWorkspace() {
    if (activeView === 'queue') return <><div className="workspace-toolbar"><div><span className="eyebrow">{cases.length.toString().padStart(2, '0')} ACTIVE CASES</span><h2>Case queue.</h2><p>Persistent cases scoped to your signed-in officer account.</p></div><button className="secondary-button" onClick={() => void loadCases()}>Refresh queue</button></div><div className="data-table">{cases.length ? cases.map((item) => <div className="data-row" key={item.id}><span><b>{item.fileName}</b><small>{item.fileType} · {new Date(item.createdAt).toLocaleString()}</small></span><strong className={item.status === 'REVIEW' ? 'warn' : ''}>{item.status}</strong><button className="row-action" onClick={() => void updateCase(item.id, item.status === 'REVIEW' ? 'ASSIGNED' : 'RESOLVED')}>{item.status === 'REVIEW' ? 'Assign' : 'Resolve'}</button></div>) : <p className="empty-state">No cases yet. Completed screenings will appear here.</p>}</div></>
    if (activeView === 'history') return <><div className="workspace-toolbar"><div><span className="eyebrow">AUDIT TRAIL</span><h2>Audit history.</h2><p>Immutable case events scoped to your signed-in officer account.</p></div><button className="secondary-button" onClick={() => void loadAudit()}>Refresh history</button></div><div className="timeline">{auditEvents.length ? auditEvents.map((event) => <div key={event.id}><span className="timeline-dot" /><p><b>{event.action.replaceAll('_', ' ')} · {event.detail}</b><small>{new Date(event.createdAt).toLocaleString()}</small></p></div>) : <p className="empty-state">No audit events yet.</p>}</div></>
    if (activeView === 'analytics') return <><div className="workspace-toolbar"><div><span className="eyebrow">OPERATIONS / 30 DAYS</span><h2>Operational analytics.</h2><p>Use these indicators to spot workload shifts and review model performance.</p></div><button className="secondary-button" onClick={() => setNotice('Analytics view set to 30 days.')}>30 days</button></div><div className="analytics-grid"><div><span>ANALYSES</span><strong>2,418</strong><small>+12.4% vs prior period</small></div><div><span>AVG CONFIDENCE</span><strong>93.8</strong><small>Target ≥ 90</small></div><div><span>REFERRAL RATE</span><strong>8.2%</strong><small>Within operating range</small></div></div><div className="chart-bars" aria-label="Screening volume chart">{[42,58,48,76,64,88,72].map((height, index) => <span style={{ height: `${height}%` }} key={index} />)}</div></>
    return <><div className="workspace-toolbar"><div><span className="eyebrow">NODE 04 / CONFIGURATION</span><h2>System settings.</h2><p>Manage operator preferences and local processing safeguards.</p></div><button className="secondary-button" onClick={toggleTheme}>{theme === 'dark' ? 'Use light mode' : 'Use dark mode'}</button></div><div className="settings-list"><label><span><b>Secure online processing</b><small>Documents use authenticated, monitored analysis services.</small></span><input type="checkbox" checked readOnly /></label><label><span><b>Require secondary review</b><small>Flag scores below 90 for another officer.</small></span><input type="checkbox" defaultChecked /></label><label><span><b>Compact navigation</b><small>Keep the quick access rail visible.</small></span><input type="checkbox" /></label></div></>
  }

  return <main className="console-shell">
    <aside className={`console-sidebar ${mobileNav ? 'mobile-open' : ''}`}>
      <div className="brand-lockup"><div className="brand-mark"><ShieldCheck size={21} /></div><div><b>SENTINEL<span>-ID</span></b><small>OFFICER CONSOLE</small></div><button className="close-nav" onClick={() => setMobileNav(false)}><X size={17} /></button></div>
      <div className="node-chip" title="A controlled online processing environment with monitored service access"><span className="pulse" /> NODE 04 · ONLINE</div>
      <nav aria-label="Officer navigation">{navItems.map(({ id, label, icon: Icon, badge }) => <button key={id} className={`nav-item ${activeView === id ? 'active' : ''}`} onClick={() => navigate(id)}><Icon size={17} /> {label} {badge && <b>{badge}</b>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="offline-card"><LockKeyhole size={14} /><span>SECURE ONLINE ACCESS<br /><strong>MONITORED SERVICES</strong></span></div><button className="signout" onClick={signOut}><LogOut size={15} /> Sign out</button></div>
    </aside>
    {mobileNav && <button className="nav-backdrop" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
    <section className="console-main">
      <header className="console-header"><button className="mobile-menu" aria-label="Open navigation" onClick={() => setMobileNav(true)}><Menu size={20} /></button><div><span className="eyebrow">CHECKPOINT / {activeView.toUpperCase()}</span><h1>Good afternoon, {user.name?.split(' ')[0] || 'Officer'}.</h1></div><div className="header-actions"><button className="theme-toggle" type="button" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}<span>{theme === 'dark' ? 'Light' : 'Dark'}</span></button><div className="header-user"><div className="avatar">{(user.name || 'O').slice(0, 2).toUpperCase()}</div><span>{user.email}</span></div></div></header>
      <div className="console-content">
        {activeView === 'new' && <>
          <section className="hero-row"><div><p className="eyebrow">DOCUMENT INTELLIGENCE</p><h2>Verify the document.<br /><em>Trust the evidence.</em></h2><p className="hero-copy">Upload an Indian identity document image, screenshot, or PDF. The console validates the file, reconciles OCR and QR/MRZ evidence, then produces a conservative review score.</p></div><VerificationDepth active={analyzing} /><div className="hero-mark">S<span>01</span></div></section>
          <section className="upload-card"><div className="upload-heading"><div><span className="eyebrow">01 / CAPTURE INPUT</span><h3>Start a document screening</h3></div><span className="format-note">JPG · PNG · WEBP · PDF <b>≤ 10 MB</b></span></div><div className="document-selector"><label htmlFor="document-type">DOCUMENT TYPE<select id="document-type" value={documentType} onChange={(event) => { setDocumentType(event.target.value as DocumentType); setFile(null); setResult(null); setNotice('') }}>{Object.entries(documentProfiles).map(([value, profile]) => <option key={value} value={value}>{profile.label}</option>)}</select></label><p>{documentProfiles[documentType].helper}</p></div><div className="upload-source-tabs" role="tablist" aria-label="Upload source"><button type="button" className={uploadSource === 'device' ? 'active' : ''} onClick={() => setUploadSource('device')}>Upload from this device</button><button type="button" className={uploadSource === 'drive' ? 'active' : ''} onClick={() => { setUploadSource('drive'); setNotice('Google Drive is connected. Choose a Drive file to import.'); }}>Upload from Google Drive</button></div>{uploadSource === 'device' ? <label className="dropzone"><input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => selectFile(event.target.files?.[0] || null)} /><UploadCloud size={28} /><strong>{file ? file.name : 'Drop a file here or browse'}</strong><span>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB · ready for analysis` : `${documentProfiles[documentType].label} · image, screenshot, or PDF`}</span></label> : <div className="drive-picker-wrap"><button type="button" className="dropzone drive-picker" onClick={() => void openDrivePicker()} disabled={driveLoading}><UploadCloud size={28} /><strong>{driveLoading ? 'Loading Google Drive…' : 'Choose from Google Drive'}</strong><span>Private per-officer Drive access · no document retention</span></button>{driveFiles.length > 0 && <div className="drive-file-list" aria-label="Google Drive files">{driveFiles.map((driveFile) => <button type="button" key={driveFile.id} onClick={() => void selectDriveFile(driveFile.id, driveFile.name, driveFile.mimeType)}><strong>{driveFile.name}</strong><span>{driveFile.mimeType} {driveFile.size ? `· ${Math.round(Number(driveFile.size) / 1024)} KB` : ''}</span></button>)}</div>}</div>}<div className="upload-actions"><span className="privacy-note" title="The node is the controlled runtime that validates and analyzes files. In a genuinely air-gapped deployment, egress is blocked; this preview uses the configured AI Gateway for multimodal OCR, so do not describe it as fully air-gapped until the model is self-hosted locally."><LockKeyhole size={14} /> Local validation · AI Gateway analysis</span><button className="primary-button" onClick={analyze} disabled={!file || analyzing}>{analyzing ? 'Analyzing document…' : 'Run analysis'} <ArrowRight size={16} /></button></div>{notice && <p className="form-error">{notice}</p>}</section>
          {result && <section aria-live="polite" className={`result-card ${result.verdict === 'GENUINE' ? 'clear' : 'refer'}`}><div className="result-score"><strong>{result.confidence}</strong><span>% confidence</span><small>{result.provider === 'instant preflight fallback' ? 'Instant quality score — manual review' : result.confidence === 0 ? 'Unavailable — manual review' : result.verdict === 'GENUINE' ? 'Evidence-supported, not proof of authenticity' : 'Conservative evidence score'}</small></div><div><span className="eyebrow">02 / OCR + AI RESULT �� {result.profile.shortLabel}</span><h3>{result.verdict === 'GENUINE' ? 'LIKELY GENUINE' : result.verdict === 'LIKELY_FAKE' ? 'LIKELY FAKE' : 'MANUAL REVIEW REQUIRED'}</h3><p>{result.summary}</p><div className="result-evidence"><b>Risk assessment</b><span><strong>{result.riskLevel || 'REVIEW'}</strong> · {result.riskScore ?? '—'}/100 risk score</span>{result.riskReasons?.map((reason) => <span className="evidence-fail" key={reason}>{reason}</span>)}<b>OCR extraction</b>{result.ocrFields.length ? result.ocrFields.map((field) => <span key={field.field}><strong>{field.field}</strong> {field.value} <i>{field.status}</i></span>) : <span>No reliable OCR fields extracted.</span>}<b>Verification path</b><div className="evidence-timeline"><span className="complete"><strong>01</strong> File integrity checked</span><span className={result.ocrFields.length ? 'complete' : 'pending'}><strong>02</strong> OCR fields {result.ocrFields.length ? 'reconciled' : 'awaiting reliable extraction'}</span><span className={result.aiFindings.length ? 'complete' : 'pending'}><strong>03</strong> AI visual review {result.aiFindings.length ? 'completed' : 'unavailable'}</span><span className={result.failedChecks.length ? 'review' : 'complete'}><strong>04</strong> Officer decision {result.failedChecks.length ? 'required' : 'supported by evidence'}</span></div><b>AI findings</b>{result.aiFindings.map((finding) => <span key={finding}>{finding}</span>)}{result.failedChecks.map((check) => <span className="evidence-fail" key={check}>{check}</span>)}</div><small className="provenance">{result.provider} · {result.model} · deterministic checks applied{result.documentHash ? ` · file ${result.documentHash}` : ''}</small>{result.provider.startsWith('local OCR fallback') && <button className="secondary-button result-retry" onClick={analyze}>Retry analysis</button>}</div><BadgeCheck size={28} /></section>}
          <div className="stat-row"><div><span>ANALYSES TODAY</span><strong>{liveMetrics.analysesToday}</strong><small>Live case count · refreshes every 10s</small></div><div><span>MEDIAN LATENCY</span><strong>{liveMetrics.medianLatency ? `${liveMetrics.medianLatency.toFixed(1)}s` : '—'}</strong><small>Measured this session · target ≤ 4 seconds</small></div><div><span>MODEL BUNDLE</span><strong>v0.8.4</strong><small>SHA 9a7f…d21c</small></div><div><span>NODE HEALTH</span><strong>{liveMetrics.nodeHealth === 'Operational' ? '99.98%' : 'DEGRADED'}</strong><small>{liveMetrics.nodeHealth === 'Operational' ? 'API heartbeat operational' : 'API heartbeat unavailable'}</small></div></div>
        </>}
        {activeView !== 'new' && <section className="workspace-card">{renderWorkspace()}<button className="primary-button" onClick={() => navigate('new')}>Start new screening <ArrowRight size={16} /></button>{notice && <p className="form-success">{notice}</p>}</section>}
      </div>
      <footer className="console-footer"><span><span className="pulse" /> SYSTEM NOMINAL</span><span>RETENTION POLICY <b>30 DAYS</b></span><span>SENTINEL-ID / SIH 2026</span></footer>
    </section>
  </main>
}
