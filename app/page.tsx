'use client'

import { useState } from 'react'
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  Bell,
  Camera,
  ChevronDown,
  CircleAlert,
  FileCheck2,
  Fingerprint,
  Gauge,
  GitBranch,
  History,
  LayoutDashboard,
  LockKeyhole,
  Menu,
  Network,
  ScanLine,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UserRound,
  Users,
  X,
  Zap,
} from 'lucide-react'

const evidence = [
  { label: 'MRZ integrity', value: 'PASS', detail: '7–3–1 check digits valid', tone: 'good' },
  { label: 'VIZ ↔ MRZ match', value: 'MISMATCH', detail: 'DOB differs at field 06', tone: 'danger' },
  { label: 'Ghost portrait', value: '0.11', detail: 'Near-conclusive mismatch', tone: 'danger' },
  { label: 'Font forensics', value: 'FLAGGED', detail: 'DOB glyphs deviate from page', tone: 'warn' },
  { label: 'Face verification', value: '97.4%', detail: 'Live capture ↔ portrait', tone: 'good' },
]

const signals = [
  ['Double JPEG', 82, 'warn'], ['PRNU noise', 64, 'warn'], ['Copy-move', 92, 'danger'], ['ELA grid', 71, 'warn'],
  ['Glyph forensics', 96, 'danger'], ['Ghost portrait', 98, 'danger'], ['Stamp analysis', 43, 'good'], ['Moiré replay', 12, 'good'],
]

function MetricCard({ label, value, sub, accent = 'cyan' }: { label: string; value: string; sub: string; accent?: 'cyan' | 'amber' | 'red' | 'green' }) {
  return <div className="metric-card">
    <div className={`metric-dot ${accent}`} />
    <div className="metric-label">{label}</div>
    <div className="metric-value">{value}</div>
    <div className="metric-sub">{sub}</div>
  </div>
}

