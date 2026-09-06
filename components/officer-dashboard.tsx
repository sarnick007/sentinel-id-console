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
  const [result, setResult] = useState<{ score: number; verdict: string; profile: DocumentProfile } | null>(null)
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

  function analyze() {
    if (!file) { setNotice(`Choose a ${documentProfiles[documentType].label} file first.`); return }
    setAnalyzing(true); setResult(null); setNotice('')
    window.setTimeout(() => {
      const score = (file.size + documentType.length) % 2 === 0 ? 96 : 87
      setResult({ score, verdict: score > 92 ? 'CLEAR WITH CONFIDENCE' : 'REFER TO SECONDARY INSPECTION', profile: documentProfiles[documentType] })
      setAnalyzing(false)
    }, 900)
  }

  async function signOut() { await authClient.signOut(); window.location.href = '/sign-in' }
  function navigate(view: View) { setActiveView(view); setMobileNav(false); setNotice(''); if (view === 'new') { setFile(null); setResult(null); } }

  return <main className="console-shell">
    <aside className={`console-sidebar ${mobileNav ? 'mobile-open' : ''}`}>
      <div className="brand-lockup"><div className="brand-mark"><ShieldCheck size={21} /></div><div><b>SENTINEL<span>-ID</span></b><small>OFFICER CONSOLE</small></div><button className="close-nav" onClick={() => setMobileNav(false)}><X size={17} /></button></div>
      <div className="node-chip"><span className="pulse" /> NODE 04 · AIR-GAPPED</div>
      <nav aria-label="Officer navigation">{navItems.map(({ id, label, icon: Icon, badge }) => <button key={id} className={`nav-item ${activeView === id ? 'active' : ''}`} onClick={() => navigate(id)}><Icon size={17} /> {label} {badge && <b>{badge}</b>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="offline-card"><LockKeyhole size={14} /><span>LOCAL PROCESSING<br /><strong>EGRESS BLOCKED</strong></span></div><button className="signout" onClick={signOut}><LogOut size={15} /> Sign out</button></div>
    </aside>
    {mobileNav && <button className="nav-backdrop" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
    <section className="console-main">
      <header className="console-header"><button className="mobile-menu" aria-label="Open navigation" onClick={() => setMobileNav(true)}><Menu size={20} /></button><div><span className="eyebrow">CHECKPOINT / {activeView.toUpperCase()}</span><h1>Good afternoon, {user.name?.split(' ')[0] || 'Officer'}.</h1></div><div className="header-actions"><button className="theme-toggle" type="button" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}<span>{theme === 'dark' ? 'Light' : 'Dark'}</span></button><div className="header-user"><div className="avatar">{(user.name || 'O').slice(0, 2).toUpperCase()}</div><span>{user.email}</span></div></div></header>
      <div className="console-content">
        {activeView === 'new' && <>
          <section className="hero-row"><div><p className="eyebrow">DOCUMENT INTELLIGENCE</p><h2>Verify the document.<br /><em>Trust the evidence.</em></h2><p className="hero-copy">Upload a government document image, screenshot, or PDF. SENTINEL-ID returns an explainable confidence score without sending sensitive documents outside the node.</p></div><div className="hero-mark">S<span>01</span></div></section>
          <section className="upload-card"><div className="upload-heading"><div><span className="eyebrow">01 / CAPTURE INPUT</span><h3>Start a document screening</h3></div><span className="format-note">JPG · PNG · WEBP · PDF <b>≤ 10 MB</b></span></div><div className="document-selector"><label htmlFor="document-type">DOCUMENT TYPE<select id="document-type" value={documentType} onChange={(event) => { setDocumentType(event.target.value as DocumentType); setFile(null); setResult(null); setNotice('') }}>{Object.entries(documentProfiles).map(([value, profile]) => <option key={value} value={value}>{profile.label}</option>)}</select></label><p>{documentProfiles[documentType].helper}</p></div><label className="dropzone"><input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => selectFile(event.target.files?.[0] || null)} /><UploadCloud size={28} /><strong>{file ? file.name : 'Drop a file here or browse'}</strong><span>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB · ready for analysis` : `${documentProfiles[documentType].label} · image, screenshot, or PDF`}</span></label><div className="upload-actions"><span className="privacy-note"><LockKeyhole size={14} /> Processed locally · never retained by default</span><button className="primary-button" onClick={analyze} disabled={!file || analyzing}>{analyzing ? 'Analyzing document…' : 'Run analysis'} <ArrowRight size={16} /></button></div>{notice && <p className="form-error">{notice}</p>}</section>
          {result && <section className={`result-card ${result.score > 92 ? 'clear' : 'refer'}`}><div className="result-score"><strong>{result.score}</strong><span>/ 100</span></div><div><span className="eyebrow">02 / CONFIDENCE RESULT · {result.profile.shortLabel}</span><h3>{result.verdict}</h3><p>Demo adapter score for {result.profile.label}. Production inference can plug into the same result contract without changing the officer workflow.</p><div className="signal-list">{result.profile.signals.map((signal) => <span key={signal}><BadgeCheck size={13} /> {signal}</span>)}</div></div><BadgeCheck size={28} /></section>}
          <div className="stat-row"><div><span>ANALYSES TODAY</span><strong>184</strong><small>↑ 12.4% vs yesterday</small></div><div><span>MEDIAN LATENCY</span><strong>2.8s</strong><small>Target ≤ 4 seconds</small></div><div><span>MODEL BUNDLE</span><strong>v0.8.4</strong><small>SHA 9a7f…d21c</small></div><div><span>NODE HEALTH</span><strong>99.98%</strong><small>All modules operational</small></div></div>
        </>}
        {activeView !== 'new' && <section className="workspace-card"><span className="eyebrow">{activeView.toUpperCase()} / OFFICER WORKSPACE</span><h2>{activeView === 'queue' ? 'Case queue.' : activeView === 'history' ? 'Audit history.' : activeView === 'analytics' ? 'Operational analytics.' : 'System settings.'}</h2><p>This workspace is ready for the next SENTINEL-ID module. The navigation is wired so queue management, audit exports, analytics, and node controls can scale without changing the officer workflow.</p><div className="workspace-list"><div><FileCheck2 size={18} /><span>Offline-first processing node</span><b>ONLINE</b></div><div><Activity size={18} /><span>Inference pipeline</span><b>READY</b></div><div><LockKeyhole size={18} /><span>Evidence retention</span><b>30 DAYS</b></div></div><button className="primary-button" onClick={() => navigate('new')}>Start new screening <ArrowRight size={16} /></button><button className="secondary-button" onClick={() => setNotice('Workspace controls are ready for the next module release.')}>View module status</button></section>}
      </div>
      <footer className="console-footer"><span><span className="pulse" /> SYSTEM NOMINAL</span><span>RETENTION POLICY <b>30 DAYS</b></span><span>SENTINEL-ID / SIH 2026</span></footer>
    </section>
  </main>
}
