import { Navigate, Outlet } from "react-router-dom";
import { useUser } from "../../context/UserContext";

const PublicGuard = () => {
  const { user, loading } = useUser();

  // ⛔ VERY IMPORTANT
  // Wait until context finishes loading
  if (loading) return null;

  // If logged in → send to role dashboard
  if (user?.role) {
    const role = user.role.toLowerCase();

    if (role === "admin") return <Navigate to="/admin/dashboard" replace />;
    if (role === "organization") return <Navigate to="/organization/dashboard" replace />;
    return <Navigate to="/radiologist/dashboard" replace />;
  }

  // Not logged in → allow login/register
  return <Outlet />;
};

export default PublicGuard;
