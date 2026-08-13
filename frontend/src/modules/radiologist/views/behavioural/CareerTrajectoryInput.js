import React, { useEffect, useState } from 'react'
import { CCard, CCardHeader, CCardBody, CFormCheck, CButton, CAlert } from '@coreui/react'
import { useNavigate } from 'react-router-dom'
import api from '../../../../shared/api/axios'
import useAssessmentLock from '../../../../shared/useAssessmentLock'
import { apptheme } from './../theme/colors/apptheme'


const EnvironmentResonance = () => {
  const [answers, setAnswers] = useState({ 18: '', 19: '', 20: '', 21: '' })
  const navigate = useNavigate()
  const { locked } = useAssessmentLock()

  const questions = [
    {
      qNo: 18,
      text: 'The day to day environment where you feel most at home is:',
      options: [
        'Fast changing and evolving',
        'Stable and predictable',
        'Independent with minimal interruptions',
        'Highly collaborative with regular interaction',
      ],
    },
    {
      qNo: 19,
      text: 'How ambiguous is your ideal work?',
      options: [
        'Highly ambiguous — I enjoy solving undefined problems',
        'Moderately ambiguous — some open questions are fine',
        'Minimally ambiguous — I prefer clear expectations',
        'No ambiguity — I perform best with concrete structure',
      ],
    },
    {
      qNo: 20,
      text: 'How often do you prefer active collaboration?',
      options: [
        'Daily collaboration is ideal',
        'Weekly syncs plus autonomy',
        'Mostly independent with occasional collaboration',
        'Collaboration only when necessary',
      ],
    },
    {
      qNo: 21,
      text: 'What work environment setup supports your best performance?',
      options: [
        'Agile environment with quick pivots',
        'Structured processes and documentation',
        'Quiet space for deep thinking',
        'Open environment with easy interaction and feedback',
      ],
    },
  ]

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get('/radiologist/assessment/environment')
        const saved = res?.data?.answers || []
        const next = { 18: '', 19: '', 20: '', 21: '' }
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
        type_code: 'environment',
        answers: Object.keys(answers)
          .map((k) => ({ question_no: Number(k), option_no: Number(answers[k]) }))
          .filter((x) => x.option_no),
      }

      await api.post('/radiologist/assessment', payload)
      alert('Environment Resonance Saved!')
      navigate('/growth-arc')
    } catch (err) {
      console.error(err)
      alert('Failed to save environment assessment')
    }
  }

  return (
    <CCard>
      <CCardHeader>
        <h4 style={apptheme.tx("h2")}>Environment Resonance</h4>
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

export default EnvironmentResonance

