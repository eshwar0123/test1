import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList,
} from "recharts";
import "./Analytics.css";

/* =========================================================================
 *  Organization → Analytics
 *  One request (GET /organization/analytics?date_from&date_to) feeds every card.
 *  Colour = the entity, never the rank:  Completed = blue, In queue = orange
 *  (validated categorical slots 1-2; see Analytics.css for light/dark tokens).
 * ======================================================================= */

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

const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];

const pad = (n) => String(n).padStart(2, "0");
const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;          // m is 0-based
const todayIso = () => { const t = new Date(); return iso(t.getFullYear(), t.getMonth(), t.getDate()); };
const fmtDay = (s) => {
  if (!s) return "";
  const [y, m, d] = s.split("-").map(Number);
  return `${pad(d)} ${MONTHS[m - 1].slice(0, 3)} ${y}`;
};

const SERIES = [
  { key: "completed", label: "Completed", color: "var(--an-s1)" },
  { key: "queue",     label: "In queue",  color: "var(--an-s2)" },
];

/* ── small pieces ──────────────────────────────────────────────────────── */
function Legend() {
  return (
    <div className="an-legend" aria-hidden="true">
      {SERIES.map((s) => (
        <span key={s.key} className="an-legend-item">
          <i className="an-swatch" style={{ background: s.color }} />{s.label}
        </span>
      ))}
    </div>
  );
}

function Tip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload || {};
  const completed = row.completed ?? 0;
  const queue = row.queue ?? 0;
  return (
    <div className="an-tip">
      <div className="an-tip-title">{row.name ?? row.label}</div>
      <div><i className="an-swatch" style={{ background: SERIES[0].color }} />Completed <b>{completed}</b></div>
      <div><i className="an-swatch" style={{ background: SERIES[1].color }} />In queue <b>{queue}</b></div>
      <div className="an-tip-total">Total <b>{completed + queue}</b></div>
    </div>
  );
}

const Tick = ({ x, y, payload }) => {
  const t = String(payload.value);
  const s = t.length > 24 ? `${t.slice(0, 23)}…` : t;
  return (
    <text x={x} y={y} dy={4} textAnchor="end" className="an-tick">
      <title>{t}</title>{s}
    </text>
  );
};

const AXIS_TICK = { fill: "var(--an-muted)", fontSize: 12 };

/* Stacked Completed / In-queue bars. horizontal=true → ranked bars (long names). */
function SplitBars({ rows, nameKey = "name", horizontal = true }) {
  const height = horizontal ? Math.max(170, rows.length * 34 + 36) : 260;
  const common = { stroke: "var(--an-surface)", strokeWidth: 2, stackId: "s" };
  return (
    <ResponsiveContainer width="100%" height={height}>
      {horizontal ? (
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 0 }} barCategoryGap={8}>
          <CartesianGrid horizontal={false} stroke="var(--an-grid)" />
          <XAxis type="number" allowDecimals={false} tick={AXIS_TICK} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey={nameKey} width={170} tick={<Tick />} axisLine={false} tickLine={false} interval={0} />
          <Tooltip content={<Tip />} cursor={{ fill: "var(--an-hover)" }} />
          <Bar dataKey="completed" fill={SERIES[0].color} maxBarSize={22} {...common} />
          <Bar dataKey="queue" fill={SERIES[1].color} maxBarSize={22} radius={[0, 4, 4, 0]} {...common} />
        </BarChart>
      ) : (
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 4, left: -8 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke="var(--an-grid)" />
          <XAxis dataKey={nameKey} tick={AXIS_TICK} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={14} />
          <YAxis allowDecimals={false} tick={AXIS_TICK} axisLine={false} tickLine={false} width={40} />
          <Tooltip content={<Tip />} cursor={{ fill: "var(--an-hover)" }} />
          <Bar dataKey="completed" fill={SERIES[0].color} maxBarSize={28} {...common} />
          <Bar dataKey="queue" fill={SERIES[1].color} maxBarSize={28} radius={[4, 4, 0, 0]} {...common} />
        </BarChart>
      )}
    </ResponsiveContainer>
  );
}

