import { useEffect, useState } from "react";
import { NavLink, Navigate, Outlet } from "react-router-dom";
import { billingApi } from "./paymentConfig";
import "./Payment.css";

/* Shell for the Payment pages. Routes (see ../../routes.js):
 *   /organization/payment        → Balance
 *   /organization/payment/add    → Add Money
 * Only organizations enabled on the server can open it. */
const TABS = [
  { to: "/organization/payment", label: "Balance", end: true },
  { to: "/organization/payment/add", label: "Add Money" },
];

export default function Payment() {
  const [enabled, setEnabled] = useState(null); // null = still checking

  useEffect(() => {
    billingApi("/status")
      .then((d) => setEnabled(!!d.enabled))
      .catch(() => setEnabled(false));
  }, []);

  if (enabled === null) return <div className="pay-page"><p className="pay-muted">Loading…</p></div>;
  if (!enabled) return <Navigate to="/organization/dashboard" replace />;

  return (
    <div className="pay-page">
      <nav className="pay-tabs">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) => `pay-tab${isActive ? " active" : ""}`}
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
