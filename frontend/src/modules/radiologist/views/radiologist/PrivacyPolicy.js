import React from "react";
import { useNavigate } from "react-router-dom";
import { CButton, CCard, CCardBody, CContainer } from "@coreui/react";
import { apptheme } from "../../views/theme/colors/apptheme";

const PrivacyPolicy = () => {
  const navigate = useNavigate();
  const t = apptheme.layout?.pages?.legal ?? {};

  return (
    <CContainer fluid className="px-4 py-4">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <h4 style={{ color: t.titleColor }}>Privacy Policy</h4>
        <CButton
                  color="primary"
                  variant="outline"
                  onClick={() => navigate("/radiologist/dashboard")}
                >
                  Back
                </CButton>
      </div>

      <CCard style={{ borderRadius: 14, background: t.cardBg }}>
        <CCardBody style={{ color: t.textColor, lineHeight: "1.7" }}>
          <p>
            This Privacy Policy explains how <b>LoMa Vantage</b> collects, uses,
            and protects your personal information when you use our professional
            career platform.
          </p>

          <h6>1. Information We Collect</h6>
          <p>
            We collect information you provide directly, such as your name,
            email, professional details, resume, skills, assessments, and
            verification documents where applicable.
          </p>

          <h6>2. How We Use Information</h6>
          <p>
            Your data is used to create your profile, deliver personalized
            insights, connect you with relevant opportunities, and improve
            platform performance.
          </p>

          <h6>3. Profile Visibility</h6>
          <p>
            Your profile may be visible to verified recruiters and companies.
            You control what information is shared. We never sell your data.
          </p>

          <h6>4. Data Security</h6>
          <p>
            We use industry-standard security practices including encryption,
            access controls, and monitoring to safeguard your information.
          </p>

          <h6>5. Your Rights</h6>
          <p>
            You may update your profile, change credentials, or request account
            deactivation at any time through platform settings.
          </p>

          <h6>6. Policy Updates</h6>
          <p>
            We may update this policy periodically. Continued use of the
            platform implies acceptance of updates.
          </p>

          <p className="mt-4 text-muted">
            Contact: <b>support@lomavantage.com</b>
          </p>
        </CCardBody>
      </CCard>
    </CContainer>
  );
};

export default PrivacyPolicy;
