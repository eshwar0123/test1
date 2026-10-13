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


const ArchetypePattern = () => {
  const navigate = useNavigate()
  const { locked } = useAssessmentLock()

  const [answers, setAnswers] = useState({
    q6: '',
    q7: '',
    q8: '',
    q9: '',
    q10: '',
    q11: '',
    q12: '',
    q13: '',
  })

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get('/radiologist/assessment/archetype')
        const saved = res?.data?.answers || []

        const next = { q6:'', q7:'', q8:'', q9:'', q10:'', q11:'', q12:'', q13:'' }
        saved.forEach((a) => {
          const qNo = Number(a.question_no)
          if (qNo >= 6 && qNo <= 13) next[`q${qNo}`] = String(a.option_no || '')
        })
        setAnswers(next)
      } catch {}
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
        type_code: 'archetype',
        answers: [
          { question_no: 6, option_no: Number(answers.q6) },
          { question_no: 7, option_no: Number(answers.q7) },
          { question_no: 8, option_no: Number(answers.q8) },
          { question_no: 9, option_no: Number(answers.q9) },
          { question_no: 10, option_no: Number(answers.q10) },
          { question_no: 11, option_no: Number(answers.q11) },
          { question_no: 12, option_no: Number(answers.q12) },
          { question_no: 13, option_no: Number(answers.q13) },
        ].filter((x) => x.option_no),
      }

      await api.post('/radiologist/assessment', payload)
      alert('Archetype Pattern Saved!')
      navigate('/work-style-inputs')
    } catch (err) {
      console.error(err)
      alert('Failed to save archetype assessment')
    }
  }

  return (
    <CCard className="p-3">
      <CCardHeader>
        <h5 style={apptheme.tx("h2")}>Archetype Pattern Assessment</h5>
        <p className="text-muted mb-0">
          Answer these questions to identify your behavioural archetype.
        </p>
      </CCardHeader>

      <CCardBody>
        {locked && (
          <CAlert color="warning" className="mb-3">
            Profile is <b>Completed</b>. Assessments are locked.
          </CAlert>
        )}

        <CForm onSubmit={handleSubmit}>
          {/* all CFormCheck add disabled={locked} */}
          <CFormLabel style={apptheme.tx("label")}>1. When facing a new challenge, you instinctively:</CFormLabel>
          <div>
            <CFormCheck type="radio" name="q6" value="1" label="Break it into structured steps"
              checked={answers.q6 === '1'} onChange={handleChange} disabled={locked} />
            <CFormCheck type="radio" name="q6" value="2" label="Analyze data or risks before acting"
              checked={answers.q6 === '2'} onChange={handleChange} disabled={locked} />
            <CFormCheck type="radio" name="q6" value="3" label="Seek input and alignment"
              checked={answers.q6 === '3'} onChange={handleChange} disabled={locked} />
            <CFormCheck type="radio" name="q6" value="4" label="Explore different possibilities"
              checked={answers.q6 === '4'} onChange={handleChange} disabled={locked} />
          </div>

          {/* Q7 */}
          <CFormLabel style={apptheme.tx("label")}>2. When leading a project, you naturally:</CFormLabel>
          <div>
            <CFormCheck type="radio" name="q7" value="1" label="Set a bold direction"
              checked={answers.q7 === '1'} onChange={handleChange} disabled={locked} />
            <CFormCheck type="radio" name="q7" value="2" label="Ensure tasks get done reliably"
              checked={answers.q7 === '2'} onChange={handleChange} disabled={locked} />
            <CFormCheck type="radio" name="q7" value="3" label="Validate assumptions"
              checked={answers.q7 === '3'} onChange={handleChange} disabled={locked} />
            <CFormCheck type="radio" name="q7" value="4" label="Keep everyone aligned"
              checked={answers.q7 === '4'} onChange={handleChange} disabled={locked} />
          </div>

          {/* Q8 */}
          <CFormLabel style={apptheme.tx("label")}>3. Work that energizes you most:</CFormLabel>
          <div>
            <CFormCheck type="radio" name="q8" value="1" label="Creating something new"
              checked={answers.q8 === '1'} onChange={handleChange} disabled={locked} />
            <CFormCheck type="radio" name="q8" value="2" label="Improving systems or processes"
              checked={answers.q8 === '2'} onChange={handleChange} disabled={locked} />
            <CFormCheck type="radio" name="q8" value="3" label="Solving complex problems"
              checked={answers.q8 === '3'} onChange={handleChange} disabled={locked} />
            <CFormCheck type="radio" name="q8" value="4" label="Cross functional collaboration"
              checked={answers.q8 === '4'} onChange={handleChange} disabled={locked} />
          </div>

          {/* Q9 */}
          <CFormLabel style={apptheme.tx("label")}>4. Your working identity is closest to:</CFormLabel>
          <div>
            <CFormCheck type="radio" name="q9" value="1" label="I build what does not exist yet."
              checked={answers.q9 === '1'} onChange={handleChange} disabled={locked} />
            <CFormCheck type="radio" name="q9" value="2" label="I improve and optimize."
              checked={answers.q9 === '2'} onChange={handleChange} disabled={locked} />
            <CFormCheck type="radio" name="q9" value="3" label="I understand how things work."
              checked={answers.q9 === '3'} onChange={handleChange} disabled={locked} />
            <CFormCheck type="radio" name="q9" value="4" label="I unite people."
              checked={answers.q9 === '4'} onChange={handleChange} disabled={locked} />
          </div>

          {/* Q10 */}
          <CFormLabel style={apptheme.tx("label")}>5. When tension arises, you instinctively:</CFormLabel>
          <div>
            <CFormCheck type="radio" name="q10" value="1" label="Re-center everyone on the big picture"
              checked={answers.q10 === '1'} onChange={handleChange} disabled={locked} />
            <CFormCheck type="radio" name="q10" value="2" label="Clarify roles and processes"
              checked={answers.q10 === '2'} onChange={handleChange} disabled={locked} />
            <CFormCheck type="radio" name="q10" value="3" label="Use data to find root causes"
              checked={answers.q10 === '3'} onChange={handleChange} disabled={locked} />
            <CFormCheck type="radio" name="q10" value="4" label="Mediate and restore connection"
              checked={answers.q10 === '4'} onChange={handleChange} disabled={locked} />
          </div>

          {/* Q11 */}
          <CFormLabel style={apptheme.tx("label")}>6. When deciding with incomplete information:</CFormLabel>
          <div>
            <CFormCheck type="radio" name="q11" value="1" label="Make the most promising directional bet"
              checked={answers.q11 === '1'} onChange={handleChange} disabled={locked} />
            <CFormCheck type="radio" name="q11" value="2" label="Choose what keeps execution on track"
              checked={answers.q11 === '2'} onChange={handleChange} disabled={locked} />
            <CFormCheck type="radio" name="q11" value="3" label="Make reversible decisions based on data"
              checked={answers.q11 === '3'} onChange={handleChange} disabled={locked} />
            <CFormCheck type="radio" name="q11" value="4" label="Consult stakeholders"
              checked={answers.q11 === '4'} onChange={handleChange} disabled={locked} />
          </div>

          {/* Q12 */}
          <CFormLabel style={apptheme.tx("label")}>7. You influence others mainly through:</CFormLabel>
          <div>
            <CFormCheck type="radio" name="q12" value="1" label="Vision or ideas"
              checked={answers.q12 === '1'} onChange={handleChange} disabled={locked} />
            <CFormCheck type="radio" name="q12" value="2" label="Reliability in delivery"
              checked={answers.q12 === '2'} onChange={handleChange} disabled={locked} />
            <CFormCheck type="radio" name="q12" value="3" label="Analysis"
              checked={answers.q12 === '3'} onChange={handleChange} disabled={locked} />
            <CFormCheck type="radio" name="q12" value="4" label="Relationships and trust"
              checked={answers.q12 === '4'} onChange={handleChange} disabled={locked} />
          </div>

          {/* Q13 */}
          <CFormLabel style={apptheme.tx("label")}>8. You prefer work that mostly:</CFormLabel>
          <div>
            <CFormCheck type="radio" name="q13" value="1" label="Explores future directions"
              checked={answers.q13 === '1'} onChange={handleChange} disabled={locked} />
            <CFormCheck type="radio" name="q13" value="2" label="Drives execution"
              checked={answers.q13 === '2'} onChange={handleChange} disabled={locked} />
            <CFormCheck type="radio" name="q13" value="3" label="Improves systems"
              checked={answers.q13 === '3'} onChange={handleChange} disabled={locked} />
            <CFormCheck type="radio" name="q13" value="4" label="Coordinates people"
              checked={answers.q13 === '4'} onChange={handleChange} disabled={locked} />
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

export default ArchetypePattern

