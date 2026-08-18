import React from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useUser } from "../../context/UserContext";

/*
  RoleGuard protects route groups

  Usage:
  <Route element={<RoleGuard allow={["admin"]} />}>
      <Route path="/admin/*" element={<AdminApp />} />
  </Route>
*/

const normalize = (v) => String(v ?? "").toLowerCase().trim();

const RoleGuard = ({ allow }) => {
  const { user, loading } = useUser();

  // wait until user is loaded (important after refresh)
  if (loading) return null;

  const role = normalize(user?.role);

  // not logged in
  if (!role) {
    return <Navigate to="/login" replace />;
  }

  // allow all logged users
  if (!allow) {
    return <Outlet />;
  }

  const allowedRoles = Array.isArray(allow)
    ? allow.map(normalize)
    : [normalize(allow)];

  const isAllowed = allowedRoles.includes(role);

  // wrong role -> redirect to their own dashboard
  if (!isAllowed) {
    const fallback =
      role === "admin"
        ? "/admin/dashboard"
        : role === "organization"
        ? "/organization/dashboard"
        : "/radiologist/dashboard";

    return <Navigate to={fallback} replace />;
  }

  // access granted
  return <Outlet />;
};

export default RoleGuard;
