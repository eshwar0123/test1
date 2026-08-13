import React from "react";
import { useNavigate } from "react-router-dom";
import { CButton, CCard, CCardBody, CContainer } from "@coreui/react";
import { apptheme } from "../../views/theme/colors/apptheme";

const HelpCenter = () => {
  const navigate = useNavigate();
  const t = apptheme.layout?.pages?.legal ?? {};

  return (
    <CContainer fluid className="px-4 py-4">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <h4 style={{ color: t.titleColor }}>Help Center</h4>

        {/* Back → Home */}
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
            Welcome to the <b>LoMa Vantage Help Center</b>.
            If you need assistance, our support team is here to help you.
          </p>

          <h6>📧 Customer Support</h6>
          <p>
            For account, privacy, or technical issues, contact us at:
          </p>

          <p>
            <b>Email:</b>{" "}
            <a href="mailto:support@lomavantage.com">
              support@lomavantage.com
            </a>
          </p>

          <h6 className="mt-4">🕒 Support Hours</h6>
          <p>
            Monday – Friday<br />
            9:00 AM – 6:00 PM (IST)
          </p>

          <p className="mt-4 text-muted">
            We typically respond within 24 hours.
          </p>
        </CCardBody>
      </CCard>
    </CContainer>
  );
};

export default HelpCenter;
