import React, { useMemo } from "react";
import { CModal, CModalBody, CModalHeader, CModalTitle, CButton } from "@coreui/react";

const ProfileReviewModal = ({
  visible,
  onClose,
  onEdit,
  onComplete,
  summary,
  assessments,
  selectedRoleCode = null,
  selectedRoleLabel = null,
  technicalQuestions = [],
  loading,
  error,
}) => {
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
      technical: technicalQuestions.map((q) => ({
        no: q.question_no,
        text: q.question_text,
      })),
      
    };
  }, [technicalQuestions]);


  const p = summary?.profile || null;
  const prog =
    summary?.progress?.progress || // if API returns {progress:{...}}
    summary?.progress || // if API returns progress directly
    null;

  const education = summary?.education || [];
  const experience = summary?.experience?.experiences || [];
  const skills = summary?.experience?.skills || [];
  const languages = summary?.experience?.languages || [];

  const permanent = [
    p?.permanent_address?.addressLine1 || p?.permanent_address?.address_line1,
    p?.permanent_address?.city,
    p?.permanent_address?.state,
    p?.permanent_address?.pincode,
  ]
    .filter(Boolean)
    .join(", ");

  const temporary = [
    p?.temporary_address?.addressLine1 || p?.temporary_address?.address_line1,
    p?.temporary_address?.city,
    p?.temporary_address?.state,
    p?.temporary_address?.pincode,
  ]
    .filter(Boolean)
    .join(", ");

  const readAny = (obj, keys) => {
    for (const k of keys) {
      const v = obj?.[k];
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

  const technicalAnswerText = (q) => {
    const rows = assessments?.technical || [];
    const a = rows.find((x) => Number(x.question_no) === Number(q.question_no));
    if (!a) return "-";
  
    // MCQ answer saved as option_no
    if (a.option_no != null) {
      const opts = Array.isArray(q.options) ? q.options : [];
      const opt = opts.find((o) => Number(o.option_no) === Number(a.option_no));
      return opt?.option_text || `Option ${a.option_no}`;
    }
  
    // fallback for future text answers
    return a.free_text || a.answer_text || a.option_text || "-";
  };
  
  
  

  const answerText = (typeCode, qNo) => {
    const rows = assessments?.[typeCode] || [];
    const a = rows.find((x) => Number(x.question_no) === Number(qNo));
    if (!a) return "-";

    // ✅ Technical Q1 = level (support option_no OR option_text)
    if (typeCode === "technical" && Number(qNo) === 1) {
      if (a.option_no != null) return levelText(a.option_no);
      if (a.option_text) return a.option_text; // fallback
      return "-";
    }

    // ✅ Others
    return a.free_text || a.answer_text || a.option_text || "-";
  };

  return (
    <CModal alignment="center" visible={visible} onClose={onClose} size="lg">
      <CModalHeader>
        <CModalTitle>Review Your Profile (Before Completing)</CModalTitle>
      </CModalHeader>

      <CModalBody>
        {loading && <div>Loading summary...</div>}
        {error && <div className="text-danger">{error}</div>}

        {!loading && !error && (
          <div style={{ maxHeight: "70vh", overflowY: "auto", paddingRight: 8 }}>
            <Section title="Personal Details">
              <KV k="Name" v={`${p?.first_name || "-"} ${p?.last_name || ""}`.trim()} />
              <KV k="Email" v={p?.email || "-"} />
              <KV k="Phone" v={p?.phone || "-"} />
              <KV k="DOB" v={p?.dob || "-"} />
            </Section>

            <Section title="Address">
              <KV k="Permanent" v={permanent || "-"} />
              <KV k="Temporary" v={temporary || "-"} />
            </Section>

            <Section title="KYC">
              <KV k="Uploaded" v={prog?.kyc_uploaded ? "Yes" : "No"} />
              <KV k="Verified" v={prog?.kyc_verified ? "Yes" : "No"} />
            </Section>

            <Section title="Job Preferences">
              <KV k="Preferred role" v={p?.job_preferences?.preferred_role || "-"} />
              <KV k="Preferred location" v={p?.job_preferences?.preferred_location || "-"} />
              <KV k="Preferred job type" v={p?.job_preferences?.preferred_job_type || "-"} />
              <KV
                k="Expected salary"
                v={`${p?.job_preferences?.expected_salary_min ?? "-"} - ${p?.job_preferences?.expected_salary_max ?? "-"}`}
              />
            </Section>

            <Section title="Education">
              {education.length === 0 ? (
                <div>-</div>
              ) : (
                education.map((ed, idx) => (
                  <Block key={idx} title={`Education ${idx + 1}`}>
                    <KV k="Degree" v={readAny(ed, ["degree"])} />
                    <KV k="Specialization" v={readAny(ed, ["specialization", "field", "stream"])} />
                    <KV
                      k="Institution Name"
                      v={readAny(ed, ["institution_name", "institutionName", "institution", "institution_name_text"])}
                    />
                    <KV k="University" v={readAny(ed, ["university"])} />
                    <KV k="Start" v={formatEduDate(ed, "start")} />
                    <KV k="End" v={formatEduDate(ed, "end")} />
                    <KV k="Grade" v={readAny(ed, ["grade"])} />
                  </Block>
                ))
              )}
            </Section>

            <Section title="Experience">
              {experience.length === 0 ? (
                <div>-</div>
              ) : (
                experience.map((ex, idx) => (
                  <Block key={idx} title={`Experience ${idx + 1}`}>
                    <KV k="Organization" v={readAny(ex, ["organization_name", "organizationName"])} />
                    <KV k="Role" v={readAny(ex, ["role"])} />
                    <KV k="Start date" v={readAny(ex, ["start_date", "startDate", "from_date", "fromDate"])} />
                    <KV k="End date" v={readAny(ex, ["end_date", "endDate", "to_date", "toDate"])} />
                    <KV k="Total years" v={readAny(ex, ["total_years", "totalYears"])} />
                    <KV k="Description" v={readAny(ex, ["description"])} />
                  </Block>
                ))
              )}
            </Section>

            <Section title="Skills">
              {skills.length === 0 ? (
                <div>-</div>
              ) : (
                <ul className="mb-0">
                  {skills.map((s, i) => (
                    <li key={i}>
                      {readAny(s, ["skillName", "skill", "name", "skill_name"])} —{" "}
                      <b>{readAny(s, ["skillLevel", "skill_level", "proficiencyLevel", "level", "proficiency_level"])}</b>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title="Languages">
              {languages.length === 0 ? (
                <div>-</div>
              ) : (
                <ul className="mb-0">
                  {languages.map((l, i) => (
                    <li key={i}>
                      {readAny(l, ["languageName", "language", "name", "language_name"])} —{" "}
                      <b>{readAny(l, ["languageLevel", "language_level", "proficiencyLevel", "level", "proficiency_level"])}</b>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title="Assessments (Full Answers)">
              {["motivator", "archetype", "stress", "environment", "growth"].map((type) => (
                <div key={type} style={{ marginBottom: 18 }}>
                  <div className="fw-semibold mb-2" style={{ textTransform: "capitalize" }}>
                    {type}
                  </div>
                  {(questionMaps[type] || []).map((q) => (
                    <div key={q.no} style={qaRow}>
                      <div className="fw-semibold">
                        Q{q.no}. {q.text}
                      </div>
                      <div>
                        <span className="text-muted">Answer:</span> <b>{answerText(type, q.no)}</b>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
              <div style={{ marginBottom: 18 }}>
                <div className="fw-semibold mb-2">
                  Technical (Role: <b>{selectedRoleLabel || `Role ${selectedRoleCode}`}</b>)

                </div>

                {(!technicalQuestions || technicalQuestions.length === 0) ? (
                  <div>-</div>
                ) : (
                  technicalQuestions.map((q) => (
                    <div key={q.question_no} style={qaRow}>
                      <div className="fw-semibold">
                        Q{q.question_no}. {q.question_text}
                      </div>
                      <div>
                        <span className="text-muted">Answer:</span> <b>{technicalAnswerText(q)}</b>
                      </div>
                    </div>
                  ))
                )}
              </div>


            </Section>

            <div style={disclaimerStyle}>
              <b>Disclaimer:</b> Once you click <b>Complete</b>, your profile will be marked as completed and{" "}
              <b>cannot be edited</b>. If you need changes, click <b>Edit</b>.
            </div>
          </div>
        )}

        <div className="d-flex justify-content-end gap-2 mt-3">
          <CButton color="secondary" variant="outline" onClick={onEdit}>
            Edit
          </CButton>
          <CButton color="primary" onClick={onComplete}>
            Complete
          </CButton>
        </div>
      </CModalBody>
    </CModal>
  );
};

export default ProfileReviewModal;

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <h6 className="mb-2">{title}</h6>
      {children}
      <hr />
    </div>
  );
}

function KV({ k, v }) {
  return (
    <div style={{ display: "flex", gap: 12, padding: "2px 0" }}>
      <div style={{ width: 180, color: "#6b7280" }}>{k}</div>
      <div style={{ fontWeight: 600 }}>{v}</div>
    </div>
  );
}

function Block({ title, children }) {
  return (
    <div style={{ borderBottom: "1px solid #eee", paddingBottom: 10, marginBottom: 12 }}>
      <div className="fw-semibold mb-2">{title}</div>
      {children}
    </div>
  );
}


const qaRow = { borderBottom: "1px solid #f1f1f1", padding: "10px 0" };
const disclaimerStyle = {
  background: "#fff3cd",
  border: "1px solid #ffe69c",
  padding: "12px 14px",
  borderRadius: 8,
};
