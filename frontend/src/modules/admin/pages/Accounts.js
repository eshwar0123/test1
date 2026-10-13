import React, { useMemo, useState } from "react";
import {
  CAlert,
  CButton,
  CCard,
  CCardBody,
  CCol,
  CContainer,
  CForm,
  CFormInput,
  CInputGroup,
  CInputGroupText,
  CRow,
  CModal,
  CModalBody,
  CModalFooter,
  CModalHeader,
  CModalTitle,
} from "@coreui/react";
import CIcon from "@coreui/icons-react";
import { cilEnvelopeClosed, cilLockLocked } from "@coreui/icons";
import { useNavigate } from "react-router-dom";
import api from "../../../shared/api/axios";
import "./Accounts.css";

const Accounts = () => {
  const navigate = useNavigate();

  const [openPassword, setOpenPassword] = useState(false);
  const [openEmail, setOpenEmail] = useState(false);

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [emailPassword, setEmailPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [showReloginModal, setShowReloginModal] = useState(false);
  const [reloginReason, setReloginReason] = useState("changes");

  const currentEmail = useMemo(() => {
    try {
      const auth = JSON.parse(localStorage.getItem("auth") || "null");
      if (auth?.email) return auth.email;
    } catch {}
    return localStorage.getItem("email") || "";
  }, []);

  const clearMsgs = () => { setError(""); setSuccess(""); };
  const showSuccess3s = (msg) => { setSuccess(msg); setTimeout(() => setSuccess(""), 3000); };
  const showError5s   = (msg) => { setError(msg);   setTimeout(() => setError(""),   5000); };

  const logoutNow = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("access_token");
    localStorage.removeItem("auth");
    navigate("/admin/login", { replace: true });
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    clearMsgs();
    if (!oldPassword || !newPassword || !confirmPassword) { showError5s("Please fill all password fields"); return; }
    if (newPassword !== confirmPassword) { showError5s("New password and confirm password do not match"); return; }
    try {
      const res = await api.post("/change-password", {
        email: currentEmail,
        old_password: oldPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
      setOldPassword(""); setNewPassword(""); setConfirmPassword("");
      showSuccess3s(res.data.message || "Password changed successfully");
      setReloginReason("password");
      setShowReloginModal(true);
      setOpenPassword(false);
    } catch (err) {
      showError5s(err.response?.data?.detail || "Failed to change password");
    }
  };

  const handleChangeEmail = async (e) => {
    e.preventDefault();
    clearMsgs();
    if (!emailPassword || !newEmail) { showError5s("Please enter password and new email"); return; }
    try {
      const res = await api.post("/change-email", {
        email: currentEmail,
        password: emailPassword,
        new_email: newEmail,
      });
      const updatedEmail = res.data?.email || newEmail;
      localStorage.setItem("email", updatedEmail);
      try {
        const auth = JSON.parse(localStorage.getItem("auth") || "null");
        if (auth && typeof auth === "object") {
          auth.email = updatedEmail;
          localStorage.setItem("auth", JSON.stringify(auth));
        }
      } catch {}
      setEmailPassword(""); setNewEmail("");
      showSuccess3s(res.data.message || "Email changed successfully");
      setReloginReason("email");
      setShowReloginModal(true);
      setOpenEmail(false);
    } catch (err) {
      showError5s(err.response?.data?.detail || "Failed to change email");
    }
  };

  return (
    <CContainer fluid className="px-4 py-4">
      <div className="mb-3">
        <div className="d-flex align-items-center justify-content-between">
          <h4 className="mb-0">Accounts</h4>
          <CButton color="primary" variant="outline" onClick={() => navigate("/admin/dashboard")}>
            Back
          </CButton>
        </div>
        <div className="text-body-secondary mt-1">
          Manage your account credentials
          <span style={{ marginLeft: 8 }}>
            | Login Email: <b>{currentEmail || "-"}</b>
          </span>
        </div>
      </div>

      {error && (
        <div className="d-flex justify-content-center">
          <CAlert color="danger" className="text-center" style={{ width: "100%", maxWidth: 720 }}>
            {error}
          </CAlert>
        </div>
      )}
      {success && <CAlert color="success">{success}</CAlert>}

      <CRow className="g-4">
        {/* PASSWORD */}
        <CCol xs={12}>
          <CCard style={{ borderRadius: 14 }}>
            <CCardBody>
              <div className="d-flex align-items-start justify-content-between gap-3">
                <div>
                  <h6 className="mb-1">Password</h6>
                  <div className="text-body-secondary">Change your password using your old password.</div>
                </div>
                <CButton
                  className="theme-btn-sm"
                  variant={openPassword ? "outline" : undefined}
                  onClick={() => { clearMsgs(); setOpenPassword((v) => !v); if (!openPassword) setOpenEmail(false); }}
                >
                  {openPassword ? "Close" : "Reset Password"}
                </CButton>
              </div>

              {openPassword && (
                <div className="mt-4">
                  <CForm onSubmit={handleChangePassword}>
                    <CRow className="g-3">
                      <CCol md={4}>
                        <div className="mb-1 fw-semibold">Old Password</div>
                        <CInputGroup>
                          <CInputGroupText><CIcon icon={cilLockLocked} /></CInputGroupText>
                          <CFormInput type="password" placeholder="Enter old password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} required />
                        </CInputGroup>
                      </CCol>
                      <CCol md={4}>
                        <div className="mb-1 fw-semibold">New Password</div>
                        <CInputGroup>
                          <CInputGroupText><CIcon icon={cilLockLocked} /></CInputGroupText>
                          <CFormInput type="password" placeholder="New Password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
                        </CInputGroup>
                      </CCol>
                      <CCol md={4}>
                        <div className="mb-1 fw-semibold">Confirm Password</div>
                        <CInputGroup>
                          <CInputGroupText><CIcon icon={cilLockLocked} /></CInputGroupText>
                          <CFormInput type="password" placeholder="Confirm Password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
                        </CInputGroup>
                      </CCol>
                      <CCol xs={12} className="d-flex justify-content-end">
                        <CButton type="submit" color="success">Update Password</CButton>
                      </CCol>
                    </CRow>
                  </CForm>
                </div>
              )}
            </CCardBody>
          </CCard>
        </CCol>

        {/* EMAIL */}
        <CCol xs={12}>
          <CCard style={{ borderRadius: 14 }}>
            <CCardBody>
              <div className="d-flex align-items-start justify-content-between gap-3">
                <div>
                  <h6 className="mb-1">Email</h6>
                  <div className="text-body-secondary">Change your login email by confirming your password.</div>
                </div>
                <CButton
                  className="theme-btn-sm"
                  variant={openEmail ? "outline" : undefined}
                  onClick={() => { clearMsgs(); setOpenEmail((v) => !v); if (!openEmail) setOpenPassword(false); }}
                >
                  {openEmail ? "Close" : "Change Email"}
                </CButton>
              </div>

              {openEmail && (
                <div className="mt-4">
                  <CForm onSubmit={handleChangeEmail}>
                    <CRow className="g-3">
                      <CCol md={6}>
                        <div className="mb-1 fw-semibold">Password</div>
                        <CInputGroup>
                          <CInputGroupText><CIcon icon={cilLockLocked} /></CInputGroupText>
                          <CFormInput type="password" placeholder="Confirm Password" value={emailPassword} onChange={(e) => setEmailPassword(e.target.value)} required />
                        </CInputGroup>
                      </CCol>
                      <CCol md={6}>
                        <div className="mb-1 fw-semibold">New Email</div>
                        <CInputGroup>
                          <CInputGroupText><CIcon icon={cilEnvelopeClosed} /></CInputGroupText>
                          <CFormInput type="email" placeholder="New Email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required />
                        </CInputGroup>
                      </CCol>
                      <CCol xs={12} className="d-flex justify-content-end">
                        <CButton type="submit" color="success">Update Email</CButton>
                      </CCol>
                    </CRow>
                  </CForm>
                </div>
              )}
            </CCardBody>
          </CCard>
        </CCol>
      </CRow>

      <CModal visible={showReloginModal} onClose={() => setShowReloginModal(false)} alignment="center">
        <CModalHeader><CModalTitle>Login required</CModalTitle></CModalHeader>
        <CModalBody>
          {reloginReason === "password" && <div>Your password has been changed successfully. Please login again.</div>}
          {reloginReason === "email"    && <div>Your email has been changed successfully. Please login again.</div>}
          {reloginReason === "changes"  && <div>Your account details have been changed. Please login again.</div>}
        </CModalBody>
        <CModalFooter>
          <CButton color="danger" onClick={logoutNow}>Logout &amp; Login Again</CButton>
        </CModalFooter>
      </CModal>
    </CContainer>
  );
};

export default Accounts;
