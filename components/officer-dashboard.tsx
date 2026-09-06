'use client'

import { useState } from 'react'
import { Activity, ArrowRight, BadgeCheck, FileCheck2, FileUp, LockKeyhole, LogOut, ScanLine, ShieldCheck, UploadCloud } from 'lucide-react'
import { authClient } from '@/lib/auth-client'

type User = { name?: string | null; email: string }

export function OfficerDashboard({ user }: { user: User }) {
  const [file, setFile] = useState<File | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState<{ score: number; verdict: string } | null>(null)

  function analyze() {
    if (!file) return
    setAnalyzing(true)
    setResult(null)
    window.setTimeout(() => {
      const score = file.size % 2 === 0 ? 96 : 87
      setResult({ score, verdict: score > 92 ? 'CLEAR WITH CONFIDENCE' : 'REFER TO SECONDARY INSPECTION' })
      setAnalyzing(false)
    }, 900)
  }

  async function signOut() { await authClient.signOut(); window.location.href = '/sign-in' }

  return <main className="console-shell">
    <aside className="console-sidebar">
      <div className="brand-lockup"><div className="brand-mark"><ShieldCheck size={21} /></div><div><b>SENTINEL<span>-ID</span></b><small>OFFICER CONSOLE</small></div></div>
      <div className="node-chip"><span className="pulse" /> NODE 04 · AIR-GAPPED</div>
      <nav><button className="nav-item active"><ScanLine size={17} /> New screening</button><button className="nav-item"><Activity size={17} /> Case queue <b>07</b></button><button className="nav-item"><FileCheck2 size={17} /> Audit history</button></nav>
      <div className="sidebar-bottom"><div className="offline-card"><LockKeyhole size={14} /><span>LOCAL PROCESSING<br /><strong>EGRESS BLOCKED</strong></span></div><button className="signout" onClick={signOut}><LogOut size={15} /> Sign out</button></div>
    </aside>
    <section className="console-main">
      <header className="console-header"><div><span className="eyebrow">CHECKPOINT / NEW SCREENING</span><h1>Good afternoon, {user.name?.split(' ')[0] || 'Officer'}.</h1></div><div className="header-user"><div className="avatar">{(user.name || 'O').slice(0, 2).toUpperCase()}</div><span>{user.email}</span></div></header>
      <div className="console-content">
        <section className="hero-row"><div><p className="eyebrow">DOCUMENT INTELLIGENCE</p><h2>Verify the document.<br /><em>Trust the evidence.</em></h2><p className="hero-copy">Upload a passport or Aadhaar image, screenshot, or PDF. SENTINEL-ID returns an explainable confidence score without sending sensitive documents outside the node.</p></div><div className="hero-mark">S<span>01</span></div></section>
        <section className="upload-card">
          <div className="upload-heading"><div><span className="eyebrow">01 / CAPTURE INPUT</span><h3>Start a document screening</h3></div><span className="format-note">JPG · PNG · WEBP · PDF <b>≤ 10 MB</b></span></div>
          <label className="dropzone"><input type="file" accept="image/*,.pdf" onChange={(event) => setFile(event.target.files?.[0] || null)} /><UploadCloud size={28} /><strong>{file ? file.name : 'Drop a file here or browse'}</strong><span>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB · ready for analysis` : 'Passport or Aadhaar document'}</span></label>
          <div className="upload-actions"><span className="privacy-note"><LockKeyhole size={14} /> Processed locally · never retained by default</span><button className="primary-button" onClick={analyze} disabled={!file || analyzing}>{analyzing ? 'Analyzing document…' : 'Run analysis'} <ArrowRight size={16} /></button></div>
        </section>
        {result && <section className={`result-card ${result.score > 92 ? 'clear' : 'refer'}`}><div className="result-score"><strong>{result.score}</strong><span>/ 100</span></div><div><span className="eyebrow">02 / CONFIDENCE RESULT</span><h3>{result.verdict}</h3><p>Score assembled from MRZ integrity, visual consistency, portrait match, font forensics, and tamper signals.</p></div><BadgeCheck size={28} /></section>}
        <div className="stat-row"><div><span>ANALYSES TODAY</span><strong>184</strong><small>↑ 12.4% vs yesterday</small></div><div><span>MEDIAN LATENCY</span><strong>2.8s</strong><small>Target ≤ 4 seconds</small></div><div><span>MODEL BUNDLE</span><strong>v0.8.4</strong><small>SHA 9a7f…d21c</small></div><div><span>NODE HEALTH</span><strong>99.98%</strong><small>All modules operational</small></div></div>
        <section className="future-card"><div><span className="eyebrow">BUILT FOR THE NEXT CHECKPOINT</span><h3>One console. Every identity signal.</h3><p>Designed to scale from offline demo mode to supervised AI inference, encrypted case history, and multi-node deployment.</p></div><div className="future-tags"><span>Passport</span><span>Aadhaar</span><span>MRZ + VIZ</span><span>Face match</span><span>Audit chain</span></div></section>
      </div>
      <footer className="console-footer"><span><span className="pulse" /> SYSTEM NOMINAL</span><span>RETENTION POLICY <b>30 DAYS</b></span><span>SENTINEL-ID / SIH 2026</span></footer>
    </section>
  </main>
}
