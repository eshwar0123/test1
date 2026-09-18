import React, { useEffect, useState } from 'react'
import { CButton, CCard, CCardBody, CContainer } from '@coreui/react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'

const TermsAndConditions = () => {
  const [terms, setTerms] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    const fetchTerms = async () => {
      try {
        const res = await axios.get('/api/terms-and-conditions')
        setTerms(res.data.terms)
      } catch (err) {
        console.error(err)
        setTerms('Failed to load Terms & Conditions')
      }
    }

    fetchTerms()
  }, [])

  return (
    <div className="bg-body-tertiary min-vh-100 d-flex flex-row align-items-center">
      <CContainer>
        <CCard className="mx-auto" style={{ maxWidth: '800px' }}>
          <CCardBody className="p-4">
            <h2 className="mb-3 text-center">Terms & Conditions</h2>
            <pre style={{ whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>{terms}</pre>
            <div className="text-center mt-3">

            </div>
          </CCardBody>
        </CCard>
      </CContainer>
    </div>
  )
}

export default TermsAndConditions
