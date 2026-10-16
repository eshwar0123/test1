import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";

// Modules
import RadiologyApp from "./modules/radiologist/RadiologyApp";
import OrganizationApp from "./modules/organization/OrganizationApp";
import AdminApp from "./modules/admin/AdminApp";
import TechnicianApp from "./modules/technician/TechnicianApp";
import PatientViewer from "./modules/share/PatientViewer";

// Auth pages
import Login from "./pages/login/Login";
import RadiologistLogin from "./pages/login/RadiologistLogin";
import OrganizationLogin from "./pages/login/OrganizationLogin";
import TechnicianLogin from "./pages/login/TechnicianLogin";
import Register from "./pages/register/Register";
import RadiologistRegister from "./pages/register/RadiologistRegister";
import OrganizationRegister from "./pages/register/OrganizationRegister";
import TechnicianRegister from "./pages/register/TechnicianRegister";

// Global footer


/* ================= PROTECTED ROUTE ================= */
function ProtectedRoute({ children, loginPath, allowRoles }) {
  const location = useLocation();

  // ✅ your app stores token in localStorage.auth.token
  let authToken = null;
  try {
    const auth = JSON.parse(localStorage.getItem("auth") || "null");
    authToken = auth?.token || null;
  } catch {}

  const token =
    authToken ||
    localStorage.getItem("access_token") ||
    localStorage.getItem("token");

  if (!token) {
    return (
      <Navigate
        to={loginPath}
        replace
        state={{ from: location }} // remember where user wanted to go
      />
    );
  }

  // Optional role gate (used by the Technician portal): the role saved at
  // login must be one of allowRoles, otherwise send them back to login.
  if (allowRoles) {
    let role = "";
    try {
      role = String(JSON.parse(localStorage.getItem("auth") || "null")?.role || "").toLowerCase();
    } catch {}
    if (!allowRoles.includes(role)) {
      return <Navigate to={loginPath} replace />;
    }
  }

  return children;
}

/* ================= GLOBAL LAYOUT ================= */

function Layout() {
  const location = useLocation();

  // hide footer in fullscreen viewers
  const hideFooter =
    location.pathname.includes("/viewer/") ||
    location.pathname.includes("/dcmviewer") ||
    location.pathname.startsWith("/view/");

  return (
    <div className="app-shell">
      <div className="app-main">
        <Routes>
        {/* ========= PUBLIC PATIENT IMAGE LINK (no login) ========= */}
        <Route path="/view/:token" element={<PatientViewer />} />

        {/* ========= GLOBAL REDIRECT ========= */}
          <Route path="/" element={<Navigate to="/login" replace />} />
          {/* ✅ ADD THIS — the missing /login route */}
          <Route path="/login" element={<Login />} />

        {/* ========= RADIOLOGIST AUTH ========= */}
        <Route path="/radiologist/login" element={<RadiologistLogin />} />
        <Route path="/radiologist/signup" element={<RadiologistRegister />} />

        {/* ========= ORGANIZATION AUTH ========= */}
        <Route path="/organization/login" element={<OrganizationLogin />} />
        <Route path="/organization/signup" element={<OrganizationRegister />} />

        {/* Technician */}
        <Route path="/technician/login" element={<TechnicianLogin />} />
        <Route path="/technician/signup" element={<TechnicianRegister />} />

        {/* ========= REGISTER SELECTOR ========= */}
        <Route path="/register" element={<Register />} />
        <Route path="/signup" element={<Register />} />

        {/* ========= ADMIN AUTH ========= */}
        <Route path="/admin/login" element={<Login role="admin" />} />
        <Route path="/admin/signup" element={<Register />} />

        {/* ========= MODULE APPS ========= */}
        <Route
          path="/radiologist/*"
          element={
            <ProtectedRoute loginPath="/radiologist/login">
              <RadiologyApp />
            </ProtectedRoute>
          }
        />

        <Route path="/organization/*" element={<OrganizationApp />} />
        <Route
          path="/technician/*"
          element={
            <ProtectedRoute loginPath="/technician/login" allowRoles={["technician"]}>
              <TechnicianApp />
            </ProtectedRoute>
          }
        />
        <Route path="/admin/*" element={<AdminApp />} />

        {/* ========= FALLBACK ========= */}
        <Route path="*" element={<Navigate to="/radiologist/login" replace />} />
        </Routes>
      </div>

    </div>
  );
}

/* ================= ROOT ================= */

export default function App() {
  return (
    <BrowserRouter>
      <Layout />
    </BrowserRouter>
  );
}
