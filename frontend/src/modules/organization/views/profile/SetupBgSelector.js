import React, { useState } from 'react'
import './SetupBgSelector.css'
import OrgSetupModal from './OrgSetupModal'

const OPTIONS = [
  { id: 1, label: 'Branded Welcome' },
  { id: 2, label: 'Split Layout' },
  { id: 3, label: 'Medical Illustration' },
  { id: 4, label: 'Blurred Dashboard' },
]

/* ── mock dashboard behind option 4 ── */
const MockDashboard = () => (
  <div className="sbg-mock-dash">
    <div className="sbg-mock-sidebar">
      <div className="sbg-mock-logo" />
      {[...Array(4)].map((_, i) => <div key={i} className="sbg-mock-nav-item" />)}
    </div>
    <div className="sbg-mock-main">
      <div className="sbg-mock-header" />
      <div className="sbg-mock-cards">
        {[...Array(3)].map((_, i) => <div key={i} className="sbg-mock-card" />)}
      </div>
      <div className="sbg-mock-rows">
        {[...Array(4)].map((_, i) => <div key={i} className="sbg-mock-row" />)}
      </div>
    </div>
  </div>
)

/* ── background renderers ── */
const Bg1 = () => (
  <div className="sbg-bg sbg-bg1">
    <div className="sbg-bg1-circle sbg-bg1-c1" />
    <div className="sbg-bg1-circle sbg-bg1-c2" />
    <div className="sbg-bg1-circle sbg-bg1-c3" />
    <div className="sbg-brand-center">
      <div className="sbg-brand-logo">
        <span className="sbg-brand-icon">⊙</span>
        <span className="sbg-brand-name">ONIX AI</span>
      </div>
      <p className="sbg-brand-tagline">AI-Powered Medical Imaging Platform</p>
      <div className="sbg-brand-features">
        <span>✦ DICOM Viewer</span>
        <span>✦ AI Diagnostics</span>
        <span>✦ Radiology Reports</span>
      </div>
    </div>
  </div>
)

const Bg2 = () => (
  <div className="sbg-bg sbg-bg2">
    <div className="sbg-bg2-left">
      <div className="sbg-bg2-logo">
        <span className="sbg-brand-icon">⊙</span>
        <span className="sbg-brand-name">ONIX AI</span>
      </div>
      <h2 className="sbg-bg2-heading">Welcome to<br />ONIX AI</h2>
      <p className="sbg-bg2-sub">AI-Powered Medical Imaging Platform</p>
      <div className="sbg-bg2-features">
        <div className="sbg-bg2-feat"><span className="sbg-feat-dot" />DICOM & NIfTI Viewer</div>
        <div className="sbg-bg2-feat"><span className="sbg-feat-dot" />AI-Assisted Diagnostics</div>
        <div className="sbg-bg2-feat"><span className="sbg-feat-dot" />Radiology Reports</div>
        <div className="sbg-bg2-feat"><span className="sbg-feat-dot" />Multi-Org Management</div>
      </div>
    </div>
    <div className="sbg-bg2-right" />
  </div>
)

const Bg3 = () => (
  <div className="sbg-bg sbg-bg3">
    <div className="sbg-bg3-overlay" />
    <div className="sbg-bg3-body-hint">
      <div className="sbg-body-svg">
        {/* Simple human silhouette using SVG */}
        <svg viewBox="0 0 200 500" xmlns="http://www.w3.org/2000/svg" opacity="0.18">
          <circle cx="100" cy="45" r="38" fill="white" />
          <rect x="62" y="88" width="76" height="130" rx="20" fill="white" />
          <rect x="20" y="95" width="40" height="110" rx="15" fill="white" />
          <rect x="140" y="95" width="40" height="110" rx="15" fill="white" />
          <rect x="62" y="215" width="33" height="150" rx="15" fill="white" />
          <rect x="105" y="215" width="33" height="150" rx="15" fill="white" />
          <rect x="55" y="360" width="36" height="100" rx="12" fill="white" />
          <rect x="109" y="360" width="36" height="100" rx="12" fill="white" />
        </svg>
      </div>
      <div className="sbg-bg3-brand">
        <span className="sbg-brand-icon" style={{color:'#fff'}}>⊙</span>
        <span className="sbg-brand-name" style={{color:'#fff'}}>ONIX AI</span>
      </div>
      <p className="sbg-bg3-tag">Medical Imaging Intelligence</p>
    </div>
  </div>
)

const Bg4 = () => (
  <div className="sbg-bg sbg-bg4">
    <MockDashboard />
    <div className="sbg-bg4-overlay" />
  </div>
)

const BG_MAP = { 1: <Bg1 />, 2: <Bg2 />, 3: <Bg3 />, 4: <Bg4 /> }

const SetupBgSelector = ({ onSelect }) => {
  const [active, setActive] = useState(1)
  const [confirming, setConfirming] = useState(false)

  if (confirming) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 99999 }}>
        {BG_MAP[active]}
        <OrgSetupModal onComplete={onSelect} />
      </div>
    )
  }

  return (
    <div className="sbg-root">
      {/* live background preview */}
      <div className="sbg-preview-area">
        {BG_MAP[active]}
      </div>

      {/* top option tabs */}
      <div className="sbg-tab-bar">
        <span className="sbg-tab-label">Choose background style:</span>
        {OPTIONS.map(o => (
          <button
            key={o.id}
            className={`sbg-tab ${active === o.id ? 'active' : ''}`}
            onClick={() => setActive(o.id)}
          >
            {o.id}. {o.label}
          </button>
        ))}
        <button className="sbg-use-btn" onClick={() => setConfirming(true)}>
          Use This →
        </button>
      </div>
    </div>
  )
}

export default SetupBgSelector
