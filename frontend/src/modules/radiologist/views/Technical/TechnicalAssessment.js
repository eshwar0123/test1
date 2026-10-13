import React, { useEffect, useMemo, useState } from "react";
import {
  CCard,
  CCardHeader,
  CCardBody,
  CForm,
  CFormLabel,
  CFormInput,
  CFormCheck,
  CButton,
  CAlert,
  CSpinner,
} from "@coreui/react";
import { useNavigate } from "react-router-dom";
import api from "../../../../shared/api/axios";
import { apptheme } from './../theme/colors/apptheme'


import ProfileReviewModal from "../radiologist/review/ProfileReviewModal";
import ProfileCompletedModal from "../radiologist/review/ProfileCompletedModal";

// ==========================
// LocalStorage keys (scoped)
// ==========================
const LS_ROLE_CODE = "selected_role_code";
const LS_TECH_ANS = "tech_answers_json"; // store map of answers (per user)

// ✅ same user-key scoping style you already use
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

// ==========================
// Component
// ==========================
const TechnicalAssessment = () => {
  const navigate = useNavigate();

  const [isLocked, setIsLocked] = useState(false);

  // role
  const [roleCode, setRoleCode] = useState("");
  

  // questions from backend
  // Expected format from backend:
  // [
  //   { question_no: 1, type: "radio", question_text: "...", options: [{ option_no: 1, option_text: "..."}] },
  //   { question_no: 2, type: "text", question_text: "..." },
  // ]
  const [questions, setQuestions] = useState([]);
  const [loadingQ, setLoadingQ] = useState(true);

  // answers state (generic)
  // For radio => answers[qNo] = { option_no: number }
  // For text  => answers[qNo] = { free_text: string }
  const [answers, setAnswers] = useState(() => {
    try {
      const raw = localStorage.getItem(k(LS_TECH_ANS));
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const [roleLabel, setRoleLabel] = useState("");
  useEffect(() => {
    const loadRoleLabel = async () => {
      try {
        const res = await api.get("/radiologist/roles");
        const found = (res.data || []).find(
          (r) => Number(r.role_code) === Number(roleCode)
        );
        setRoleLabel(found?.role_name || `Role ${roleCode}`);
      } catch {
        setRoleLabel(`Role ${roleCode}`);
      }
    };
  
    if (roleCode != null) loadRoleLabel();
  }, [roleCode]);
  


  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Review modal
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState("");

  const [summary, setSummary] = useState(null);
  const [assessments, setAssessments] = useState({
    motivator: [],
    archetype: [],
    stress: [],
    environment: [],
    growth: [],
    technical: [],
  });

  // Congrats modal
  const [doneOpen, setDoneOpen] = useState(false);

  // Persist answers locally
  useEffect(() => {
    localStorage.setItem(k(LS_TECH_ANS), JSON.stringify(answers || {}));
  }, [answers]);

  // 1) Load role + lock state + saved technical answers
 // 1) Load role + lock state + saved technical answers
useEffect(() => {
  const loadInitial = async () => {
    setLoadingQ(true);
    try {
      // 1) progress + role first
      const [progRes, roleRes] = await Promise.allSettled([
        api.get("/radiologist/progress"),
        api.get("/radiologist/role"),
      ]);

      const progress =
        progRes.status === "fulfilled" ? progRes.value?.data?.progress : null;
      const ack = Boolean(progress?.completion_acknowledged);

      // role_code
      let rc =
        roleRes.status === "fulfilled" ? roleRes.value?.data?.role_code : "";
      if (!rc) rc = localStorage.getItem(k(LS_ROLE_CODE)) || "";
      setRoleCode(rc);

      // 2) NOW fetch saved technical answers using role_code
      let saved = [];
      if (rc) {
        const techRes = await api.get(
          `/radiologist/assessment/technical/answers?role_code=${encodeURIComponent(rc)}`
        );
        saved = techRes?.data?.answers || [];
      }

      // map saved backend answers into our generic answer state
      const next = {};
      for (const s of saved) {
        const qNo = Number(s.question_no);
        if (!Number.isFinite(qNo)) continue;

        if (s.option_no != null) next[qNo] = { option_no: Number(s.option_no) };
        else if (s.free_text != null) next[qNo] = { free_text: String(s.free_text || "") };
      }
      setAnswers(next);

      const hasTechAnswers = saved.length > 0;

      // LOCK RULE
      setIsLocked(ack && hasTechAnswers);
    } catch (e) {
      console.error("Failed to load initial technical state", e);
      setIsLocked(false);
      setAnswers({});
    } finally {
      setLoadingQ(false);
    }
  };

  loadInitial();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

  // 2) Load questions role-wise (when roleCode available)
  useEffect(() => {
    const loadQuestions = async () => {
      if (!roleCode) {
        setQuestions([]);
        return;
      }
      try {
        setLoadingQ(true);
        // ✅ You will add this endpoint in backend
        const res = await api.get(
          `/radiologist/assessment/technical/questions?role_code=${encodeURIComponent(
            roleCode
          )}`
        );
        setQuestions(res?.data?.questions || []);
      } catch (e) {
        console.error(e);
        // fallback: keep empty; you can show message
        setQuestions([]);
      } finally {
        setLoadingQ(false);
      }
    };

    loadQuestions();
  }, [roleCode]);

  // helper: update answer
  const setRadio = (qNo, optionNo) => {
    setAnswers((prev) => ({ ...(prev || {}), [qNo]: { option_no: optionNo } }));
  };
  const setText = (qNo, text) => {
    setAnswers((prev) => ({ ...(prev || {}), [qNo]: { free_text: text } }));
  };

  const saveTechnical = async () => {
    // Convert generic answers to your backend payload
    // Your backend expects:
    // { type_code: "technical", answers: [{question_no, option_no?} or {question_no, option_text?}] }
    const out = [];

    for (const q of questions) {
      const qNo = Number(q.question_no);
      const a = answers?.[qNo];
      if (!a) continue;

      if (a.option_no != null) {
        out.push({ question_no: qNo, option_no: Number(a.option_no) });
      } else if (a.free_text != null && String(a.free_text).trim()) {
        out.push({ question_no: qNo, option_text: String(a.free_text).trim() });
      }
    }

    const payload = {
      type_code: "technical",
      role_code: roleCode, // ✅ include role so backend knows which set it was
      answers: out,
    };

    await api.post("/radiologist/assessment", payload);
  };

  const loadReviewData = async () => {
    setReviewLoading(true);
    setReviewError("");

    const safe = (r) => (r.status === "fulfilled" ? r.value : null);

    try {
      const results = await Promise.allSettled([
        api.get("/radiologist/profile"),
        api.get("/radiologist/progress"),
        api.get("/radiologist/education"),
        api.get("/radiologist/experience"),
        api.get("/radiologist/assessment/motivator"),
        api.get("/radiologist/assessment/archetype"),
        api.get("/radiologist/assessment/stress"),
        api.get("/radiologist/assessment/environment"),
        api.get("/radiologist/assessment/growth"),
        api.get(`/radiologist/assessment/technical/answers?role_code=${encodeURIComponent(roleCode)}`),


      ]);

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
        technicalRes,
      ] = results.map(safe);

      if (!profileRes || !progressRes) {
        setReviewError(
          "Failed to load summary (profile/progress missing). Please login again or try later."
        );
        setSummary(null);
        setAssessments({
          motivator: [],
          archetype: [],
          stress: [],
          environment: [],
          growth: [],
          technical: [],
        });
        return;
      }

      setSummary({
        profile: profileRes?.data || null,
        progress: progressRes?.data || null,
        education: eduRes?.data || [],
        experience: expRes?.data || { experiences: [], skills: [], languages: [] },
      });
      const techAnswers =
        technicalRes?.data?.answers ??
        (Array.isArray(technicalRes?.data) ? technicalRes.data : []);

      setAssessments({
        motivator: motivatorRes?.data?.answers || [],
        archetype: archetypeRes?.data?.answers || [],
        stress: stressRes?.data?.answers || [],
        environment: envRes?.data?.answers || [],
        growth: growthRes?.data?.answers || [],
        technical: techAnswers,
      });
    } catch (e) {
      console.error(e);
      setReviewError("Failed to load summary. Please try again.");
    } finally {
      setReviewLoading(false);
    }
  };

  const handleSaveContinue = async (e) => {
    e.preventDefault();
    if (isLocked) return;

    setError("");

    if (!roleCode) {
      setError("No role selected. Please select a role first.");
      navigate("/radiologist/job-preferences");
      return;
    }

    if (!questions?.length) {
      setError("No technical questions found for your selected role.");
      return;
    }

    setSaving(true);

    try {
      await saveTechnical();
      await loadReviewData();
      setReviewOpen(true);
    } catch (err) {
      console.error(err);
      setError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleEditFromReview = () => {
    setReviewOpen(false);
  };

  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState("");

  const handleCompleteFromReview = async () => {
    setCompleting(true);
    setCompleteError("");

    try {
      await api.post("/radiologist/progress/acknowledge");
      setIsLocked(true);
      setReviewOpen(false);
      setDoneOpen(true);
    } catch (e) {
      console.error(e);
      setCompleteError("Failed to complete profile. Please try again.");
    } finally {
      setCompleting(false);
    }
  };

  const handleHome = () => {
    setDoneOpen(false);
    navigate("/radiologist/dashboard");
  };

  const roleBadge = useMemo(() => {
    if (!roleCode) return "-";
    return String(roleCode).replaceAll("_", " ");

  }, [roleCode]);

  return (
    <>
      <CCard className="p-3">
        <CCardHeader>
          <div className="d-flex justify-content-between align-items-start">
            <div>
              <h5 style={apptheme.tx("h2")}>Technical Assessment</h5>
              <p className="text-muted mb-0">
                Technical assessment will be based upon your preferred role.
              </p>
            </div>

            <div className="text-end">
              <div style={{ fontSize: 12, opacity: 0.75 }}>Selected Role</div>
              <div style={{ fontWeight: 800 }}>{roleBadge}</div>
              <button
                type="button"
                onClick={() =>
                  navigate("/radiologist/job-preferences")
                }
                style={{
                  marginTop: 6,
                  border: "none",
                  background: "transparent",
                  color: "#0d6efd",
                  textDecoration: "none",
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                Change role
              </button>
            </div>
          </div>
        </CCardHeader>

        <CCardBody>
          {isLocked && (
            <CAlert color="warning" className="mb-3">
              Your profile is marked as <b>Completed</b>. Editing is disabled.
            </CAlert>
          )}

          {error && <CAlert color="danger">{error}</CAlert>}

          {!roleCode && (
            <CAlert color="info">
              Please select a role first.{" "}
              <b
                style={{ cursor: "pointer", textDecoration: "underline" }}
                onClick={() =>
                  navigate("/radiologist/job-preferences")
                }
              >
                Go to Role Selection
              </b>
            </CAlert>
          )}

          {loadingQ ? (
            <div className="py-4 d-flex align-items-center gap-2">
              <CSpinner size="sm" /> Loading questions...
            </div>
          ) : roleCode && !questions.length ? (
            <CAlert color="warning">
              No questions configured for this role yet.
            </CAlert>
          ) : (
            <CForm onSubmit={handleSaveContinue}>
              {questions.map((q) => {
                const qNo = Number(q.question_no);
                const a = answers?.[qNo] || {};
                return (
                  <div key={qNo} className="mb-4">
                    <CFormLabel style={apptheme.tx("label")}>
                      {qNo}. {q.question_text}
                    </CFormLabel>

                    {q.type === "radio" && Array.isArray(q.options) ? (
                      <div>
                        {q.options.map((opt) => (
                          <CFormCheck
                            key={`${qNo}-${opt.option_no}`}
                            type="radio"
                            name={`q_${qNo}`}
                            disabled={isLocked}
                            label={opt.option_text}
                            checked={String(a.option_no || "") === String(opt.option_no)}
                            onChange={() => setRadio(qNo, Number(opt.option_no))}
                          />
                        ))}
                      </div>
                    ) : (
                      <CFormInput
                        placeholder="Type your answer..."
                        disabled={isLocked}
                        value={a.free_text || ""}
                        onChange={(e) => setText(qNo, e.target.value)}
                      />
                    )}
                  </div>
                );
              })}

              <div className="text-end mt-4">
                <CButton type="submit" color="primary" disabled={saving || isLocked}>
                  {saving ? "Saving..." : "Save & Preview"}
                </CButton>
              </div>
            </CForm>
          )}
        </CCardBody>
      </CCard>

      <ProfileReviewModal
        visible={reviewOpen}
        onClose={() => setReviewOpen(false)}
        onEdit={handleEditFromReview}
        onComplete={handleCompleteFromReview}
        summary={summary}
        assessments={assessments}
        selectedRoleCode={roleCode}
        selectedRoleLabel={roleLabel}
        technicalQuestions={questions}
        loading={reviewLoading || completing}
        error={reviewError || completeError}
      />

      <ProfileCompletedModal
        visible={doneOpen}
        onClose={() => setDoneOpen(false)}
        onHome={handleHome}
      />
    </>
  );
};

export default TechnicalAssessment;
