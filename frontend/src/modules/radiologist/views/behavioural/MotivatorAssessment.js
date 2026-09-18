import React, { useEffect, useState } from 'react'
import {
  CCard,
  CCardHeader,
  CCardBody,
  CForm,
  CFormLabel,
  CFormCheck,
  CButton,
  CAlert,
} from '@coreui/react'
import { useNavigate } from 'react-router-dom'
import api from '../../../../shared/api/axios'
import useAssessmentLock from '../../../../shared/useAssessmentLock'
import { apptheme } from './../theme/colors/apptheme'


const MotivatorAssessment = () => {
  const navigate = useNavigate()
  const { locked } = useAssessmentLock()

  const [answers, setAnswers] = useState({
    q1: '',
    q2: '',
    q3: '',
    q4: '',
    q5: '',
  })

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get('/radiologist/assessment/motivator')
        const saved = res?.data?.answers || []
        const next = { q1: '', q2: '', q3: '', q4: '', q5: '' }
        saved.forEach((a) => {
          if (a.question_no >= 1 && a.question_no <= 5) {
            next[`q${a.question_no}`] = String(a.option_no || '')
          }
        })
        setAnswers(next)
      } catch (e) {}
    }
    load()
  }, [])

  const handleChange = (e) => {
    if (locked) return
    const { name, value } = e.target
    setAnswers((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (locked) return

    try {
      const payload = {
        type_code: 'motivator',
        answers: [
          { question_no: 1, option_no: Number(answers.q1) },
          { question_no: 2, option_no: Number(answers.q2) },
          { question_no: 3, option_no: Number(answers.q3) },
          { question_no: 4, option_no: Number(answers.q4) },
          { question_no: 5, option_no: Number(answers.q5) },
        ].filter((x) => x.option_no),
      }

      await api.post('/radiologist/assessment', payload)
      alert('Motivator Assessment Saved!')
      navigate('/archetype-pattern')
    } catch (err) {
      console.error(err)
      alert('Failed to save assessment')
    }
  }

  return (
    <CCard className="p-3">
      <CCardHeader>
        <h5 style={apptheme.tx("h2")}>Motivator Assessment</h5>
        <p className="text-muted mb-0">
          Please answer the following questions to understand your work motivators.
        </p>
      </CCardHeader>

      <CCardBody>
        {locked && (
          <CAlert color="warning" className="mb-3">
            Profile is <b>Completed</b>. Assessments are locked.
          </CAlert>
        )}

        <CForm onSubmit={handleSubmit}>
          <CFormLabel style={apptheme.tx("label")}>
            Q1. When starting a new project, what energizes you most?
          </CFormLabel>
          <div>
            <CFormCheck type="radio" name="q1" value="1" label="Clear expectations and defined targets"
              checked={answers.q1 === '1'} onChange={handleChange} disabled={locked} />
            <CFormCheck type="radio" name="q1" value="2" label="Freedom to explore multiple options"
              checked={answers.q1 === '2'} onChange={handleChange} disabled={locked} />
            <CFormCheck type="radio" name="q1" value="3" label="Knowing it will help others"
              checked={answers.q1 === '3'} onChange={handleChange} disabled={locked} />
            <CFormCheck type="radio" name="q1" value="4" label="Opportunity to learn something new"
              checked={answers.q1 === '4'} onChange={handleChange} disabled={locked} />
          </div>

          <CFormLabel style={apptheme.tx("label")}>
            Q2. What makes you feel most accomplished?
          </CFormLabel>
          <div>
            <CFormCheck type="radio" name="q2" value="1" label="Solving difficult problems"
              checked={answers.q2 === '1'} onChange={handleChange} disabled={locked} />
            <CFormCheck type="radio" name="q2" value="2" label="Helping a team succeed"
              checked={answers.q2 === '2'} onChange={handleChange} disabled={locked} />
            <CFormCheck type="radio" name="q2" value="3" label="Delivering ahead of deadlines"
              checked={answers.q2 === '3'} onChange={handleChange} disabled={locked} />
            <CFormCheck type="radio" name="q2" value="4" label="Receiving recognition"
              checked={answers.q2 === '4'} onChange={handleChange} disabled={locked} />
          </div>

          <CFormLabel style={apptheme.tx("label")}>
            Q3. What keeps you committed long term?
          </CFormLabel>
          <div>
            <CFormCheck type="radio" name="q3" value="1" label="Growing my skills"
              checked={answers.q3 === '1'} onChange={handleChange} disabled={locked} />
            <CFormCheck type="radio" name="q3" value="2" label="A healthy culture and support"
              checked={answers.q3 === '2'} onChange={handleChange} disabled={locked} />
            <CFormCheck type="radio" name="q3" value="3" label="Reward structure"
              checked={answers.q3 === '3'} onChange={handleChange} disabled={locked} />
            <CFormCheck type="radio" name="q3" value="4" label="Predictability"
              checked={answers.q3 === '4'} onChange={handleChange} disabled={locked} />
          </div>

          <CFormLabel style={apptheme.tx("label")}>
            Q4. What type of environment feels best for you?
          </CFormLabel>
          <div>
            <CFormCheck type="radio" name="q4" value="1" label="High autonomy and ownership"
              checked={answers.q4 === '1'} onChange={handleChange} disabled={locked} />
            <CFormCheck type="radio" name="q4" value="2" label="Highly collaborative"
              checked={answers.q4 === '2'} onChange={handleChange} disabled={locked} />
            <CFormCheck type="radio" name="q4" value="3" label="Deep focused work"
              checked={answers.q4 === '3'} onChange={handleChange} disabled={locked} />
            <CFormCheck type="radio" name="q4" value="4" label="Clear structure and plan"
              checked={answers.q4 === '4'} onChange={handleChange} disabled={locked} />
          </div>

          <CFormLabel style={apptheme.tx("label")}>
            Q5. How do you prefer to be appreciated?
          </CFormLabel>
          <div>
            <CFormCheck type="radio" name="q5" value="1" label="Feedback on work quality"
              checked={answers.q5 === '1'} onChange={handleChange} disabled={locked} />
            <CFormCheck type="radio" name="q5" value="2" label="Trust and independence"
              checked={answers.q5 === '2'} onChange={handleChange} disabled={locked} />
            <CFormCheck type="radio" name="q5" value="3" label="Public recognition"
              checked={answers.q5 === '3'} onChange={handleChange} disabled={locked} />
            <CFormCheck type="radio" name="q5" value="4" label="Promotions or rewards"
              checked={answers.q5 === '4'} onChange={handleChange} disabled={locked} />
          </div>

          <div className="text-end mt-4">
            <CButton type="submit" color="primary" disabled={locked}>
              Save & Continue
            </CButton>
          </div>
        </CForm>
      </CCardBody>
    </CCard>
  )
}

export default MotivatorAssessment