export default function Page() {
  const [activeTab, setActiveTab] = useState('Screening')
  const [showDetails, setShowDetails] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const tabs = [
    { name: 'Screening', icon: ScanLine }, { name: 'Case queue', icon: History }, { name: 'Identity graph', icon: Network }, { name: 'System health', icon: Activity },
  ]

  return <main className="sentinel-shell">
    <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
      <div className="brand-lockup">
        <div className="brand-mark"><ShieldCheck size={21} strokeWidth={2.4} /></div>
        <div><div className="brand-name">SENTINEL<span>-ID</span></div><div className="brand-kicker">OFFLINE SCREENING NODE</div></div>
      </div>
      <div className="node-status"><span className="pulse" /> NODE 04 · AIR-GAPPED</div>
      <nav className="side-nav" aria-label="Primary navigation">
        {tabs.map(({ name, icon: Icon }) => <button key={name} className={`side-link ${activeTab === name ? 'active' : ''}`} onClick={() => { setActiveTab(name); setMenuOpen(false) }}><Icon size={17} /><span>{name}</span>{name === 'Case queue' && <b>07</b>}</button>)}
      </nav>
      <div className="sidebar-footer">
        <div className="offline-card"><LockKeyhole size={14} /><span>All services local<br /><strong>EGRESS BLOCKED</strong></span><i /></div>
        <div className="user-row"><div className="avatar">PS</div><div><strong>Priya Sharma</strong><span>Immigration Officer</span></div><ChevronDown size={15} /></div>
      </div>
    </aside>

    <section className="workspace">
      <header className="topbar">
        <button className="mobile-menu" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle navigation">{menuOpen ? <X size={20} /> : <Menu size={20} />}</button>
        <div className="crumb"><span>CHECKPOINT /</span> NEW SCREENING</div>
        <div className="top-actions"><div className="clock">SHIFT 02 · 14:32:08 IST</div><button className="icon-button" aria-label="Notifications"><Bell size={17} /><i /></button><button className="help-button">Demo mode <ChevronDown size={14} /></button></div>
      </header>

      <div className="content">
        <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> LIVE OPERATIONS</div><h1>Officer console</h1><p>Evidence-first identity screening for checkpoint 04.</p></div><div className="heading-actions"><button className="secondary-button"><Search size={15} /> Search records</button><button className="primary-button" onClick={() => setShowDetails(true)}><ScanLine size={15} /> Start new screening</button></div></div>

        <div className="metric-grid"><MetricCard label="SCREENINGS TODAY" value="184" sub="↑ 12.4% vs. yesterday" /><MetricCard label="MEDIAN LATENCY" value="2.8s" sub="Target ≤ 4.0s" accent="green" /><MetricCard label="REFER RATE" value="6.5%" sub="12 cases need review" accent="amber" /><MetricCard label="NODE HEALTH" value="99.98%" sub="All modules operational" accent="cyan" /></div>

        <div className="screening-grid">
          <section className="panel verdict-panel">
            <div className="panel-header"><div><div className="panel-kicker">LATEST SCREENING <span>· 14:31:54</span></div><h2>Verdict dossier</h2></div><div className="case-id">CASE <strong>SIH-040218</strong></div></div>
            <div className="verdict-banner"><div className="verdict-icon"><CircleAlert size={27} /></div><div><div className="verdict-label">REFER TO SECONDARY INSPECTION</div><p>Multiple independent signals indicate document alteration. Officer decision required.</p></div><div className="risk-score"><strong>0.87</strong><span>CALIBRATED RISK</span></div></div>
            <div className="subject-strip"><div className="passport-avatar"><UserRound size={30} /></div><div><strong>ARJUN MEHTA</strong><span>Indian national · Passport <b>V4520198</b></span></div><div className="subject-meta"><span>DOB</span><strong>14 JUN 1994</strong></div><div className="subject-meta"><span>CAPTURE</span><strong>2.4 MP · 300 DPI</strong></div><button className="round-arrow" aria-label="Open case" onClick={() => setShowDetails(true)}><ArrowRight size={16} /></button></div>
            <div className="evidence-title"><span>TOP EVIDENCE</span><span>5 OF 12 SIGNALS SHOWN</span></div>
            <div className="evidence-list">{evidence.map(item => <div className="evidence-row" key={item.label}><div className={`evidence-status ${item.tone}`}><span />{item.value}</div><div className="evidence-copy"><strong>{item.label}</strong><span>{item.detail}</span></div><ArrowRight size={14} className="evidence-arrow" /></div>)}</div>
            <div className="panel-footer"><button className="text-button" onClick={() => setShowDetails(true)}>View full evidence dossier <ArrowRight size={14} /></button><span className="audit-stamp"><BadgeCheck size={14} /> HASH CHAIN VERIFIED</span></div>
          </section>

          <section className="panel capture-panel">
            <div className="panel-header"><div><div className="panel-kicker">CAPTURE INPUT</div><h2>Document analysis</h2></div><button className="more-button" aria-label="More options">•••</button></div>
            <div className="document-stage"><div className="scan-corner tl" /><div className="scan-corner tr" /><div className="scan-corner bl" /><div className="scan-corner br" /><div className="passport-card"><div className="passport-top"><span>REPUBLIC OF INDIA</span><span>P</span></div><div className="passport-body"><div className="fake-portrait"><UserRound size={24} /></div><div className="passport-lines"><i /><i /><i /><i /><i /></div></div><div className="mrz">P&lt;INDMEHTA&lt;&lt;ARJUN&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;<br />V4520198&lt;1IND9406148M3106142&lt;&lt;&lt;&lt;&lt;&lt;06</div></div><div className="heat-spot one" /><div className="heat-spot two" /><div className="scan-line" /></div>
            <div className="capture-meta"><span><Camera size={14} /> LIVE CAMERA</span><span><Zap size={14} /> 2.8 SEC</span><span><FileCheck2 size={14} /> TD3 / ICAO 9303</span></div>
            <div className="signal-grid">{signals.map(([label, value, tone]) => <div className="signal" key={label}><div><span>{label}</span><strong>{value}%</strong></div><div className="signal-bar"><i className={tone} style={{ width: `${value}%` }} /></div></div>)}</div>
          </section>
        </div>

        <div className="bottom-grid"><section className="panel mini-panel"><div className="panel-header"><div><div className="panel-kicker">PIPELINE LATENCY</div><h2>Last 12 screenings</h2></div><Gauge size={18} className="muted-icon" /></div><div className="latency-bars">{[45, 54, 42, 62, 48, 78, 51, 46, 54, 40, 58, 49].map((height, i) => <div key={i} className="latency-col"><i style={{ height: `${height}%` }} /><span>{i === 11 ? '2.8s' : ''}</span></div>)}</div><div className="chart-axis"><span>14:12</span><span>14:22</span><span>14:32</span></div></section><section className="panel mini-panel"><div className="panel-header"><div><div className="panel-kicker">IDENTITY GRAPH</div><h2>Alias signals today</h2></div><GitBranch size={18} className="muted-icon" /></div><div className="identity-stat"><div className="big-stat">03</div><div><strong>linked identities detected</strong><span>Across 2 nationalities · 4 records</span></div><button className="text-button">Open graph <ArrowRight size={14} /></button></div><div className="identity-nodes"><span>AM</span><span>RK</span><span>VN</span><span>+1</span></div></section></div>
      </div>
      <footer className="status-footer"><span><span className="pulse" /> SYSTEM NOMINAL</span><span>MODEL BUNDLE <b>v0.8.4 · SHA 9a7f…d21c</b></span><span>RETENTION POLICY <b>30 DAYS</b></span><span className="footer-right">SENTINEL-ID / SIH 2026 <Sparkles size={13} /></span></footer>
    </section>

    {showDetails && <div className="dialog-backdrop" onClick={() => setShowDetails(false)}><div className="detail-dialog" onClick={e => e.stopPropagation()}><div className="dialog-header"><div><div className="eyebrow"><span className="eyebrow-line" /> CASE DETAIL</div><h2>SIH-040218 · Arjun Mehta</h2></div><button className="icon-button" onClick={() => setShowDetails(false)} aria-label="Close"><X size={18} /></button></div><div className="dialog-body"><div className="dialog-callout"><CircleAlert size={20} /><div><strong>REFER · calibrated risk 0.87</strong><span>Officer review required. No automated adverse action.</span></div></div><div className="detail-columns"><div><span className="detail-label">PRIMARY REASON</span><strong>DOB field alteration</strong><p>Font-level outlier detected in the visual inspection zone. MRZ value remains 14 JUN 1994.</p></div><div><span className="detail-label">DECISION POLICY</span><strong>Fail-safe direction</strong><p>Forensic service healthy. Evidence dossier is hash-chained and ready for supervisor review.</p></div></div><div className="dialog-actions"><button className="secondary-button" onClick={() => setShowDetails(false)}>Close dossier</button><button className="primary-button" onClick={() => setShowDetails(false)}>Assign to supervisor <ArrowRight size={15} /></button></div></div></div></div>}
  </main>
}
