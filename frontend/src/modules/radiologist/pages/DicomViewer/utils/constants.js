export const BACKEND_URL = "/api";

// nginx proxies /uploads/* straight to the backend's static mount — it is NOT
// behind /api (confirmed: https://onixai.in/uploads/... works, .../api/uploads/...
// 404s). So unlike API calls, uploads URLs must NOT be prefixed with BACKEND_URL.
const toPublicUrl = (path) => {
  if (!path) return "";
  const p = String(path).trim();
  if (p.startsWith("http://") || p.startsWith("https://")) return p;

  // "/uploads/organisation/kvg_logo.png"
  if (p.startsWith("/uploads/")) return p;

  // "/signature/x.png"  -> serve under /uploads/signature/x.png
  if (p.startsWith("/")) return `/uploads${p}`;

  // "signature/x.png"
  return `/uploads/${p}`;
};

// Strip a leading "Dr." / "DR." / "dr" prefix so the report template can safely
// prepend its own "DR." without producing "DR. Dr. <name>" double-titles.
// Idempotent: works whether the DB value is "Dr. Varun Sehrawat" or "Varun Sehrawat".
const stripDrPrefix = (raw) =>
  String(raw || "").replace(/^\s*Dr\.?\s+/i, "").trim();

export const HOSPITAL_PROFILE = (reportData) => ({
  name: reportData?.user_lab_name || "",
  department: reportData?.department || "",
  logoUrl: toPublicUrl(reportData?.lab_logo_url),

  // ✅ template fields
  addressLine1: reportData?.lab_address || "",
  addressLine2: "",
  accreditation: "",
  website: "",
});

