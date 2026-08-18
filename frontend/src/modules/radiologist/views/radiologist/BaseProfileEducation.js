import React, { useState, useEffect } from 'react'
import api from "../../../../shared/api/axios"

import {
  CCard,
  CCardHeader,
  CCardBody,
  CForm,
  CFormInput,
  CFormLabel,
  CRow,
  CCol,
  CButton,
} from '@coreui/react'

import { useNavigate } from 'react-router-dom'
import { apptheme } from './../theme/colors/apptheme'

const DRAFT_KEY = "draft.radiologist.education"

const BaseProfileEducation = () => {
  const navigate = useNavigate()

  const [educationList, setEducationList] = useState([
    {
      degree: '',
      specialization: '',
      institution: '',
      university: '',
      startDate: '',
      endDate: '',
      grade: '',
    },
  ])

  // ✅ ADDED: load draft + backend
  useEffect(() => {
    // draft first
    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null")
      if (draft?.length) setEducationList(draft)
    } catch {}

    // backend load
    const load = async () => {
      try {
        const res = await api.get("/radiologist/education")
        const rows = res.data || []

        if (rows.length) {
          setEducationList(
            rows.map((r) => ({
              degree: r.degree || '',
              specialization: r.specialization || '',
              institution: r.institution_name || '',
              university: r.university || '',
              // convert year -> date input
              startDate: r.start_year ? `${r.start_year}-01-01` : '',
              endDate: r.end_year ? `${r.end_year}-01-01` : '',
              grade: r.grade || '',
            }))
          )
        }
      } catch (e) {
        // ignore
      }
    }
    load()
  }, [])

  // ✅ ADDED: autosave draft
  useEffect(() => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(educationList))
  }, [educationList])

  const handleChange = (index, e) => {
    const updated = [...educationList]
    updated[index][e.target.name] = e.target.value
    setEducationList(updated)
  }

  const addEducation = () => {
    setEducationList([
      ...educationList,
      {
        degree: '',
        specialization: '',
        institution: '',
        university: '',
        startDate: '',
        endDate: '',
        grade: '',
      },
    ])
  }

  const removeEducation = (index) => {
    const updatedList = educationList.filter((_, i) => i !== index)
    setEducationList(updatedList)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    // Map UI -> backend keys (send both date + year safe)
    const payload = educationList.map((edu) => ({
      degree: edu.degree,
      specialization: edu.specialization,
      institution_name: edu.institution,
      university: edu.university,
      start_date: edu.startDate || null,
      end_date: edu.endDate || null,
      grade: edu.grade,
    }))

    try {
      await api.post("/radiologist/education", payload)

      // ✅ ADDED: clear draft after save
      localStorage.removeItem(DRAFT_KEY)

      alert("Education Saved Successfully!")
      navigate("/radiologist/experience")
    } catch (err) {
      console.error(err)
      alert(err.response?.data?.detail || "Failed to save education")
    }
  }

  return (
    <CCard>
      <CCardHeader>
        <h5 style={apptheme.tx("h2")}>Education profile</h5>

        <div style={{ fontSize: '14px', color: '#6c757d' }}>
          Personal Details✔&nbsp;›&nbsp; KYC✔&nbsp;›&nbsp;
          <span style={{ color: '#007bff', fontWeight: 'bold' }}>Education Profile</span>
          &nbsp;›&nbsp; Experience &nbsp;›&nbsp; Job Preferences
        </div>
      </CCardHeader>

      <CCardBody>
        <CForm onSubmit={handleSubmit}>
          {educationList.map((edu, index) => (
            <div
              key={index}
              style={{
                border: "1px solid #ddd",
                padding: "15px",
                borderRadius: "8px",
                marginBottom: "15px",
              }}
            >
              <div className="d-flex justify-content-between align-items-center mb-2">
              <h6 style={apptheme.tx("h3")}>Education {index + 1}</h6>
                {index === 0 ? (
                  <CButton color="primary" onClick={addEducation}>Add Education</CButton>
                ) : (
                  <CButton color="primary" onClick={() => removeEducation(index)}>Close</CButton>
                )}
              </div>

              <CRow>
                <CCol md={6}>
                  <CFormLabel style={apptheme.tx("label")}>Degree</CFormLabel>
                  <CFormInput name="degree" value={edu.degree} onChange={(e) => handleChange(index, e)} />
                </CCol>
                <CCol md={6}>
                  <CFormLabel style={apptheme.tx("label")}>Specialization</CFormLabel>
                  <CFormInput name="specialization" value={edu.specialization} onChange={(e) => handleChange(index, e)} />
                </CCol>
              </CRow>

              <CRow className="mt-2">
                <CCol md={6}>
                  <CFormLabel style={apptheme.tx("label")}>Institution Name</CFormLabel>
                  <CFormInput name="institution" value={edu.institution} onChange={(e) => handleChange(index, e)} />
                </CCol>
                <CCol md={6}>
                  <CFormLabel style={apptheme.tx("label")}>University</CFormLabel>
                  <CFormInput name="university" value={edu.university} onChange={(e) => handleChange(index, e)} />
                </CCol>
              </CRow>

              <CRow className="mt-2">
                <CCol md={6}>
                  <CFormLabel style={apptheme.tx("label")}>Start Date</CFormLabel>
                  <CFormInput type="date" name="startDate" value={edu.startDate} onChange={(e) => handleChange(index, e)} />
                </CCol>
                <CCol md={6}>
                  <CFormLabel style={apptheme.tx("label")}>End Date</CFormLabel>
                  <CFormInput type="date" name="endDate" value={edu.endDate} onChange={(e) => handleChange(index, e)} />
                </CCol>
              </CRow>

              <CRow className="mt-2">
                <CCol md={12}>
                  <CFormLabel style={apptheme.tx("label")}>Grade</CFormLabel>
                  <CFormInput name="grade" value={edu.grade} onChange={(e) => handleChange(index, e)} />
                </CCol>
              </CRow>
            </div>
          ))}

          <div className="text-end mt-3">
            <CButton type="submit" color="primary">Save & Continue</CButton>
          </div>
        </CForm>
      </CCardBody>
    </CCard>
  )
}

export default BaseProfileEducation
