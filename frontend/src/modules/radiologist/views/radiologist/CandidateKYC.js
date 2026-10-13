import React, { useState, useEffect, useRef } from "react";
import api from "../../../../shared/api/axios";

import {
  CCard,
  CCardHeader,
  CCardBody,
  CForm,
  CFormLabel,
  CFormInput,
  CButton,
  CAlert,
  CSpinner,
  CModal,
  CModalHeader,
  CModalTitle,
  CModalBody,
} from "@coreui/react";

import { useNavigate } from "react-router-dom";
import { apptheme } from './../theme/colors/apptheme'


const RadiologistKYC = () => {
  const [kycFile, setKycFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  const [existingKyc, setExistingKyc] = useState(null);

  // ✅ lock like TechnicalAssessment
  const [isLocked, setIsLocked] = useState(false);

  // ✅ view/download loading
  const [opening, setOpening] = useState(false);
  const [openErr, setOpenErr] = useState("");
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerUrl, setViewerUrl] = useState("");
  const [viewerType, setViewerType] = useState(""); // image | pdf
  const [saving, setSaving] = useState(false);

  // ✅ prevents reopen after close (async race)
  const openTokenRef = useRef(0);

  const navigate = useNavigate();

  // ✅ backend absolute url helper (kept same)
  const toAbsoluteUrl = (pathOrUrl) => {
    if (!pathOrUrl) return "";
    if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) return pathOrUrl;
    try {
      const origin = new URL(api.defaults.baseURL).origin;
      const p = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
      return origin + p;
    } catch {
      return pathOrUrl;
    }
  };

  // ✅ Load lock state + latest KYC
  useEffect(() => {
    const load = async () => {
      try {
        const [progRes, kycRes] = await Promise.allSettled([
          api.get("/radiologist/progress"),
          api.get("/radiologist/kyc"),
        ]);

        const progress =
          progRes.status === "fulfilled"
            ? progRes.value?.data?.progress || progRes.value?.data
            : null;

        const ack = Boolean(progress?.completion_acknowledged);
        setIsLocked(ack);

        const kycData = kycRes.status === "fulfilled" ? kycRes.value?.data : null;
        if (kycData?.file_path) setExistingKyc(kycData);
      } catch {
        // ignore
      }
    };

    load();
  }, []);

  const handleFileChange = (e) => {
    if (isLocked) return;

    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ["image/jpeg", "image/png", "application/pdf"];
    if (!allowedTypes.includes(file.type)) {
      alert("Upload only JPG, PNG, or PDF files.");
      return;
    }

    setKycFile(file);
    setExistingKyc(null);
    setOpenErr("");

    if (file.type === "application/pdf") {
      setPreviewUrl(null);
    } else {
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  // ✅ Open existing file (modal) (race-safe + fallback)
  const openExisting = async () => {
    if (!existingKyc?.file_path) return;

    setOpening(true);
    setOpenErr("");

    // token to prevent reopen after close
    const token = ++openTokenRef.current;

    const openBlobInModal = (blob, contentTypeHeader) => {
      // If user closed while loading, stop
      if (token !== openTokenRef.current) return;

      const contentType = contentTypeHeader || blob.type || "application/octet-stream";
      const url = URL.createObjectURL(blob);

      setViewerUrl(url);
      setViewerType(contentType.includes("pdf") ? "pdf" : "image");
      setViewerOpen(true);
    };

    try {
      // 1) secured endpoint if present
      const res = await api.get("/radiologist/kyc/file", { responseType: "blob" });
      openBlobInModal(res.data, res.headers?.["content-type"]);
    } catch (e1) {
      try {
        // 2) fallback: fetch using stored file_path with axios (keeps auth headers)
        const path = existingKyc.file_path.startsWith("/") ? existingKyc.file_path : `/${existingKyc.file_path}`;
        const res2 = await api.get(path, { responseType: "blob" });
        openBlobInModal(res2.data, res2.headers?.["content-type"]);
      } catch (e2) {
        console.error("openExisting failed:", e1, e2);
        setOpenErr("Unable to open document (check backend file route / permissions).");
      }
    } finally {
      setOpening(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // ✅ if locked, don't allow upload/edit — only allow navigation if already uploaded
    if (isLocked) {
      if (existingKyc?.file_path) {
        navigate("/base-profile-education");
        return;
      }
      alert("Your profile is completed. Upload is disabled.");
      return;
    }

    // allow continue if already uploaded
    if (!kycFile) {
      if (existingKyc?.file_path) {
        navigate("/base-profile-education");
        return;
      }
      alert("Please upload your KYC document.");
      return;
    }

    setSaving(true);

    try {
      const formData = new FormData();

      // ✅ send both keys (some backends expect different names)
      formData.append("file", kycFile);
      formData.append("image", kycFile);

      await api.post("/radiologist/kyc", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      // ✅ refresh existingKyc from backend so UI is consistent
      try {
        const res = await api.get("/radiologist/kyc");
        if (res.data?.file_path) setExistingKyc(res.data);
      } catch {}

      // cleanup preview
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setKycFile(null);

      alert("KYC Uploaded Successfully!");
      navigate("/base-profile-education");
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.detail || err.response?.data?.message || "KYC upload failed");
    } finally {
      setSaving(false);
    }
  };

  const closeViewer = () => {
    // invalidate any pending open
    openTokenRef.current++;

    // cleanup
    if (viewerUrl) URL.revokeObjectURL(viewerUrl);

    setViewerOpen(false);
    setViewerUrl("");
  };

  return (
    <CCard>
      <CCardHeader>
        <h5 style={apptheme.tx("h2")}>KYC Verification</h5>

        <div style={{ fontSize: "14px", color: "#6c757d" }}>
          Personal Details✔ › <span style={{ color: "#007bff", fontWeight: "bold" }}>KYC</span> › Education Profile ›
          Experience › Job Preferences
        </div>
      </CCardHeader>

      <CCardBody>
        {isLocked && (
          <CAlert color="warning" className="mb-3">
            Your profile is marked as <b>Completed</b>. Editing is disabled.
          </CAlert>
        )}

        <CForm onSubmit={handleSubmit}>
          <CFormLabel style={apptheme.tx("label")}>Upload KYC Document (Passport / Govt ID)</CFormLabel>
          <CFormInput
            type="file"
            accept=".jpg,.jpeg,.png,.pdf"
            onChange={handleFileChange}
            disabled={isLocked}
          />

          {/* ✅ Already uploaded */}
          {existingKyc?.file_path && !kycFile && (
            <div className="mt-3">
              <h3 style={apptheme.tx("label")}>Already Uploaded:</h3>

              <p style={{ marginBottom: 6 }}>{existingKyc.file_path.split("/").pop()}</p>

              <div className="d-flex gap-2 align-items-center">
                <CButton type="button" color="info" variant="outline" onClick={openExisting} disabled={opening}>
                  {opening ? (
                    <>
                      <CSpinner size="sm" className="me-2" />
                      Opening...
                    </>
                  ) : (
                    "View uploaded document"
                  )}
                </CButton>

                <span style={{ fontSize: 13, color: "#6c757d" }}>
                  Status: <b>{existingKyc.status || "Uploaded"}</b> {existingKyc.verified ? "(Verified)" : ""}
                </span>
              </div>

              {openErr && (
                <div className="mt-2">
                  <CAlert color="danger" className="mb-0">
                    {openErr}
                  </CAlert>
                </div>
              )}
            </div>
          )}

          {/* Preview */}
          {previewUrl && (
            <div className="mt-3">
              <h6>Preview:</h6>
              <img
                src={previewUrl}
                alt="KYC Preview"
                style={{ width: "300px", borderRadius: "8px", border: "1px solid #ccc" }}
              />
            </div>
          )}

          {!previewUrl && kycFile?.type === "application/pdf" && (
            <div className="mt-3">
              <h6>PDF Uploaded:</h6>
              <p>{kycFile.name}</p>
            </div>
          )}

          <div className="text-end mt-4">
            <CButton type="submit" color="primary" disabled={saving || (isLocked && !existingKyc?.file_path)}>
              {saving ? (
                <>
                  <CSpinner size="sm" className="me-2" />
                  Saving...
                </>
              ) : (
                "Save & Continue"
              )}
            </CButton>
          </div>
        </CForm>
      </CCardBody>

      {/* ================= DOCUMENT VIEWER MODAL ================= */}
      <CModal visible={viewerOpen} size="lg" alignment="center" onClose={closeViewer}>
        <CModalHeader closeButton>
          <CModalTitle>Uploaded KYC Document</CModalTitle>
        </CModalHeader>

        <CModalBody style={{ textAlign: "center" }}>
          {viewerType === "image" && (
            <img
              src={viewerUrl}
              alt="KYC Document"
              style={{
                maxWidth: "100%",
                maxHeight: "70vh",
                borderRadius: 8,
                border: "1px solid #ddd",
              }}
            />
          )}

          {viewerType === "pdf" && (
            <iframe
              src={viewerUrl}
              title="KYC PDF"
              style={{
                width: "100%",
                height: "70vh",
                border: "none",
              }}
            />
          )}
        </CModalBody>
      </CModal>
    </CCard>
  );
};

export default RadiologistKYC;
