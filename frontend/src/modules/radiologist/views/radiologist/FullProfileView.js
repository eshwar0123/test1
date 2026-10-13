// src/modules/radiologist/views/radiologist/FullProfileView.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  CCard,
  CCardBody,
  CCardHeader,
  CButton,
  CAlert,
  CBadge,
  CFormLabel,
  CFormRange,
  CModal,
  CModalHeader,
  CModalTitle,
  CModalBody,
  CModalFooter,
  CFormInput,
  CSpinner,
} from "@coreui/react";
import CIcon from "@coreui/icons-react";
import { cilPencil, cilCamera, cilCloudUpload, cilX } from "@coreui/icons";
import { useNavigate } from "react-router-dom";
import api from "../../../../shared/api/axios";
import { apptheme } from "../../views/theme/colors/apptheme";
import Cropper from "react-easy-crop";

// ✅ MUST be SAME key used by Dashboard + Header dropdown
const LS_PROFILE_IMG = "radiologist_profile_image_url";
const AVATAR_EVENT = "radiologist:avatar-updated";
const FALLBACK_AVATAR = "/avatars/images/avatars/8.jpg";

// ✅ SAME role localStorage key used in TechnicalAssessment
const LS_ROLE_CODE = "selected_role_code";
const getUserKey = () => {
  const user = (() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "null");
    } catch {
      return null;
    }
  })();

  const userId = user?.user_id || user?.id || localStorage.getItem("user_id");
  const email = user?.email || localStorage.getItem("email");
  return userId || email || "anon";
};
const k = (base) => `${base}:${getUserKey()}`;

