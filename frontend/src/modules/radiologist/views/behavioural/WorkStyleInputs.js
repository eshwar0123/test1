import React, { useEffect, useState } from 'react'
import { CCard, CCardBody, CCardHeader, CFormCheck, CButton, CAlert } from '@coreui/react'
import { useNavigate } from 'react-router-dom'
import api from '../../../../shared/api/axios'
import useAssessmentLock from '../../../../shared/useAssessmentLock'
import { apptheme } from './../theme/colors/apptheme'


const StressPatterns = () => {
  const [answers, setAnswers] = useState({ 14: '', 15: '', 16: '', 17: '' })
  const navigate = useNavigate()
  const { locked } = useAssessmentLock()

  const questions = [
    {
      qNo: 14,
      text: 'Under stress, you may:',
      options: [
        'Drive goals aggressively',
        'Become overly structured or controlling',
        'Over analyze and slow decisions',
        'Avoid conflict to preserve harmony',
      ],
    },
    {
      qNo: 15,
      text: 'When priorities change suddenly:',
      options: [
        'Feel energized by new possibilities',
        'Feel frustrated because plans must be redone',
        'Pause to reassess data and implications',
        'Check in on people affected by the change',
      ],
    },
    {
      qNo: 16,
      text: 'When a project is at risk:',
      options: [
        'Push for a bold pivot',
        'Increase structure and rigor',
        'Analyze failure points deeply',
        'Align stakeholders to reset expectations',
      ],
    },
    {
      qNo: 17,
      text: 'After a tough week, you recover by:',
      options: [
        'Reimagining solutions or future paths',
        'Restoring order and control',
        'Quiet reflection and processing',
        'Talking it through with trusted people',
      ],
    },
  ]

  // ✅ load saved answers
  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get('/radiologist/assessment/stress')
        const saved = res?.data?.answers || []
        const next = { 14: '', 15: '', 16: '', 17: '' }
        saved.forEach((a) => {
          if (next[a.question_no] !== undefined) next[a.question_no] = String(a.option_no || '')
        })
        setAnswers(next)
      } catch {
        // ignore
      }
    }
    load()
  }, [])

  const handleSelect = (qNo, optionNoStr) => {
    if (locked) return
    setAnswers((prev) => ({ ...prev, [qNo]: optionNoStr }))
  }

  const handleSaveAndContinue = async () => {
    if (locked) return
    try {
      const payload = {
        type_code: 'stress',
        answers: Object.keys(answers)
          .map((k) => ({
            question_no: Number(k),
            option_no: Number(answers[k]),
          }))
          .filter((x) => x.option_no),
      }

      await api.post('/radiologist/assessment', payload)
      alert('Stress Patterns Saved!')
      navigate('/career-trajectory-input')
    } catch (err) {
      console.error(err)
      alert('Failed to save stress assessment')
    }
  }

  return (
    <CCard>
      <CCardHeader>
        <h4 style={apptheme.tx("h2")}>Stress Patterns</h4>
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

export default StressPatterns

