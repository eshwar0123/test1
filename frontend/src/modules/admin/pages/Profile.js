import React, { useState, useRef, useEffect } from "react";
import { useTheme } from "../layout/ThemeContext";
import {
  CCard,
  CCardBody,
  CAvatar,
  CButton,
  CRow,
  CCol,
  CAlert,
  CModal,
  CModalHeader,
  CModalTitle,
  CModalBody,
  CModalFooter,
  CFormRange,
} from "@coreui/react";
import Cropper from "react-easy-crop";

async function getCroppedImageBlob(imageSrc, cropPixels, outType = "image/png") {
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = imageSrc;
  });
  const canvas = document.createElement("canvas");
  canvas.width = cropPixels.width;
  canvas.height = cropPixels.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, cropPixels.x, cropPixels.y, cropPixels.width, cropPixels.height, 0, 0, cropPixels.width, cropPixels.height);
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), outType, 0.95));
}

export default function Profile() {
  const { isDark } = useTheme();

  const [profile, setProfile] = useState(null);
  const [fetchError, setFetchError] = useState("");

  useEffect(() => {
    const auth = (() => {
      try { return JSON.parse(localStorage.getItem("auth") || "null"); } catch { return null; }
    })();
    const token = auth?.token || auth?.access_token;
    if (!token) { setFetchError("Not logged in"); return; }

    fetch("http://127.0.0.1:8000/admin/profile", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch profile");
        return res.json();
      })
      .then((data) => setProfile(data))
      .catch(() => setFetchError("Could not load profile from server"));
  }, []);

  const name     = profile?.username || profile?.name || "Admin";
  const email    = profile?.email || "";
  const initials = name.slice(0, 2).toUpperCase();

  const [photoPreview, setPhotoPreview] = useState(() => localStorage.getItem("adminAvatarUrl") || "");
  const [success, setSuccess]           = useState("");
  const [error, setError]               = useState("");

  const [modalOpen, setModalOpen]               = useState(false);
  const [imageSrc, setImageSrc]                 = useState("");
  const [crop, setCrop]                         = useState({ x: 0, y: 0 });
  const [zoom, setZoom]                         = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [saving, setSaving]                     = useState(false);
  const [pendingBlob, setPendingBlob]           = useState(null);

  const photoInputRef = useRef(null);

  const showSuccess = (m) => { setSuccess(m); setTimeout(() => setSuccess(""), 3000); };
  const showError   = (m) => { setError(m);   setTimeout(() => setError(""), 4000);   };

  const onPickPhoto = (file) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setImageSrc(url);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setModalOpen(true);
  };

  const onCropComplete = (_, pixels) => setCroppedAreaPixels(pixels);

  const closeModal = () => {
    setModalOpen(false);
    if (imageSrc?.startsWith("blob:")) URL.revokeObjectURL(imageSrc);
    setImageSrc("");
    setSaving(false);
  };

  const doUpload = async () => {
    if (!croppedAreaPixels || !imageSrc) return;
    try {
      setSaving(true);
      const blob = await getCroppedImageBlob(imageSrc, croppedAreaPixels, "image/png");
      const localUrl = URL.createObjectURL(blob);
      setPhotoPreview(localUrl);
      localStorage.setItem("adminAvatarUrl", localUrl);
      window.dispatchEvent(new Event("avatar-updated"));
      showSuccess("Profile photo updated");
      closeModal();
    } catch {
      showError("Failed to crop image");
      setSaving(false);
    }
  };

  if (fetchError) return <p className="text-center mt-5">{fetchError}</p>;
  if (!profile) return <p className="text-center mt-5">Loading profile...</p>;

  return (
    <>
      <input ref={photoInputRef} type="file" accept="image/png,image/jpeg"
        style={{ display: "none" }} onChange={(e) => onPickPhoto(e.target.files?.[0])} />

      <CRow className="justify-content-center" style={{ padding: "32px 20px 0" }}>
        <CCol md={10} lg={7}>
          <CCard className="shadow-sm" style={{ background: isDark ? "var(--bg-card)" : "#fff", border: `1px solid ${isDark ? "var(--border)" : "#e5e7eb"}` }}>
            <CCardBody>
              {error   && <CAlert color="danger">{error}</CAlert>}
              {success && <CAlert color="success">{success}</CAlert>}

              {/* Avatar */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 28 }}>
                <CAvatar
                  src={photoPreview || undefined}
                  color="primary"
                  style={{ width: 96, height: 96, fontSize: 32, marginBottom: 12 }}
                  onError={() => { setPhotoPreview(""); localStorage.removeItem("adminAvatarUrl"); }}
                >
                  {!photoPreview && initials}
                </CAvatar>
                <CButton size="sm" color="primary" variant="outline" onClick={() => photoInputRef.current?.click()}>
                  Upload Photo
                </CButton>
              </div>

              {/* Info rows */}
              <div style={{ border: `1px solid ${isDark ? "var(--border)" : "#e5e7eb"}`, borderRadius: 12, overflow: "hidden", background: isDark ? "var(--bg-card)" : "#fff" }}>
                {[
                  { label: "Name",  value: name },
                  { label: "Email", value: email },
                  { label: "Role",  value: profile?.role || "Administrator" },
                ].map(({ label, value }, i, arr) => (
                  <div key={label} style={{ display: "flex", padding: "16px 20px", borderBottom: i < arr.length - 1 ? `1px solid ${isDark ? "var(--border)" : "#f1f5f9"}` : "none", background: isDark ? (i % 2 === 0 ? "var(--bg-card)" : "rgba(255,255,255,0.03)") : (i % 2 === 0 ? "#fff" : "#f8fafc") }}>
                    <div style={{ width: 140, fontWeight: 700, color: isDark ? "var(--text-muted)" : "#6b7280", fontSize: 14 }}>{label}</div>
                    <div style={{ fontWeight: 500, color: isDark ? "var(--text)" : "#111827", fontSize: 15 }}>{value || "—"}</div>
                  </div>
                ))}
              </div>
            </CCardBody>
          </CCard>
        </CCol>
      </CRow>

      {/* Crop modal */}
      <CModal visible={modalOpen} onClose={closeModal} alignment="center" size="lg">
        <CModalHeader><CModalTitle>Crop Profile Photo</CModalTitle></CModalHeader>
        <CModalBody>
          {imageSrc && (
            <>
              <div style={{ position: "relative", height: 320, background: "#000" }}>
                <Cropper image={imageSrc} crop={crop} zoom={zoom} aspect={1}
                  onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={onCropComplete} />
              </div>
              <div className="mt-3">
                <div className="fw-semibold mb-2">Zoom</div>
                <CFormRange min={1} max={3} step={0.01} value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))} />
              </div>
            </>
          )}
        </CModalBody>
        <CModalFooter>
          <CButton color="secondary" variant="outline" onClick={closeModal} disabled={saving}>Cancel</CButton>
          <CButton color="success" onClick={doUpload} disabled={saving}>{saving ? "Saving..." : "Save"}</CButton>
        </CModalFooter>
      </CModal>
    </>
  );
}
