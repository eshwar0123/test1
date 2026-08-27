import React, { useEffect, useState } from 'react'
import { CCard, CCardHeader, CCardBody, CFormCheck, CButton, CAlert } from '@coreui/react'
import { useNavigate } from 'react-router-dom'
import api from '../../../../shared/api/axios'
import useAssessmentLock from '../../../../shared/useAssessmentLock'
import { apptheme } from './../theme/colors/apptheme'


const GrowthArc = () => {
  const [answers, setAnswers] = useState({ 22: '', 23: '', 24: '', 25: '' })
  const navigate = useNavigate()
  const { locked } = useAssessmentLock()

  const questions = [
    {
      qNo: 22,
      text: 'In the next 3 to 5 years, you want to:',
      options: [
        'Lead larger teams or initiatives',
        'Become a deep expert in your field',
        'Work across multiple functions or disciplines',
        'Build something of your own',
      ],
    },
    {
      qNo: 23,
      text: 'Which stretch role would you most likely say yes to?',
      options: [
        'A role with more influence over direction and strategy',
        'A role that demands stronger execution or operational scope',
        'A role requiring deeper analytical or technical depth',
        'A role needing stronger stakeholder orchestration',
      ],
    },
    {
      qNo: 24,
      text: 'When imagining your future best self, you see yourself:',
      options: [
        'Creating transformative ideas or products',
        'Running highly effective systems or teams',
        'Becoming the go-to expert for complex questions',
        'Uniting people to create powerful results',
      ],
    },
    {
      qNo: 25,
      text: 'Which type of feedback helps you grow the most?',
      options: [
        'Feedback on creativity and impact',
        'Feedback on reliability or delivery',
        'Feedback on analytical quality',
        'Feedback on communication or relationships',
      ],
    },
  ]

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get('/radiologist/assessment/growth')
        const saved = res?.data?.answers || []
        const next = { 22: '', 23: '', 24: '', 25: '' }
        saved.forEach((a) => {
          if (next[a.question_no] !== undefined) next[a.question_no] = String(a.option_no || '')
        })
        setAnswers(next)
      } catch {}
    }
    load()
  }, [])

  const handleSelect = (qNo, optNoStr) => {
    if (locked) return
    setAnswers((prev) => ({ ...prev, [qNo]: optNoStr }))
  }

  const handleSaveAndContinue = async () => {
    if (locked) return
    try {
      const payload = {
        type_code: 'growth',
        answers: Object.keys(answers)
          .map((k) => ({ question_no: Number(k), option_no: Number(answers[k]) }))
          .filter((x) => x.option_no),
      }

      await api.post('/radiologist/assessment', payload)
      alert('Growth Arc Saved!')
      navigate("/radiologist/technical-assessment");

    } catch (err) {
      console.error(err)
      alert('Failed to save growth assessment')
    }
  }

  return (
    <CCard>
      <CCardHeader>
        <h4 style={apptheme.tx("h2")}>Growth Arc</h4>
        <p className="text-muted mb-0">
          Understand how you want to grow and evolve professionally.
        </p>
      </CCardHeader>

      <CCardBody>
        {locked && (
          <CAlert color="warning" className="mb-3">
            Profile is <b>Completed</b>. Assessments are locked.
          </CAlert>
        )}

        {questions.map((q) => (
          <div key={q.qNo} style={{ marginBottom: '24px' }}>
            <p style={apptheme.tx("label", {marginBottom: '10px' })}>
              <b>Q{q.qNo}.</b> {q.text}
            </p>

            <div style={{ paddingLeft: '15px' }}>
              {q.options.map((label, idx) => {
                const optNo = String(idx + 1)
                return (
                  <CFormCheck
                    key={optNo}
                    type="radio"
                    name={`q${q.qNo}`}
                    label={label}
                    checked={answers[q.qNo] === optNo}
                    onChange={() => handleSelect(q.qNo, optNo)}
                    disabled={locked}
                  />
                )
              })}
            </div>
          </div>
        ))}

        <div style={{ textAlign: 'right', marginTop: '30px' }}>
          <CButton color="primary" onClick={handleSaveAndContinue} disabled={locked}>
            Save & Continue
          </CButton>
        </div>
      </CCardBody>
    </CCard>
  )
}

export default GrowthArc