const FullProfileView = () => {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [summary, setSummary] = useState(null);

  const [assessments, setAssessments] = useState({
    motivator: [],
    archetype: [],
    stress: [],
    environment: [],
    growth: [],
    technical: [],
  });

  // ✅ role code (needed for technical Q/A APIs)
  const [roleCode, setRoleCode] = useState("");

  const toAbsoluteUrl = (url) => {
    if (!url) return "";
    if (url.startsWith("data:")) return url;
    if (url.startsWith("http://") || url.startsWith("https://")) return url;

    // attach backend origin from axios baseURL
    try {
      const origin = new URL(api.defaults.baseURL).origin;
      return origin + url;
    } catch {
      return url;
    }
  };

  const [avatarUrl, setAvatarUrl] = useState(() => {
    const ls = localStorage.getItem(LS_PROFILE_IMG);
    return toAbsoluteUrl(ls) || FALLBACK_AVATAR;
  });

  // ✅ layout values (fixed; no View Controls)
  const themeDefaults = apptheme?.profileView || apptheme?.fullProfileView || {};
  const cardMaxWidth = Number(themeDefaults.cardMaxWidth || 920);
  const labelWidth = Number(themeDefaults.labelWidth || 180);
  const valueMinWidth = Number(themeDefaults.valueMinWidth || 320);
  const fontScale = Number(themeDefaults.fontScale || 1);

  // ✅ Upload modal state
  const [imgModal, setImgModal] = useState(false);
  const [imgUploading, setImgUploading] = useState(false);
  const [imgError, setImgError] = useState("");
  const [imgPreview, setImgPreview] = useState("");
  const [imgFile, setImgFile] = useState(null);
  const fileInputRef = useRef(null);

  // ✅ Crop / edit state
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [brightness, setBrightness] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  // ✅ technical questions state (role-based)
  const [technicalQuestions, setTechnicalQuestions] = useState([]);

  const questionMaps = useMemo(() => {
    return {
      motivator: [
        { no: 1, text: "When starting a new project, what energizes you most?" },
        { no: 2, text: "What makes you feel most accomplished?" },
        { no: 3, text: "What keeps you committed long term?" },
        { no: 4, text: "What type of environment feels best for you?" },
        { no: 5, text: "How do you prefer to be appreciated?" },
      ],
      archetype: [
        { no: 6, text: "When facing a new challenge, you instinctively:" },
        { no: 7, text: "When leading a project, you naturally:" },
        { no: 8, text: "Work that energizes you most:" },
        { no: 9, text: "Your working identity is closest to:" },
        { no: 10, text: "When tension arises, you instinctively:" },
        { no: 11, text: "When deciding with incomplete information:" },
        { no: 12, text: "You influence others mainly through:" },
        { no: 13, text: "You prefer work that mostly:" },
      ],
      stress: [
        { no: 14, text: "Under stress, you may:" },
        { no: 15, text: "When priorities change suddenly:" },
        { no: 16, text: "When a project is at risk:" },
        { no: 17, text: "After a tough week, you recover by:" },
      ],
      environment: [
        { no: 18, text: "The day to day environment where you feel most at home is:" },
        { no: 19, text: "How ambiguous is your ideal work?" },
        { no: 20, text: "How often do you prefer active collaboration?" },
        { no: 21, text: "What work environment setup supports your best performance?" },
      ],
      growth: [
        { no: 22, text: "In the next 3 to 5 years, you want to:" },
        { no: 23, text: "Which stretch role would you most likely say yes to?" },
        { no: 24, text: "When imagining your future best self, you see yourself:" },
        { no: 25, text: "Which type of feedback helps you grow the most?" },
      ],
    };
  }, []);

  const readAny = (obj, keys) => {
    for (const k2 of keys) {
      const v = obj?.[k2];
      if (v !== undefined && v !== null && String(v).trim() !== "") return v;
    }
    return "-";
  };

  const formatEduDate = (ed, which) => {
    const dateVal = readAny(ed, [
      which === "start" ? "start_date" : "end_date",
      which === "start" ? "startDate" : "endDate",
      which === "start" ? "from_date" : "to_date",
      which === "start" ? "fromDate" : "toDate",
    ]);
    if (dateVal !== "-" && String(dateVal).length >= 4) return dateVal;

    const yearVal = readAny(ed, [which === "start" ? "start_year" : "end_year"]);
    if (yearVal !== "-" && String(yearVal).trim() !== "") return String(yearVal);

    return "-";
  };

  const levelText = (n) => {
    if (String(n) === "1") return "Beginner";
    if (String(n) === "2") return "Intermediate";
    if (String(n) === "3") return "Advanced";
    return "-";
  };

  // ✅ old answerText remains for non-technical
  const answerText = (typeCode, qNo) => {
    const rows = assessments?.[typeCode] || [];
    const a = rows.find((x) => Number(x.question_no) === Number(qNo));
    if (!a) return "-";
    return a.free_text || a.answer_text || a.option_text || "-";
  };

  // ✅ technical answer text using fetched technicalQuestions options
  const technicalAnswerText = (q) => {
    const rows = assessments?.technical || [];
    const a = rows.find((x) => Number(x.question_no) === Number(q.question_no));
    if (!a) return "-";

    if (a.option_no != null) {
      // Special: technical Q1 = level
      if (Number(q.question_no) === 1) return levelText(a.option_no);

      const opts = Array.isArray(q.options) ? q.options : [];
      const opt = opts.find((o) => Number(o.option_no) === Number(a.option_no));
      return opt?.option_text || `Option ${a.option_no}`;
    }

    return a.free_text || a.option_text || a.answer_text || "-";
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setErr("");

      try {
        // ✅ 1) ROLE with fallback (SAME as TechnicalAssessment)
        let rc = "";
        try {
          const roleRes = await api.get("/radiologist/role");
          rc = roleRes?.data?.role_code || "";
        } catch {
          rc = "";
        }
        if (!rc) rc = localStorage.getItem(k(LS_ROLE_CODE)) || "";
        if (!rc) rc = localStorage.getItem(LS_ROLE_CODE) || "";
        setRoleCode(rc);

        // ✅ 2) Load everything else + technical based on role_code
        const [
          profileRes,
          progressRes,
          eduRes,
          expRes,
          motivatorRes,
          archetypeRes,
          stressRes,
          envRes,
          growthRes,
          technicalAnsRes,
          technicalQRes,
        ] = await Promise.all([
          api.get("/radiologist/profile"),
          api.get("/radiologist/progress"),
          api.get("/radiologist/education"),
          api.get("/radiologist/experience"),
          api.get("/radiologist/assessment/motivator"),
          api.get("/radiologist/assessment/archetype"),
          api.get("/radiologist/assessment/stress"),
          api.get("/radiologist/assessment/environment"),
          api.get("/radiologist/assessment/growth"),

          // ✅ SAME as TechnicalAssessment
          rc
            ? api.get(`/radiologist/assessment/technical/answers?role_code=${encodeURIComponent(rc)}`)
            : Promise.resolve({ data: { answers: [] } }),

          rc
            ? api.get(`/radiologist/assessment/technical/questions?role_code=${encodeURIComponent(rc)}`)
            : Promise.resolve({ data: { questions: [] } }),
        ]);

        // ✅ if API returns image, store into shared LS key
        const apiImg =
          profileRes?.data?.profile_image_url ||
          profileRes?.data?.profileImageUrl ||
          profileRes?.data?.avatar_url ||
          profileRes?.data?.avatarUrl;

        if (apiImg) {
          const abs = toAbsoluteUrl(apiImg);
          localStorage.setItem(LS_PROFILE_IMG, abs);
          setAvatarUrl(abs);
          window.dispatchEvent(new CustomEvent(AVATAR_EVENT, { detail: { url: abs } }));
        }

        setSummary({
          profile: profileRes?.data || null,
          progress: progressRes?.data || null,
          education: eduRes?.data || [],
          experience: expRes?.data || {
            experiences: [],
            skills: [],
            languages: [],
          },
        });

        // ✅ parse EXACTLY like TechnicalAssessment style
        const techAnswers =
          technicalAnsRes?.data?.answers ??
          (Array.isArray(technicalAnsRes?.data) ? technicalAnsRes.data : []);

        const techQuestions =
          technicalQRes?.data?.questions ??
          (Array.isArray(technicalQRes?.data) ? technicalQRes.data : []);

        setTechnicalQuestions(techQuestions || []);

        setAssessments({
          motivator: motivatorRes?.data?.answers || [],
          archetype: archetypeRes?.data?.answers || [],
          stress: stressRes?.data?.answers || [],
          environment: envRes?.data?.answers || [],
          growth: growthRes?.data?.answers || [],
          technical: techAnswers || [],
        });
      } catch (e) {
        console.error(e);
        setErr("Failed to load profile summary. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  useEffect(() => {
    const sync = () => {
      const ls = localStorage.getItem(LS_PROFILE_IMG);
      setAvatarUrl(toAbsoluteUrl(ls) || FALLBACK_AVATAR);
    };

    window.addEventListener(AVATAR_EVENT, sync);
    window.addEventListener("storage", sync);

    return () => {
      window.removeEventListener(AVATAR_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const p = summary?.profile || null;
  const prog = summary?.progress?.progress || summary?.progress || null;
  const jobPref = p?.job_preferences || {};


  const education = summary?.education || [];
  const experience = summary?.experience?.experiences || [];
  const skills = summary?.experience?.skills || [];
  const languages = summary?.experience?.languages || [];

  const fullName = `${p?.first_name || p?.firstName || "-"} ${p?.last_name || p?.lastName || ""}`.trim();
  const completed = Boolean(prog?.completion_acknowledged);

  const radiologistId =
    p?.radiologist_id ||
    p?.radiologistId ||
    localStorage.getItem("radiologist_id") ||
    summary?.radiologist_id ||
    "-";

  const permanent = [
    p?.permanent_address?.addressLine1 ||
      p?.permanent_address?.address_line1 ||
      p?.permanent_address?.address1,
    p?.permanent_address?.city,
    p?.permanent_address?.state,
    p?.permanent_address?.pincode || p?.permanent_address?.zip,
  ]
    .filter(Boolean)
    .join(", ");

  const temporary = [
    p?.temporary_address?.addressLine1 ||
      p?.temporary_address?.address_line1 ||
      p?.temporary_address?.address1,
    p?.temporary_address?.city,
    p?.temporary_address?.state,
    p?.temporary_address?.pincode || p?.temporary_address?.zip,
  ]
    .filter(Boolean)
    .join(", ");

  const kycPreview =
    prog?.kyc_preview_url ||
    prog?.kycPreviewUrl ||
    prog?.kyc_file_url ||
    prog?.kycFileUrl ||
    p?.kyc_preview_url ||
    p?.kyc_file_url ||
    "";

  // ✅ avatar priority: localStorage > API > fallback
  const profileImage =
    localStorage.getItem(LS_PROFILE_IMG) ||
    p?.profile_image_url ||
    p?.profileImageUrl ||
    p?.avatar_url ||
    p?.avatarUrl ||
    FALLBACK_AVATAR;

  // THEME
  const t = apptheme?.profileView || apptheme?.fullProfileView || {};
  const COLORS = {
    pageBg: t.pageBg ?? "transparent",
    cardBg: t.cardBg ?? "#ffffff",
    cardBorder: t.cardBorder ?? "rgba(15,23,42,0.10)",
    headerBg: t.headerBg ?? "rgba(0,0,0,0.03)",
    headerText: t.headerText ?? "#111827",
    text: t.text ?? "#111827",
    muted: t.muted ?? "#6b7280",
    valueBg: t.valueBg ?? "rgba(248,250,252,0.95)",
    valueBorder: t.valueBorder ?? "rgba(15,23,42,0.10)",
    badgeOkBg: t.badgeOkBg ?? "#198754",
    badgeWarnBg: t.badgeWarnBg ?? "#ffc107",
    primary: t.primary ?? "#5856D6",
  };

  const BUTTONS = { dash: t.dashboardBtn ?? { color: "primary", variant: undefined } };
  const SIZES = {
    radius: Number(t.radius ?? 16),
    sectionGap: Number(t.sectionGap ?? 12),
    photo: Number(t.photoSize ?? 120),
  };

  const scale = (n) => Math.round(n * fontScale);
  const pageWrap = { background: COLORS.pageBg, padding: "0 12px 18px 12px" };
  const centerCol = { maxWidth: cardMaxWidth, margin: "0 auto" };

  // =========================
  // Upload helpers
  // =========================
  const openUpload = () => {
    setImgError("");
    setImgPreview("");
    setImgFile(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setBrightness(1);
    setCroppedAreaPixels(null);
    setImgModal(true);
  };

  const onPickFile = (file) => {
    setImgError("");
    if (!file) return;

    const allowed = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (!allowed.includes(file.type)) {
      setImgError("Please upload PNG / JPG / WEBP image only.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setImgError("Max file size is 5MB.");
      return;
    }

    setImgFile(file);
    setImgPreview(URL.createObjectURL(file));
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setBrightness(1);
    setCroppedAreaPixels(null);
  };

  const withBust = (url) => {
    if (!url || url.startsWith("data:")) return url;
    const joiner = url.includes("?") ? "&" : "?";
    return `${url}${joiner}t=${Date.now()}`;
  };

  // ✅ IMPORTANT: broadcast so Header + Dashboard refresh in same tab
  const saveAndBroadcast = (newUrlRaw) => {
    const newUrl = withBust(toAbsoluteUrl(newUrlRaw));

    localStorage.setItem(LS_PROFILE_IMG, newUrl);
    setAvatarUrl(newUrl);

    setSummary((prev) => ({
      ...(prev || {}),
      profile: { ...(prev?.profile || {}), profile_image_url: newUrl },
    }));

    setImgModal(false);
    window.dispatchEvent(new CustomEvent(AVATAR_EVENT, { detail: { url: newUrl } }));
  };

  const onCropComplete = (_, croppedPixels) => {
    setCroppedAreaPixels(croppedPixels);
  };

  const createImage = (url) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.addEventListener("load", () => resolve(img));
      img.addEventListener("error", (e) => reject(e));
      img.crossOrigin = "anonymous";
      img.src = url;
    });

  const getCroppedBlob = async (imageSrc, cropPixels, bright = 1) => {
    const image = await createImage(imageSrc);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    canvas.width = cropPixels.width;
    canvas.height = cropPixels.height;

    ctx.filter = `brightness(${bright})`;

    ctx.drawImage(
      image,
      cropPixels.x,
      cropPixels.y,
      cropPixels.width,
      cropPixels.height,
      0,
      0,
      cropPixels.width,
      cropPixels.height
    );

    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error("Failed to create image blob."));
          resolve(blob);
        },
        "image/jpeg",
        0.92
      );
    });
  };

  const uploadImage = async () => {
    if (!imgFile || !imgPreview) {
      setImgError("Choose an image first.");
      return;
    }

    if (!croppedAreaPixels) {
      setImgError("Please adjust crop area before saving.");
      return;
    }

    setImgUploading(true);
    setImgError("");

    try {
      const editedBlob = await getCroppedBlob(imgPreview, croppedAreaPixels, brightness);

      const form = new FormData();

      // ✅ Some backends use "file", some use "image" — send both
      form.append("file", editedBlob, `profile_${Date.now()}.jpg`);
      form.append("image", editedBlob, `profile_${Date.now()}.jpg`);

      const res = await api.post("/radiologist/profile-image", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const newUrl =
        res?.data?.profile_image_url ||
        res?.data?.profileImageUrl ||
        res?.data?.url ||
        res?.data?.file_url;

      if (!newUrl) throw new Error("Upload success but URL not returned.");

      saveAndBroadcast(newUrl);
    } catch (e) {
      // ✅ fallback: save locally so UI updates everywhere
      console.error("Upload API failed, saving locally:", e);
      try {
        const editedBlob = await getCroppedBlob(imgPreview, croppedAreaPixels, brightness);
        const reader = new FileReader();
        reader.onloadend = () => saveAndBroadcast(reader.result);
        reader.readAsDataURL(editedBlob);
      } catch (e2) {
        console.error(e2);
        setImgError("Upload failed. Please try again.");
      }
    } finally {
      setImgUploading(false);
    }
  };

  return (
    <div style={pageWrap}>
      {/* Header */}
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div>
          <h4 className="mb-1" style={{ color: COLORS.text, fontSize: scale(20) }}>
            Profile
          </h4>
          {completed && (
            <CAlert
              color="success"
              className="mb-3"
              style={{
                fontSize: scale(13),
                background: "none",
                borderColor: "none",
                border: "none",
                alignContent: "center",
                padding: 0,
              }}
            >
              Profile status: <b>Completed</b>. This view is read-only.
            </CAlert>
          )}
        </div>

        <div className="d-flex gap-2">
          <CButton
            color={BUTTONS.dash.color}
            variant={BUTTONS.dash.variant}
            onClick={() => navigate("/radiologist/dashboard")}
          >
            Home
          </CButton>
        </div>
      </div>

      {loading && <div>Loading...</div>}
      {err && <CAlert color="danger">{err}</CAlert>}

      {!loading && !err && (
        <div style={centerCol}>
          <div style={{ display: "grid", gap: SIZES.sectionGap }}>
            {/* Profile photo card */}
            <CCard style={{ borderRadius: SIZES.radius, border: `1px solid ${COLORS.cardBorder}` }}>
              <CCardBody style={{ background: COLORS.cardBg }}>
                <div className="d-flex flex-column align-items-center">
                  <div style={{ position: "relative" }}>
                    <div
                      style={{
                        width: SIZES.photo,
                        height: SIZES.photo,
                        borderRadius: "50%",
                        overflow: "hidden",
                        border: `1px solid ${COLORS.cardBorder}`,
                        background: "rgba(0,0,0,0.02)",
                      }}
                    >
                      <img
                        src={avatarUrl}
                        alt="profile"
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    </div>

                    <button
                      type="button"
                      onClick={openUpload}
                      title="Change photo"
                      style={{
                        position: "absolute",
                        right: -4,
                        bottom: -4,
                        width: 38,
                        height: 38,
                        borderRadius: "50%",
                        border: `1px solid ${COLORS.cardBorder}`,
                        background: "#fff",
                        display: "grid",
                        placeItems: "center",
                        cursor: "pointer",
                        boxShadow: "0 10px 24px rgba(15,23,42,0.12)",
                      }}
                    >
                      <CIcon icon={cilPencil} />
                    </button>
                  </div>

                  <div className="mt-3">
                    {completed ? (
                      <CBadge
                        style={{
                          background: COLORS.badgeOkBg,
                          borderRadius: 999,
                          padding: "6px 12px",
                          fontSize: scale(12),
                          fontWeight: 900,
                        }}
                      >
                        Completed
                      </CBadge>
                    ) : (
                      <CBadge
                        style={{
                          background: COLORS.badgeWarnBg,
                          color: "#111827",
                          borderRadius: 999,
                          padding: "6px 12px",
                          fontSize: scale(12),
                          fontWeight: 900,
                        }}
                      >
                        In Progress
                      </CBadge>
                    )}
                  </div>

                  <div style={{ marginTop: 8, color: COLORS.muted, fontSize: scale(12) }}>
                    Photo updates reflect in Dashboard.
                  </div>
                </div>
              </CCardBody>
            </CCard>

            {/* Personal Details */}
            <SectionCard title="Personal Details" radius={SIZES.radius} colors={COLORS} fontSize={scale(14)}>
              <KVRow k="Radiologist ID" v={radiologistId} {...kvProps()} />
              <KVRow k="Name" v={fullName} {...kvProps()} />
              <KVRow k="Email" v={p?.email || "-"} {...kvProps()} />
              <KVRow k="Phone" v={p?.phone || "-"} {...kvProps()} />
              <KVRow k="DOB" v={p?.dob || "-"} {...kvProps()} />
            </SectionCard>

            {/* Address */}
            <SectionCard title="Address" radius={SIZES.radius} colors={COLORS} fontSize={scale(14)}>
              <KVRow k="Permanent Address" v={permanent || "-"} {...kvProps()} />
              <KVRow k="Temporary Address" v={temporary || "-"} {...kvProps()} />
            </SectionCard>

            {/* KYC */}
            <SectionCard title="KYC" radius={SIZES.radius} colors={COLORS} fontSize={scale(14)}>
              <KVRow k="Uploaded" v={prog?.kyc_uploaded ? "Yes" : "No"} {...kvProps()} />
              <KVRow k="Verified" v={prog?.kyc_verified ? "Yes" : "No"} {...kvProps()} />

            {/* 

              <div style={{ marginTop: 10 }}>
                <div style={{ fontWeight: 900, fontSize: scale(13), color: COLORS.text, marginBottom: 8 }}>
                  KYC Preview
                </div>

                {kycPreview ? (
                  <div
                    style={{
                      border: `1px solid ${COLORS.valueBorder}`,
                      background: COLORS.valueBg,
                      borderRadius: 12,
                      padding: 10,
                      maxWidth: 560,
                    }}
                  >
                    <img
                      src={kycPreview}
                      alt="KYC Preview"
                      style={{ width: "100%", height: "auto", borderRadius: 10, display: "block" }}
                    />
                  </div>
                ) : (
                  <div
                    style={{
                      border: `1px dashed ${COLORS.valueBorder}`,
                      background: "rgba(248,250,252,0.6)",
                      borderRadius: 12,
                      padding: 14,
                      color: COLORS.muted,
                      fontSize: scale(13),
                    }}
                  >
                    No KYC file preview available.
                  </div>
                )}
              </div> */}
            </SectionCard> 

            {/* Job Preferences */}
            <SectionCard title="Job Preferences" radius={SIZES.radius} colors={COLORS} fontSize={scale(14)}>
              <KVRow
                k="Preferred Role"
                v={jobPref?.preferred_role || "-"}
                {...kvProps()}
              />

              <KVRow
                k="Preferred Location"
                v={jobPref?.preferred_location || "-"}
                {...kvProps()}
              />

              <KVRow
                k="Job Type"
                v={jobPref?.preferred_job_type || "-"}
                {...kvProps()}
              />

              <KVRow
                k="Expected Salary"
                v={
                  jobPref?.expected_salary_min || jobPref?.expected_salary_max
                    ? `${jobPref?.expected_salary_min ?? "-"} - ${jobPref?.expected_salary_max ?? "-"}`
                    : "-"
                }
                {...kvProps()}
              />
            </SectionCard>


            {/* Education */}
            <SectionCard title="Education" radius={SIZES.radius} colors={COLORS} fontSize={scale(14)}>
              {education.length === 0 ? (
                <div style={{ color: COLORS.muted, fontSize: scale(13) }}>-</div>
              ) : (
                education.map((ed, idx) => (
                  <Block key={idx} title={`Education ${idx + 1}`} colors={COLORS} fontSize={scale(13)}>
                    <KVRow k="Degree" v={readAny(ed, ["degree"])} {...kvProps()} />
                    <KVRow k="Specialization" v={readAny(ed, ["specialization", "field", "stream"])} {...kvProps()} />
                    <KVRow
                      k="Institution"
                      v={readAny(ed, ["institution_name", "institutionName", "institution"])}
                      {...kvProps()}
                    />
                    <KVRow k="University" v={readAny(ed, ["university"])} {...kvProps()} />
                    <KVRow k="Start" v={formatEduDate(ed, "start")} {...kvProps()} />
                    <KVRow k="End" v={formatEduDate(ed, "end")} {...kvProps()} />
                    <KVRow k="Grade" v={readAny(ed, ["grade"])} {...kvProps()} />
                  </Block>
                ))
              )}
            </SectionCard>

            {/* Experience */}
            <SectionCard title="Experience" radius={SIZES.radius} colors={COLORS} fontSize={scale(14)}>
              {experience.length === 0 ? (
                <div style={{ color: COLORS.muted, fontSize: scale(13) }}>-</div>
              ) : (
                experience.map((ex, idx) => (
                  <Block key={idx} title={`Experience ${idx + 1}`} colors={COLORS} fontSize={scale(13)}>
                    <KVRow k="Organization" v={readAny(ex, ["organization_name", "organizationName"])} {...kvProps()} />
                    <KVRow k="Role" v={readAny(ex, ["role"])} {...kvProps()} />
                    <KVRow
                      k="Start date"
                      v={readAny(ex, ["start_date", "startDate", "from_date", "fromDate"])}
                      {...kvProps()}
                    />
                    <KVRow
                      k="End date"
                      v={readAny(ex, ["end_date", "endDate", "to_date", "toDate"])}
                      {...kvProps()}
                    />
                    <KVRow k="Description" v={readAny(ex, ["description"])} {...kvProps()} />
                  </Block>
                ))
              )}
            </SectionCard>

            {/* Skills & Languages */}
            <SectionCard title="Skills & Languages" radius={SIZES.radius} colors={COLORS} fontSize={scale(14)}>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontWeight: 900, fontSize: scale(13), color: COLORS.text, marginBottom: 6 }}>
                  Skills
                </div>
                {skills.length === 0 ? (
                  <div style={{ color: COLORS.muted, fontSize: scale(13) }}>-</div>
                ) : (
                  <div style={{ display: "grid", gap: 8 }}>
                    {skills.map((s, i) => (
                      <KVRow
                        key={i}
                        k={readAny(s, ["skillName", "skill", "name", "skill_name"])}
                        v={readAny(s, ["skillLevel", "skill_level", "proficiencyLevel", "level", "proficiency_level"])}
                        {...kvProps()}
                      />
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div style={{ fontWeight: 900, fontSize: scale(13), color: COLORS.text, marginBottom: 6 }}>
                  Languages
                </div>
                {languages.length === 0 ? (
                  <div style={{ color: COLORS.muted, fontSize: scale(13) }}>-</div>
                ) : (
                  <div style={{ display: "grid", gap: 8 }}>
                    {languages.map((l, i) => (
                      <KVRow
                        key={i}
                        k={readAny(l, ["languageName", "language", "name", "language_name"])}
                        v={readAny(l, ["languageLevel", "language_level", "proficiencyLevel", "level", "proficiency_level"])}
                        {...kvProps()}
                      />
                    ))}
                  </div>
                )}
              </div>
            </SectionCard>

            {/* Assessments */}
            <SectionCard title="Assessments (Full Answers)" radius={SIZES.radius} colors={COLORS} fontSize={scale(14)}>
              {/* Non-technical */}
              {["motivator", "archetype", "stress", "environment", "growth"].map((type) => (
                <div key={type} style={{ marginBottom: 14 }}>
                  <div
                    style={{
                      fontWeight: 900,
                      marginBottom: 10,
                      textTransform: "capitalize",
                      fontSize: scale(14),
                      color: COLORS.text,
                    }}
                  >
                    {type}
                  </div>

                  {(questionMaps[type] || []).map((q) => (
                    <div key={q.no} style={{ borderBottom: `1px solid ${COLORS.cardBorder}`, padding: "10px 0" }}>
                      <div style={{ fontWeight: 800, fontSize: scale(13), color: COLORS.text }}>
                        Q{q.no}. {q.text}
                      </div>

                      <KVRow k="Answer" v={answerText(type, q.no)} {...kvProps()} />
                    </div>
                  ))}
                </div>
              ))}

              {/* Technical (role-based from backend) */}
              <div style={{ marginBottom: 14 }}>
                <div
                  style={{
                    fontWeight: 900,
                    marginBottom: 10,
                    textTransform: "capitalize",
                    fontSize: scale(14),
                    color: COLORS.text,
                  }}
                >
                  Technical
                </div>

                {technicalQuestions.length === 0 ? (
                  <div style={{ color: COLORS.muted, fontSize: scale(13) }}>-</div>
                ) : (
                  technicalQuestions.map((q) => (
                    <div
                      key={q.question_no}
                      style={{ borderBottom: `1px solid ${COLORS.cardBorder}`, padding: "10px 0" }}
                    >
                      <div style={{ fontWeight: 800, fontSize: scale(13), color: COLORS.text }}>
                        Q{q.question_no}. {q.question_text}
                      </div>

                      <KVRow k="Answer" v={technicalAnswerText(q)} {...kvProps()} />
                    </div>
                  ))
                )}
              </div>
            </SectionCard>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      <CModal alignment="center" visible={imgModal} onClose={() => setImgModal(false)} size="lg">
        <CModalHeader>
          <CModalTitle>Update Profile Photo</CModalTitle>
        </CModalHeader>

        <CModalBody>
          <div
            style={{
              border: `1px solid ${COLORS.cardBorder}`,
              borderRadius: 12,
              padding: 12,
              background: "rgba(248,250,252,0.45)",
            }}
          >
            <div className="d-flex align-items-center gap-3 mb-3">
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 900, color: COLORS.text }}>Edit & Crop</div>
                <div style={{ color: COLORS.muted, fontSize: 12 }}>Crop, zoom and brightness — then Save</div>
              </div>

              <CButton
                color="secondary"
                variant="outline"
                style={{ fontWeight: 800 }}
                onClick={() => fileInputRef.current?.click()}
              >
                <CIcon icon={cilCamera} className="me-2" />
                Browse
              </CButton>

              <CFormInput
                type="file"
                ref={fileInputRef}
                accept="image/png,image/jpeg,image/jpg,image/webp"
                onChange={(e) => onPickFile(e.target.files?.[0] || null)}
                style={{ display: "none" }}
              />
            </div>

            <div
              style={{
                position: "relative",
                width: "100%",
                height: 280,
                borderRadius: 12,
                overflow: "hidden",
                border: `1px solid ${COLORS.valueBorder}`,
                background: "rgba(0,0,0,0.06)",
              }}
            >
              <div style={{ position: "absolute", inset: 0, filter: `brightness(${brightness})` }}>
                <Cropper
                  image={imgPreview || profileImage}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  cropShape="round"
                  showGrid={false}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={onCropComplete}
                />
              </div>
            </div>

            <div className="mt-3" style={{ display: "grid", gap: 12 }}>
              <div>
                <CFormLabel style={{ fontWeight: 800 }}>
                  Zoom: <b>{zoom.toFixed(2)}x</b>
                </CFormLabel>
                <CFormRange min={1} max={3} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
              </div>

              <div>
                <CFormLabel style={{ fontWeight: 800 }}>
                  Brightness: <b>{brightness.toFixed(2)}x</b>
                </CFormLabel>
                <CFormRange
                  min={0.6}
                  max={1.6}
                  step={0.01}
                  value={brightness}
                  onChange={(e) => setBrightness(Number(e.target.value))}
                />
              </div>
            </div>

            {imgFile && (
              <div className="mt-2" style={{ color: COLORS.muted, fontSize: 12 }}>
                Selected: {imgFile.name}
              </div>
            )}

            {imgError && (
              <div className="mt-3">
                <CAlert color="danger" className="mb-0">
                  {imgError}
                </CAlert>
              </div>
            )}
          </div>
        </CModalBody>

        <CModalFooter>
          <CButton color="secondary" variant="outline" onClick={() => setImgModal(false)}>
            <CIcon icon={cilX} className="me-2" />
            Cancel
          </CButton>

          <CButton
            style={{ background: COLORS.primary, borderColor: COLORS.primary, fontWeight: 900 }}
            onClick={uploadImage}
            disabled={imgUploading}
          >
            {imgUploading ? (
              <>
                <CSpinner size="sm" className="me-2" />
                Uploading...
              </>
            ) : (
              <>
                <CIcon icon={cilCloudUpload} className="me-2" />
                Save
              </>
            )}
          </CButton>
        </CModalFooter>
      </CModal>
    </div>
  );

  function kvProps() {
    return {
      labelWidth,
      valueMinWidth,
      colors: COLORS,
      fontSize: scale(13),
    };
  }
};

export default FullProfileView;

/* =========================
   Components
========================= */
function SectionCard({ title, children, radius, colors, fontSize }) {
  return (
    <CCard style={{ borderRadius: radius, border: `1px solid ${colors.cardBorder}` }}>
      <CCardHeader
        style={{
          fontWeight: 900,
          background: colors.headerBg,
          color: colors.headerText,
          borderTopLeftRadius: radius,
          borderTopRightRadius: radius,
          fontSize,
        }}
      >
        {title}
      </CCardHeader>
      <CCardBody style={{ background: colors.cardBg }}>{children}</CCardBody>
    </CCard>
  );
}

function KVRow({ k, v, labelWidth, valueMinWidth, colors, fontSize }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `${labelWidth}px 1fr`, gap: 12, padding: "6px 0" }}>
      <div style={{ color: colors.muted, fontWeight: 800, fontSize, lineHeight: 1.35 }}>{k}</div>
      <div style={{ minWidth: valueMinWidth }}>
        <div
          style={{
            width: "100%",
            padding: "8px 10px",
            borderRadius: 12,
            border: `1px solid ${colors.valueBorder}`,
            background: colors.valueBg,
            fontWeight: 900,
            fontSize,
            color: colors.text,
            lineHeight: 1.35,
            wordBreak: "break-word",
          }}
        >
          {v}
        </div>
      </div>
    </div>
  );
}

function Block({ title, children, colors, fontSize }) {
  return (
    <div
      style={{
        border: `1px solid ${colors.cardBorder}`,
        borderRadius: 12,
        padding: 12,
        marginBottom: 10,
        background: "rgba(248,250,252,0.45)",
      }}
    >
      <div style={{ fontWeight: 900, marginBottom: 10, fontSize, color: colors.text }}>{title}</div>
      {children}
    </div>
  );
}
