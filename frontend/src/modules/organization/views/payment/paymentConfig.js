/* =========================================================================
 *  Payment module — payee details, API helper, formatting.
 *
 *  The QR image is a static file: frontend/public/payment-qr.jpg
 *  (served at /payment-qr.jpg). To change the QR, replace that file and
 *  update the UPI ID below.
 * ======================================================================= */

export const PAYEE = {
  upiId: "krishnabairavi95@okicici",
  qrImage: "/payment-qr.jpg",
};

/* ── API ───────────────────────────────────────────────────────────────── */
// Same base the dashboard uses (VITE_API_BASE_URL = /api in production).
const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env &&
    (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE)) || "";

const getToken = () => {
  try {
    const auth = JSON.parse(localStorage.getItem("auth") || "null");
    if (auth?.token || auth?.access_token) return auth.token || auth.access_token;
  } catch (_) { /* ignore */ }
  return localStorage.getItem("token") || localStorage.getItem("access_token") || "";
};

export const billingApi = async (path, opts = {}) => {
  const token = getToken();
  const res = await fetch(`${API_BASE}/organization/billing${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const d = body?.detail;
    const err = new Error(typeof d === "string" ? d : `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return body;
};

/* ── Formatting ────────────────────────────────────────────────────────── */
// Rs amount with a leading minus for dues: -384 → "-₹384"
export const inr = (n) => {
  const v = Number(n || 0);
  const s = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(Math.abs(v));
  return `${v < 0 ? "-" : ""}₹${s}`;
};

// Date + time in India time: "13 Nov 2026, 14:35"
export const fmtDateTime = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", {
    timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
};

/* ── Seller (who issues the invoice) ───────────────────────────────────────
 * Printed on every invoice. Fields left blank are simply not printed.
 * !! Fill these with the company's real registered details. With a GSTIN set
 * the document is titled "TAX INVOICE", otherwise just "INVOICE".
 *   gstRate : GST % included in the amount paid (0 = no tax lines printed)
 *   state   : seller's state, used to choose CGST+SGST (same state) vs IGST  */
export const SELLER = {
  legalName: "Genphase Technologies Private Limited",
  address: "",
  state: "",
  gstin: "",
  pan: "",
  email: "",
  phone: "",
  sac: "",
  serviceDescription: "Teleradiology reporting services - prepaid account top-up",
  gstRate: 0,
};

// Signed, for ledger rows: +500 / -32
export const inrSigned = (n) => {
  const v = Number(n || 0);
  return `${v > 0 ? "+" : ""}${inr(v)}`;
};