// Signature files are always saved under uploads/radiologist/signature/ (see the
// upload-signature endpoint and the technician "add radiologist" form), but the
// directory part stored in radiologists.signature_path varies between records. Rebuild
// the URL from just the file name, like the organization dashboard's report download does.
const signatureUrlFromPath = (path) => {
  const p = String(path || "").trim();
  if (!p) return "";
  if (/^https?:\/\//i.test(p)) return p;
  const fname = p.split(/[\\/]/).pop();
  return fname ? `/uploads/radiologist/signature/${encodeURIComponent(fname)}` : "";
};

// ── Organization-specific signature block ──
// Only reports of BRAHM SHAKTI SANJIVANI SUPER SPECIALITY HOSPITAL carry the
// signature / name / qualification / designation / Reg.No / report date /
// disclaimer sign-off; every other organization keeps the standard card.
export const BRAHM_SHAKTI_DISCLAIMER =
  "It is an online interpretation of medical imaging based on clinical data. All modern machines/procedures have their own limitation. If there is any clinical discrepancy ,this investigation may be repeated or reassessed by other tests. Patients identification in online reporting is not established, so in no way this report can be utilized for any medico legal purpose. In case of any discrepancy due to typing error or machinery error please get it rectified immediately.";

export const isBrahmShaktiOrg = (orgName) =>
  /brahm\s*shakti\s*sanjivani/i.test(String(orgName || ""));

// dd-mm-yyyy hh:mm AM/PM
export const formatSignReportDate = (value) => {
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return "";
  const p2 = (n) => String(n).padStart(2, "0");
  const h = d.getHours();
  return `${p2(d.getDate())}-${p2(d.getMonth() + 1)}-${d.getFullYear()} ${p2(h % 12 || 12)}:${p2(d.getMinutes())} ${h >= 12 ? "PM" : "AM"}`;
};

// `rp` is RADIOLOGIST_PROFILE(...); the Report Date lives in a .report-sign-date
// span that is stamped with the submit time when the report is submitted.
export const buildBrahmShaktiSignatureHtml = (rp, reportDate = "") => {
  const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const line = (t) => (t ? `<div style="font-size:13px;line-height:1.35;">${esc(t)}</div>` : "");
  return (
    `<div class="report-sign-section report-sign-org" style="text-align:left;margin-top:10px;width:100%;">` +
      (rp.signatureUrl
        ? `<img class="report-sign" src="${esc(rp.signatureUrl)}" alt="Radiologist Signature" style="max-height:80px;max-width:220px;object-fit:contain;display:block;margin:0 0 4px;" onerror="this.style.display='none'" />`
        : "") +
      (rp.name ? line(`Dr. ${rp.name.toUpperCase()}`) : "") +
      line(rp.qualification) +
      line(rp.designation) +
      (rp.regNo ? line(`Reg.No:${rp.regNo}`) : "") +
      `<div style="font-size:13px;margin-top:14px;">Report Date : <span class="report-sign-date">${esc(reportDate)}</span></div>` +
      `<div style="font-size:11px;line-height:1.35;margin-top:4px;"><b>Disclaimer-</b>${esc(BRAHM_SHAKTI_DISCLAIMER)}</div>` +
    `</div>`
  );
};

export const RADIOLOGIST_PROFILE = (reportData) => ({
  name: stripDrPrefix(reportData?.radiologist_name),
  qualification: reportData?.qualification || "",
  designation: reportData?.designation || "",
  registrationNumber: reportData?.dmc_no || "",
  regNo: reportData?.reg_no || "",
  organizationName: reportData?.organization_name || "",
  isBrahmShakti: isBrahmShaktiOrg(reportData?.organization_name),

  signatureUrl: signatureUrlFromPath(reportData?.signature_path),
  // the path exactly as stored — tried second if the rebuilt URL doesn't load
  signatureAltUrl: toPublicUrl(reportData?.signature_path),
});

export const NIFTI_COLORMAP_PRESETS = [
  { label: "BlackBody", csName: "Black-Body Radiation", swatch: "linear-gradient(90deg,#300,#f00,#ff0,#fff)" },
  { label: "BW", csName: "Grayscale", swatch: "linear-gradient(90deg,#000,#fff)" },
  { label: "BWInverse", csName: "Grayscale", invert: true, swatch: "linear-gradient(90deg,#fff,#000)" },
  { label: "Cardiac", csName: "X Ray", swatch: "linear-gradient(90deg,#0af,#f22,#fff)" },
  { label: "Flow", csName: "Blue to Red Rainbow", swatch: "linear-gradient(90deg,#00f,#0ff,#ff0,#f00)" },
  { label: "French", csName: "coolwarm", swatch: "linear-gradient(90deg,#225,#79f,#fff,#f97,#922)" },
  { label: "GrayRainbow", csName: "Rainbow Blended Grey", swatch: "linear-gradient(90deg,#555,#0ff,#ff0,#f0f,#ddd)" },
  { label: "HotGreen", csName: "Haze_green", swatch: "linear-gradient(90deg,#020,#0f0,#dfd)" },
  { label: "HotIron", csName: "RED_TEMPERATURE", swatch: "linear-gradient(90deg,#200,#900,#f44,#fff)" },
  { label: "HotMetal", csName: "2hot", swatch: "linear-gradient(90deg,#000,#f00,#ff0,#fff)" },
  { label: "Hue1", csName: "Rainbow Blended White", swatch: "linear-gradient(90deg,#f0f,#0ff,#ff0,#fff)" },
  { label: "Hue2", csName: "Rainbow Blended Black", swatch: "linear-gradient(90deg,#00f,#0ff,#0f0,#ff0,#f00)" },
  { label: "Jet", csName: "Blue to Red Rainbow", swatch: "linear-gradient(90deg,#00f,#0ff,#ff0,#f00)" },
  { label: "NIH", csName: "X Ray", swatch: "linear-gradient(90deg,#000,#6aa,#fff)" },
  { label: "Perfusion", csName: "Inferno (matplotlib)", swatch: "linear-gradient(90deg,#110,#520,#b30,#f80,#ffb)" },
  { label: "PET", csName: "Plasma (matplotlib)", swatch: "linear-gradient(90deg,#140,#43a,#f35,#fd0)" },
  { label: "Rainbow", csName: "Rainbow Desaturated", swatch: "linear-gradient(90deg,#00f,#0ff,#0f0,#ff0,#f00)" },
  { label: "Rainbow2", csName: "Blue to Yellow", swatch: "linear-gradient(90deg,#00f,#0ff,#ff0)" },
  { label: "Rainbow3", csName: "Red to Blue Rainbow", swatch: "linear-gradient(90deg,#f00,#ff0,#0ff,#00f)" },
  { label: "Ratio", csName: "Cool to Warm", swatch: "linear-gradient(90deg,#36f,#fff,#f63)" },
  { label: "Rred", csName: "Reds", swatch: "linear-gradient(90deg,#300,#900,#f66,#fff)" },
  { label: "Spectrum", csName: "Spectral_lowBlue", swatch: "linear-gradient(90deg,#00f,#0ff,#0f0,#ff0,#f00)" },
  { label: "Stern", csName: "Cool to Warm (Extended)", swatch: "linear-gradient(90deg,#227,#9cf,#fff,#fc9,#722)" },
  { label: "UCLA", csName: "Viridis (matplotlib)", swatch: "linear-gradient(90deg,#440154,#31688e,#35b779,#fde725)" },
  { label: "VRBones", csName: "bone_Matlab", swatch: "linear-gradient(90deg,#000,#6d7d8d,#cfd8dc)" },
  { label: "VRMusclesBones", csName: "copper_Matlab", swatch: "linear-gradient(90deg,#000,#6b4a2f,#c58b55)" },
  { label: "VRRedVessels", csName: "RED-PURPLE", swatch: "linear-gradient(90deg,#200,#800,#f45,#f9f)" },
];
