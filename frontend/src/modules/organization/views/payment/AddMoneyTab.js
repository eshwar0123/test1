import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PAYEE, billingApi, inr } from "./paymentConfig";

const CopyIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="7" width="12" height="14" rx="2.5" />
    <path d="M9 4.5A1.5 1.5 0 0 1 10.5 3H17.5A3.5 3.5 0 0 1 21 6.5V15.5A1.5 1.5 0 0 1 19.5 17" />
  </svg>
);

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a"
       strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_) {
    // clipboard API needs https; fall back for plain-http dev servers
    const t = document.createElement("textarea");
    t.value = text;
    t.style.position = "fixed";
    t.style.opacity = "0";
    document.body.appendChild(t);
    t.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (__) { /* ignore */ }
    document.body.removeChild(t);
    return ok;
  }
};

const CopyBtn = ({ value }) => {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button" className="pay-copy" title={done ? "Copied" : "Copy"} aria-label="Copy"
      onClick={async () => {
        if (await copyText(value)) {
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        }
      }}
    >
      {done ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
};

export default function AddMoneyTab() {
  const navigate = useNavigate();
  const [balance, setBalance] = useState(null);
  const [amount, setAmount] = useState("");
  const [utr, setUtr] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    billingApi("/summary").then((d) => {
      setBalance(d.balance);
      // Suggest clearing the due amount.
      if (d.balance < 0) setAmount(String(Math.abs(d.balance)));
    }).catch((e) => setError(e.message));
  }, []);

  const amt = Number(amount);
  const amtOk = Number.isFinite(amt) && amt > 0;
  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!amtOk) { setError("Enter the amount you paid."); return; }
    if (!/^[A-Za-z0-9]{6,40}$/.test(utr.trim())) {
      setError("Enter the 6–40 character transaction reference (UTR) from your payment.");
      return;
    }
    setSaving(true);
    try {
      await billingApi("/pay", {
        method: "POST",
        body: JSON.stringify({ amount: amt, payment_ref: utr.trim() }),
      });
      navigate("/organization/payment");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="pay-account-grid" onSubmit={submit} noValidate>
      <div className="pay-card">
        <h2 className="pay-card-title">Add money</h2>
        <p className="pay-muted">
          {balance === null ? "" : `Current balance: ${inr(balance)}. `}
          Pay using the QR or UPI ID, then enter the amount and transaction reference.
        </p>

        <div className="pay-form">
          <label className="pay-field wide">
            <span>Amount paid (₹)</span>
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label className="pay-field wide">
            <span>UPI / bank transaction reference (UTR)</span>
            <input value={utr} onChange={(e) => setUtr(e.target.value)} />
          </label>
        </div>

        {error && <div className="pay-error">{error}</div>}
        <div className="pay-actions">
          <button type="submit" className="pay-btn pay-btn--primary" disabled={saving}>
            {saving ? "Submitting…" : "I have paid — update balance"}
          </button>
        </div>
      </div>

      <div className="pay-card pay-center pay-qr-card">
        <h3 className="pay-section-label">Scan &amp; Pay</h3>
        <img className="pay-qr" src={PAYEE.qrImage} alt="UPI QR code" />
        <p className="pay-muted">Scan with any UPI app and enter the amount.</p>
        <div className="pay-upi-line">
          <span className="pay-kv-label">UPI ID</span>
          <span className="pay-kv-value">
            {PAYEE.upiId}
            <CopyBtn value={PAYEE.upiId} />
          </span>
        </div>
      </div>
    </form>
  );
}
