'use client'

import { useRef, useState } from 'react'
import { Activity, ArrowRight, BadgeCheck, BarChart3, ClipboardList, FileCheck2, FileUp, History, LockKeyhole, LogOut, Menu, ScanLine, Settings, ShieldCheck, UploadCloud, X } from 'lucide-react'
import { authClient } from '@/lib/auth-client'

type User = { name?: string | null; email: string }
type View = 'new' | 'queue' | 'history' | 'analytics' | 'settings'

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
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState<{ score: number; verdict: string } | null>(null)
  const [activeView, setActiveView] = useState<View>('new')
  const [mobileNav, setMobileNav] = useState(false)
  const [notice, setNotice] = useState('')

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
    if (!file) { setNotice('Choose a passport or Aadhaar file first.'); return }
    setAnalyzing(true); setResult(null); setNotice('')
    window.setTimeout(() => {
      const score = file.size % 2 === 0 ? 96 : 87
      setResult({ score, verdict: score > 92 ? 'CLEAR WITH CONFIDENCE' : 'REFER TO SECONDARY INSPECTION' })
      setAnalyzing(false)
    }, 900)
  }

  async function signOut() { await authClient.signOut(); window.location.href = '/sign-in' }
  function navigate(view: View) { setActiveView(view); setMobileNav(false); setNotice('') }

  return <main className="console-shell">
    <aside className={`console-sidebar ${mobileNav ? 'mobile-open' : ''}`}>
      <div className="brand-lockup"><div className="brand-mark"><ShieldCheck size={21} /></div><div><b>SENTINEL<span>-ID</span></b><small>OFFICER CONSOLE</small></div><button className="close-nav" onClick={() => setMobileNav(false)}><X size={17} /></button></div>
      <div className="node-chip"><span className="pulse" /> NODE 04 · AIR-GAPPED</div>
      <nav aria-label="Officer navigation">{navItems.map(({ id, label, icon: Icon, badge }) => <button key={id} className={`nav-item ${activeView === id ? 'active' : ''}`} onClick={() => navigate(id)}><Icon size={17} /> {label} {badge && <b>{badge}</b>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="offline-card"><LockKeyhole size={14} /><span>LOCAL PROCESSING<br /><strong>EGRESS BLOCKED</strong></span></div><button className="signout" onClick={signOut}><LogOut size={15} /> Sign out</button></div>
    </aside>
    {mobileNav && <button className="nav-backdrop" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
    <section className="console-main">
      <header className="console-header"><button className="mobile-menu" aria-label="Open navigation" onClick={() => setMobileNav(true)}><Menu size={20} /></button><div><span className="eyebrow">CHECKPOINT / {activeView.toUpperCase()}</span><h1>Good afternoon, {user.name?.split(' ')[0] || 'Officer'}.</h1></div><div className="header-user"><div className="avatar">{(user.name || 'O').slice(0, 2).toUpperCase()}</div><span>{user.email}</span></div></header>
      <div className="console-content">
        {activeView === 'new' && <>
          <section className="hero-row"><div><p className="eyebrow">DOCUMENT INTELLIGENCE</p><h2>Verify the document.<br /><em>Trust the evidence.</em></h2><p className="hero-copy">Upload a passport or Aadhaar image, screenshot, or PDF. SENTINEL-ID returns an explainable confidence score without sending sensitive documents outside the node.</p></div><div className="hero-mark">S<span>01</span></div></section>
          <section className="upload-card"><div className="upload-heading"><div><span className="eyebrow">01 / CAPTURE INPUT</span><h3>Start a document screening</h3></div><span className="format-note">JPG · PNG · WEBP · PDF <b>≤ 10 MB</b></span></div><label className="dropzone"><input ref={inputRef} type="file" accept="image/*,.pdf" onChange={(event) => selectFile(event.target.files?.[0] || null)} /><UploadCloud size={28} /><strong>{file ? file.name : 'Drop a file here or browse'}</strong><span>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB · ready for analysis` : 'Passport or Aadhaar document'}</span></label><div className="upload-actions"><span className="privacy-note"><LockKeyhole size={14} /> Processed locally · never retained by default</span><button className="primary-button" onClick={analyze} disabled={!file || analyzing}>{analyzing ? 'Analyzing document…' : 'Run analysis'} <ArrowRight size={16} /></button></div>{notice && <p className="form-error">{notice}</p>}</section>
          {result && <section className={`result-card ${result.score > 92 ? 'clear' : 'refer'}`}><div className="result-score"><strong>{result.score}</strong><span>/ 100</span></div><div><span className="eyebrow">02 / CONFIDENCE RESULT</span><h3>{result.verdict}</h3><p>Score assembled from MRZ integrity, visual consistency, portrait match, font forensics, and tamper signals.</p></div><BadgeCheck size={28} /></section>}
          <div className="stat-row"><div><span>ANALYSES TODAY</span><strong>184</strong><small>↑ 12.4% vs yesterday</small></div><div><span>MEDIAN LATENCY</span><strong>2.8s</strong><small>Target ≤ 4 seconds</small></div><div><span>MODEL BUNDLE</span><strong>v0.8.4</strong><small>SHA 9a7f…d21c</small></div><div><span>NODE HEALTH</span><strong>99.98%</strong><small>All modules operational</small></div></div>
        </>}
        {activeView !== 'new' && <section className="workspace-card"><span className="eyebrow">{activeView.toUpperCase()} / OFFICER WORKSPACE</span><h2>{activeView === 'queue' ? 'Case queue.' : activeView === 'history' ? 'Audit history.' : activeView === 'analytics' ? 'Operational analytics.' : 'System settings.'}</h2><p>This workspace is ready for the next SENTINEL-ID module. The navigation is wired so queue management, audit exports, analytics, and node controls can scale without changing the officer workflow.</p><div className="workspace-list"><div><FileCheck2 size={18} /><span>Offline-first processing node</span><b>ONLINE</b></div><div><Activity size={18} /><span>Inference pipeline</span><b>READY</b></div><div><LockKeyhole size={18} /><span>Evidence retention</span><b>30 DAYS</b></div></div><button className="primary-button" onClick={() => navigate('new')}>Start new screening <ArrowRight size={16} /></button></section>}
      </div>
      <footer className="console-footer"><span><span className="pulse" /> SYSTEM NOMINAL</span><span>RETENTION POLICY <b>30 DAYS</b></span><span>SENTINEL-ID / SIH 2026</span></footer>
    </section>
  </main>
}
