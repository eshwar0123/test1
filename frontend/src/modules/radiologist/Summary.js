import React, { useState } from 'react'
import {
  CCard,
  CCardBody,
  CBadge,
  CCollapse,
  CListGroup,
  CListGroupItem,
  CButton,
  CModal,
  CModalHeader,
  CModalTitle,
  CModalBody,
  CModalFooter,
  CFormInput,
  CFormTextarea,
  CDropdownToggle,
  CDropdownMenu,
  CDropdownItem,
  CDropdown,
} from '@coreui/react'
import { CChartLine } from '@coreui/react-chartjs'
import CIcon from '@coreui/icons-react'
import {
  cilCalendar,
  cilChartLine,
  cilMedicalCross,
} from '@coreui/icons'

const Summary = () => {
  const [open, setOpen] = useState(false)
  const recentImages = [
  {
    id: 'IMG-1023',
    patient: 'Patient A',
    modality: 'CT',
    time: '10 mins ago',
    url: 'https://picsum.photos/seed/1023/400/300',
  },
  {
    id: 'IMG-1021',
    patient: 'Patient B',
    modality: 'MRI',
    time: '35 mins ago',
    url: 'https://picsum.photos/seed/1021/400/300',
  },
  {
    id: 'IMG-1019',
    patient: 'Patient C',
    modality: 'X-Ray',
    time: '1 hour ago',
    url: 'https://picsum.photos/seed/1019/400/300',
  },
]


  /* Section A data */
  const todayScans = 10
  const weekScans = 36
  const scanDataMap = {
  week: {
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    data: [12, 18, 9, 15, 22, 19, 25],
  },
  threeMonths: {
    labels: ['Jan', 'Feb', 'Mar'],
    data: [220, 310, 280],
  },
  sixMonths: {
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
    data: [220, 310, 280, 350, 300, 420],
  },
  year: {
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    data: [220, 310, 280, 350, 300, 420, 390, 450, 410, 480, 500, 530],
  },
}

  const [range, setRange] = useState('week')

  const currentData = scanDataMap[range]
  /* Section B data */
  const scannerStatus = 'Available'
  const scanners = ['Scanner A', 'Scanner B', 'Scanner C', 'Scanner D']
  const isAvailable = scannerStatus === 'Available'

  /* Notices */
  const [notices, setNotices] = useState([
    {
      title: 'CT scanner maintenance',
      description: 'Maintenance scheduled today at 6 PM.',
    },
    {
      title: 'System update',
      description: 'System update planned tomorrow morning.',
    },
  ])

  const [showModal, setShowModal] = useState(false)
  const [noticeTitle, setNoticeTitle] = useState('')
  const [noticeDesc, setNoticeDesc] = useState('')
  const [activeNotice, setActiveNotice] = useState(null)
// Hover preview for Recent Images
const [hoverImage, setHoverImage] = useState(null)
const [mousePos, setMousePos] = useState({ x: 0, y: 0 })

  const addNotice = () => {
    if (!noticeTitle.trim() || !noticeDesc.trim()) return

    setNotices([
      {
        title: noticeTitle,
        description: noticeDesc,
      },
      ...notices,
    ])

    setNoticeTitle('')
    setNoticeDesc('')
    setShowModal(false)
  }

  return (
    <div>

      {/* =======================
          SECTION A – Completed Scans
      ======================= */}
      <h1>Welcome, User!</h1><br/>
      <h5 className="text-center fw-bold mb-3">Completed Scans</h5>

      <div className="dashboard-grid mb-5">
        <CCard className="stat-card text-center">
          <CCardBody>
            <CIcon icon={cilCalendar} className="card-bg-icon" />
            <p className="text-medium-emphasis mb-1">Today</p>
            <h4 className="fw-bold">{todayScans}</h4>
          </CCardBody>
        </CCard>

        <CCard className="stat-card text-center">
          <CCardBody>
            <CIcon icon={cilChartLine} className="card-bg-icon" />
            <p className="text-medium-emphasis mb-1">This Week</p>
            <h4 className="fw-bold">{weekScans}</h4>
          </CCardBody>
        </CCard>
      </div>

      {/* =======================
          SECTION B – Scanner Status
      ======================= */}
      <h5 className="text-center fw-bold mb-3">Scanner Status</h5>

      <div className="dashboard-grid mb-5">
        <CCard
          className="stat-card text-center scanner-card"
          role="button"
          onClick={() => setOpen(!open)}
        >
          <CCardBody>
            <CIcon icon={cilMedicalCross} className="card-bg-icon" />
            <p className="text-medium-emphasis mb-2">Current Status</p>
            

            <CBadge color={isAvailable ? 'success' : 'danger'}>
              {scannerStatus}
            </CBadge>

            <CCollapse visible={open}>
              <div className="mt-3 text-start">
                <small className="text-medium-emphasis">
                  Available Scanners
                </small>
                <CListGroup className="mt-2">
                  {scanners.map((scanner, index) => (
                    <CListGroupItem key={index}>
                      {scanner}
                    </CListGroupItem>
                  ))}
                </CListGroup>
              </div>
            </CCollapse>
          </CCardBody>
        </CCard>
      </div>

      {/* =======================
          SECTION C + D – Trend & Notices
      ======================= */}
      <div className="dashboard-split mb-5">

        {/* Scan Trend */}
        <CCard>
          
          <CCardBody>
            <div className="d-flex justify-content-between align-items-center">
            <h6 className="fw-semibold mb-0">Imaging Performance Overview</h6>
            <CDropdown>
              <CDropdownToggle size="sm" color="light" className="graph">
                {
                  range==="week"
                  ? 'This Week'
                  :range==="threeMonths"
                  ? "3 Months"
                  :range==="sixMonths"
                  ? "6 Months"
                  :"1 Year"
                }
              </CDropdownToggle>
              <CDropdownMenu>
                <CDropdownItem onClick={()=>setRange('week')}>
                  This Week
                </CDropdownItem>
                <CDropdownItem onClick={()=>setRange("threeMonths")}>
                    3 Months
                </CDropdownItem>
             <CDropdownItem onClick={() => setRange('sixMonths')}>
                6 Months
              </CDropdownItem>
              <CDropdownItem onClick={() => setRange('year')}>
                1 Year
              </CDropdownItem>
            </CDropdownMenu>
          </CDropdown>
        </div>
            <CChartLine
              data={{
                labels: currentData.labels,
                datasets: [
                  {
                    label: 'Scans',
                    data: currentData.data,
                    borderWidth: 2,
                    tension: 0.4,
                    fill:false
                  },
                ],
              }}
            />
          </CCardBody>
        </CCard>

        {/* Notices */}
        <CCard>
          <CCardBody>
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h6 className="fw-semibold mb-0">Notice Board</h6>
              <CButton size="sm" color="primary" onClick={() => setShowModal(true)}>
                Add Notice
              </CButton>
            </div>

            <CListGroup>
              {notices.map((notice, index) => (
                <CListGroupItem
                  key={index}
                  role="button"
                  onClick={() =>
                    setActiveNotice(activeNotice === index ? null : index)
                  }
                >
                  <strong>{notice.title}</strong>

                  <CCollapse visible={activeNotice === index}>
                    <p className="mt-2 mb-0 text-emphasis">
                      {notice.description}
                    </p>
                  </CCollapse>
                </CListGroupItem>
              ))}
            </CListGroup>
          </CCardBody>
        </CCard>

      </div>

      {/* =======================
          ADD NOTICE MODAL
      ======================= */}
      <CModal visible={showModal} onClose={() => setShowModal(false)}>
        <CModalHeader>
          <CModalTitle>Add Notice</CModalTitle>
        </CModalHeader>

        <CModalBody>
          <CFormInput
            label="Title"
            placeholder="Enter notice title"
            className="mb-3"
            value={noticeTitle}
            onChange={(e) => setNoticeTitle(e.target.value)}
          />

          <CFormTextarea
            label="Description"
            placeholder="Enter notice description"
            rows={4}
            value={noticeDesc}
            onChange={(e) => setNoticeDesc(e.target.value)}
          />
        </CModalBody>

        <CModalFooter>
          <CButton color="danger" onClick={() => setShowModal(false)}>
            Cancel
          </CButton>
          <CButton color="primary" onClick={addNotice}>
            Add
          </CButton>
        </CModalFooter>
      </CModal>
        {/* =======================
    RECENT IMAGES OPENED
======================= */}
      <CCard className="mb-5">
        <CCardBody>
          <h6 className="fw-semibold mb-3">Recent Images</h6>
          <CListGroup>
            {recentImages.map((img,index)=>(
            <CListGroupItem
  key={index}
  role="button"
  className="d-flex justify-content-between align-items-center"
  onMouseEnter={() => setHoverImage(img)}
  onMouseLeave={() => setHoverImage(null)}
  onMouseMove={(e) =>
    setMousePos({
      x: e.clientX + 16,
      y: e.clientY + 16,
    })
  }
>
  <div>
    <strong>{img.id}</strong>
    <div className="text-emphasis small">
      {img.patient} • {img.modality}
    </div>
  </div>

  <span className="text-emphasis small">
    {img.time}
  </span>
</CListGroupItem>
))}
          </CListGroup>
        </CCardBody>
      </CCard>
      {hoverImage && (
  <img
    src={hoverImage.url}
    alt=""
    className="cursor-preview"
    style={{
      top: mousePos.y,
      left: mousePos.x,
    }}
  />
)}

    </div>

  )
}

export default Summary
