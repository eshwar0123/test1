// src/modules/radiologist/pages/dashboard/useAssignedCases.js
// ─────────────────────────────────────────────────────────────────────────────
// Hook that fetches the logged-in radiologist's assigned cases from the backend.
// Also exposes accept() and reject() actions.
//
// Backend endpoints (services/accept_case.py via radiologist/assigned_cases_router.py):
//   GET    /api/radiologist/assigned-cases?status=pending_acceptance
//   POST   /api/radiologist/assigned-cases/{case_id}/accept
//   POST   /api/radiologist/assigned-cases/{case_id}/reject  { reason }
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE || "/api";

function getAuthToken() {
  try {
    const auth = JSON.parse(localStorage.getItem("auth") || "{}");
    return auth.token || "";
  } catch {
    return "";
  }
}

function authHeaders() {
  const t = getAuthToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export default function useAssignedCases({ status = "pending_acceptance", pollMs = 10000 } = {}) {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchCases = useCallback(async () => {
    try {
      setError(null);
      const url = `${API_BASE}/radiologist/assigned-cases?status=${encodeURIComponent(status)}&limit=100`;
      const res = await fetch(url, { headers: authHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCases(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("[useAssignedCases]", e);
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [status]);

  // Initial load + polling
  useEffect(() => {
    setLoading(true);
    fetchCases();
    if (pollMs > 0) {
      const id = setInterval(fetchCases, pollMs);
      return () => clearInterval(id);
    }
  }, [fetchCases, pollMs]);

  const accept = useCallback(async (caseId) => {
    const res = await fetch(
      `${API_BASE}/radiologist/assigned-cases/${encodeURIComponent(caseId)}/accept`,
      { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() } }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
      throw new Error(err.detail || "Accept failed");
    }
    await fetchCases();
    return res.json();
  }, [fetchCases]);

  const reject = useCallback(async (caseId, reason = "") => {
    const res = await fetch(
      `${API_BASE}/radiologist/assigned-cases/${encodeURIComponent(caseId)}/reject`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ reason }),
      }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
      throw new Error(err.detail || "Reject failed");
    }
    await fetchCases();
    return res.json();
  }, [fetchCases]);

  return { cases, loading, error, refresh: fetchCases, accept, reject };
}
