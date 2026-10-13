import React, { useState } from "react";
import { Outlet } from "react-router-dom";

import Sidebar from "../Sidebar";
import Header from "../pages/Header";

import "../Sidebar.css"; // ✅ ensure sidebar css loads

const DefaultLayout = () => {
  const [sidebarVisible, setSidebarVisible] = useState(true);

  return (
    <div className="radiology-layout">
      {/* ✅ Fixed Sidebar */}
      <Sidebar visible={sidebarVisible} />

      {/* ✅ Main wrapper (push right so it won’t go under sidebar) */}
      <div className="radiology-wrapper">
        <Header onToggleSidebar={() => setSidebarVisible((v) => !v)} />

        <div className="radiology-body">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export default DefaultLayout;

