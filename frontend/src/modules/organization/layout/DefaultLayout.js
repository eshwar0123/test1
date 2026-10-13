import { Outlet } from "react-router-dom";
import AppHeader from "../pages/AppHeader";
import AppFooter from "../pages/AppFooter";
import "../pages/Sidebar.css";

const DefaultLayout = () => {
  return (
    <div className="radiology-app organization-app sidebar-collapsed">
      <div className="org-layout">
        <AppHeader />
        <main className="org-main">
          <Outlet />
        </main>
        <AppFooter />
      </div>
    </div>
  );
};

export default DefaultLayout;
