import React, { useEffect, useMemo, useState } from "react";
import api from "../../../../shared/api/axios";

import {
  CCard,
  CCardHeader,
  CCardBody,
  CForm,
  CFormLabel,
  CFormInput,
  CFormSelect,
  CButton,
  CAlert,
  CSpinner,
} from "@coreui/react";

import { useNavigate } from "react-router-dom";
import { apptheme } from "./../theme/colors/apptheme";

const RadiologistJobPreferences = () => {
  const navigate = useNavigate();

  // =======================
  // LOCK STATE
  // =======================
  const [isLocked, setIsLocked] = useState(false);

  // =======================
  // ROLES
  // =======================
  const [roles, setRoles] = useState([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [rolesErr, setRolesErr] = useState("");

  // =======================
  // FORM STATE
  // =======================
  const [preferredRoleCode, setPreferredRoleCode] = useState("");
  const [preferredLocation, setPreferredLocation] = useState("");
  const [preferredJobType, setPreferredJobType] = useState("");
  const [expectedSalaryMin, setExpectedSalaryMin] = useState("");
  const [expectedSalaryMax, setExpectedSalaryMax] = useState("");

  const [saving, setSaving] = useState(false);

  // =======================
  // PREFILL BUFFER (🔥 FIX)
  // =======================
  const [loadedPrefs, setLoadedPrefs] = useState(null);

  // =======================
  // ROLE HELPERS
  // =======================
  const roleLabelByCode = useMemo(() => {
    const map = new Map();
    roles.forEach((r) =>
      map.set(String(r.role_code), `${r.role_name} (${r.role_code})`)
    );
    return map;
  }, [roles]);

  const roleCodeByName = useMemo(() => {
    const map = new Map();
    roles.forEach((r) =>
      map.set(r.role_name.toLowerCase(), String(r.role_code))
    );
    return map;
  }, [roles]);

  // =======================
  // LOAD DATA (no prefilling here)
  // =======================
  useEffect(() => {
    const load = async () => {
      // progress / lock
      try {
        const progRes = await api.get("/radiologist/progress");
        const p = progRes?.data?.progress || {};
        setIsLocked(Boolean(p?.completion_acknowledged || p?.technical_completed));
      } catch {}

      // roles
      setRolesLoading(true);
      try {
        const res = await api.get("/radiologist/roles");
        setRoles(Array.isArray(res.data) ? res.data : []);
      } catch {
        setRolesErr("Unable to load roles");
      } finally {
        setRolesLoading(false);
      }

      // job prefs
      try {
        const prefRes = await api.get("/radiologist/job-preferences");
        const data = prefRes?.data || null;
        if (data) setLoadedPrefs(data);
      } catch {}
    };

    load();
  }, []);

  // =======================
  // PREFILL AFTER ROLES LOAD ✅
  // =======================
  useEffect(() => {
    if (!loadedPrefs || roles.length === 0) return;

    if (loadedPrefs.preferred_role_code != null) {
      setPreferredRoleCode(String(loadedPrefs.preferred_role_code));
    } else if (loadedPrefs.preferred_role) {
      const code = roleCodeByName.get(
        loadedPrefs.preferred_role.toLowerCase().trim()
      );
      if (code) setPreferredRoleCode(code);
    }

    setPreferredLocation(loadedPrefs.preferred_location || "");
    setPreferredJobType(loadedPrefs.preferred_job_type || "");
    setExpectedSalaryMin(
      loadedPrefs.expected_salary_min != null
        ? String(loadedPrefs.expected_salary_min)
        : ""
    );
    setExpectedSalaryMax(
      loadedPrefs.expected_salary_max != null
        ? String(loadedPrefs.expected_salary_max)
        : ""
    );
  }, [loadedPrefs, roles, roleCodeByName]);

  // =======================
  // SAVE
  // =======================
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (isLocked) {
      navigate("/radiologist/motivator-assessment");
      return;
    }

    if (!preferredRoleCode) {
      alert("Please select Preferred Role");
      return;
    }

    setSaving(true);
    try {
      await api.put("/radiologist/job-preferences", {
        preferred_role_code: Number(preferredRoleCode),
        preferred_location: preferredLocation || null,
        preferred_job_type: preferredJobType || null,
        expected_salary_min: expectedSalaryMin
          ? Number(expectedSalaryMin)
          : null,
        expected_salary_max: expectedSalaryMax
          ? Number(expectedSalaryMax)
          : null,
      });

      alert("Job Preferences Saved");
      navigate("/radiologist/motivator-assessment");
    } catch (e) {
      alert("Failed to save job preferences");
    } finally {
      setSaving(false);
    }
  };

  return (
    <CCard>
      <CCardHeader>
        <h5 style={apptheme.tx("h2")}>Job Preferences</h5>
      </CCardHeader>

      <CCardBody>
        {isLocked && (
          <CAlert color="warning">
            Profile completed. Editing disabled.
          </CAlert>
        )}

        {rolesErr && <CAlert color="danger">{rolesErr}</CAlert>}

        <CForm onSubmit={handleSubmit}>
          {/* ROLE */}
          <div className="mb-3">
            <CFormLabel>Preferred Role</CFormLabel>

            {rolesLoading ? (
              <CSpinner size="sm" />
            ) : (
              <CFormSelect
                value={preferredRoleCode}
                onChange={(e) => setPreferredRoleCode(e.target.value)}
                disabled={isLocked}
              >
                <option value="">Select Preferred Role</option>
                {roles.map((r) => (
                  <option key={r.role_code} value={String(r.role_code)}>
                    {r.role_name} ({r.role_code})
                  </option>
                ))}
              </CFormSelect>
            )}

            <div style={{ fontSize: 13, marginTop: 6 }}>
              Selected:{" "}
              <b>
                {preferredRoleCode
                  ? roleLabelByCode.get(preferredRoleCode)
                  : "-"}
              </b>
            </div>
          </div>

          {/* LOCATION */}
          <div className="mb-3">
            <CFormLabel>Preferred Location</CFormLabel>
            <CFormInput
              value={preferredLocation}
              onChange={(e) => setPreferredLocation(e.target.value)}
              disabled={isLocked}
            />
          </div>

          {/* JOB TYPE */}
          <div className="mb-3">
            <CFormLabel>Preferred Job Type</CFormLabel>
            <CFormSelect
              value={preferredJobType}
              onChange={(e) => setPreferredJobType(e.target.value)}
              disabled={isLocked}
            >
              <option value="">Select</option>
              <option value="Remote">Remote</option>
              <option value="Hybrid">Hybrid</option>
              <option value="Onsite">Onsite</option>
            </CFormSelect>
          </div>

          {/* SALARY */}
          <div className="mb-3">
            <CFormLabel>Expected Minimum Salary</CFormLabel>
            <CFormInput
              type="number"
              value={expectedSalaryMin}
              onChange={(e) => setExpectedSalaryMin(e.target.value)}
              disabled={isLocked}
            />
          </div>

          <div className="mb-3">
            <CFormLabel>Expected Maximum Salary</CFormLabel>
            <CFormInput
              type="number"
              value={expectedSalaryMax}
              onChange={(e) => setExpectedSalaryMax(e.target.value)}
              disabled={isLocked}
            />
          </div>

          <div className="text-end">
            <CButton type="submit" color="primary" disabled={saving}>
              {saving ? "Saving..." : isLocked ? "Continue" : "Save & Continue"}
            </CButton>
          </div>
        </CForm>
      </CCardBody>
    </CCard>
  );
};

export default RadiologistJobPreferences;
