import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import DefaultLayout from './layout/DefaultLayout'

import Dashboard from './views/dashboard/Dashboard'
import AdminAvailability from './views/availability/AvailabilitySchedule'
import AutoAssign from './views/autoassign/AutoAssign'
import Organizations from './views/organizations/Organizations'
import Radiologists from './views/radiologists/Radiologists'
import Profile from './pages/Profile'
import Accounts from './pages/Accounts'
import Help from './pages/Help'
import PrivacyPolicy from './pages/PrivacyPolicy'
import TermsConditions from './pages/TermsConditions'

export default function AdminApp() {
  return (
    <Routes>
      <Route path="/" element={<DefaultLayout />}>
        {/* default */}
        <Route index element={<Navigate to="dashboard" replace />} />

        {/* main */}
        <Route path="dashboard"     element={<Dashboard />} />
        <Route path="organizations" element={<Organizations />} />
        <Route path="radiologists"  element={<Radiologists />} />
        <Route path="availability"  element={<AdminAvailability />} />
        <Route path="auto-assign"   element={<AutoAssign />} />

        {/* profile & info */}
        <Route path="profile"        element={<Profile />} />
        <Route path="accounts"       element={<Accounts />} />
        <Route path="help"           element={<Help />} />
        <Route path="privacy-policy" element={<PrivacyPolicy />} />
        <Route path="terms"          element={<TermsConditions />} />

        {/* fallback */}
        <Route path="*" element={<Navigate to="dashboard" replace />} />
      </Route>
    </Routes>
  )
}
