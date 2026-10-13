import React from 'react'
import './BlurredDashboardBg.css'

const BlurredDashboardBg = () => (
  <div className="bdb-root">
    {/* Sidebar */}
    <div className="bdb-sidebar">
      <div className="bdb-logo">
        <img src="/logo.png" alt="ONIX AI" className="bdb-logo-img" />
      </div>
      <div className="bdb-nav-item bdb-active" />
      <div className="bdb-nav-item" />
      <div className="bdb-nav-item" />
      <div className="bdb-nav-item" />
      <div className="bdb-spacer" />
      <div className="bdb-nav-item bdb-sm" />
      <div className="bdb-nav-item bdb-sm" />
      <div className="bdb-nav-item bdb-sm" />
    </div>

    {/* Main content */}
    <div className="bdb-main">
      {/* Header */}
      <div className="bdb-header">
        <div className="bdb-header-text" />
        <div className="bdb-header-btns">
          <div className="bdb-btn bdb-btn-blue" />
          <div className="bdb-btn" />
          <div className="bdb-btn" />
          <div className="bdb-btn" />
        </div>
      </div>

      {/* Stat cards */}
      <div className="bdb-cards">
        <div className="bdb-card bdb-card-green">
          <div className="bdb-card-label" />
          <div className="bdb-card-value" />
          <div className="bdb-card-sub" />
          <div className="bdb-card-bar" />
        </div>
        <div className="bdb-card bdb-card-blue">
          <div className="bdb-card-label" />
          <div className="bdb-card-value" />
          <div className="bdb-card-sub" />
          <div className="bdb-card-bar" />
        </div>
        <div className="bdb-card bdb-card-orange">
          <div className="bdb-card-label" />
          <div className="bdb-card-value" />
          <div className="bdb-card-sub" />
          <div className="bdb-card-bar" />
        </div>
      </div>

      {/* Bottom panels */}
      <div className="bdb-panels">
        <div className="bdb-panel">
          <div className="bdb-panel-title" />
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bdb-panel-row">
              <div className="bdb-pr-left" />
              <div className="bdb-pr-right" />
            </div>
          ))}
        </div>
        <div className="bdb-panel">
          <div className="bdb-panel-title" />
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bdb-panel-row">
              <div className="bdb-pr-left" />
              <div className="bdb-pr-right bdb-colored" />
            </div>
          ))}
        </div>
        <div className="bdb-panel">
          <div className="bdb-panel-title" />
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bdb-panel-row">
              <div className="bdb-pr-dot" />
              <div className="bdb-pr-left" />
              <div className="bdb-pr-bar" />
              <div className="bdb-pr-right bdb-sm-text" />
            </div>
          ))}
        </div>
      </div>
    </div>

    {/* blur + dark overlay */}
    <div className="bdb-overlay">
      <div className="bdb-overlay-brand">
        <img src="/logo.png" alt="ONIX AI" className="bdb-overlay-logo" />
        <p className="bdb-overlay-tagline">AI-Powered Medical Imaging Platform</p>
      </div>
    </div>
  </div>
)

export default BlurredDashboardBg
