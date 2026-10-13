import React from "react";
import { Routes, Route } from "react-router-dom";
import DefaultLayout from "./layout/DefaultLayout";
import OrgScanViewer from "./views/dashboard/OrgScanViewer";
import routes from "./routes";

export default function OrganizationApp() {
  return (
    <Routes>
      {/* ── Standalone full-page routes (no sidebar / header) ── */}
      <Route path="/scan-view/:caseId" element={<OrgScanViewer />} />

      {/* ── Layout-wrapped routes ── */}
      <Route path="/" element={<DefaultLayout />}>
        {routes.map((route, idx) => (
          <Route
            key={idx}
            path={route.path}
            element={route.element}
          />
        ))}
      </Route>
    </Routes>
  );
}
