import React, { Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { CSpinner } from "@coreui/react";

import RadiologistLayout from "./modules/radiologist/layout/DefaultLayout";
import OrganizationLayout from "./modules/organization/layout/DefaultLayout";

import RadiologistDashboard from "./modules/radiologist/views/dashboard/Dashboard";
import OrganizationDashboard from "./modules/organization/views/dashboard/Dashboard";

export default function AppContent() {
  return (
    <Suspense fallback={<CSpinner color="primary" />}>
      <Routes>

        {/* Radiologist */}
        <Route path="radiologist" element={<RadiologistLayout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<RadiologistDashboard />} />
        </Route>

        {/* Organization */}
        <Route path="organization" element={<OrganizationLayout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<OrganizationDashboard />} />
        </Route>

        {/* Default */}
        <Route path="*" element={<Navigate to="radiologist/dashboard" replace />} />

      </Routes>
    </Suspense>
  );
}