function DataTable({ rows, nameKey, nameLabel }) {
  return (
    <div className="an-table-wrap">
      <table className="an-table">
        <thead>
          <tr><th>{nameLabel}</th><th>Completed</th><th>In queue</th><th>Total</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const c = r.completed ?? 0, q = r.queue ?? 0;
            return (
              <tr key={r[nameKey]}>
                <td>{r[nameKey]}</td><td>{c}</td><td>{q}</td><td><b>{c + q}</b></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* A titled card: chart by default, table on demand (so values are never colour-only). */
function ChartCard({ title, hint, rows, nameKey = "name", nameLabel = "Name", horizontal = true, wide = false }) {
  const [asTable, setAsTable] = useState(false);
  const list = rows || [];
  const empty = list.length === 0 || list.every((r) => (r.completed ?? 0) + (r.queue ?? 0) === 0);
  const summary = `${title}: ` + list.map((r) => `${r[nameKey]} ${(r.completed ?? 0) + (r.queue ?? 0)}`).join(", ");
  return (
    <section className={`an-card${wide ? " an-card--wide" : ""}`}>
      <header className="an-card-head">
        <div>
          <h3 className="an-card-title">{title}</h3>
          {hint && <p className="an-card-hint">{hint}</p>}
        </div>
        <div className="an-card-tools">
          {!empty && !asTable && <Legend />}
          {!empty && (
            <button type="button" className="an-link-btn" onClick={() => setAsTable((v) => !v)}>
              {asTable ? "Chart" : "Table"}
            </button>
          )}
        </div>
      </header>
      {empty ? (
        <p className="an-empty">No cases in this period.</p>
      ) : asTable ? (
        <DataTable rows={list} nameKey={nameKey} nameLabel={nameLabel} />
      ) : (
        <div role="img" aria-label={summary}>
          <SplitBars rows={list} nameKey={nameKey} horizontal={horizontal} />
        </div>
      )}
    </section>
  );
}

function TatCard({ rows }) {
  const list = rows || [];
  return (
    <section className="an-card">
      <header className="an-card-head">
        <div>
          <h3 className="an-card-title">Average turnaround by priority</h3>
          <p className="an-card-hint">Hours from upload to completed report · completed cases only</p>
        </div>
      </header>
      {list.length === 0 ? (
        <p className="an-empty">No completed cases in this period.</p>
      ) : (
        <div role="img" aria-label={"Average turnaround hours: " + list.map((r) => `${r.name} ${r.avg_hours}`).join(", ")}>
          <ResponsiveContainer width="100%" height={Math.max(150, list.length * 44 + 30)}>
            <BarChart data={list} layout="vertical" margin={{ top: 4, right: 48, bottom: 4, left: 0 }} barCategoryGap={10}>
              <CartesianGrid horizontal={false} stroke="var(--an-grid)" />
              <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={80} tick={<Tick />} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: "var(--an-hover)" }}
                content={({ active, payload }) => active && payload?.length ? (
                  <div className="an-tip">
                    <div className="an-tip-title">{payload[0].payload.name}</div>
                    <div>Avg turnaround <b>{payload[0].payload.avg_hours} h</b></div>
                    <div>Completed cases <b>{payload[0].payload.cases}</b></div>
                  </div>
                ) : null}
              />
              <Bar dataKey="avg_hours" fill={SERIES[0].color} maxBarSize={22} radius={[0, 4, 4, 0]}>
                <LabelList dataKey="avg_hours" position="right" formatter={(v) => `${v} h`} className="an-label" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

function Kpi({ label, value, sub }) {
  return (
    <div className="an-kpi">
      <div className="an-kpi-label">{label}</div>
      <div className="an-kpi-value">{value}</div>
      {sub && <div className="an-kpi-sub">{sub}</div>}
    </div>
  );
}

/* ── page ──────────────────────────────────────────────────────────────── */
/* Only organizations enabled on the server can open Insights (see
 * INSIGHTS_ORG_IDS in backend/organization/router.py); everyone else is
 * sent back to the dashboard. */
export default function Analytics() {
  const [enabled, setEnabled] = useState(null); // null = still checking

  useEffect(() => {
    const token = getToken();
    fetch(`${API_BASE}/organization/analytics/status`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => (res.ok ? res.json() : { enabled: false }))
      .then((d) => setEnabled(!!d?.enabled))
      .catch(() => setEnabled(false));
  }, []);

  if (enabled === null) return <div className="an-page"><p className="an-sub">Loading…</p></div>;
  if (!enabled) return <Navigate to="/organization/dashboard" replace />;
  return <InsightsPage />;
}

function InsightsPage() {
  const now = new Date();
  const [mode, setMode] = useState("year");              // month | year | range | all
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [bounds, setBounds] = useState({ first: null, last: null });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const { from, to, label } = useMemo(() => {
    if (mode === "month") {
      const last = new Date(year, month + 1, 0).getDate();
      return { from: iso(year, month, 1), to: iso(year, month, last), label: `${MONTHS[month]} ${year}` };
    }
    if (mode === "year") return { from: iso(year, 0, 1), to: iso(year, 11, 31), label: `${year}` };
    if (mode === "range") {
      return { from: rangeFrom, to: rangeTo, label: rangeFrom && rangeTo ? `${fmtDay(rangeFrom)} – ${fmtDay(rangeTo)}` : "" };
    }
    return { from: bounds.first || "2020-01-01", to: todayIso(), label: "All time" };
  }, [mode, year, month, rangeFrom, rangeTo, bounds.first]);

  useEffect(() => {
    if (!from || !to) return undefined;
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    const token = getToken();
    fetch(`${API_BASE}/organization/analytics?date_from=${from}&date_to=${to}`, {
      signal: ctrl.signal,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(typeof body?.detail === "string" ? body.detail : `HTTP ${res.status}`);
        return body;
      })
      .then((body) => {
        setData(body);
        setBounds({ first: body.case_dates?.first || null, last: body.case_dates?.last || null });
      })
      .catch((e) => { if (e.name !== "AbortError") setError(e.message || "Could not load analytics"); })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
    return () => ctrl.abort();
  }, [from, to]);

  const years = useMemo(() => {
    const thisYear = new Date().getFullYear();
    const first = bounds.first ? Number(bounds.first.slice(0, 4)) : thisYear - 3;
    const list = [];
    for (let y = thisYear; y >= Math.min(first, thisYear); y--) list.push(y);
    return list;
  }, [bounds.first]);

  const k = data?.kpis;
  const gran = data?.range?.granularity === "month" ? "month" : "day";

  return (
    <div className="an-page">
      <div className="an-title-row">
        <div>
          <h1 className="an-title">Insights</h1>
          <p className="an-sub">
            {data?.org_name ? `${data.org_name} · ` : ""}{label || "Choose a date range"}
          </p>
        </div>
      </div>

      {/* Filters — one row above the charts */}
      <div className="an-filters">
        <div className="an-seg" role="tablist" aria-label="Period">
          {[["month", "Month"], ["year", "Year"], ["range", "Date range"], ["all", "All time"]].map(([m, t]) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m}
              className={`an-seg-btn${mode === m ? " active" : ""}`} onClick={() => setMode(m)}>{t}</button>
          ))}
        </div>
        {mode === "month" && (
          <select className="an-input" value={month} onChange={(e) => setMonth(Number(e.target.value))} aria-label="Month">
            {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
          </select>
        )}
        {(mode === "month" || mode === "year") && (
          <select className="an-input" value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Year">
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        )}
        {mode === "range" && (
          <div className="an-range">
            <input type="date" className="an-input" value={rangeFrom} max={rangeTo || undefined}
              onChange={(e) => setRangeFrom(e.target.value)} aria-label="From date" />
            <span>to</span>
            <input type="date" className="an-input" value={rangeTo} min={rangeFrom || undefined}
              onChange={(e) => setRangeTo(e.target.value)} aria-label="To date" />
          </div>
        )}
        {loading && <span className="an-loading">Loading…</span>}
      </div>

      {error && <div className="an-error">{error}</div>}
      {mode === "range" && (!from || !to) && <p className="an-empty">Pick a start and end date to see analytics.</p>}

      {data && from && to && (
        <div className={loading ? "an-fade" : undefined}>
          {/* KPI row */}
          <div className="an-kpis">
            <Kpi label="Total cases" value={k.total} />
            <Kpi label="Completed" value={k.completed}
              sub={k.completion_rate != null ? `${k.completion_rate}% completion rate` : null} />
            <Kpi label="In queue" value={k.queue} />
            <Kpi label="Avg turnaround" value={k.avg_tat_hours != null ? `${k.avg_tat_hours} h` : "—"} sub="completed cases" />
          </div>

          <div className="an-grid">
            <ChartCard wide horizontal={false} nameKey="label" nameLabel={gran === "month" ? "Month" : "Day"}
              title={`Cases received per ${gran}`} hint="Each bar is the cases uploaded that period, split by current status"
              rows={data.trend} />

            <ChartCard title="Cases by modality" hint="Completed vs in queue" nameLabel="Modality" rows={data.modality} />
            <ChartCard title="Cases by study type" hint="Top 10 study types" nameLabel="Study type" rows={data.study_type} />

            <ChartCard title="Cases by priority" nameLabel="Priority" rows={data.priority} />
            <TatCard rows={data.tat_by_priority} />

            <ChartCard title="Referring institution" hint="Where your cases come from · set per case in Edit"
              nameLabel="Institution" rows={data.ref_institution} />
            <ChartCard title="Referring doctor" hint="Top 10 referring doctors" nameLabel="Doctor" rows={data.ref_doctor} />

            <ChartCard title="Radiologist workload" hint="Cases per assigned radiologist" nameLabel="Radiologist" rows={data.radiologist} />
            <ChartCard horizontal={false} title="Patients by age group" nameLabel="Age group" rows={data.age_band} />
            <ChartCard horizontal={false} title="Patients by gender" nameLabel="Gender" rows={data.gender} />
          </div>
        </div>
      )}
    </div>
  );
}
