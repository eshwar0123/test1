import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Account.css";

const Account = () => {
  const navigate = useNavigate();
  const auth = JSON.parse(localStorage.getItem("auth")) || {};
  const loginEmail = auth.email || "";

  // ── Reset Password Modal ────────────────────────────────────────────────────
  const [showPwModal, setShowPwModal] = useState(false);
  const [pwForm, setPwForm] = useState({ oldPassword: "", newPassword: "", confirmPassword: "" });
  const [pwError, setPwError] = useState("");
  const [pwLoading, setPwLoading] = useState(false);

  const openPwModal = () => { setPwForm({ oldPassword: "", newPassword: "", confirmPassword: "" }); setPwError(""); setShowPwModal(true); };
  const closePwModal = () => setShowPwModal(false);

  const handlePwSubmit = async (e) => {
    e.preventDefault();
    setPwError("");
    if (!pwForm.oldPassword || !pwForm.newPassword || !pwForm.confirmPassword) {
      setPwError("All fields are required.");
      return;
    }
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      setPwError("New passwords do not match.");
      return;
    }
    if (pwForm.newPassword.length < 8) {
      setPwError("New password must be at least 8 characters.");
      return;
    }
    setPwLoading(true);
    // TODO: wire up to API
    setTimeout(() => {
      setPwLoading(false);
      setShowPwModal(false);
    }, 800);
  };

  // ── Change Email Modal ──────────────────────────────────────────────────────
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailForm, setEmailForm] = useState({ password: "", newEmail: "" });
  const [emailError, setEmailError] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);

  const openEmailModal = () => { setEmailForm({ password: "", newEmail: "" }); setEmailError(""); setShowEmailModal(true); };
  const closeEmailModal = () => setShowEmailModal(false);

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    setEmailError("");
    if (!emailForm.password || !emailForm.newEmail) {
      setEmailError("All fields are required.");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailForm.newEmail)) {
      setEmailError("Please enter a valid email address.");
      return;
    }
    setEmailLoading(true);
    // TODO: wire up to API
    setTimeout(() => {
      setEmailLoading(false);
      setShowEmailModal(false);
    }, 800);
  };

  return (
    <div className="acct-page">
      {/* Header */}
      <div className="acct-header-row">
        <div>
          <h1 className="acct-title">Accounts</h1>
          <p className="acct-subtitle">
            Manage your account credentials &nbsp;|&nbsp; Login Email:&nbsp;
            <strong>{loginEmail}</strong>
          </p>
        </div>
        <button className="acct-back-btn" onClick={() => navigate(-1)}>Back</button>
      </div>

      {/* Password Card */}
      <div className="acct-card">
        <div className="acct-card-info">
          <p className="acct-card-title">Password</p>
          <p className="acct-card-desc">Change your password using your old password.</p>
        </div>
        <button className="acct-primary-btn" onClick={openPwModal}>Reset Password</button>
      </div>

      {/* Email Card */}
      <div className="acct-card">
        <div className="acct-card-info">
          <p className="acct-card-title">Email</p>
          <p className="acct-card-desc">Change your login email by confirming your password.</p>
        </div>
        <button className="acct-primary-btn" onClick={openEmailModal}>Change Email</button>
      </div>

      {/* Reset Password Modal */}
      {showPwModal && (
        <div className="acct-modal-overlay" onClick={closePwModal}>
          <div className="acct-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="acct-modal-title">Reset Password</h2>
            <form onSubmit={handlePwSubmit}>
              <div className="acct-modal-field">
                <label>Current Password</label>
                <input
                  type="password"
                  placeholder="Enter current password"
                  value={pwForm.oldPassword}
                  onChange={(e) => setPwForm({ ...pwForm, oldPassword: e.target.value })}
                />
              </div>
              <div className="acct-modal-field">
                <label>New Password</label>
                <input
                  type="password"
                  placeholder="Enter new password"
                  value={pwForm.newPassword}
                  onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })}
                />
              </div>
              <div className="acct-modal-field">
                <label>Confirm New Password</label>
                <input
                  type="password"
                  placeholder="Confirm new password"
                  value={pwForm.confirmPassword}
                  onChange={(e) => setPwForm({ ...pwForm, confirmPassword: e.target.value })}
                />
              </div>
              {pwError && <p className="acct-modal-error">{pwError}</p>}
              <div className="acct-modal-actions">
                <button type="button" className="acct-modal-cancel" onClick={closePwModal}>Cancel</button>
                <button type="submit" className="acct-modal-submit" disabled={pwLoading}>
                  {pwLoading ? "Saving..." : "Save Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Change Email Modal */}
      {showEmailModal && (
        <div className="acct-modal-overlay" onClick={closeEmailModal}>
          <div className="acct-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="acct-modal-title">Change Email</h2>
            <form onSubmit={handleEmailSubmit}>
              <div className="acct-modal-field">
                <label>Confirm Password</label>
                <input
                  type="password"
                  placeholder="Enter your password"
                  value={emailForm.password}
                  onChange={(e) => setEmailForm({ ...emailForm, password: e.target.value })}
                />
              </div>
              <div className="acct-modal-field">
                <label>New Email Address</label>
                <input
                  type="email"
                  placeholder="Enter new email"
                  value={emailForm.newEmail}
                  onChange={(e) => setEmailForm({ ...emailForm, newEmail: e.target.value })}
                />
              </div>
              {emailError && <p className="acct-modal-error">{emailError}</p>}
              <div className="acct-modal-actions">
                <button type="button" className="acct-modal-cancel" onClick={closeEmailModal}>Cancel</button>
                <button type="submit" className="acct-modal-submit" disabled={emailLoading}>
                  {emailLoading ? "Saving..." : "Change Email"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Account;
