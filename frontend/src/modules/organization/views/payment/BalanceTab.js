import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { billingApi, fmtDateTime, inr, inrSigned } from "./paymentConfig";
import { printInvoice } from "./invoicePrint";

const DownloadIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

export default function BalanceTab() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    billingApi("/summary").then(setData).catch((e) => setError(e.message));
  }, []);

  const download = async (row) => {
    // Open the window synchronously so popup blockers allow it.
    const win = window.open("", "_blank");
    if (!win) { setError("Allow pop-ups to download the invoice."); return; }
    setBusyId(row.payment_id);
    try {
      const d = await billingApi(`/payments/${row.payment_id}/invoice`);
      printInvoice(win, d.invoice);
    } catch (e) {
      win.close();
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  };

  if (!data) return error ? <div className="pay-error">{error}</div> : <p className="pay-muted">Loading…</p>;

  const due = data.balance < 0;

  return (
    <>
      <div className="pay-balance-row">
        <div className="pay-card pay-balance-card">
          <span className="pay-section-label">Current balance</span>
          <div className={`pay-balance ${due ? "due" : "ok"}`}>{inr(data.balance)}</div>
          <p className="pay-muted" style={{ marginBottom: 0 }}>
            {due ? "Amount due — add money to clear it." : "Credit available."}
          </p>
          <Link to="/organization/payment/add" className="pay-btn pay-btn--primary" style={{ marginTop: 14 }}>
            Add Money
          </Link>
        </div>

        <div className="pay-card pay-stats">
          <div className="pay-kv"><span className="pay-kv-label">Opening balance</span><span className="pay-kv-value">{inr(data.opening_balance)}</span></div>
          <div className="pay-kv"><span className="pay-kv-label">Payments received</span><span className="pay-kv-value">{inr(data.total_paid)}</span></div>
          <div className="pay-kv"><span className="pay-kv-label">X-ray cases completed since {data.charge_from}</span><span className="pay-kv-value">{data.xray_cases}</span></div>
          <div className="pay-kv"><span className="pay-kv-label">Charged (by number of views)</span><span className="pay-kv-value">{inr(-data.total_charged)}</span></div>
        </div>
      </div>

      <div className="pay-card">
        <h2 className="pay-card-title">Transactions</h2>
        {error && <div className="pay-error">{error}</div>}
        <div className="pay-table-wrap">
          <table className="pay-table">
            <thead>
              <tr>
                <th>Date &amp; time</th>
                <th>Transaction ID</th>
                <th>Description</th>
                <th className="num">Amount</th>
                <th className="center">Invoice</th>
              </tr>
            </thead>
            <tbody>
              {!data.ledger.length && <tr><td colSpan={5} className="pay-empty">No transactions yet.</td></tr>}
              {data.ledger.map((r, i) => (
                <tr key={`${r.kind}-${r.payment_id || r.case_id}-${i}`}>
                  <td>{r.kind === "payment" ? fmtDateTime(r.datetime) : r.date}</td>
                  <td>{r.kind === "payment" ? r.transaction_id : r.case_id}</td>
                  <td>{r.description}</td>
                  <td className={`num pay-amt ${r.amount < 0 ? "neg" : "pos"}`}>{inrSigned(r.amount)}</td>
                  <td className="center">
                    {r.kind === "payment" && (
                      <button
                        type="button" className="pay-icon-btn" title={`Download invoice ${r.invoice_number}`}
                        disabled={busyId === r.payment_id} onClick={() => download(r)}
                      >
                        <DownloadIcon />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
