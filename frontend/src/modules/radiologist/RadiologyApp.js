import React, { useState, useEffect } from "react";
import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";

import Header from "./pages/Header";
import Footer from "./pages/Footer";
import Summary from "./Summary";
import Dashboard from "./pages/dashboard/Dashboard";
import Profile from "./pages/Profile";
import Viewer from "./pages/Viewer";
import DicomViewer from "./pages/Dicomviewer";
import HelpPage from "./pages/HelpPage";
import PrivacyPage from "./pages/PrivacyPage";
import TermsPage from "./pages/TermsPage";
import DocsPage from "./pages/DocsPage";
import Accounts from "./pages/Accounts";
import Repository1 from "./pages/repository_1";
import Settings from "./views/Settings";

import "@coreui/coreui/dist/css/coreui.min.css";
import "./Sidebar.css";
import "./pages/Header.css";
import "./darkmode.css";

export default function RadiologyApp() {
  const navigate = useNavigate();
  const location = useLocation();
  const [darkMode, setDarkMode] = useState(
    () => localStorage.getItem('darkMode') === 'true'
  );
  const [exitTarget, setExitTarget] = useState(null);

  const isViewerRoute = location.pathname.includes('/dcmviewer');

  useEffect(() => {
    setExitTarget(null);
  }, [location.pathname]);

  useEffect(() => {
    if (exitTarget) {
      navigate(exitTarget);
    }
  }, [exitTarget, navigate]);

  const toggleDarkMode = () => {
    setDarkMode(prev => {
      localStorage.setItem('darkMode', String(!prev));
      return !prev;
    });
  };

  return (
    <div
      className={`radiology-app ${darkMode ? "dark" : ""}`}
      style={isViewerRoute ? { height: "100vh", overflow: "hidden" } : undefined}
    >
      <div className="wrapper flex-grow-1">
        {!isViewerRoute && (
          <Header
            darkMode={darkMode}
            toggleDarkMode={toggleDarkMode}
          />
        )}

        <div
          className={`body flex-grow-1${isViewerRoute ? "" : " px-4 py-3"}`}
          style={{ paddingBottom: isViewerRoute ? 0 : "56px" }}
        >
          {exitTarget && isViewerRoute ? (
            <div style={{ width: "100%", height: "100%", background: "#0b0f16" }} />
          ) : (
            <div className={isViewerRoute ? "" : "container-fluid px-3"}>
              <Routes>
                <Route index element={<Navigate to="/radiologist/repository1" replace />} />
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="viewer/:scanId" element={<Viewer />} />
                <Route path="dcmviewer" element={<DicomViewer />} />
                <Route path="dcmviewer-cpu" element={<DicomViewer />} />
                <Route path="profile" element={<Profile />} />
                <Route path="settings" element={<Settings />} />
                <Route path="help" element={<HelpPage />} />
                <Route path="privacy" element={<PrivacyPage />} />
                <Route path="terms" element={<TermsPage />} />
                <Route path="docs" element={<DocsPage />} />
                <Route path="accounts" element={<Accounts />} />
                <Route path="repository1" element={<Repository1 />} />
                <Route path="*" element={<Navigate to="/radiologist/repository1" replace />} />
              </Routes>
            </div>
          )}
        </div>
      </div>

      {!isViewerRoute && <Footer />}
    </div>
  );
}
