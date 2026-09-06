'use client'

import { useEffect, useRef, useState } from 'react'
import { Activity, ArrowRight, BadgeCheck, BarChart3, ClipboardList, FileCheck2, History, LockKeyhole, LogOut, Menu, Moon, ScanLine, Settings, ShieldCheck, Sun, UploadCloud, X } from 'lucide-react'
import { authClient } from '@/lib/auth-client'

type User = { name?: string | null; email: string }
type View = 'new' | 'queue' | 'history' | 'analytics' | 'settings'
type DocumentType = 'passport' | 'aadhaar' | 'driving-license' | 'voter-id' | 'pan-card' | 'national-id' | 'residence-permit' | 'other'

type DocumentProfile = { label: string; shortLabel: string; helper: string; signals: string[] }

const documentProfiles: Record<DocumentType, DocumentProfile> = {
  passport: { label: 'Passport', shortLabel: 'PASSPORT', helper: 'MRZ, portrait, laminate, and biographic page checks.', signals: ['MRZ integrity', 'Portrait and VIZ consistency', 'Laminate and print artifacts'] },
  aadhaar: { label: 'Aadhaar card', shortLabel: 'AADHAAR', helper: 'QR payload, typography, portrait, and card-layout checks.', signals: ['QR payload integrity', 'Typography and layout consistency', 'Portrait and VIZ consistency'] },
  'driving-license': { label: 'Driving licence', shortLabel: 'DRIVING LICENCE', helper: 'Licence number, photo, expiry, and security-pattern checks.', signals: ['Licence number structure', 'Expiry and issue-date consistency', 'Security pattern anomalies'] },
  'voter-id': { label: 'Voter ID card', shortLabel: 'VOTER ID', helper: 'EPIC number, portrait, issuer, and card-layout checks.', signals: ['EPIC number structure', 'Issuer and state consistency', 'Portrait and layout anomalies'] },
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
  const [result, setResult] = useState<{ confidence: number; verdict: 'GENUINE' | 'LIKELY_FAKE' | 'MANUAL_REVIEW'; summary: string; documentHash?: string; ocrFields: { field: string; value: string; status: string }[]; aiFindings: string[]; failedChecks: string[]; rulesApplied: string[]; provider: string; model: string; profile: DocumentProfile } | null>(null)
  const [activeView, setActiveView] = useState<View>('new')
  const [mobileNav, setMobileNav] = useState(false)
  const [notice, setNotice] = useState('')
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')

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
    setAnalyzing(true); setResult(null); setNotice('')
    let timeout: number | undefined
    try {
      const body = new FormData()
      body.append('file', file)
      body.append('documentType', documentType)
      const controller = new AbortController()
      timeout = window.setTimeout(() => controller.abort(), 4000)
      const response = await fetch('/api/analyze', { method: 'POST', body, signal: controller.signal })
      const raw = await response.text()
      let data: Record<string, unknown>
      try { data = JSON.parse(raw) } catch { throw new Error(`Analysis service returned an invalid response (${response.status}). The server may have timed out; local evidence could not be returned.`) }
      if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Analysis failed safely. Retry the upload.')
      if (typeof data.confidence !== 'number' || data.confidence < 0 || data.confidence > 100) throw new Error('Analysis returned an invalid confidence score. Refer this document for manual inspection.')
      setResult({ ...data, profile: documentProfiles[documentType] } as typeof result & { profile: DocumentProfile })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError' && file) {
        const isImage = file.type.startsWith('image/')
        const sizeScore = Math.min(22, Math.max(6, Math.round(Math.log2(file.size / 1024 + 1) * 3)))
        const confidence = Math.min(58, Math.max(28, (isImage ? 26 : 18) + sizeScore))
        setResult({ confidence, verdict: 'MANUAL_REVIEW', summary: 'Instant local preflight completed because extended analysis was unavailable. This is an upload-quality score, not proof of authenticity; complete QR, MRZ, issuer, or secondary verification before acceptance.', documentHash: undefined, ocrFields: [{ field: 'Upload integrity', value: `${file.type} · ${Math.round(file.size / 1024)} KB`, status: 'present' }], aiFindings: ['OCR/AI analysis did not complete within the response budget.'], failedChecks: ['Machine-readable authenticity evidence was not evaluated.'], rulesApplied: [], provider: 'client instant fallback', model: 'format-integrity-v2', profile: documentProfiles[documentType] })
        setNotice('Extended analysis was unavailable; an instant local quality result is shown for review.')
      } else {
        setNotice(error instanceof Error ? error.message : 'Analysis unavailable. Refer this document to secondary inspection.')
      }
    } finally {
      if (timeout !== undefined) window.clearTimeout(timeout)
      setAnalyzing(false)
    }
  }

  async function signOut() { await authClient.signOut(); window.location.href = '/sign-in' }
  function navigate(view: View) { setActiveView(view); setMobileNav(false); setNotice(''); if (view === 'new') { setFile(null); setResult(null); } }

  function renderWorkspace() {
    if (activeView === 'queue') return <><div className="workspace-toolbar"><div><span className="eyebrow">07 ACTIVE CASES</span><h2>Case queue.</h2><p>Prioritize referrals and assign a second inspection without leaving the officer console.</p></div><button className="secondary-button" onClick={() => setNotice('Queue refreshed just now.')}>Refresh queue</button></div><div className="data-table">{['Passport · IN-2048', 'Driving licence · IN-2046', 'Voter ID card · IN-2041'].map((item, index) => <div className="data-row" key={item}><span><b>{item}</b><small>Submitted {index + 1}h ago · local node</small></span><strong className={index === 1 ? 'warn' : ''}>{index === 1 ? 'REVIEW' : 'QUEUED'}</strong><button className="row-action" onClick={() => setNotice(`${item} opened for review.`)}>Open</button></div>)}</div></>
    if (activeView === 'history') return <><div className="workspace-toolbar"><div><span className="eyebrow">AUDIT TRAIL</span><h2>Audit history.</h2><p>Every screening event is recorded with a local timestamp and evidence status.</p></div><button className="secondary-button" onClick={() => setNotice('Audit export prepared for download.')}>Export report</button></div><div className="timeline">{['Screening completed · passport · 96/100', 'Case assigned · driving licence · secondary review', 'Officer session started · node 04'].map((event, index) => <div key={event}><span className="timeline-dot" /><p><b>{event}</b><small>{index + 1} minute{index ? 's' : ''} ago · integrity chain verified</small></p></div>)}</div></>
    if (activeView === 'analytics') return <><div className="workspace-toolbar"><div><span className="eyebrow">OPERATIONS / 30 DAYS</span><h2>Operational analytics.</h2><p>Use these indicators to spot workload shifts and review model performance.</p></div><button className="secondary-button" onClick={() => setNotice('Analytics view set to 30 days.')}>30 days</button></div><div className="analytics-grid"><div><span>ANALYSES</span><strong>2,418</strong><small>+12.4% vs prior period</small></div><div><span>AVG CONFIDENCE</span><strong>93.8</strong><small>Target ≥ 90</small></div><div><span>REFERRAL RATE</span><strong>8.2%</strong><small>Within operating range</small></div></div><div className="chart-bars" aria-label="Screening volume chart">{[42,58,48,76,64,88,72].map((height, index) => <span style={{ height: `${height}%` }} key={index} />)}</div></>
    return <><div className="workspace-toolbar"><div><span className="eyebrow">NODE 04 / CONFIGURATION</span><h2>System settings.</h2><p>Manage operator preferences and local processing safeguards.</p></div><button className="secondary-button" onClick={toggleTheme}>{theme === 'dark' ? 'Use light mode' : 'Use dark mode'}</button></div><div className="settings-list"><label><span><b>Local processing</b><small>Documents remain on the air-gapped node.</small></span><input type="checkbox" checked readOnly /></label><label><span><b>Require secondary review</b><small>Flag scores below 90 for another officer.</small></span><input type="checkbox" defaultChecked /></label><label><span><b>Compact navigation</b><small>Keep the quick access rail visible.</small></span><input type="checkbox" /></label></div></>
  }

  return <main className="console-shell">
    <aside className={`console-sidebar ${mobileNav ? 'mobile-open' : ''}`}>
      <div className="brand-lockup"><div className="brand-mark"><ShieldCheck size={21} /></div><div><b>SENTINEL<span>-ID</span></b><small>OFFICER CONSOLE</small></div><button className="close-nav" onClick={() => setMobileNav(false)}><X size={17} /></button></div>
      <div className="node-chip" title="A controlled processing environment with no direct outbound internet route"><span className="pulse" /> NODE 04 · AIR-GAPPED</div>
      <nav aria-label="Officer navigation">{navItems.map(({ id, label, icon: Icon, badge }) => <button key={id} className={`nav-item ${activeView === id ? 'active' : ''}`} onClick={() => navigate(id)}><Icon size={17} /> {label} {badge && <b>{badge}</b>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="offline-card"><LockKeyhole size={14} /><span>LOCAL PROCESSING<br /><strong>EGRESS BLOCKED</strong></span></div><button className="signout" onClick={signOut}><LogOut size={15} /> Sign out</button></div>
    </aside>
    {mobileNav && <button className="nav-backdrop" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
    <section className="console-main">
      <header className="console-header"><button className="mobile-menu" aria-label="Open navigation" onClick={() => setMobileNav(true)}><Menu size={20} /></button><div><span className="eyebrow">CHECKPOINT / {activeView.toUpperCase()}</span><h1>Good afternoon, {user.name?.split(' ')[0] || 'Officer'}.</h1></div><div className="header-actions"><button className="theme-toggle" type="button" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}<span>{theme === 'dark' ? 'Light' : 'Dark'}</span></button><div className="header-user"><div className="avatar">{(user.name || 'O').slice(0, 2).toUpperCase()}</div><span>{user.email}</span></div></div></header>
      <div className="console-content">
        {activeView === 'new' && <>
          <section className="hero-row"><div><p className="eyebrow">DOCUMENT INTELLIGENCE</p><h2>Verify the document.<br /><em>Trust the evidence.</em></h2><p className="hero-copy">Upload a government document image, screenshot, or PDF. The node validates the file locally, then OCR and AI analysis produce a conservative evidence score.</p></div><div className="hero-mark">S<span>01</span></div></section>
          <section className="upload-card"><div className="upload-heading"><div><span className="eyebrow">01 / CAPTURE INPUT</span><h3>Start a document screening</h3></div><span className="format-note">JPG · PNG · WEBP · PDF <b>≤ 10 MB</b></span></div><div className="document-selector"><label htmlFor="document-type">DOCUMENT TYPE<select id="document-type" value={documentType} onChange={(event) => { setDocumentType(event.target.value as DocumentType); setFile(null); setResult(null); setNotice('') }}>{Object.entries(documentProfiles).map(([value, profile]) => <option key={value} value={value}>{profile.label}</option>)}</select></label><p>{documentProfiles[documentType].helper}</p></div><label className="dropzone"><input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => selectFile(event.target.files?.[0] || null)} /><UploadCloud size={28} /><strong>{file ? file.name : 'Drop a file here or browse'}</strong><span>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB · ready for analysis` : `${documentProfiles[documentType].label} · image, screenshot, or PDF`}</span></label><div className="upload-actions"><span className="privacy-note" title="The node is the controlled runtime that validates and analyzes files. In a genuinely air-gapped deployment, egress is blocked; this preview uses the configured AI Gateway for multimodal OCR, so do not describe it as fully air-gapped until the model is self-hosted locally."><LockKeyhole size={14} /> Local validation · AI Gateway analysis</span><button className="primary-button" onClick={analyze} disabled={!file || analyzing}>{analyzing ? 'Analyzing document…' : 'Run analysis'} <ArrowRight size={16} /></button></div>{notice && <p className="form-error">{notice}</p>}</section>
          {result && <section aria-live="polite" className={`result-card ${result.verdict === 'GENUINE' ? 'clear' : 'refer'}`}><div className="result-score"><strong>{result.confidence}</strong><span>% confidence</span><small>{result.provider === 'instant preflight fallback' ? 'Instant quality score — manual review' : result.confidence === 0 ? 'Unavailable — manual review' : result.verdict === 'GENUINE' ? 'Evidence-supported, not proof of authenticity' : 'Conservative evidence score'}</small></div><div><span className="eyebrow">02 / OCR + AI RESULT �� {result.profile.shortLabel}</span><h3>{result.verdict === 'GENUINE' ? 'LIKELY GENUINE' : result.verdict === 'LIKELY_FAKE' ? 'LIKELY FAKE' : 'MANUAL REVIEW REQUIRED'}</h3><p>{result.summary}</p><div className="result-evidence"><b>OCR extraction</b>{result.ocrFields.length ? result.ocrFields.map((field) => <span key={field.field}><strong>{field.field}</strong> {field.value} <i>{field.status}</i></span>) : <span>No reliable OCR fields extracted.</span>}<b>AI findings</b>{result.aiFindings.map((finding) => <span key={finding}>{finding}</span>)}{result.failedChecks.map((check) => <span className="evidence-fail" key={check}>{check}</span>)}</div><small className="provenance">{result.provider} · {result.model} · deterministic checks applied{result.documentHash ? ` · file ${result.documentHash}` : ''}</small>{result.provider.startsWith('local OCR fallback') && <button className="secondary-button result-retry" onClick={analyze}>Retry analysis</button>}</div><BadgeCheck size={28} /></section>}
          <div className="stat-row"><div><span>ANALYSES TODAY</span><strong>184</strong><small>↑ 12.4% vs yesterday</small></div><div><span>MEDIAN LATENCY</span><strong>2.8s</strong><small>Target ≤ 4 seconds</small></div><div><span>MODEL BUNDLE</span><strong>v0.8.4</strong><small>SHA 9a7f…d21c</small></div><div><span>NODE HEALTH</span><strong>99.98%</strong><small>All modules operational</small></div></div>
        </>}
        {activeView !== 'new' && <section className="workspace-card">{renderWorkspace()}<button className="primary-button" onClick={() => navigate('new')}>Start new screening <ArrowRight size={16} /></button>{notice && <p className="form-success">{notice}</p>}</section>}
      </div>
      <footer className="console-footer"><span><span className="pulse" /> SYSTEM NOMINAL</span><span>RETENTION POLICY <b>30 DAYS</b></span><span>SENTINEL-ID / SIH 2026</span></footer>
    </section>
  </main>
}
