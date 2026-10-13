// src/modules/radiologist/views/profile/review/ProfileCompletedModal.js
import React from "react";
import { CModal, CModalBody, CModalHeader, CModalTitle, CButton } from "@coreui/react";

const ProfileCompletedModal = ({ visible, onClose, onHome }) => {
  return (
    <CModal alignment="center" visible={visible} onClose={onClose} size="md">
      <CModalHeader>
        <CModalTitle>Congratulations</CModalTitle>
      </CModalHeader>

      <CModalBody>
        <div className="mb-2 fw-semibold">Your profile is completed 🎉</div>
        <div className="text-body-secondary" style={{ fontSize: 13, marginBottom: 14 }}>
          You can now view companies and matches.
        </div>

        <div className="d-flex justify-content-end gap-2">
          <CButton color="secondary" variant="outline" onClick={onClose}>
            Close
          </CButton>
          <CButton color="primary" onClick={onHome}>
            Home
          </CButton>
        </div>
      </CModalBody>
    </CModal>
  );
};

export default ProfileCompletedModal;
