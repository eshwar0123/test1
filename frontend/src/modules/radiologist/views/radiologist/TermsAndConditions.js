import React from "react";
import { useNavigate } from "react-router-dom";
import { CButton, CCard, CCardBody, CContainer } from "@coreui/react";
import { apptheme } from "../../views/theme/colors/apptheme";

const TermsAndConditions = () => {
  const navigate = useNavigate();
  const t = apptheme.layout?.pages?.legal ?? {};

  return (
    <CContainer fluid className="px-4 py-4">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <h4 style={{ color: t.titleColor }}>Terms & Conditions</h4>
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
            By accessing or using <b>LoMa Vantage</b>, you agree to comply with
            these Terms & Conditions.
          </p>

          <h6>1. Platform Purpose</h6>
          <p>
            LoMa Vantage is a professional career platform designed to assist
            users in building profiles, completing assessments, and connecting
            with hiring organizations.
          </p>

          <h6>2. Account Responsibility</h6>
          <p>
            You are responsible for maintaining the confidentiality of your
            account credentials and all activity under your account.
          </p>

          <h6>3. Acceptable Use</h6>
          <p>
            You must not provide false information, misuse the platform, or
            attempt unauthorized access to systems or user data.
          </p>

          <h6>4. Assessments & Insights</h6>
          <p>
            Assessment results are informational and do not guarantee
            employment or outcomes.
          </p>

          <h6>5. Termination</h6>
          <p>
            We reserve the right to suspend or terminate accounts that violate
            platform rules or policies.
          </p>

          <h6>6. Limitation of Liability</h6>
          <p>
            LoMa Vantage is not responsible for hiring decisions or outcomes
            made by third-party organizations.
          </p>

          <h6>7. Governing Law</h6>
          <p>
            These Terms are governed by applicable laws of the operating
            jurisdiction.
          </p>

          <p className="mt-4 text-muted">
            Support: <b>support@lomavantage.com</b>
          </p>
        </CCardBody>
      </CCard>
    </CContainer>
  );
};

export default TermsAndConditions;
