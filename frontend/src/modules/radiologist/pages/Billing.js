import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../../shared/api/axios";
import "./Billing.css";

const inr = (n) =>
  `₹${new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n || 0))}`;

const monthLabel = (ym) => {
  if (!ym || ym === "all") return "All time";
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-GB", { month: "long", year: "numeric" });
};

const CATEGORY_LABEL = { xray: "X-ray", mri: "MRI", ct: "CT", other: "Other" };

export default function Billing() {
  const navigate = useNavigate();
  const [month, setMonth] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    api
      .get("/radiology/earnings/summary", { params: month ? { month } : {} })
      .then((res) => { if (!cancelled) setData(res.data); })
      .catch((e) => {
        if (cancelled) return;
        if (e?.response?.status === 403) navigate("/radiologist/repository1", { replace: true });
        else setError(e?.response?.data?.detail || "Could not load billing.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [month, navigate]);

  if (!data) {
    return (
      <div className="bill-wrap">
        <h1 className="bill-title">Billing</h1>
        {error ? <div className="bill-error">{error}</div> : <p className="bill-muted">Loading…</p>}
      </div>
    );
  }

  const cats = ["xray", "mri", "ct", "other"].filter((k) => data.by_category[k]);

  return (
    <div className="bill-wrap">
      <div className="bill-head">
        <h1 className="bill-title">Billing</h1>
        <select className="bill-select" value={month} onChange={(e) => setMonth(e.target.value)}>
          <option value="">All time</option>
          {data.months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
      </div>

      {error && <div className="bill-error">{error}</div>}

      <div className="bill-grid">
        <div className="bill-card bill-earn">
          <span className="bill-label">Earnings · {monthLabel(data.month)}</span>
          <div className="bill-amount">{inr(data.total_earnings)}</div>
          <span className="bill-muted">{data.total_cases} completed case{data.total_cases === 1 ? "" : "s"}</span>
        </div>

        {cats.map((k) => (
          <div className="bill-card" key={k}>
            <span className="bill-label">{CATEGORY_LABEL[k]}</span>
            <div className="bill-amount bill-amount--sm">{inr(data.by_category[k].amount)}</div>
            <span className="bill-muted">{data.by_category[k].cases} case{data.by_category[k].cases === 1 ? "" : "s"}</span>
          </div>
        ))}
      </div>

      {data.unpriced_cases > 0 && (
        <div className="bill-warn">
          {data.unpriced_cases} case{data.unpriced_cases === 1 ? " has" : "s have"} no matching rate yet and
          {data.unpriced_cases === 1 ? " is" : " are"} counted as ₹0.00 (marked “No rate”).
        </div>
      )}

      <div className="bill-card">
        <h2 className="bill-sub">Completed cases</h2>
        <div className="bill-table-wrap">
          <table className="bill-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Case ID</th>
                <th>Patient</th>
                <th>Organization</th>
                <th>Examination</th>
                <th className="num">Payout</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={6} className="bill-empty">Loading…</td></tr>}
              {!loading && !data.cases.length && <tr><td colSpan={6} className="bill-empty">No completed cases.</td></tr>}
              {data.cases.map((c) => (
                <tr key={c.case_id}>
                  <td>{c.date}<span className="bill-time"> {c.time}</span></td>
                  <td>{c.case_id}</td>
                  <td>{c.patient_name}</td>
                  <td>{c.organization}</td>
                  <td>
                    {c.modality} · {c.study}
                    {c.match === "approx" && <span className="bill-tag" title={`Matched to: ${c.exam}`}>approx</span>}
                    {c.match === "none" && <span className="bill-tag bill-tag--none">No rate</span>}
                  </td>
                  <td className="num">{inr(c.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
