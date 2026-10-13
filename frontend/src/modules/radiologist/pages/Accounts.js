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
import { cilEnvelopeClosed, cilLockLocked, cilCloudUpload } from "@coreui/icons";
import { useNavigate } from "react-router-dom";
import api from "../../../shared/api/axios";
import './Accounts.css'

const Accounts = () => {
  const navigate = useNavigate();

  // open/close sections
  const [openPassword, setOpenPassword] = useState(false);
  const [openEmail, setOpenEmail] = useState(false);
  const [openSignature, setOpenSignature] = useState(false);

  // password form
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // email form
  const [emailPassword, setEmailPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");

  // signature
  const [signatureFile, setSignatureFile] = useState(null);
  const [signaturePreview, setSignaturePreview] = useState("");
  const [signatureUploading, setSignatureUploading] = useState(false);

  // messages
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // logout modal after change
  const [showReloginModal, setShowReloginModal] = useState(false);
  const [reloginReason, setReloginReason] = useState("changes"); // "password" | "email" | "changes"

  const currentEmail = useMemo(() => {
    // ✅ prefer your "auth" object (used in Header)
    try {
      const auth = JSON.parse(localStorage.getItem("auth") || "null");
      if (auth?.email) return auth.email;
    } catch {}

    // fallback existing storage keys
    return (
      localStorage.getItem("email") ||
      (() => {
        try {
          const u = JSON.parse(localStorage.getItem("user") || "null");
          return u?.email || "";
        } catch {
          return "";
        }
      })()
    );
  }, []);

  const clearMsgs = () => {
    setError("");
    setSuccess("");
  };

  const showSuccess3s = (msg) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(""), 3000);
  };

  const showError5s = (msg) => {
    setError(msg);
    setTimeout(() => setError(""), 5000);
  };

  const logoutNow = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("access_token");
    localStorage.removeItem("role");
    localStorage.removeItem("email");
    localStorage.removeItem("user");
    localStorage.removeItem("auth");
    navigate("/login", { replace: true });
  };

  // ==========================
  // Change Password
  // ==========================
  const handleChangePassword = async (e) => {
    e.preventDefault();
    clearMsgs();

    if (!oldPassword || !newPassword || !confirmPassword) {
      showError5s("Please fill all password fields");
      return;
    }
    if (newPassword !== confirmPassword) {
      showError5s("New password and confirm password do not match");
      return;
    }

    try {
      const res = await api.post("/change-password", {
        email: currentEmail,
        old_password: oldPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });

      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");

      showSuccess3s(res.data.message || "Password changed successfully");

      setReloginReason("password");
      setShowReloginModal(true);
      setOpenPassword(false);
    } catch (err) {
      showError5s(err.response?.data?.detail || "Failed to change password");
    }
  };

  // ==========================
  // Change Email
  // ==========================
  const handleChangeEmail = async (e) => {
    e.preventDefault();
    clearMsgs();

    if (!emailPassword || !newEmail) {
      showError5s("Please enter password and new email");
      return;
    }

    try {
      const res = await api.post("/change-email", {
        email: currentEmail,
        password: emailPassword,
        new_email: newEmail,
      });

      const updatedEmail = res.data?.email || newEmail;

      // update local storage
      localStorage.setItem("email", updatedEmail);
      try {
        const u = JSON.parse(localStorage.getItem("user") || "null");
        if (u && typeof u === "object") {
          u.email = updatedEmail;
          localStorage.setItem("user", JSON.stringify(u));
        }
      } catch {}

      // update auth if you use it
      try {
        const auth = JSON.parse(localStorage.getItem("auth") || "null");
        if (auth && typeof auth === "object") {
          auth.email = updatedEmail;
          localStorage.setItem("auth", JSON.stringify(auth));
        }
      } catch {}

      setEmailPassword("");
      setNewEmail("");

      showSuccess3s(res.data.message || "Email changed successfully");

      setReloginReason("email");
      setShowReloginModal(true);
      setOpenEmail(false);
    } catch (err) {
      showError5s(err.response?.data?.detail || "Failed to change email");
    }
  };

  // ==========================
  // Upload Signature
  // ==========================
  const handlePickSignature = (file) => {
    setSignatureFile(file || null);
    if (!file) {
      setSignaturePreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setSignaturePreview(url);
  };

  const handleUploadSignature = async (e) => {
    e.preventDefault();
    clearMsgs();
  
    if (!signatureFile) {
      showError5s("Please choose a signature image file first");
      return;
    }
  
    try {
      setSignatureUploading(true);
  
      const auth = JSON.parse(localStorage.getItem("auth") || "null");
      const userId = auth?.userId;
  
      if (!userId) {
        showError5s("User not found. Please login again.");
        return;
      }
  
      const form = new FormData();
      form.append("file", signatureFile); // ✅ same key used in Profile upload
  
      // ✅ SAME endpoint used by Profile page (updates radiology_schema.radiologists.signature_path)
      const res = await api.post(
        `/radiology/profile/${userId}/upload-signature`,
        form,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
  
      showSuccess3s(res.data?.message || "Signature uploaded successfully");
      setOpenSignature(false);
    } catch (err) {
      showError5s(err.response?.data?.detail || "Failed to upload signature");
    } finally {
      setSignatureUploading(false);
    }
  };
  

  return (
    <CContainer fluid className="px-4 py-4">
      {/* ===== Page Header ===== */}
      <div className="mb-3">
        <div className="d-flex align-items-center justify-content-between">
          <h4 className="mb-0">Accounts</h4>

          <CButton
            color="primary"
            variant="outline"
            onClick={() => navigate("/radiologist/repository")}
          >
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
          <CAlert
            color="danger"
            className="text-center"
            style={{ width: "100%", maxWidth: 720 }}
          >
            {error}
          </CAlert>
        </div>
      )}

      {success && <CAlert color="success">{success}</CAlert>}

      <CRow className="g-4">
        {/* ===================== PASSWORD SECTION ===================== */}
        <CCol xs={12}>
          <CCard style={{ borderRadius: 14 }}>
            <CCardBody>
              <div className="d-flex align-items-start justify-content-between gap-3">
                <div>
                  <h6 className="mb-1">Password</h6>
                  <div className="text-body-secondary">
                    Change your password using your old password.
                  </div>
                </div>

                <CButton
                  className="theme-btn-sm"
                  variant={openPassword ? "outline" : undefined}
                  onClick={() => {
                    clearMsgs();
                    setOpenPassword((v) => !v);
                    if (!openPassword) {
                      setOpenEmail(false);
                      setOpenSignature(false);
                    }
                  }}
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
                          <CInputGroupText>
                            <CIcon icon={cilLockLocked} />
                          </CInputGroupText>
                          <CFormInput
                            type="password"
                            placeholder="Enter old password"
                            value={oldPassword}
                            onChange={(e) => setOldPassword(e.target.value)}
                            required
                          />
                        </CInputGroup>
                      </CCol>

                      <CCol md={4}>
                        <div className="mb-1 fw-semibold">New Password</div>
                        <CInputGroup>
                          <CInputGroupText>
                            <CIcon icon={cilLockLocked} />
                          </CInputGroupText>
                          <CFormInput
                            type="password"
                            placeholder="New Password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            required
                          />
                        </CInputGroup>
                      </CCol>

                      <CCol md={4}>
                        <div className="mb-1 fw-semibold">Confirm Password</div>
                        <CInputGroup>
                          <CInputGroupText>
                            <CIcon icon={cilLockLocked} />
                          </CInputGroupText>
                          <CFormInput
                            type="password"
                            placeholder="Confirm Password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                          />
                        </CInputGroup>
                      </CCol>

                      <CCol xs={12} className="d-flex justify-content-end">
                        <CButton type="submit" color="success">
                          Update Password
                        </CButton>
                      </CCol>
                    </CRow>
                  </CForm>
                </div>
              )}
            </CCardBody>
          </CCard>
        </CCol>

        {/* ===================== EMAIL SECTION ===================== */}
        <CCol xs={12}>
          <CCard style={{ borderRadius: 14 }}>
            <CCardBody>
              <div className="d-flex align-items-start justify-content-between gap-3">
                <div>
                  <h6 className="mb-1">Email</h6>
                  <div className="text-body-secondary">
                    Change your login email by confirming your password.
                  </div>
                </div>

                <CButton
                  className="theme-btn-sm"
                  variant={openEmail ? "outline" : undefined}
                  onClick={() => {
                    clearMsgs();
                    setOpenEmail((v) => !v);
                    if (!openEmail) {
                      setOpenPassword(false);
                      setOpenSignature(false);
                    }
                  }}
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
                          <CInputGroupText>
                            <CIcon icon={cilLockLocked} />
                          </CInputGroupText>
                          <CFormInput
                            type="password"
                            placeholder="Confirm Password"
                            value={emailPassword}
                            onChange={(e) => setEmailPassword(e.target.value)}
                            required
                          />
                        </CInputGroup>
                      </CCol>

                      <CCol md={6}>
                        <div className="mb-1 fw-semibold">New Email</div>
                        <CInputGroup>
                          <CInputGroupText>
                            <CIcon icon={cilEnvelopeClosed} />
                          </CInputGroupText>
                          <CFormInput
                            type="email"
                            placeholder="New Email"
                            value={newEmail}
                            onChange={(e) => setNewEmail(e.target.value)}
                            required
                          />
                        </CInputGroup>
                      </CCol>

                      <CCol xs={12} className="d-flex justify-content-end">
                        <CButton type="submit" color="success">
                          Update Email
                        </CButton>
                      </CCol>
                    </CRow>
                  </CForm>
                </div>
              )}
            </CCardBody>
          </CCard>
        </CCol>

        {/* ===================== SIGNATURE SECTION ===================== 
        <CCol xs={12}>
          <CCard style={{ borderRadius: 14 }}>
            <CCardBody>
              <div className="d-flex align-items-start justify-content-between gap-3">
                <div>
                  <h6 className="mb-1">Signature</h6>
                  <div className="text-body-secondary">
                    Upload your signature image (PNG/JPG) for reports.
                  </div>
                </div>

                <CButton
                  color="primary"
                  variant={openSignature ? "outline" : undefined}
                  onClick={() => {
                    clearMsgs();
                    setOpenSignature((v) => !v);
                    if (!openSignature) {
                      setOpenPassword(false);
                      setOpenEmail(false);
                    }
                  }}
                >
                  {openSignature ? "Close" : "Upload Signature"}
                </CButton>
              </div>

              {openSignature && (
                <div className="mt-4">
                  <CForm onSubmit={handleUploadSignature}>
                    <CRow className="g-3">
                      <CCol md={6}>
                        <div className="mb-1 fw-semibold">Signature Image</div>
                        <CInputGroup>
                          <CInputGroupText>
                            <CIcon icon={cilCloudUpload} />
                          </CInputGroupText>
                          <CFormInput
                            type="file"
                            accept="image/png,image/jpeg"
                            onChange={(e) => handlePickSignature(e.target.files?.[0])}
                          />
                        </CInputGroup>
                        <div className="text-body-secondary mt-2" style={{ fontSize: 12 }}>
                          Recommended: transparent PNG, width ~600px
                        </div>
                      </CCol>

                      <CCol md={6}>
                        <div className="mb-1 fw-semibold">Preview</div>
                        <div
                          style={{
                            height: 90,
                            border: "1px dashed rgba(0,0,0,0.2)",
                            borderRadius: 12,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: "rgba(255,255,255,0.55)",
                            overflow: "hidden",
                          }}
                        >
                          {signaturePreview ? (
                            <img
                              src={signaturePreview}
                              alt="signature-preview"
                              style={{ maxHeight: 80, maxWidth: "100%" }}
                            />
                          ) : (
                            <span className="text-body-secondary">No file selected</span>
                          )}
                        </div>
                      </CCol>

                      <CCol xs={12} className="d-flex justify-content-end">
                        <CButton
                          type="submit"
                          color="success"
                          disabled={signatureUploading}
                        >
                          {signatureUploading ? "Uploading..." : "Save Signature"}
                        </CButton>
                      </CCol>
                    </CRow>
                  </CForm>
                </div>
              )}
            </CCardBody>
          </CCard>
        </CCol> */}
      </CRow> 

      {/* ===================== RE-LOGIN MODAL ===================== */}
      <CModal
        visible={showReloginModal}
        onClose={() => setShowReloginModal(false)}
        alignment="center"
      >
        <CModalHeader>
          <CModalTitle>Login required</CModalTitle>
        </CModalHeader>

        <CModalBody>
          {reloginReason === "password" && (
            <div>Your password has been changed successfully. Please login again.</div>
          )}
          {reloginReason === "email" && (
            <div>Your email has been changed successfully. Please login again.</div>
          )}
          {reloginReason === "changes" && (
            <div>Your account details have been changed. Please login again.</div>
          )}
        </CModalBody>

        <CModalFooter>
          <CButton color="danger" onClick={logoutNow}>
            Logout & Login Again
          </CButton>
        </CModalFooter>
      </CModal>
    </CContainer>
  );
};

export default Accounts;
