import React, { useState, useEffect } from "react";
import { CBadge } from "@coreui/react";
import api from "../../../../shared/api/axios"


import {
  CCard,
  CCardHeader,
  CCardBody,
  CForm,
  CFormInput,
  CFormLabel,
  CRow,
  CCol,
  CButton,
  CFormTextarea,
} from "@coreui/react";
import { useNavigate } from "react-router-dom";
import { apptheme } from './../theme/colors/apptheme'


const DRAFT_KEY = "draft.radiologist.experience";

const Experience = () => {
  const navigate = useNavigate();

  const [experiences, setExperiences] = useState([
    {
      organization_name: "",
      role: "",
      description: "",
      start_date: "",
      end_date: "",
      total_years: "",
    },
  ]);

  const addExperience = () => {
    setExperiences([
      ...experiences,
      {
        organization_name: "",
        role: "",
        description: "",
        start_date: "",
        end_date: "",
        total_years: "",
      },
    ]);
  };

  const removeExperience = (index) => {
    const updated = experiences.filter((_, i) => i !== index);
    setExperiences(updated);
  };

  const handleExperienceChange = (index, e) => {
    const updated = [...experiences];
    updated[index][e.target.name] = e.target.value;
    setExperiences(updated);
  };

  // skills
  const [skillName, setSkillName] = useState("");
  const [skillLevel, setSkillLevel] = useState("");
  const [skills, setSkills] = useState([]);

  const addSkill = () => {
    if (!skillName || !skillLevel) return alert("Enter skill & select level!");
    setSkills([...skills, { skillName, skillLevel }]);
    setSkillName("");
    setSkillLevel("");
  };

  const removeSkill = (index) => {
    setSkills(skills.filter((_, i) => i !== index));
  };

  // languages (frontend-only draft unless you add table)
  const [languageName, setLanguageName] = useState("");
  const [languageLevel, setLanguageLevel] = useState("");
  const [languages, setLanguages] = useState([]);

  const addLanguage = () => {
    if (!languageName || !languageLevel)
      return alert("Enter language & select level!");
    setLanguages([...languages, { languageName, languageLevel }]);
    setLanguageName("");
    setLanguageLevel("");
  };

  const removeLanguage = (index) => {
    setLanguages(languages.filter((_, i) => i !== index));
  };

  // ✅ load draft + backend
  useEffect(() => {
    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
      if (draft) {
        if (draft.experiences) setExperiences(draft.experiences);
        if (draft.skills) setSkills(draft.skills);
        if (draft.languages) setLanguages(draft.languages);
      }
    } catch {}

    const load = async () => {
      try {
        const res = await api.get("/radiologist/experience");
        const d = res.data || {};
        if (d.experiences?.length) setExperiences(d.experiences);

        if (d.skills?.length) {
          setSkills(
            d.skills.map((s) => ({
              skillName: s.skill_name,
              skillLevel: s.proficiency_level,
            }))
          );
        }

        // languages only if your backend returns it (optional)
        if (d.languages?.length) {
          setLanguages(
            d.languages.map((l) => ({
              languageName: l.language_name,
              languageLevel: l.proficiency_level,
            }))
          );
        }
      } catch {}
    };
    load();
  }, []);

  // ✅ autosave draft
  useEffect(() => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ experiences, skills, languages })
    );
  }, [experiences, skills, languages]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    const payload = {
      experiences: experiences.map((x) => ({
        organization_name: x.organization_name,
        role: x.role,
        description: x.description,
        start_date: x.start_date || null,
        end_date: x.end_date || null,
        total_years: x.total_years ? Number(x.total_years) : null,
      })),
      skills: skills.map((s) => ({
        skill_name: s.skillName,
        proficiency_level: s.skillLevel,
      })),
      // ✅ keep languages in draft; backend will ignore unless you implement it
      languages: languages.map((l) => ({
        language_name: l.languageName,
        proficiency_level: l.languageLevel,
      })),
    };

    try {
      await api.post("/radiologist/experience", payload);
      localStorage.removeItem(DRAFT_KEY);
      alert("Experience & Skills Saved Successfully!");
      navigate("/radiologist/job-preferences");
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.detail || "Failed to save experience/skills");
    }
  };

  return (
    <CCard>
      <CCardHeader>
        <h5 style={apptheme.tx("h2")}>Experiences, Skills and Languages</h5>
        <div style={{ fontSize: '14px', color: '#6c757d' }}>
          Personal Details✔&nbsp;›&nbsp;KYC✔&nbsp;›&nbsp;Education Profile✔&nbsp;›&nbsp;
          <span style={{ color: '#007bff', fontWeight: 'bold' }}>Experiences</span>
          &nbsp;›&nbsp;Job Preferences
        </div>
      </CCardHeader>

      <CCardBody>
        <CForm onSubmit={handleSubmit}>
        <div style={apptheme.tx("h3", { marginBottom: 12 })}>
          Experience
        </div>



          {experiences.map((exp, index) => (
            <div
              key={index}
              style={{
                border: "1px solid #ddd",
                padding: "15px",
                borderRadius: "8px",
                marginBottom: "15px",
              }}
            >
              <CRow>
                <CCol md={6}>
                  <CFormLabel style={apptheme.tx("label")}>Organization Name</CFormLabel>
                  <CFormInput
                    type="text"
                    name="organization_name"
                    value={exp.organization_name}
                    onChange={(e) => handleExperienceChange(index, e)}
                  />
                </CCol>

                <CCol md={6}>
                  <CFormLabel style={apptheme.tx("label")}>Role</CFormLabel>
                  <CFormInput
                    type="text"
                    name="role"
                    value={exp.role}
                    onChange={(e) => handleExperienceChange(index, e)}
                  />
                </CCol>
              </CRow>

              <CRow className="mt-2">
                <CCol>
                  <CFormLabel style={apptheme.tx("label")}>Description</CFormLabel>
                  <CFormTextarea
                    name="description"
                    value={exp.description}
                    onChange={(e) => handleExperienceChange(index, e)}
                    rows={2}
                  />
                </CCol>
              </CRow>

              <CRow className="mt-2">
                <CCol md={4}>
                  <CFormLabel style={apptheme.tx("label")}>Start Date</CFormLabel>
                  <CFormInput
                    type="date"
                    name="start_date"
                    value={exp.start_date}
                    onChange={(e) => handleExperienceChange(index, e)}
                  />
                </CCol>

                <CCol md={4}>
                  <CFormLabel style={apptheme.tx("label")}>End Date</CFormLabel>
                  <CFormInput
                    type="date"
                    name="end_date"
                    value={exp.end_date}
                    onChange={(e) => handleExperienceChange(index, e)}
                  />
                </CCol>

                <CCol md={4}>
                  <CFormLabel style={apptheme.tx("label")}>Total Years</CFormLabel>
                  <CFormInput
                    type="number"
                    name="total_years"
                    value={exp.total_years}
                    onChange={(e) => handleExperienceChange(index, e)}
                  />
                </CCol>
              </CRow>

              <div className="text-end mt-2">
                {index === 0 ? (
                  <CButton color="primary" onClick={addExperience}>
                    Add Experience
                  </CButton>
                ) : (
                  <CButton color="primary" onClick={() => removeExperience(index)}>
                    Close
                  </CButton>
                )}
              </div>
            </div>
          ))}

         
          <CRow>
            <CCol md={4}>
              <CFormLabel style={apptheme.tx("label", {marginTop:20})}>Skill</CFormLabel>
              <CFormInput value={skillName} onChange={(e) => setSkillName(e.target.value)} />
            </CCol>

            <CCol md={4}>
              <CFormLabel style={apptheme.tx("label", {marginTop:20})}>Proficiency Level</CFormLabel>
              <select className="form-control" value={skillLevel} onChange={(e) => setSkillLevel(e.target.value)}>
                <option value="">Select</option>
                <option>Beginner</option>
                <option>Intermediate</option>
                <option>Expert</option>
              </select>
            </CCol>

            <CCol md={4} className="d-flex align-items-end">
              <CButton color="primary" onClick={addSkill}>Add Skill</CButton>
            </CCol>
          </CRow>

          

          {skills.length > 0 && (
            <div className="d-flex flex-wrap gap-2 mt-3">
              {skills.map((s, index) => (
                <CBadge
                  key={index}
                  color="primary"
                  className="d-flex align-items-center px-3 py-2"
                  style={{ fontSize: "0.85rem", borderRadius: "20px" }}
                >
                  {s.skillName} – {s.skillLevel}
                  <CButton
                    size="sm"
                    color="light"
                    className="ms-2 p-0 px-2"
                    style={{ borderRadius: "50%" }}
                    onClick={() => removeSkill(index)}
                  >
                    ×
                  </CButton>
                </CBadge>
              ))}
            </div>
          )}


          <CRow>
            <CCol md={4}>
              <CFormLabel style={apptheme.tx("label", {marginTop:20})}>Language</CFormLabel>
              <CFormInput value={languageName} onChange={(e) => setLanguageName(e.target.value)} />
            </CCol>

            <CCol md={4}>
              <CFormLabel style={apptheme.tx("label", {marginTop:20})}>Proficiency Level</CFormLabel>
              <select className="form-control" value={languageLevel} onChange={(e) => setLanguageLevel(e.target.value)}>
                <option value="">Select</option>
                <option>Beginner</option>
                <option>Intermediate</option>
                <option>Expert</option>
              </select>
            </CCol>

            <CCol md={4} className="d-flex align-items-end">
              <CButton color="primary" onClick={addLanguage}>Add Language</CButton>
            </CCol>
          </CRow>

          {languages.length > 0 && (
            <div className="d-flex flex-wrap gap-2 mt-3">
              {languages.map((l, index) => (
                <CBadge
                  key={index}
                  color="primary"
                  className="d-flex align-items-center px-3 py-2"
                  style={{ fontSize: "0.85rem", borderRadius: "20px" }}
                >
                  {l.languageName} – {l.languageLevel}
                  <CButton
                    size="sm"
                    color="light"
                    className="ms-2 p-0 px-2"
                    style={{ borderRadius: "50%" }}
                    onClick={() => removeLanguage(index)}
                  >
                    ×
                  </CButton>
                </CBadge>
              ))}
            </div>
          )}


          <div className="text-end mt-4">
            <CButton type="submit" color="primary">Save & Continue</CButton>
          </div>
        </CForm>
      </CCardBody>
    </CCard>
  );
};

export default Experience;
