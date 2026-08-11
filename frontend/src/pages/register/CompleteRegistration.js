// frontend/src/views/pages/register/CompleteRegistration.js
import React, { useState, useEffect } from "react";
import GoogleTranslateSwitcher from "../../shared/components/GoogleTranslateSwitcher";
import { useNavigate, useLocation } from "react-router-dom";
import {
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
} from "@coreui/react";
import CIcon from "@coreui/icons-react";
import { cilLockLocked, cilUser } from "@coreui/icons";
import api from "../../shared/api/axios";


const CompleteRegistration = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const email = location.state?.email || "";
  const role = location.state?.role || ""; // 👈 get role from router state

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName]   = useState("");
  const [password, setPassword]   = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError]         = useState("");
  const [success, setSuccess]     = useState("");

  useEffect(() => {
    // If email or role missing, go back to register
    if (!email || !role) {
      setError("Missing email or role. Please restart registration.");
      setTimeout(() => {
        navigate("/register");
      }, 3000);
    }
  }, [email, role, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    const username = `${firstName} ${lastName}`.trim();
    if (!username) {
      setError("Please enter first name and last name");
      return;
    }

    try {
      const res = await api.post(
        "/complete-google-registration",
        {
          email,
          username,
          password,
          confirm_password: confirmPassword,
          role,   // 👈 REQUIRED by backend
        }
      );

      setSuccess(res.data.message);
      setTimeout(() => {
        navigate("/login");
      }, 2000);
    } catch (err) {
      console.log(err);
      setError(err.response?.data?.detail || "Something went wrong");
    }
  };

  return (
    <div className="bg-body-tertiary min-vh-100 d-flex flex-row align-items-center" style={{ position: 'relative' }}>
      <div style={{ position: 'absolute', top: 16, right: 18, zIndex: 10 }}>
        <GoogleTranslateSwitcher />
      </div>
      <CContainer>
        <CRow className="justify-content-center">
          <CCol md={6}>
            <CCard className="mx-4">
              <CCardBody className="p-4">
                <CForm onSubmit={handleSubmit}>
                  <h1>Complete Registration</h1>
                  <p className="text-body-secondary">
                    Set your name and password
                  </p>

                  {error && <p style={{ color: "red" }}>{error}</p>}
                  {success && <p style={{ color: "green" }}>{success}</p>}

                  {/* First Name */}
                  <CInputGroup className="mb-3">
                    <CInputGroupText>
                      <CIcon icon={cilUser} />
                    </CInputGroupText>
                    <CFormInput
                      placeholder="First Name"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      required
                    />
                  </CInputGroup>

                  {/* Last Name */}
                  <CInputGroup className="mb-3">
                    <CInputGroupText>
                      <CIcon icon={cilUser} />
                    </CInputGroupText>
                    <CFormInput
                      placeholder="Last Name"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      required
                    />
                  </CInputGroup>

                  <CInputGroup className="mb-3">
                    <CInputGroupText>
                      <CIcon icon={cilLockLocked} />
                    </CInputGroupText>
                    <CFormInput
                      type="password"
                      placeholder="Password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </CInputGroup>

                  <CInputGroup className="mb-4">
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

                  <div className="d-grid">
                    <CButton type="submit" color="success">
                      Complete Registration
                    </CButton>
                  </div>
                </CForm>
              </CCardBody>
            </CCard>
          </CCol>
        </CRow>
      </CContainer>
    </div>
  );
};

export default CompleteRegistration;
