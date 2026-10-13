import { useState, useEffect } from 'react'
import { CSidebar, CSidebarBrand, CSidebarNav, CNavItem } from '@coreui/react'
import { cilUser } from '@coreui/icons'

import './Sidebar.css' // ✅ ADD THIS

import CIcon from '@coreui/icons-react'
import {
  cilSpeedometer,
  cilCalendar,
  cilSettings,
  cilContact,
  cilDescription,
  cilNotes,
} from '@coreui/icons'
import { NavLink } from 'react-router-dom'
import logo from '/logo.png'
import logoDark from '/logolight.png'

const Sidebar = ({ visible }) => {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [isDark, setIsDark] = useState(
    () => document.documentElement.getAttribute('data-theme') === 'dark'
  )

  useEffect(() => {
    const observer = new MutationObserver(() =>
      setIsDark(document.documentElement.getAttribute('data-theme') === 'dark')
    )
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  return (
    <CSidebar
      visible={visible}
      onHide={() => {}}
      className={`sidebar gp-sidebar ${visible ? '' : 'is-collapsed'}`}
      unfoldable={false}
      colorScheme="dark"
    >
      {/* ===== BRAND (TOP) ===== */}
      <CSidebarBrand className="sidebar-brand gp-brand">
        <img
          src={isDark ? logoDark : logo}
          alt="Logo"
          className="gp-logo"
          style={{
            height: 'auto',
            width: '160px',
            display: 'block',
            margin: '0 auto',
          }}
        />
      </CSidebarBrand>
      <div className="logo-divider" />

      {/* ✅ Full height flex column */}
      <CSidebarNav className="sidebar-nav-flex gp-nav">
        {/* ===== MAIN NAV ===== */}
        <CNavItem>
          <NavLink
            to="/organization/dashboard"
            className={({ isActive }) => `gp-link ${isActive ? 'active' : ''}`}
          >
            <CIcon icon={cilSpeedometer} className="gp-ic" />
            <span>Dashboard</span>
          </NavLink>
        </CNavItem>

        <CNavItem>
          <NavLink
            to="/organization/upload"
            className={({ isActive }) => `gp-link ${isActive ? 'active' : ''}`}
          >
            <CIcon icon={cilCalendar} className="gp-ic" />
            <span>Upload</span>
          </NavLink>
        </CNavItem>

        {/* SETTINGS (dropdown inside sidebar) */}
        <CNavItem className="gp-settings-item">
          <button
            type="button"
            className={`gp-link gp-settings-btn ${settingsOpen ? 'open' : ''}`}
            onClick={() => setSettingsOpen((s) => !s)}
          >
            <CIcon icon={cilSettings} className="gp-ic" />
            <span>Settings</span>
            <span className={`gp-chevron ${settingsOpen ? 'rot' : ''}`}>▾</span>
          </button>

          {settingsOpen && (
            <div className="gp-submenu">
              <NavLink
                to="/organization/profile"
                className={({ isActive }) => `gp-link ${isActive ? 'active' : ''}`}
              >
                <CIcon icon={cilUser} className="gp-ic" />
                <span>Profile</span>
              </NavLink>

              <NavLink
                to="/organization/accounts"
                className={({ isActive }) => `gp-link ${isActive ? 'active' : ''}`}
              >
                <CIcon icon={cilContact} className="gp-ic" />
                <span>Account</span>
              </NavLink>
            </div>
          )}
        </CNavItem>

        {/* ✅ Spacer pushes footer to bottom */}
        <div className="sidebar-spacer" />

        {/* ===== FOOTER (LIKE LOMA) ===== */}
        <div className="gp-footer">
          <div className="gp-footer-divider" />

          <NavLink
            to="/organization/help"
            className={({ isActive }) => `gp-foot-link ${isActive ? 'active' : ''}`}
          >
            <CIcon icon={cilContact} className="gp-ic" />
            <span>Help</span>
          </NavLink>

          <NavLink
            to="/organization/privacy"
            className={({ isActive }) => `gp-foot-link ${isActive ? 'active' : ''}`}
          >
            <CIcon icon={cilDescription} className="gp-ic" />
            <span>Privacy Policy</span>
          </NavLink>

          <NavLink
            to="/organization/terms"
            className={({ isActive }) => `gp-foot-link ${isActive ? 'active' : ''}`}
          >
            <CIcon icon={cilNotes} className="gp-ic" />
            <span>Terms & Conditions</span>
          </NavLink>

          <div className="gp-version">Version: v1.0.0</div>
        </div>
      </CSidebarNav>
    </CSidebar>
  )
}

export default Sidebar
