import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './repository_1.css';
import { storeFile } from './fileStore';
import { generateThumbnail } from './thumbnailGenerator';

/* ─── Generate case ID ────────────────────────────────────────── */
const generateCaseId = () => {
  const d = new Date();
  const ds = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  const rand = String(Math.floor(1000 + Math.random() * 9000));
  return `CASE-${ds}-${rand}`;
};

/* Avatar color palette */
const AVATAR_COLORS = ['#ef4444','#6366f1','#f59e0b','#8b5cf6','#0ea5e9','#10b981','#f43f5e','#3b82f6','#a78bfa','#ec4899'
];

// Extract the plain-text content of a named section (e.g. "Findings", "Impression")
// from a saved radiology-report HTML snapshot. Section headers are `.report-sec-title`
// elements; content is the sibling nodes until the next `.report-sec-title`.
const extractReportSection = (html, sectionName) => {
  if (!html || typeof window === 'undefined') return null;
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const titles = doc.querySelectorAll('.report-sec-title');
    for (const t of titles) {
      if ((t.textContent || '').trim().toLowerCase() === sectionName.toLowerCase()) {
        const parts = [
];
        let n = t.nextElementSibling;
        while (n && !(n.classList && n.classList.contains('report-sec-title'))) {
          const text = (n.textContent || '').trim();
          if (text) parts.push(text);
          n = n.nextElementSibling;
        }
        const joined = parts.join('\n').trim();
        return joined || null;
      }
    }
  } catch {}
  return null;
};

const DATASET_ASSETS = import.meta.glob('../dataset/**/*', { eager: true, query: '?url', import: 'default' });

const toFrontendAssetUrl = (value) => {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (typeof window !== 'undefined') {
    return new URL(value, window.location.origin).toString();
  }
  return value;
};

const getDatasetAssetUrl = (suffix) => {
  const entry = Object.entries(DATASET_ASSETS).find(([path]) => path.endsWith(suffix));
  return entry ? toFrontendAssetUrl(entry[1]) : null;
};

const getDatasetSeriesUrls = (folderName) =>
  Object.entries(DATASET_ASSETS)
    .filter(([path]) => path.includes(`/${folderName}/`) && path.toLowerCase().endsWith('.dcm'))
    .map(([, url]) => toFrontendAssetUrl(url))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

/* ─── Sample worklist data (covers every filter) ──────────────── */
const INITIAL_CASES = [
  // STAT
  { id: 'CASE-20260326-1001', patientName: 'Amara Johnson',   initials: 'AJ', age: 67, sex: 'F', modality: 'CT',  study: 'Head CT – Rule out haemorrhage',      priority: 'stat',    status: 'pending',   waitMins: 135, referredBy: 'Dr. P. Menon',    location: 'ED Bay 2',    avatarBg: '#ef4444', fileUrl: null, filename: null },
  { id: 'CASE-20260326-1002', patientName: 'David Chen',      initials: 'DC', age: 52, sex: 'M', modality: 'MR',  study: 'MRI Brain with Gadolinium',            priority: 'stat',    status: 'reading',   waitMins: 210, referredBy: 'Dr. S. Rao',      location: 'Neuro ICU',   avatarBg: '#6366f1', fileUrl: null, filename: null },
  { id: 'CASE-20260326-1003', patientName: 'Linda Okafor',    initials: 'LO', age: 55, sex: 'F', modality: 'CT',  study: 'CT Chest – PE Protocol',               priority: 'stat',    status: 'pending',   waitMins: 62,  referredBy: 'Dr. V. Kumar',    location: 'ED Bay 5',    avatarBg: '#f43f5e', fileUrl: null, filename: null },
  // URGENT
  { id: 'CASE-20260326-1004', patientName: 'Sarah Williams',  initials: 'SW', age: 34, sex: 'F', modality: 'XR',  study: 'Chest X-Ray PA & Lateral',             priority: 'urgent',  status: 'pending',   waitMins: 45,  referredBy: 'Dr. K. Patel',    location: 'Ward 4B',     avatarBg: '#f59e0b', fileUrl: null, filename: null },
  { id: 'CASE-20260326-1005', patientName: 'Robert Martinez', initials: 'RM', age: 78, sex: 'M', modality: 'CT',  study: 'CT Abdomen & Pelvis with Contrast',    priority: 'urgent',  status: 'review',    waitMins: 88,  referredBy: 'Dr. L. Sharma',   location: 'Gen Surgery', avatarBg: '#8b5cf6', fileUrl: null, filename: null },
  { id: 'CASE-20260326-1006', patientName: 'Thomas Brown',    initials: 'TB', age: 72, sex: 'M', modality: 'CT',  study: 'CT Head – Follow-up',                  priority: 'urgent',  status: 'reading',   waitMins: 95,  referredBy: 'Dr. P. Iyer',     location: 'Neurology',   avatarBg: '#ec4899', fileUrl: null, filename: null },
  // ROUTINE – Pending
  { id: 'CASE-20260326-1007', patientName: 'Emily Thompson',  initials: 'ET', age: 29, sex: 'F', modality: 'MR',  study: 'MRI Lumbar Spine',                     priority: 'routine', status: 'pending',   waitMins: 22,  referredBy: 'Dr. A. Singh',    location: 'Outpatient',  avatarBg: '#0ea5e9', fileUrl: null, filename: null },
  { id: 'CASE-20260326-1008', patientName: 'Michael Nguyen',  initials: 'MN', age: 44, sex: 'M', modality: 'MR',  study: 'MRI Shoulder',                         priority: 'routine', status: 'pending',   waitMins: 10,  referredBy: 'Dr. R. Shah',     location: 'Orthopaedic', avatarBg: '#3b82f6', fileUrl: null, filename: null },
  // ROUTINE – In Review
  { id: 'CASE-20260326-1009', patientName: 'Priya Kapoor',    initials: 'PK', age: 41, sex: 'F', modality: 'CT',  study: 'CT Chest with Contrast',               priority: 'routine', status: 'reading',   waitMins: 30,  referredBy: 'Dr. N. Reddy',    location: 'Pulmonology', avatarBg: '#a78bfa', fileUrl: null, filename: null },
  // ROUTINE – Completed
  { id: 'CASE-20260326-1010', patientName: 'James Park',      initials: 'JP', age: 61, sex: 'M', modality: 'US',  study: 'Abdominal Ultrasound',                 priority: 'routine', status: 'completed', waitMins: 0,   referredBy: 'Dr. M. Nair',     location: 'Radiology',   avatarBg: '#10b981', fileUrl: null, filename: null },
  { id: 'CASE-20260326-1011', patientName: 'Grace Lee',       initials: 'GL', age: 38, sex: 'F', modality: 'XR',  study: 'Knee X-Ray AP/Lateral',                priority: 'routine', status: 'completed', waitMins: 0,   referredBy: 'Dr. T. Gupta',    location: 'Orthopaedic', avatarBg: '#a78bfa', fileUrl: null, filename: null },
  // Extra modalities
  { id: 'CASE-20260326-1012', patientName: 'Arun Deshmukh',   initials: 'AD', age: 58, sex: 'M', modality: 'US',  study: 'Renal Doppler Ultrasound',             priority: 'routine', status: 'pending',   waitMins: 15,  referredBy: 'Dr. S. Joshi',    location: 'Nephrology',  avatarBg: '#14b8a6', fileUrl: null, filename: null },
  { id: 'CASE-20260326-1013', patientName: 'Fatima Al-Rashid',initials: 'FA', age: 46, sex: 'F', modality: 'MR',  study: 'MRI Knee – Meniscal tear query',       priority: 'urgent',  status: 'pending',   waitMins: 50,  referredBy: 'Dr. B. Verma',    location: 'Sports Med',  avatarBg: '#f97316', fileUrl: null, filename: null },
  { id: 'CASE-20260326-1014', patientName: 'Carlos Rivera',   initials: 'CR', age: 33, sex: 'M', modality: 'XR',  study: 'Wrist X-Ray – Fracture query',         priority: 'routine', status: 'review',    waitMins: 40,  referredBy: 'Dr. H. Das',      location: 'Orthopaedic', avatarBg: '#64748b', fileUrl: null, filename: null },

];

/* ─── Real cases backed by actual dataset files ─────────────── */
const REAL_CASES = [
  { id: 'CASE-REAL-2001', clientId: 'CLIENT-001', patientName: 'Aarav Menon', initials: 'AM', age: 58, sex: 'M', modality: 'CT', study: 'Head CT Trauma Series', priority: 'stat', status: 'pending', waitMins: 26, referredBy: 'Dr. Shreya Nair', location: 'Emergency Unit', avatarBg: AVATAR_COLORS[0], fileUrl: 'local-dicom-series-head-ct', filename: 'Head_CT_dicom', seriesFiles: getDatasetSeriesUrls('Head_CT_dicom') },

  { id: 'CASE-REAL-2002', clientId: 'CLIENT-004', patientName: 'Nisha Varghese', initials: 'NV', age: 44, sex: 'F', modality: 'MRI', study: 'MRI Brain Contrast Review', priority: 'stat', status: 'reading', waitMins: 74, referredBy: 'Dr. Karthik Rao', location: 'Neuro Imaging', avatarBg: AVATAR_COLORS[1], fileUrl: getDatasetAssetUrl('/MRI_Brain_nifti.nii'), filename: 'MRI_Brain_nifti.nii' },

  { id: 'CASE-REAL-2003', clientId: 'CLIENT-002', patientName: 'Rahul Iyer', initials: 'RI', age: 63, sex: 'M', modality: 'CT', study: 'Pelvic CT Follow-up Series', priority: 'urgent', status: 'review', waitMins: 91, referredBy: 'Dr. Meera Joseph', location: 'Trauma Ward', avatarBg: AVATAR_COLORS[2], fileUrl: 'local-dicom-series-pelvic-ct', filename: 'pelvic_CT_dicom', seriesFiles: getDatasetSeriesUrls('pelvic_CT_dicom') },

  { id: 'CASE-REAL-2004', clientId: 'CLIENT-006', patientName: 'Sana Ali', initials: 'SA', age: 37, sex: 'F', modality: 'CT', study: 'CT Abdomen NIfTI Reconstruction', priority: 'urgent', status: 'pending', waitMins: 43, referredBy: 'Dr. Vivek Sharma', location: 'Abdominal Imaging', avatarBg: AVATAR_COLORS[3], fileUrl: getDatasetAssetUrl('/CT_Abdo_nifti.nii'), filename: 'CT_Abdo_nifti.nii' },

  { id: 'CASE-REAL-2005', clientId: 'CLIENT-003', patientName: 'Dhanush Prabhu', initials: 'DP', age: 49, sex: 'M', modality: 'CT', study: 'CT Brain NIfTI Review', priority: 'routine', status: 'completed', waitMins: 0, referredBy: 'Dr. Anita Kapoor', location: 'Radiology Core', avatarBg: AVATAR_COLORS[4], fileUrl: getDatasetAssetUrl('/CT_Brain_nifti.nii'), filename: 'CT_Brain_nifti.nii' },

  { id: 'CASE-REAL-2006', clientId: 'CLIENT-005', patientName: 'Megha Thomas', initials: 'MT', age: 31, sex: 'F', modality: 'MRI', study: 'MRI Head NIfTI Follow-up', priority: 'routine', status: 'pending', waitMins: 18, referredBy: 'Dr. Harish Patel', location: 'Outpatient Imaging', avatarBg: AVATAR_COLORS[5], fileUrl: getDatasetAssetUrl('/MRI_Head_nifti.nii'), filename: 'MRI_Head_nifti.nii' },

  // ─── NEW: X-Ray Chest ──────────────────────────────────────────
  { id: 'CASE-REAL-2007', clientId: 'CLIENT-007', patientName: 'Karthik Reddy', initials: 'KR', age: 52, sex: 'M', modality: 'XR', study: 'Chest X-Ray PA & Lateral', priority: 'urgent', status: 'pending', waitMins: 35, referredBy: 'Dr. Anjali Gupta', location: 'Pulmonology', avatarBg: AVATAR_COLORS[6], fileUrl: 'local-dicom-series-xray-chest', filename: 'XRay_Chest_dicom', seriesFiles: getDatasetSeriesUrls('XRay_Chest_dicom') },

  // ─── NEW: X-Ray Hip ────────────────────────────────────────────
  { id: 'CASE-REAL-2008', clientId: 'CLIENT-008', patientName: 'Priyanka Desai', initials: 'PD', age: 68, sex: 'F', modality: 'XR', study: 'Leg X-Ray AP View', priority: 'routine', status: 'pending', waitMins: 20, referredBy: 'Dr. Rajesh Kumar', location: 'Orthopaedic', avatarBg: AVATAR_COLORS[7], fileUrl: 'local-dicom-series-xray-hip', filename: 'XRay_Leg_dicom', seriesFiles: getDatasetSeriesUrls('XRay_Leg_dicom') },

  // ─── NEW: X-Ray Knee ───────────────────────────────────────────
  { id: 'CASE-REAL-2009', clientId: 'CLIENT-009', patientName: 'Vikram Singh', initials: 'VS', age: 35, sex: 'M', modality: 'XR', study: 'Knee X-Ray AP/Lateral', priority: 'routine', status: 'pending', waitMins: 15, referredBy: 'Dr. Nandini Rao', location: 'Sports Medicine', avatarBg: AVATAR_COLORS[8], fileUrl: 'local-dicom-series-xray-knee', filename: 'XRay_Knee_dicom', seriesFiles: getDatasetSeriesUrls('XRay_Knee_dicom') },

  // ─── NEW: Mammography Left Breast ──────────────────────────────
  { id: 'CASE-REAL-2010', clientId: 'CLIENT-010', patientName: 'Lakshmi Narayan', initials: 'LN', age: 46, sex: 'F', modality: 'MG', study: 'Mammography – Left Breast', priority: 'urgent', status: 'pending', waitMins: 40, referredBy: 'Dr. Priya Iyer', location: "Women's Imaging", avatarBg: AVATAR_COLORS[9], fileUrl: 'local-dicom-series-mammography-left', filename: 'Mammography_Left_dicom', seriesFiles: getDatasetSeriesUrls('Mammography_Left_dicom') },

  // ─── NEW: Mammography Right Breast ─────────────────────────────
  { id: 'CASE-REAL-2011', clientId: 'CLIENT-011', patientName: 'Sunita Mehta', initials: 'SM', age: 49, sex: 'F', modality: 'MG', study: 'Mammography – Right Breast', priority: 'urgent', status: 'reading', waitMins: 55, referredBy: 'Dr. Priya Iyer', location: "Women's Imaging", avatarBg: AVATAR_COLORS[0], fileUrl: 'local-dicom-series-mammography-right', filename: 'Mammography_Right_dicom', seriesFiles: getDatasetSeriesUrls('Mammography_Right_dicom') },

  // ─── NEW: MRI Pelvis – Hemalata ────────────────────────────────
  { id: 'CASE-REAL-2012', clientId: 'CLIENT-001', patientName: 'Hemalata', initials: 'HL', age: 34, sex: 'F', modality: 'MR', study: 'MRI Pelvis – Multi-sequence', priority: 'routine', status: 'pending', waitMins: 12, referredBy: 'Dr. R. M. L.', location: "Women's Imaging", avatarBg: AVATAR_COLORS[1], fileUrl: 'local-dicom-series-mri-pelvis-hemalata', filename: 'MRI_Pelvis_Hemalata_dicom', seriesFiles: getDatasetSeriesUrls('MRI_Pelvis_Hemalata_dicom') },

  // ─── NEW: MRI Brain – Babita ───────────────────────────────────
  { id: 'CASE-REAL-2013', clientId: 'CLIENT-012', patientName: 'Babita', initials: 'BA', age: 26, sex: 'F', modality: 'MR', study: 'MRI Brain – Multi-sequence', priority: 'routine', status: 'pending', waitMins: 12, referredBy: 'Dr. Arjun Patel', location: 'Neuro Imaging', avatarBg: AVATAR_COLORS[5], fileUrl: 'local-dicom-series-mri-brain-babita', filename: 'MRI_Brain_Babita_dicom', seriesFiles: getDatasetSeriesUrls('MRI_Brain_Babita_dicom') },

  // ─── NEW: MRI Brain – Dinesh ────────────────────────────────────
  { id: 'CASE-REAL-2014', clientId: 'CLIENT-013', patientName: 'Dinesh', initials: 'DN', age: 48, sex: 'M', modality: 'MR', study: 'MRI Brain – Routine Protocol', priority: 'routine', status: 'pending', waitMins: 25, referredBy: 'Dr. Suresh Verma', location: 'Neuro Imaging', avatarBg: AVATAR_COLORS[2], fileUrl: 'local-dicom-series-mri-brain-dinesh', filename: 'MRI_Brain_Dinesh_dicom', seriesFiles: getDatasetSeriesUrls('MRI_Brain_Dinesh_dicom') },

  // ─── NEW: MRI Lumbo-Sacral Spine – Sandhya ─────────────────────
  { id: 'CASE-REAL-2015', clientId: 'CLIENT-014', patientName: 'Sandhya', initials: 'SD', age: 40, sex: 'F', modality: 'MR', study: 'MRI Lumbo-Sacral Spine – Multi-sequence', priority: 'urgent', status: 'pending', waitMins: 38, referredBy: 'Dr. Ramesh Iyer', location: 'Spine Center', avatarBg: AVATAR_COLORS[4], fileUrl: 'local-dicom-series-mri-lumbosacral-sandhya', filename: 'MRI_LumboSacral_Spine_Sandhya_dicom', seriesFiles: getDatasetSeriesUrls('MRI_LumboSacral_Spine_Sandhya_dicom') },

  // ─── NEW: MRI Brain – Lacchi Ram ────────────────────────────────
  { id: 'CASE-REAL-2016', clientId: 'CLIENT-015', patientName: 'Lacchi Ram', initials: 'LR', age: 37, sex: 'F', modality: 'MR', study: 'MRI Brain – T1/T2/FLAIR', priority: 'routine', status: 'pending', waitMins: 18, referredBy: 'Dr. Priya Sharma', location: 'Neuro Imaging', avatarBg: AVATAR_COLORS[6], fileUrl: 'local-dicom-series-mri-brain-lacchi', filename: 'MRI_Brain_Lacchi_dicom', seriesFiles: getDatasetSeriesUrls('MRI_Brain_Lacchi_dicom') },

  // ─── NEW: MRI Brain – Nitin ─────────────────────────────────────
  { id: 'CASE-REAL-2017', clientId: 'CLIENT-016', patientName: 'Nitin', initials: 'NT', age: 22, sex: 'M', modality: 'MR', study: 'MRI Brain', priority: 'routine', status: 'pending', waitMins: 20, referredBy: 'Dr. —', location: 'Neuro Imaging', avatarBg: AVATAR_COLORS[3], fileUrl: 'local-dicom-series-mri-brain-nitin', filename: 'MRI_Brain_Nitin_dicom', seriesFiles: getDatasetSeriesUrls('MRI_Brain_Nitin_dicom') },

  // ─── NEW: MRI Pelvis – Leela Wati ───────────────────────────────
  { id: 'CASE-REAL-2018', clientId: 'CLIENT-016', patientName: 'Leela Wati', initials: 'LW', age: 60, sex: 'F', modality: 'MR', study: 'MRI Pelvis', priority: 'routine', status: 'pending', waitMins: 20, referredBy: 'Dr. —', location: 'Radiology', avatarBg: AVATAR_COLORS[4], fileUrl: 'local-dicom-series-mri-pelvis-leelawati', filename: 'MRI_Pelvis_LeelaWati_dicom', seriesFiles: getDatasetSeriesUrls('MRI_Pelvis_LeelaWati_dicom') },

  // ─── NEW: MRI Brain – Nitesh Tiwari ─────────────────────────────
  { id: 'CASE-REAL-2019', clientId: 'CLIENT-016', patientName: 'Nitesh Tiwari', initials: 'NTW', age: 45, sex: 'M', modality: 'MR', study: 'MRI Brain', priority: 'routine', status: 'pending', waitMins: 20, referredBy: 'Dr. —', location: 'Neuro Imaging', avatarBg: AVATAR_COLORS[7], fileUrl: 'local-dicom-series-mri-brain-niteshtiwari', filename: 'MRI_Brain_NiteshTiwari_dicom', seriesFiles: getDatasetSeriesUrls('MRI_Brain_NiteshTiwari_dicom') },

  // ─── NEW: MRI Knee – Pinki ──────────────────────────────────────
  { id: 'CASE-REAL-2020', clientId: 'CLIENT-016', patientName: 'Pinki', initials: 'PK', age: 30, sex: 'F', modality: 'MR', study: 'MRI Knee', priority: 'routine', status: 'pending', waitMins: 20, referredBy: 'Dr. —', location: 'Orthopaedic', avatarBg: AVATAR_COLORS[8], fileUrl: 'local-dicom-series-mri-knee-pinki', filename: 'MRI_Knee_Pinki_dicom', seriesFiles: getDatasetSeriesUrls('MRI_Knee_Pinki_dicom') },

  // ─── NEW: MRI Brain – Rekha Rani ────────────────────────────────
  { id: 'CASE-REAL-2021', clientId: 'CLIENT-016', patientName: 'Rekha Rani', initials: 'RR', age: 58, sex: 'F', modality: 'MR', study: 'MRI Brain', priority: 'routine', status: 'pending', waitMins: 20, referredBy: 'Dr. —', location: 'Neuro Imaging', avatarBg: AVATAR_COLORS[9], fileUrl: 'local-dicom-series-mri-brain-rekharani', filename: 'MRI_Brain_RekhaRani_dicom', seriesFiles: getDatasetSeriesUrls('MRI_Brain_RekhaRani_dicom') },

  // ─── NEW: MRI Knee – Vikram Bhati ───────────────────────────────
  { id: 'CASE-REAL-2022', clientId: 'CLIENT-016', patientName: 'Vikram Bhati', initials: 'VB', age: 28, sex: 'M', modality: 'MR', study: 'MRI Knee', priority: 'routine', status: 'pending', waitMins: 20, referredBy: 'Dr. —', location: 'Orthopaedic', avatarBg: AVATAR_COLORS[0], fileUrl: 'local-dicom-series-mri-knee-vikrambhati', filename: 'MRI_Knee_VikramBhati_dicom', seriesFiles: getDatasetSeriesUrls('MRI_Knee_VikramBhati_dicom') },

  // ─── NEW: MRI Brain – Vinay Kumar ───────────────────────────────
  { id: 'CASE-REAL-2023', clientId: 'CLIENT-016', patientName: 'Vinay Kumar', initials: 'VK', age: 29, sex: 'M', modality: 'MR', study: 'MRI Brain', priority: 'routine', status: 'pending', waitMins: 20, referredBy: 'Dr. —', location: 'Neuro Imaging', avatarBg: AVATAR_COLORS[1], fileUrl: 'local-dicom-series-mri-brain-vinaykumar', filename: 'MRI_Brain_VinayKumar_dicom', seriesFiles: getDatasetSeriesUrls('MRI_Brain_VinayKumar_dicom') },

  // ─── NEW: MRI T-Spine – Renu ────────────────────────────────────
  { id: 'CASE-REAL-2024', clientId: 'CLIENT-016', patientName: 'Renu', initials: 'RN', age: 56, sex: 'F', modality: 'MR', study: 'MRI Thoracic Spine', priority: 'routine', status: 'pending', waitMins: 20, referredBy: 'Dr. —', location: 'Spine Center', avatarBg: AVATAR_COLORS[2], fileUrl: 'local-dicom-series-mri-tspine-renu', filename: 'MRI_TSpine_Renu_dicom', seriesFiles: getDatasetSeriesUrls('MRI_TSpine_Renu_dicom') },

  // ─── NEW: MRI C-Spine – Farida ──────────────────────────────────
  { id: 'CASE-REAL-2025', clientId: 'CLIENT-016', patientName: 'Farida', initials: 'FD', age: 49, sex: 'F', modality: 'MR', study: 'MRI Cervical Spine', priority: 'routine', status: 'pending', waitMins: 20, referredBy: 'Dr. —', location: 'Spine Center', avatarBg: AVATAR_COLORS[3], fileUrl: 'local-dicom-series-mri-cspine-farida', filename: 'MRI_CSpine_Farida_dicom', seriesFiles: getDatasetSeriesUrls('MRI_CSpine_Farida_dicom') },

  // ─── NEW: MRI T-Spine – Reenu ───────────────────────────────────
  { id: 'CASE-REAL-2026', clientId: 'CLIENT-016', patientName: 'Reenu', initials: 'RN', age: 56, sex: 'F', modality: 'MR', study: 'MRI Thoracic Spine', priority: 'routine', status: 'pending', waitMins: 20, referredBy: 'Dr. —', location: 'Spine Center', avatarBg: AVATAR_COLORS[4], fileUrl: 'local-dicom-series-mri-tspine-reenu', filename: 'MRI_TSpine_Reenu_dicom', seriesFiles: getDatasetSeriesUrls('MRI_TSpine_Reenu_dicom') },

  { id: 'CASE-REAL-2027', clientId: 'CLIENT-017', patientName: 'Aasif', initials: 'AS', age: 32, sex: 'M', modality: 'MR', study: 'MRI Brain', priority: 'routine', status: 'pending', waitMins: 20, referredBy: 'Dr. —', location: '-', avatarBg: AVATAR_COLORS[0], fileUrl: 'local-dicom-series-mri-aasif', filename: 'MRI_Aasif_Dicom', seriesFiles: getDatasetSeriesUrls('MRI_Aasif_Dicom') },
  { id: 'CASE-REAL-2028', clientId: 'CLIENT-018', patientName: 'Adesh', initials: 'AD', age: 29, sex: 'M', modality: 'MR', study: 'MRI Brain', priority: 'routine', status: 'pending', waitMins: 20, referredBy: 'Dr. —', location: '-', avatarBg: AVATAR_COLORS[1], fileUrl: 'local-dicom-series-mri-adesh', filename: 'MRI_Adesh_Dicom', seriesFiles: getDatasetSeriesUrls('MRI_Adesh_Dicom') },
  { id: 'CASE-REAL-2029', clientId: 'CLIENT-019', patientName: 'Abdul Gani', initials: 'AG', age: 41, sex: 'M', modality: 'MR', study: 'MRI Brain', priority: 'routine', status: 'pending', waitMins: 20, referredBy: 'Dr. —', location: '-', avatarBg: AVATAR_COLORS[2], fileUrl: 'local-dicom-series-mri-abdulgani', filename: 'MRI_AbdulGani_Dicom', seriesFiles: getDatasetSeriesUrls('MRI_AbdulGani_Dicom') },
  { id: 'CASE-REAL-2030', clientId: 'CLIENT-020', patientName: 'Astuti', initials: 'AA', age: 27, sex: 'F', modality: 'MR', study: 'MRI Brain', priority: 'routine', status: 'pending', waitMins: 20, referredBy: 'Dr. —', location: '-', avatarBg: AVATAR_COLORS[3], fileUrl: 'local-dicom-series-mri-astutiayifa', filename: 'MRI_AstutiAyifa_Dicom', seriesFiles: getDatasetSeriesUrls('MRI_AstutiAyifa_Dicom') },
  { id: 'CASE-REAL-2031', clientId: 'CLIENT-021', patientName: 'Baiju Prasad', initials: 'BP', age: 38, sex: 'M', modality: 'MR', study: 'MRI Abdomen', priority: 'routine', status: 'pending', waitMins: 20, referredBy: 'Dr. —', location: '-', avatarBg: AVATAR_COLORS[4], fileUrl: 'local-dicom-series-mri-baijuprasad', filename: 'MRI_BaijuPrasad_Dicom', seriesFiles: getDatasetSeriesUrls('MRI_BaijuPrasad_Dicom') },
  { id: 'CASE-REAL-2032', clientId: 'CLIENT-022', patientName: 'Bhawna', initials: 'BH', age: 31, sex: 'F', modality: 'MR', study: 'MRI Brain', priority: 'routine', status: 'pending', waitMins: 20, referredBy: 'Dr. —', location: '-', avatarBg: AVATAR_COLORS[5], fileUrl: 'local-dicom-series-mri-bhawna', filename: 'MRI_Bhawna_Dicom', seriesFiles: getDatasetSeriesUrls('MRI_Bhawna_Dicom') },
  { id: 'CASE-REAL-2033', clientId: 'CLIENT-023', patientName: 'Bhola Nath', initials: 'BN', age: 54, sex: 'M', modality: 'MR', study: 'MRI Thorax', priority: 'routine', status: 'pending', waitMins: 20, referredBy: 'Dr. —', location: '-', avatarBg: AVATAR_COLORS[6], fileUrl: 'local-dicom-series-mri-bholanath', filename: 'MRI_BholaNath_Dicom', seriesFiles: getDatasetSeriesUrls('MRI_BholaNath_Dicom') },
  { id: 'CASE-REAL-2034', clientId: 'CLIENT-024', patientName: 'Dr Kashif', initials: 'DK', age: 45, sex: 'M', modality: 'MR', study: 'MRI Lumbo-Sacral Spine', priority: 'routine', status: 'pending', waitMins: 20, referredBy: 'Dr. —', location: '-', avatarBg: AVATAR_COLORS[7], fileUrl: 'local-dicom-series-mri-drkashif', filename: 'MRI_DrKashif_Dicom', seriesFiles: getDatasetSeriesUrls('MRI_DrKashif_Dicom') },
  { id: 'CASE-REAL-2035', clientId: 'CLIENT-025', patientName: 'Farzana', initials: 'FZ', age: 34, sex: 'F', modality: 'MR', study: 'MRI Brain', priority: 'routine', status: 'pending', waitMins: 20, referredBy: 'Dr. —', location: '-', avatarBg: AVATAR_COLORS[8], fileUrl: 'local-dicom-series-mri-farzana', filename: 'MRI_Farzana_Dicom', seriesFiles: getDatasetSeriesUrls('MRI_Farzana_Dicom') },
  { id: 'CASE-REAL-2036', clientId: 'CLIENT-026', patientName: 'Kabeer', initials: 'KB', age: 36, sex: 'M', modality: 'MR', study: 'MRI Foot', priority: 'routine', status: 'pending', waitMins: 20, referredBy: 'Dr. —', location: '-', avatarBg: AVATAR_COLORS[9], fileUrl: 'local-dicom-series-mri-kabeer', filename: 'MRI_Kabeer_Dicom', seriesFiles: getDatasetSeriesUrls('MRI_Kabeer_Dicom') },
  { id: 'CASE-REAL-2037', clientId: 'CLIENT-027', patientName: 'Manju', initials: 'MJ', age: 40, sex: 'F', modality: 'MR', study: 'MRI Brain', priority: 'routine', status: 'pending', waitMins: 20, referredBy: 'Dr. —', location: '-', avatarBg: AVATAR_COLORS[0], fileUrl: 'local-dicom-series-mri-manju', filename: 'MRI_Manju_Dicom', seriesFiles: getDatasetSeriesUrls('MRI_Manju_Dicom') },
  { id: 'CASE-REAL-2038', clientId: 'CLIENT-028', patientName: 'Md Raza', initials: 'MZ', age: 33, sex: 'M', modality: 'MR', study: 'MRI Brain', priority: 'routine', status: 'pending', waitMins: 20, referredBy: 'Dr. —', location: '-', avatarBg: AVATAR_COLORS[1], fileUrl: 'local-dicom-series-mri-mdraza', filename: 'MRI_MdRaza_Dicom', seriesFiles: getDatasetSeriesUrls('MRI_MdRaza_Dicom') },
  { id: 'CASE-REAL-2039', clientId: 'CLIENT-029', patientName: 'Rajiv Kumar', initials: 'RK', age: 47, sex: 'M', modality: 'MR', study: 'MRI Brain', priority: 'routine', status: 'pending', waitMins: 20, referredBy: 'Dr. —', location: '-', avatarBg: AVATAR_COLORS[2], fileUrl: 'local-dicom-series-mri-rajivkumar', filename: 'MRI_RajivKumar_Dicom', seriesFiles: getDatasetSeriesUrls('MRI_RajivKumar_Dicom') },
  { id: 'CASE-REAL-2040', clientId: 'CLIENT-030', patientName: 'Shweta', initials: 'SW', age: 28, sex: 'F', modality: 'MR', study: 'MRI Whole Spine', priority: 'routine', status: 'pending', waitMins: 20, referredBy: 'Dr. —', location: '-', avatarBg: AVATAR_COLORS[3], fileUrl: 'local-dicom-series-mri-shweta', filename: 'MRI_Shweta_Dicom', seriesFiles: getDatasetSeriesUrls('MRI_Shweta_Dicom') },
  { id: 'CASE-REAL-2041', clientId: 'CLIENT-031', patientName: 'Surya Prakash', initials: 'SP', age: 42, sex: 'M', modality: 'MR', study: 'MRI Brain', priority: 'routine', status: 'pending', waitMins: 20, referredBy: 'Dr. —', location: '-', avatarBg: AVATAR_COLORS[4], fileUrl: 'local-dicom-series-mri-suryaprakash', filename: 'MRI_SuryaPrakash_Dicom', seriesFiles: getDatasetSeriesUrls('MRI_SuryaPrakash_Dicom') },
  { id: 'CASE-REAL-2042', clientId: 'CLIENT-032', patientName: 'Yamini', initials: 'YM', age: 26, sex: 'F', modality: 'MR', study: 'MRI Brain', priority: 'routine', status: 'pending', waitMins: 20, referredBy: 'Dr. —', location: '-', avatarBg: AVATAR_COLORS[5], fileUrl: 'local-dicom-series-mri-yamini', filename: 'MRI_Yamini_Dicom', seriesFiles: getDatasetSeriesUrls('MRI_Yamini_Dicom') },
  { id: 'CASE-REAL-2043', clientId: 'CLIENT-033', patientName: 'Dilip', initials: 'DL', age: 39, sex: 'M', modality: 'MR', study: 'MRI Abdomen', priority: 'routine', status: 'pending', waitMins: 20, referredBy: 'Dr. —', location: '-', avatarBg: AVATAR_COLORS[6], fileUrl: 'local-dicom-series-mri-dilip', filename: 'MRI_Dilip_Dicom', seriesFiles: getDatasetSeriesUrls('MRI_Dilip_Dicom') },
  { id: 'CASE-REAL-2044', clientId: 'CLIENT-034', patientName: 'Puyush', initials: 'PY', age: 25, sex: 'M', modality: 'MR', study: 'MRI Abdomen', priority: 'routine', status: 'pending', waitMins: 20, referredBy: 'Dr. —', location: '-', avatarBg: AVATAR_COLORS[7], fileUrl: 'local-dicom-series-mri-puyush', filename: 'MRI_Puyush_Dicom', seriesFiles: getDatasetSeriesUrls('MRI_Puyush_Dicom') },
  { id: 'CASE-REAL-2045', clientId: 'CLIENT-035', patientName: 'Kiran', initials: 'KR', age: 30, sex: 'M', modality: 'MR', study: 'MRI Abdomen', priority: 'routine', status: 'pending', waitMins: 20, referredBy: 'Dr. —', location: '-', avatarBg: AVATAR_COLORS[8], fileUrl: 'local-dicom-series-mri-kiran', filename: 'MRI_Kiran_Dicom', seriesFiles: getDatasetSeriesUrls('MRI_Kiran_Dicom') },
  { id: 'CASE-REAL-2046', clientId: 'CLIENT-036', patientName: 'Adhya', initials: 'AY', age: 6, sex: 'F', modality: 'MR', study: 'MRI Brain', priority: 'routine', status: 'pending', waitMins: 20, referredBy: 'Dr. —', location: '-', avatarBg: AVATAR_COLORS[9], fileUrl: 'local-dicom-series-mri-adhya', filename: 'MRI_Adhya_Dicom', seriesFiles: getDatasetSeriesUrls('MRI_Adhya_Dicom') },
  { id: 'CASE-REAL-2047', clientId: 'CLIENT-037', patientName: 'Aksha', initials: 'AK', age: 24, sex: 'F', modality: 'MR', study: 'MRI Brain', priority: 'routine', status: 'pending', waitMins: 20, referredBy: 'Dr. —', location: '-', avatarBg: AVATAR_COLORS[0], fileUrl: 'local-dicom-series-mri-aksha', filename: 'MRI_Aksha_Dicom', seriesFiles: getDatasetSeriesUrls('MRI_Aksha_Dicom') },
  { id: 'CASE-REAL-2048', clientId: 'CLIENT-038', patientName: 'Arif', initials: 'AR', age: 35, sex: 'M', modality: 'MR', study: 'MRI Brain', priority: 'routine', status: 'pending', waitMins: 20, referredBy: 'Dr. —', location: '-', avatarBg: AVATAR_COLORS[1], fileUrl: 'local-dicom-series-mri-arif', filename: 'MRI_Arif_Dicom', seriesFiles: getDatasetSeriesUrls('MRI_Arif_Dicom') },
  { id: 'CASE-REAL-2049', clientId: 'CLIENT-039', patientName: 'Bindu Devi', initials: 'BD', age: 52, sex: 'F', modality: 'MR', study: 'MRI Brain', priority: 'routine', status: 'pending', waitMins: 20, referredBy: 'Dr. —', location: '-', avatarBg: AVATAR_COLORS[2], fileUrl: 'local-dicom-series-mri-bindudevi', filename: 'MRI_BinduDevi_Dicom', seriesFiles: getDatasetSeriesUrls('MRI_BinduDevi_Dicom') },
  { id: 'CASE-REAL-2050', clientId: 'CLIENT-040', patientName: 'Dinesh', initials: 'DN', age: 37, sex: 'M', modality: 'MR', study: 'MRI Lumbo-Sacral Spine', priority: 'routine', status: 'pending', waitMins: 20, referredBy: 'Dr. —', location: '-', avatarBg: AVATAR_COLORS[3], fileUrl: 'local-dicom-series-mri-dinesh2', filename: 'MRI_Dinesh2_Dicom', seriesFiles: getDatasetSeriesUrls('MRI_Dinesh2_Dicom') },
  { id: 'CASE-REAL-2051', clientId: 'CLIENT-041', patientName: 'Beg Raj', initials: 'BR', age: 49, sex: 'M', modality: 'MR', study: 'MRI Thoraco-Lumbar Spine', priority: 'routine', status: 'pending', waitMins: 20, referredBy: 'Dr. —', location: '-', avatarBg: AVATAR_COLORS[4], fileUrl: 'local-dicom-series-mri-begraj', filename: 'MRI_BegRaj_Dicom', seriesFiles: getDatasetSeriesUrls('MRI_BegRaj_Dicom') },
  { id: 'CASE-REAL-2052', clientId: 'CLIENT-042', patientName: 'Dr. Shruthi', initials: 'DS', age: 44, sex: 'F', modality: 'MR', study: 'MRI Thoraco-Lumbar Spine', priority: 'routine', status: 'pending', waitMins: 20, referredBy: 'Dr. —', location: '-', avatarBg: AVATAR_COLORS[5], fileUrl: 'local-dicom-series-mri-drshruthi', filename: 'MRI_DrShruthi_Dicom', seriesFiles: getDatasetSeriesUrls('MRI_DrShruthi_Dicom') },
  { id: 'CASE-REAL-2053', clientId: 'CLIENT-043', patientName: 'Farheen', initials: 'FH', age: 29, sex: 'F', modality: 'MR', study: 'MRI Thorax', priority: 'routine', status: 'pending', waitMins: 20, referredBy: 'Dr. —', location: '-', avatarBg: AVATAR_COLORS[6], fileUrl: 'local-dicom-series-mri-farheen', filename: 'MRI_Farheen_Dicom', seriesFiles: getDatasetSeriesUrls('MRI_Farheen_Dicom') },
  { id: 'CASE-REAL-2054', clientId: 'CLIENT-044', patientName: 'Geeta', initials: 'GT', age: 48, sex: 'F', modality: 'MR', study: 'MRI Brain', priority: 'routine', status: 'pending', waitMins: 20, referredBy: 'Dr. —', location: '-', avatarBg: AVATAR_COLORS[7], fileUrl: 'local-dicom-series-mri-geeta', filename: 'MRI_Geeta_Dicom', seriesFiles: getDatasetSeriesUrls('MRI_Geeta_Dicom') },
  { id: 'CASE-REAL-2055', clientId: 'CLIENT-045', patientName: 'Genius', initials: 'GN', age: 22, sex: 'M', modality: 'MR', study: 'MRI Brain', priority: 'routine', status: 'pending', waitMins: 20, referredBy: 'Dr. —', location: '-', avatarBg: AVATAR_COLORS[8], fileUrl: 'local-dicom-series-mri-genius', filename: 'MRI_Genius_Dicom', seriesFiles: getDatasetSeriesUrls('MRI_Genius_Dicom') },
  { id: 'CASE-REAL-2056', clientId: 'CLIENT-046', patientName: 'Itika', initials: 'IT', age: 23, sex: 'F', modality: 'MR', study: 'MRI Brain', priority: 'routine', status: 'pending', waitMins: 20, referredBy: 'Dr. —', location: '-', avatarBg: AVATAR_COLORS[9], fileUrl: 'local-dicom-series-mri-itika', filename: 'MRI_Itika_Dicom', seriesFiles: getDatasetSeriesUrls('MRI_Itika_Dicom') },
  { id: 'CASE-REAL-2057', clientId: 'CLIENT-047', patientName: 'Joginder', initials: 'JG', age: 51, sex: 'M', modality: 'MR', study: 'MRI Hip', priority: 'routine', status: 'pending', waitMins: 20, referredBy: 'Dr. —', location: '-', avatarBg: AVATAR_COLORS[0], fileUrl: 'local-dicom-series-mri-joginder', filename: 'MRI_Joginder_Dicom', seriesFiles: getDatasetSeriesUrls('MRI_Joginder_Dicom') },
  { id: 'CASE-REAL-2058', clientId: 'CLIENT-048', patientName: 'Ayifa', initials: 'Ay', age: 33, sex: 'F', modality: 'MR', study: 'MRI Brain', priority: 'routine', status: 'pending', waitMins: 20, referredBy: 'Dr. —', location: '-', avatarBg: AVATAR_COLORS[1], fileUrl: 'local-dicom-series-mri-ayifa', filename: 'MRI_Ayifa_Dicom', seriesFiles: getDatasetSeriesUrls('MRI_Ayifa_Dicom') },
  { id: 'CASE-REAL-2059', clientId: 'CLIENT-049', patientName: 'Mahesh', initials: 'MH', age: 46, sex: 'M', modality: 'MR', study: 'MRI Brain', priority: 'routine', status: 'pending', waitMins: 20, referredBy: 'Dr. —', location: '-', avatarBg: AVATAR_COLORS[2], fileUrl: 'local-dicom-series-mri-mahesh', filename: 'MRI_Mahesh_Dicom', seriesFiles: getDatasetSeriesUrls('MRI_Mahesh_Dicom') },
  { id: 'CASE-REAL-2060', clientId: 'CLIENT-050', patientName: 'Neha', initials: 'NH', age: 27, sex: 'F', modality: 'MR', study: 'MRI Whole Spine', priority: 'routine', status: 'pending', waitMins: 20, referredBy: 'Dr. —', location: '-', avatarBg: AVATAR_COLORS[3], fileUrl: 'local-dicom-series-mri-neha', filename: 'MRI_Neha_Dicom', seriesFiles: getDatasetSeriesUrls('MRI_Neha_Dicom') },
  { id: 'CASE-REAL-2061', clientId: 'CLIENT-051', patientName: 'Sanjana', initials: 'SJ', age: 25, sex: 'F', modality: 'MR', study: 'MRI Brain', priority: 'routine', status: 'pending', waitMins: 20, referredBy: 'Dr. —', location: '-', avatarBg: AVATAR_COLORS[4], fileUrl: 'local-dicom-series-mri-sanjana', filename: 'MRI_Sanjana_Dicom', seriesFiles: getDatasetSeriesUrls('MRI_Sanjana_Dicom') },
  { id: 'CASE-REAL-2062', clientId: 'CLIENT-052', patientName: 'Shashank', initials: 'SK', age: 34, sex: 'M', modality: 'MR', study: 'MRI Whole Spine', priority: 'routine', status: 'pending', waitMins: 20, referredBy: 'Dr. —', location: '-', avatarBg: AVATAR_COLORS[5], fileUrl: 'local-dicom-series-mri-shashank', filename: 'MRI_Shashank_Dicom', seriesFiles: getDatasetSeriesUrls('MRI_Shashank_Dicom') },
  { id: 'CASE-REAL-2063', clientId: 'CLIENT-053', patientName: 'Vineta', initials: 'VT', age: 32, sex: 'F', modality: 'MR', study: 'MRI Brain', priority: 'routine', status: 'pending', waitMins: 20, referredBy: 'Dr. —', location: '-', avatarBg: AVATAR_COLORS[6], fileUrl: 'local-dicom-series-mri-vineta', filename: 'MRI_Vineta_Dicom', seriesFiles: getDatasetSeriesUrls('MRI_Vineta_Dicom') },
  { id: 'CASE-REAL-2064', clientId: 'CLIENT-054', patientName: 'Vanita', initials: 'VN', age: 36, sex: 'F', modality: 'MR', study: 'MRI Lumbo-Sacral Spine', priority: 'routine', status: 'pending', waitMins: 20, referredBy: 'Dr. —', location: '-', avatarBg: AVATAR_COLORS[7], fileUrl: 'local-dicom-series-mri-vanita', filename: 'MRI_Vanita_Dicom', seriesFiles: getDatasetSeriesUrls('MRI_Vanita_Dicom') },
  { id: 'CASE-REAL-2126', clientId: 'CLIENT-116', patientName: 'JAI NARAIN', initials: 'JN', age: 78, sex: 'M', modality: 'CT', study: 'CT Chest', priority: 'routine', status: 'pending', waitMins: 20, referredBy: 'Dr. —', location: '-', avatarBg: AVATAR_COLORS[0], fileUrl: 'local-dicom-series-ct-head-jainarain', filename: 'CT_Head_JaiNarain_dicom', seriesFiles: getDatasetSeriesUrls('CT_Head_JaiNarain_dicom') },
  { id: 'CASE-REAL-2127', clientId: 'CLIENT-117', patientName: 'SHIVANI RATHORE', initials: 'SR', age: 29, sex: 'F', modality: 'CT', study: 'CT Head', priority: 'routine', status: 'pending', waitMins: 20, referredBy: 'Dr. —', location: '-', avatarBg: AVATAR_COLORS[1], fileUrl: 'local-dicom-series-ct-head-shivanirathore', filename: 'CT_Head_ShivaniRathore_dicom', seriesFiles: getDatasetSeriesUrls('CT_Head_ShivaniRathore_dicom') },
  { id: "CASE-REAL-2129", clientId: "CLIENT-118", patientName: "RITHANYA", initials: "RI", age: 30, sex: "F", modality: "XR", study: "X-Ray", priority: "routine", status: "pending", waitMins: 20, referredBy: "Dr. —", location: "-", avatarBg: AVATAR_COLORS[2], fileUrl: "local-dicom-series-xray-rithanya", filename: "Xray_Rithanya_dicom", seriesFiles: getDatasetSeriesUrls("Xray_Rithanya_dicom") },
  { id: "CASE-REAL-2131", clientId: "CLIENT-120", patientName: "BHARATHI", initials: "BH", age: 45, sex: "F", modality: "XR", study: "X-Ray", priority: "routine", status: "pending", waitMins: 20, referredBy: "Dr. —", location: "-", avatarBg: AVATAR_COLORS[4], fileUrl: "local-dicom-series-xray-bharathi", filename: "Xray_Bharathi_dicom", seriesFiles: getDatasetSeriesUrls("Xray_Bharathi_dicom") },
  { id: "CASE-REAL-2132", clientId: "CLIENT-121", patientName: "JOFFREY", initials: "JO", age: 38, sex: "M", modality: "XR", study: "X-Ray", priority: "routine", status: "pending", waitMins: 20, referredBy: "Dr. —", location: "-", avatarBg: AVATAR_COLORS[5], fileUrl: "local-dicom-series-xray-joffrey", filename: "Xray_Joffrey_dicom", seriesFiles: getDatasetSeriesUrls("Xray_Joffrey_dicom") },
  { id: "CASE-REAL-2133", clientId: "CLIENT-122", patientName: "LOSHINI", initials: "LO", age: 29, sex: "F", modality: "XR", study: "X-Ray", priority: "routine", status: "pending", waitMins: 20, referredBy: "Dr. —", location: "-", avatarBg: AVATAR_COLORS[6], fileUrl: "local-dicom-series-xray-loshini", filename: "Xray_Loshini_dicom", seriesFiles: getDatasetSeriesUrls("Xray_Loshini_dicom") },
  { id: "CASE-REAL-2134", clientId: "CLIENT-123", patientName: "MITHUN", initials: "MI", age: 52, sex: "M", modality: "XR", study: "X-Ray", priority: "routine", status: "pending", waitMins: 20, referredBy: "Dr. —", location: "-", avatarBg: AVATAR_COLORS[7], fileUrl: "local-dicom-series-xray-mithun", filename: "Xray_Mithun_dicom", seriesFiles: getDatasetSeriesUrls("Xray_Mithun_dicom") },
  { id: "CASE-REAL-2137", clientId: "CLIENT-126", patientName: "AJITHA", initials: "AJ", age: 42, sex: "F", modality: "XR", study: "X-Ray", priority: "routine", status: "pending", waitMins: 20, referredBy: "Dr. —", location: "-", avatarBg: AVATAR_COLORS[0], fileUrl: "local-dicom-series-xray-ajitha", filename: "Xray_Ajitha_dicom", seriesFiles: getDatasetSeriesUrls("Xray_Ajitha_dicom") },
  { id: "CASE-REAL-2136", clientId: "CLIENT-125", patientName: "NITIN", initials: "NI", age: 40, sex: "M", modality: "XR", study: "X-Ray", priority: "routine", status: "pending", waitMins: 20, referredBy: "Dr. —", location: "-", avatarBg: AVATAR_COLORS[9], fileUrl: "local-dicom-series-xray-nitin", filename: "Xray_Nitin_dicom", seriesFiles: getDatasetSeriesUrls("Xray_Nitin_dicom") },
  { id: "CASE-REAL-2135", clientId: "CLIENT-124", patientName: "REETHIKA", initials: "RE", age: 34, sex: "F", modality: "XR", study: "X-Ray", priority: "routine", status: "pending", waitMins: 20, referredBy: "Dr. —", location: "-", avatarBg: AVATAR_COLORS[8], fileUrl: "local-dicom-series-xray-reethika", filename: "Xray_Reethika_dicom", seriesFiles: getDatasetSeriesUrls("Xray_Reethika_dicom") },
  { id: "CASE-REAL-2130", clientId: "CLIENT-119", patientName: "MADHESH", initials: "MA", age: 35, sex: "M", modality: "XR", study: "X-Ray", priority: "routine", status: "pending", waitMins: 20, referredBy: "Dr. —", location: "-", avatarBg: AVATAR_COLORS[3], fileUrl: "local-dicom-series-xray-madhesh", filename: "Xray_Madhesh_dicom", seriesFiles: getDatasetSeriesUrls("Xray_Madhesh_dicom") },

];

const CASE_ID_DISPLAY_MAP = {
  'CASE-REAL-2001': 'GENRAD-SUB-54634582',
  'CASE-REAL-2002': 'GENRAD-SUB-78291364',
  'CASE-REAL-2003': 'GENRAD-SUB-62847193',
  'CASE-REAL-2004': 'GENRAD-SUB-93745128',
  'CASE-REAL-2005': 'GENRAD-SUB-41826597',
  'CASE-REAL-2006': 'GENRAD-SUB-85317624',
  'CASE-REAL-2007': 'GENRAD-SUB-16294837',
  'CASE-REAL-2008': 'GENRAD-SUB-73819264',
  'CASE-REAL-2009': 'GENRAD-SUB-48572913',
  'CASE-REAL-2010': 'GENRAD-SUB-92164738',
  'CASE-REAL-2011': 'GENRAD-SUB-58372914',
  'CASE-REAL-2012': 'GENRAD-SUB-31947528',
  'CASE-REAL-2013': 'GENRAD-SUB-26491837',
  'CASE-REAL-2014': 'GENRAD-SUB-67384521',
  'CASE-REAL-2015': 'GENRAD-SUB-94827156',
  'CASE-REAL-2016': 'GENRAD-SUB-52381749',
  'CASE-REAL-2017': 'GENRAD-SUB-29183746',
  'CASE-REAL-2018': 'GENRAD-SUB-74829163',
  'CASE-REAL-2019': 'GENRAD-SUB-38196274',
  'CASE-REAL-2020': 'GENRAD-SUB-61473829',
  'CASE-REAL-2021': 'GENRAD-SUB-57293841',
  'CASE-REAL-2022': 'GENRAD-SUB-83641927',
  'CASE-REAL-2023': 'GENRAD-SUB-29471836',
  'CASE-REAL-2024': 'GENRAD-SUB-46183729',
  'CASE-REAL-2025': 'GENRAD-SUB-72914638',
  'CASE-REAL-2026': 'GENRAD-SUB-35819274',
  'CASE-REAL-2027': 'GENRAD-SUB-18274639',
  'CASE-REAL-2028': 'GENRAD-SUB-93614728',
  'CASE-REAL-2029': 'GENRAD-SUB-47382916',
  'CASE-REAL-2030': 'GENRAD-SUB-62917483',
  'CASE-REAL-2031': 'GENRAD-SUB-81934726',
  'CASE-REAL-2032': 'GENRAD-SUB-37461829',
  'CASE-REAL-2033': 'GENRAD-SUB-56219473',
  'CASE-REAL-2034': 'GENRAD-SUB-94736281',
  'CASE-REAL-2035': 'GENRAD-SUB-21847369',
  'CASE-REAL-2036': 'GENRAD-SUB-73916248',
  'CASE-REAL-2037': 'GENRAD-SUB-48263917',
  'CASE-REAL-2038': 'GENRAD-SUB-16394728',
  'CASE-REAL-2039': 'GENRAD-SUB-85729163',
  'CASE-REAL-2040': 'GENRAD-SUB-39481726',
  'CASE-REAL-2041': 'GENRAD-SUB-67192834',
  'CASE-REAL-2042': 'GENRAD-SUB-24738169',
  'CASE-REAL-2043': 'GENRAD-SUB-91274836',
  'CASE-REAL-2044': 'GENRAD-SUB-53847219',
  'CASE-REAL-2045': 'GENRAD-SUB-78163942',
  'CASE-REAL-2046': 'GENRAD-SUB-42691837',
  'CASE-REAL-2047': 'GENRAD-SUB-16837429',
  'CASE-REAL-2048': 'GENRAD-SUB-83742619',
  'CASE-REAL-2049': 'GENRAD-SUB-29163874',
  'CASE-REAL-2050': 'GENRAD-SUB-64817293',
  'CASE-REAL-2051': 'GENRAD-SUB-37291648',
  'CASE-REAL-2052': 'GENRAD-SUB-91628473',
  'CASE-REAL-2053': 'GENRAD-SUB-48371926',
  'CASE-REAL-2054': 'GENRAD-SUB-72914836',
  'CASE-REAL-2055': 'GENRAD-SUB-19283746',
  'CASE-REAL-2056': 'GENRAD-SUB-64839271',
  'CASE-REAL-2057': 'GENRAD-SUB-83162947',
  'CASE-REAL-2058': 'GENRAD-SUB-27493816',
  'CASE-REAL-2059': 'GENRAD-SUB-51836294',
  'CASE-REAL-2060': 'GENRAD-SUB-96274831',
  'CASE-REAL-2061': 'GENRAD-SUB-43817296',
  'CASE-REAL-2062': 'GENRAD-SUB-71392846',
  'CASE-REAL-2063': 'GENRAD-SUB-28461937',
  'CASE-REAL-2064': 'GENRAD-SUB-56293174',
  'CASE-REAL-2126': 'GENRAD-SUB-40257860',
  'CASE-REAL-2127': 'GENRAD-SUB-40257991',
  'CASE-REAL-2129': 'GENRAD-SUB-40258253',
  'CASE-REAL-2130': 'GENRAD-SUB-40258384',
  'CASE-REAL-2131': 'GENRAD-SUB-40258515',
  'CASE-REAL-2132': 'GENRAD-SUB-40258646',
  'CASE-REAL-2133': 'GENRAD-SUB-40258777',
  'CASE-REAL-2134': 'GENRAD-SUB-40258908',
  'CASE-REAL-2135': 'GENRAD-SUB-40259039',
  'CASE-REAL-2136': 'GENRAD-SUB-40259170',
  'CASE-REAL-2137': 'GENRAD-SUB-40259301',
};
const displayCaseId = (id) => CASE_ID_DISPLAY_MAP[id] || id;

const CLIENT_ID_DISPLAY_MAP = {
  'CLIENT-001': 'GENRAD-ORG-29839121',
  'CLIENT-002': 'GENRAD-ORG-71938425',
  'CLIENT-003': 'GENRAD-ORG-83629471',
  'CLIENT-004': 'GENRAD-ORG-52487136',
  'CLIENT-005': 'GENRAD-ORG-94725183',
  'CLIENT-006': 'GENRAD-ORG-37162859',
  'CLIENT-007': 'GENRAD-ORG-62847159',
  'CLIENT-008': 'GENRAD-ORG-28364571',
  'CLIENT-009': 'GENRAD-ORG-71829364',
  'CLIENT-010': 'GENRAD-ORG-49183726',
  'CLIENT-011': 'GENRAD-ORG-83726415',
  'CLIENT-012': 'GENRAD-ORG-29839121',
  'CLIENT-013': 'GENRAD-ORG-29839121',
  'CLIENT-014': 'GENRAD-ORG-29839121',
  'CLIENT-015': 'GENRAD-ORG-29839121',
  'CLIENT-016': 'GENRAD-ORG-29839121',
  'CLIENT-017': 'GENRAD-ORG-29839121',
  'CLIENT-018': 'GENRAD-ORG-29839121',
  'CLIENT-019': 'GENRAD-ORG-29839121',
  'CLIENT-020': 'GENRAD-ORG-29839121',
  'CLIENT-021': 'GENRAD-ORG-29839121',
  'CLIENT-022': 'GENRAD-ORG-29839121',
  'CLIENT-023': 'GENRAD-ORG-29839121',
  'CLIENT-024': 'GENRAD-ORG-29839121',
  'CLIENT-025': 'GENRAD-ORG-29839121',
  'CLIENT-026': 'GENRAD-ORG-29839121',
  'CLIENT-027': 'GENRAD-ORG-29839121',
  'CLIENT-028': 'GENRAD-ORG-29839121',
  'CLIENT-029': 'GENRAD-ORG-29839121',
  'CLIENT-030': 'GENRAD-ORG-29839121',
  'CLIENT-031': 'GENRAD-ORG-29839121',
  'CLIENT-032': 'GENRAD-ORG-29839121',
  'CLIENT-033': 'GENRAD-ORG-29839121',
  'CLIENT-034': 'GENRAD-ORG-29839121',
  'CLIENT-035': 'GENRAD-ORG-29839121',
  'CLIENT-036': 'GENRAD-ORG-29839121',
  'CLIENT-037': 'GENRAD-ORG-29839121',
  'CLIENT-038': 'GENRAD-ORG-29839121',
  'CLIENT-039': 'GENRAD-ORG-29839121',
  'CLIENT-040': 'GENRAD-ORG-29839121',
  'CLIENT-041': 'GENRAD-ORG-29839121',
  'CLIENT-042': 'GENRAD-ORG-29839121',
  'CLIENT-043': 'GENRAD-ORG-29839121',
  'CLIENT-044': 'GENRAD-ORG-29839121',
  'CLIENT-045': 'GENRAD-ORG-29839121',
  'CLIENT-046': 'GENRAD-ORG-29839121',
  'CLIENT-047': 'GENRAD-ORG-29839121',
  'CLIENT-048': 'GENRAD-ORG-29839121',
  'CLIENT-049': 'GENRAD-ORG-29839121',
  'CLIENT-050': 'GENRAD-ORG-29839121',
  'CLIENT-051': 'GENRAD-ORG-29839121',
  'CLIENT-052': 'GENRAD-ORG-29839121',
  'CLIENT-053': 'GENRAD-ORG-29839121',
  'CLIENT-054': 'GENRAD-ORG-29839121',
  'CLIENT-055': 'GENRAD-ORG-29839121',
};
const displayClientId = (id) => CLIENT_ID_DISPLAY_MAP[id] || id;

const fmtWait = (mins) => {
  if (mins <= 0) return '—';
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
};

const toBackendScanType = (value) => {
  const v = String(value || '').toUpperCase().trim();
  if (v === 'MR') return 'MRI';
  if (v === 'XR') return 'XRAY';
  if (v === 'US') return 'ULTRASOUND';
  if (v === 'MG') return 'MAMMOGRAPHY';
  return v;
};

const normalizeModality = (value) => {
  const v = String(value || '').toUpperCase().trim();
  if (v === 'MR' || v === 'MRI') return 'MRI';
  if (v === 'CT') return 'CT';
  if (v === 'XR' || v === 'XRAY' || v === 'X-RAY') return 'X-Ray';
  if (v === 'MG' || v === 'MAMMOGRAPHY' || v === 'MAMMO') return 'Mammography';
  return v;
};

const getCurrentUserId = () => {
  try {
    const auth = JSON.parse(localStorage.getItem('auth') || 'null');
    if (auth?.userId || auth?.user_id || auth?.id) {
      return auth.userId || auth.user_id || auth.id;
    }
  } catch {}

  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    if (user?.userId || user?.user_id || user?.id) {
      return user.userId || user.user_id || user.id;
    }
  } catch {}

  return localStorage.getItem('user_id') || localStorage.getItem('userId') || null;
};

const statusLabel = (s) => {
  if (s === 'reading') return 'In Review';
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/* ─── Group label ────────────────────────────────────────────── */
function GroupLabel({ label, color, count }) {
  return (
    <div className="r1-group-label" style={{ color }}>
      <span>{label} ({count})</span>
      <div className="r1-pg-line" />
    </div>
  );
}

/* ─── Generate a procedural scan-like thumbnail for sample cases ── */
const sampleThumbCache = {};
function getSampleThumb(caseId, modality) {
  if (sampleThumbCache[caseId]) return sampleThumbCache[caseId
];
  const S = 80;
  const canvas = document.createElement('canvas');
  canvas.width = S; canvas.height = S;
  const ctx = canvas.getContext('2d');
  let seed = 0;
  for (let i = 0; i < caseId.length; i++) seed = ((seed << 5) - seed + caseId.charCodeAt(i)) | 0;
  const rng = () => { seed = (seed * 16807 + 0) % 2147483647; return (seed & 0x7fffffff) / 0x7fffffff; };

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, S, S);

  const mod = String(modality || '').toUpperCase();

  if (mod === 'CT' || mod === 'MR' || mod === 'MRI') {
    const cx = S / 2, cy = S / 2;
    const grad = ctx.createRadialGradient(cx, cy, 5, cx, cy, 34);
    grad.addColorStop(0, mod === 'CT' ? '#a0a0a0' : '#c0c0c0');
    grad.addColorStop(0.6, mod === 'CT' ? '#606060' : '#808080');
    grad.addColorStop(1, '#1a1a1a');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 30 + rng() * 4, 26 + rng() * 4, 0, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 4; i++) {
      const r = 6 + rng() * 8;
      const a = rng() * Math.PI * 2;
      const d = 8 + rng() * 10;
      ctx.fillStyle = `rgba(${140 + rng() * 80},${140 + rng() * 80},${140 + rng() * 80},0.5)`;
      ctx.beginPath();
      ctx.ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r, r * (0.6 + rng() * 0.4), rng() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (mod === 'XR') {
    const cx = S / 2, cy = S / 2;
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, S, S);
    const grad = ctx.createRadialGradient(cx, cy - 4, 2, cx, cy, 36);
    grad.addColorStop(0, '#505050');
    grad.addColorStop(0.5, '#383838');
    grad.addColorStop(1, '#0a0a0a');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 28, 34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#141414';
    ctx.beginPath(); ctx.ellipse(cx - 10, cy - 2, 9, 14, 0.1, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + 10, cy - 2, 9, 14, -0.1, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#606060';
    ctx.fillRect(cx - 2, cy - 20, 4, 36);
  } else if (mod === 'MG') {
    // Mammography — teardrop-ish breast silhouette
    const cx = S / 2, cy = S / 2;
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, S, S);
    const grad = ctx.createRadialGradient(cx - 5, cy - 5, 4, cx, cy, 36);
    grad.addColorStop(0, '#9a9a9a');
    grad.addColorStop(0.5, '#5a5a5a');
    grad.addColorStop(1, '#1a1a1a');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 4, 26, 30, -0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(220,220,220,0.4)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(cx + (rng() - 0.5) * 10, cy - 10);
      ctx.lineTo(cx + (rng() - 0.5) * 30, cy + 10 + rng() * 10);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, S, S);
    const cx = S / 2, cy = 6;
    for (let a = -0.7; a < 0.7; a += 0.02) {
      for (let r = 10; r < 70; r += 1) {
        const v = (rng() * 40 + 10) * (1 - r / 80);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        const x = cx + Math.sin(a) * r;
        const y = cy + Math.cos(a) * r;
        if (x >= 0 && x < S && y >= 0 && y < S) {
          ctx.fillRect(x, y, 1.5, 1.5);
        }
      }
    }
  }

  sampleThumbCache[caseId] = canvas.toDataURL('image/png');
  return sampleThumbCache[caseId
];
}

/* ─── Case card ──────────────────────────────────────────────── */
function CaseCard({ item, selected, onSelect }) {
  let cls = 'r1-case-card';
  if (item.priority === 'stat')    cls += ' r1-stat-card';
  if (item.priority === 'urgent')  cls += ' r1-urgent-card';
  if (item.priority === 'routine') cls += ' r1-routine-card';
  if (item.status   === 'reading') cls += ' r1-reading-card';
  if (selected)                    cls += ' r1-selected';

  const thumb = item.thumbnail || getSampleThumb(item.id, item.modality);

  return (
    <div className={cls} onClick={() => onSelect(item)}>
      <div className="r1-pt-avatar" style={{ background: '#000' }}>
        <img src={thumb} alt="" className="r1-avatar-thumb" />
      </div>
      <div className="r1-case-main">
        <div className="r1-case-id">{displayCaseId(item.id)}</div>
        {item.orgName && <div className="r1-case-org">{item.orgName}</div>}
        <div className="r1-case-meta">
          <span>{item.age}y {item.sex}</span>
          <span className="r1-mod-badge">{item.modality}</span>
          <span>{item.study}</span>
        </div>
      </div>
      <div className="r1-case-right">
        <span className={`r1-pri-badge r1-pri-${item.priority}`}>{item.priority.toUpperCase()}</span>
        <span className={`r1-status-pill r1-status-${item.status}`}>{statusLabel(item.status)}</span>
        <span className="r1-case-wait">&#x23F1; {fmtWait(item.waitMins)}</span>
      </div>
    </div>
  );
}

/* ─── Main Component ─────────────────────────────────────────── */
export default function Repository1() {
  const navigate = useNavigate();
  const location = useLocation();
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [modalityFilter, setModalityFilter] = useState('all');
  const [orgFilter, setOrgFilter] = useState('');
  const [idFilter, setIdFilter] = useState('');
  const [selectedCase, setSelectedCase]  = useState(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [latestReportHtml, setLatestReportHtml] = useState(null);
  const [latestReportMeta, setLatestReportMeta] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);

  useEffect(() => {
    if (!reportOpen || !selectedCase?.id) {
      setLatestReportHtml(null);
      setLatestReportMeta(null);
      return;
    }
    let cancelled = false;
    setReportLoading(true);
    setLatestReportHtml(null);
    setLatestReportMeta(null);
    const uid = getCurrentUserId();
    const versionsUrl = uid
      ? `/api/radiology/reports/${encodeURIComponent(selectedCase.id)}/versions?user_id=${encodeURIComponent(uid)}`
      : `/api/radiology/reports/${encodeURIComponent(selectedCase.id)}/versions`;
    fetch(versionsUrl)
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (cancelled) return;
        if (json?.success && Array.isArray(json.data) && json.data.length > 0) {
          const latest = json.data[0
];
          if (latest?.html) {
            setLatestReportHtml(latest.html);
            setLatestReportMeta({ created_at: latest.created_at, label: latest.label });
          }
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setReportLoading(false); });
    return () => { cancelled = true; };
  }, [reportOpen, selectedCase?.id]);

  const markComplete = (caseId) => {
    setCases(prev => {
      const updated = prev.map(c => c.id === caseId ? { ...c, status: 'completed', waitMins: 0 } : c);
      const staticIds = new Set(REAL_CASES.map(c => c.id));
      const uploaded = updated.filter(c => !staticIds.has(c.id));
      try { sessionStorage.setItem('r1-uploaded-cases', JSON.stringify(uploaded)); } catch {}
      return updated;
    });
    setSelectedCase(prev => prev && prev.id === caseId ? { ...prev, status: 'completed', waitMins: 0 } : prev);
  };

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);

  const [cases, setCases] = useState([]);

  // Local hydration map: backend stores case metadata but not the bundled dataset
  // file URLs/seriesFiles for sample cases, so we look those up here by case_id.
  const staticCaseMap = useMemo(() => {
    const m = {};
    REAL_CASES.forEach(c => { m[c.id] = c; });
    return m;
  }, []);

  // Fetch cases from backend on mount. Backend filters by is_master / assigned_rad_id
  // based on the user_id of the logged-in radiologist — render whatever comes back.
  useEffect(() => {
    const userId = getCurrentUserId();
    if (!userId) {
      setCases([]);
      return;
    }

    const url = `/api/radiology/scans?user_id=${userId}`;
    fetch(url)
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (!json?.success || !Array.isArray(json.data)) {
          setCases([]);
          return;
        }

        const initials = (name) =>
          (name || '').split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase() || '??';

        const apiCases = json.data
          .map((s, i) => {
            const local = staticCaseMap[s.case_id] || {};
            const patientName = s.patient_name || local.patientName || 'Unknown';
            return {
              id:           s.case_id,
              clientId:     local.clientId || '',
              orgName:      s.ref_organisation || '',
              patientName,
              initials:     local.initials || initials(patientName),
              age:          s.patient_age ?? local.age ?? 0,
              sex:          s.patient_sex ?? local.sex ?? '',
              modality:     s.scan_type || local.modality || 'MR',
              study:        s.study || local.study || s.scan_type || '',
              priority:     (s.priority || local.priority || 'routine').toLowerCase(),
              status:       s.status || local.status || 'pending',
              waitMins:     local.waitMins ?? 20,
              referredBy:   local.referredBy || 'Dr. —',
              location:     local.location || '-',
              avatarBg:     local.avatarBg || AVATAR_COLORS[i % AVATAR_COLORS.length],
              fileUrl:      local.fileUrl || s.file_url || '',
              filename:     local.filename || '',
              seriesFiles:  local.seriesFiles || [],
              thumbnail:    s.thumbnail || local.thumbnail || null,
              s3Key:        s.s3_key || null,
              storageType:  s.storage_type || 'local',
            };
          });

        setCases(apiCases);
      })
      .catch(() => { setCases([]); });
  }, [staticCaseMap]);

  // Auto-open a case when arriving from a notification click
  // (navigate("/radiologist/repository1", { state: { openCaseId } })).
  useEffect(() => {
    const wantId = location.state?.openCaseId;
    if (!wantId || cases.length === 0) return;
    const match = cases.find(c => c.id === wantId);
    if (match) setSelectedCase(match);
  }, [cases, location.state]);

  useEffect(() => {
    if (cases.length === 0) return;
    let cancelled = false;

    async function genThumbs() {
      const updates = {};

      // Only generate client-side thumbnails for cases that don't already have
      // a backend-served one (returned as `thumbnail` from /radiology/scans).
      for (const c of cases) {
        if (c.thumbnail) continue;
        const staticEntry = staticCaseMap[c.id
];
        if (!staticEntry) continue;

        try {
          if (Array.isArray(staticEntry.seriesFiles) && staticEntry.seriesFiles.length > 0) {
            const midIdx = Math.floor(staticEntry.seriesFiles.length / 2);
            const url = staticEntry.seriesFiles[midIdx
];
            if (url) {
              const res = await fetch(url);
              const blob = await res.blob();
              const file = new File([blob], 'slice.dcm');
              const thumb = await generateThumbnail(file);
              if (thumb) updates[c.id] = thumb;
            }
            continue;
          }

          const fileUrl = staticEntry.fileUrl;
          if (fileUrl && !fileUrl.startsWith('local-')) {
            const res = await fetch(fileUrl);
            const blob = await res.blob();
            const file = new File([blob], staticEntry.filename || 'scan.nii');
            const thumb = await generateThumbnail(file);
            if (thumb) updates[c.id] = thumb;
          }
        } catch (e) {
          console.warn(`Thumbnail gen failed for ${c.id}:`, e);
        }
      }

      if (!cancelled && Object.keys(updates).length > 0) {
        setCases(prev => prev.map(c => (updates[c.id] && !c.thumbnail) ? { ...c, thumbnail: updates[c.id] } : c));
      }
    }

    genThumbs();
    return () => { cancelled = true; };
  }, [cases.length, staticCaseMap]);

  const [uploadForm, setUploadForm] = useState({
    caseId: generateCaseId(),
    patientName: '', patientSex: '', patientAge: '',
    scanType: 'CT',
    priority: 'routine',
    study: '',
    referredBy: '',
    location: '',
    file: null,
    dicomFile: null,
    folderFiles: null,
  });
  const fileInputRef = useRef(null);
  const dicomInputRef = useRef(null);
  const folderInputRef = useRef(null);

  const resetUploadForm = () => {
    setUploadForm({
      caseId: generateCaseId(),
      patientName: '', patientSex: '', patientAge: '',
      scanType: 'CT', priority: 'routine', study: '', referredBy: '', location: '',
      file: null, dicomFile: null, folderFiles: null,
    });
    if (fileInputRef.current)   fileInputRef.current.value = '';
    if (dicomInputRef.current)  dicomInputRef.current.value = '';
    if (folderInputRef.current) folderInputRef.current.value = '';
  };

  const handleUpload = useCallback(async () => {
    const hasNifti  = !!uploadForm.file;
    const hasDicom  = !!uploadForm.dicomFile;
    const hasFolder = uploadForm.folderFiles && uploadForm.folderFiles.length > 0;

    if (!uploadForm.patientName || !uploadForm.patientSex || !uploadForm.patientAge) {
      alert('Please provide Patient Name, Sex, and Age.');
      return;
    }
    if (!hasNifti && !hasDicom && !hasFolder) {
      alert('Please select a file (NIfTI, DICOM, or DICOM folder).');
      return;
    }

    setUploadLoading(true);

    let chosenFile = null;
    let fname = '';
    if (hasNifti) {
      chosenFile = uploadForm.file;
      fname = chosenFile.name;
    } else if (hasDicom) {
      chosenFile = uploadForm.dicomFile;
      fname = chosenFile.name;
    } else if (hasFolder) {
      fname = 'DICOM Series';
    }

    const localFileKey = `local-file-${uploadForm.caseId}`;
    if (chosenFile) {
      await storeFile(localFileKey, chosenFile);
    }

    let thumbnail = null;
    if (chosenFile) {
      try { thumbnail = await generateThumbnail(chosenFile); } catch { /* ignore */ }
    }

    let backendFileUrl = null;
    try {
      const userId = getCurrentUserId();

      const formData = new FormData();
      if (hasFolder) {
        Array.from(uploadForm.folderFiles).forEach(f => formData.append('files', f));
      } else if (hasDicom) {
        formData.append('file', uploadForm.dicomFile);
      } else {
        formData.append('file', uploadForm.file);
      }
      formData.append('case_id', uploadForm.caseId);
      formData.append('scan_type', toBackendScanType(uploadForm.scanType));
      formData.append('patient_name', uploadForm.patientName);
      formData.append('patient_sex', uploadForm.patientSex);
      formData.append('patient_age', uploadForm.patientAge);
      if (userId) {
        formData.append('user_id', userId);
      } else {
        console.warn('Upload API skipped user_id append: no current user id found in localStorage.');
      }

      const res = await fetch('/api/radiology/scans/upload', { method: 'POST', body: formData });
      if (res.ok) {
        const data = await res.json();
        backendFileUrl = data.file_url || data.fileUrl || null;
      } else {
        let detail = `Upload API failed (${res.status})`;
        try {
          const err = await res.json();
          detail = err?.detail ? `${detail}: ${JSON.stringify(err.detail)}` : detail;
        } catch {}
        console.warn(detail);
      }
    } catch {
      // Backend not available
    }

    const fileUrl = backendFileUrl || localFileKey;
    const initials = uploadForm.patientName.split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase();

    const newCase = {
      id: uploadForm.caseId,
      patientName: uploadForm.patientName,
      initials,
      age: parseInt(uploadForm.patientAge) || 0,
      sex: uploadForm.patientSex,
      modality: uploadForm.scanType,
      study: uploadForm.study || fname,
      priority: uploadForm.priority,
      status: 'pending',
      waitMins: 0,
      referredBy: uploadForm.referredBy || '—',
      location: uploadForm.location || '—',
      avatarBg: AVATAR_COLORS[cases.length % AVATAR_COLORS.length],
      fileUrl,
      filename: fname,
      thumbnail,
    };

    setCases(prev => {
      const updated = [newCase, ...prev
];
      const initialIds = new Set(REAL_CASES.map(c => c.id));
      const uploaded = updated.filter(c => !initialIds.has(c.id));
      try { sessionStorage.setItem('r1-uploaded-cases', JSON.stringify(uploaded)); } catch {}
      return updated;
    });
    setUploadOpen(false);
    resetUploadForm();
    setUploadLoading(false);
  }, [uploadForm, cases.length]);

  const openViewer = async (item) => {
    // Enter real fullscreen as part of THIS click (browsers only allow it from
    // a user gesture). We fullscreen the whole document; RadiologyApp hides its
    // Header/Footer on the viewer route, so the viewer fills the entire screen.
    try {
      if (!document.fullscreenElement) {
        const root = document.documentElement;
        const fn = root.requestFullscreen || root.webkitRequestFullscreen;
        console.log('[fs] repo click, isTrusted-gesture ok, userActivation=', navigator.userActivation?.isActive, 'fullscreenEnabled=', document.fullscreenEnabled);
        fn?.call(root)
          ?.then(() => console.log('[fs] repo SUCCESS, fullscreenElement=', document.fullscreenElement?.tagName))
          ?.catch((e) => console.log('[fs] repo REJECTED', e?.name, e?.message));
      } else {
        console.log('[fs] repo click, already fullscreenElement=', document.fullscreenElement?.tagName);
      }
    } catch (e) { console.log('[fs] repo THREW', e); }

    let fileUrl  = item.fileUrl  || null;
    const filename = item.filename || null;

    // ── Resolve presigned URL for S3 files ───────────────────────────────
    if (item.storageType === 's3' && item.s3Key) {
      try {
        const authString = localStorage.getItem('auth');
        let token = null;
        if (authString) {
          try { token = JSON.parse(authString)?.token; } catch {}
        }
        const headers = token ? { Authorization: `Bearer ${token}` } : {};

        const s3KeyLower = (item.s3Key || '').toLowerCase();
        const isNiftiKey = s3KeyLower.endsWith('.nii') || s3KeyLower.endsWith('.nii.gz');

        if (!isNiftiKey) {
          // ── DICOM series: fetch all files from S3 prefix ──────────────
          const prefix = item.s3Key.substring(0, item.s3Key.lastIndexOf('/') + 1);
          const seriesRes  = await fetch(
            `/api/storage/presigned-series?prefix=${encodeURIComponent(prefix)}`,
            { headers }
          );
          const seriesData = await seriesRes.json();
          if (seriesData?.urls?.length > 0) {
            // Pass all presigned URLs as seriesFiles
            item = {
              ...item,
              seriesFiles: seriesData.urls.map(u => u.url),
              fileUrl:     seriesData.urls[0].url,
            };
            fileUrl = seriesData.urls[0].url;
          } else {
            // Fallback: single file presigned URL
            const singleRes  = await fetch(
              `/api/storage/download-url?s3_key=${encodeURIComponent(item.s3Key)}`,
              { headers }
            );
            const singleData = await singleRes.json();
            if (singleData?.url) fileUrl = singleData.url;
          }
        } else {
          // ── NIfTI: single presigned URL ───────────────────────────────
          const res  = await fetch(
            `/api/storage/download-url?s3_key=${encodeURIComponent(item.s3Key)}`,
            { headers }
          );
          const data = await res.json();
          if (data?.url) fileUrl = data.url;
        }
      } catch (e) {
        console.error('[repository_1] S3 presigned URL fetch failed', e);
      }
    }

    const isSeries = (Array.isArray(item.seriesFiles) && item.seriesFiles.length > 0) || (fileUrl || '').toLowerCase().includes('/dicom-series/') || (fileUrl || '').toLowerCase().includes('/bulk-series/') || (item.storageType === 's3' && item.s3Key && !((item.s3Key||'').toLowerCase().endsWith('.nii') || (item.s3Key||'').toLowerCase().endsWith('.nii.gz')));
    const rawPath  = (fileUrl || '').toLowerCase().split('?')[0];
    const s3Path   = (item.s3Key || '').toLowerCase();
    const isNifti  =
      rawPath.endsWith('.nii') ||
      rawPath.endsWith('.nii.gz') ||
      s3Path.endsWith('.nii') ||
      s3Path.endsWith('.nii.gz') ||
      (filename || '').toLowerCase().endsWith('.nii') ||
      (filename || '').toLowerCase().endsWith('.nii.gz');

    const route = isSeries && !isNifti ? '/radiologist/dcmviewer-cpu' : '/radiologist/dcmviewer';

    navigate(route, {
      state: {
        fileUrl:     fileUrl,
        filename:    filename,
        seriesFiles: item.seriesFiles || null,
        patientName: item.patientName,
        patientAge:  item.age,
        patientSex:  item.sex,
        caseId:      item.id,
        clientId:    displayClientId(item.clientId),
        priority:    item.priority,
        status:      item.status,
        study:       item.study,
        modality:    item.modality,
        referredBy:  item.referredBy,
        location:    item.location,
        waitMins:    item.waitMins,
      },
    });
  };

  const filtered = useMemo(() => {
    let next = cases;

    if (priorityFilter !== 'all') {
      next = next.filter(c => c.priority === priorityFilter);
    }

    if (statusFilter !== 'all') {
      next = next.filter(c => c.status === statusFilter);
    }

    if (modalityFilter !== 'all') {
      next = next.filter(c => normalizeModality(c.modality) === modalityFilter);
    }

    if (orgFilter) {
      next = next.filter(c => c.orgName === orgFilter);
    }

    if (idFilter.trim()) {
      const query = idFilter.trim().toLowerCase();
      next = next.filter(c => {
        const displayCase = displayCaseId(c.id || '');
        const displayOrg = displayClientId(c.clientId || '');
        return displayCase.toLowerCase().includes(query) || displayOrg.toLowerCase().includes(query);
      });
    }

    return next;
  }, [priorityFilter, statusFilter, modalityFilter, orgFilter, idFilter, cases]);

  const grouped = useMemo(() => ({
    stat:    filtered.filter(c => c.priority === 'stat'),
    urgent:  filtered.filter(c => c.priority === 'urgent'),
    routine: filtered.filter(c => c.priority === 'routine'),
  }), [filtered]);

  const priorityOptions = [
    { value: 'all', label: 'All' },
    { value: 'stat', label: 'STAT' },
    { value: 'urgent', label: 'Urgent' },
    { value: 'routine', label: 'Routine' },

];
  const statusOptions = [
    { value: 'all', label: 'All' },
    { value: 'reading', label: 'In Review' },
    { value: 'pending', label: 'Pending' },
    { value: 'completed', label: 'Completed' },

];
  const modalityOptions = ['CT', 'MRI', 'X-Ray', 'Mammography'];
  const orgOptions = useMemo(
    () => [...new Set(cases.map(c => c.orgName).filter(Boolean))],
    [cases]
  );
  const isAllFilters =
    priorityFilter === 'all' &&
    statusFilter   === 'all' &&
    modalityFilter === 'all' &&
    orgFilter      === ''    &&
    idFilter       === '';

  return (
    <div className="r1-shell">
      <main className="r1-worklist">
        <div className="r1-wl-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div>
              <div className="r1-wl-title">Case Worklist</div>
              <div className="r1-wl-sub">{filtered.length} case{filtered.length !== 1 ? 's' : ''} shown</div>
            </div>
          </div>
          <div className="r1-filter-bar">
            <button
              className={`r1-chip${isAllFilters ? ' r1-chip-active' : ''}`}
              onClick={() => { setPriorityFilter('all'); setStatusFilter('all'); setModalityFilter('all'); setOrgFilter(''); setIdFilter(''); }}
            >
              All
            </button>
            <div className="r1-chip-divider" />
            <div className={`r1-select-filter${priorityFilter !== 'all' ? ' r1-chip-active' : ''}`}>
              <span className="r1-select-filter-label">Priority</span>
              <select className="r1-select-filter-control" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
                {priorityOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className={`r1-select-filter${statusFilter !== 'all' ? ' r1-chip-active' : ''}`}>
              <span className="r1-select-filter-label">Status</span>
              <select className="r1-select-filter-control" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                {statusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className={`r1-select-filter${modalityFilter !== 'all' ? ' r1-chip-active' : ''}`}>
              <span className="r1-select-filter-label">Modality</span>
              <select className="r1-select-filter-control" value={modalityFilter} onChange={(e) => setModalityFilter(e.target.value)}>
                <option value="all">All</option>
                {modalityOptions.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            {orgOptions.length > 0 && (
              <div className={`r1-select-filter${orgFilter ? ' r1-chip-active' : ''}`}>
                <span className="r1-select-filter-label">Org</span>
                <select className="r1-select-filter-control" value={orgFilter} onChange={e => setOrgFilter(e.target.value)}>
                  <option value="">All</option>
                  {orgOptions.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            )}
            <div className={`r1-orgid-filter${idFilter ? ' r1-chip-active' : ''}`}>
              <span className="r1-select-filter-label">ID</span>
              <input type="text" className="r1-orgid-input" value={idFilter} onChange={(e) => setIdFilter(e.target.value)} placeholder="Search..." spellCheck={false} />
              {idFilter && <button className="r1-orgid-clear" onClick={() => setIdFilter('')}>×</button>}
            </div>
          </div>
        </div>

        <div className="r1-wl-body">
          {grouped.stat.length > 0 && (
            <>
              <GroupLabel label="STAT" color="var(--r1-error)" count={grouped.stat.length} />
              {grouped.stat.map(c => <CaseCard key={c.id} item={c} selected={selectedCase?.id === c.id} onSelect={setSelectedCase} />)}
            </>
          )}
          {grouped.urgent.length > 0 && (
            <>
              <GroupLabel label="URGENT" color="var(--r1-warning)" count={grouped.urgent.length} />
              {grouped.urgent.map(c => <CaseCard key={c.id} item={c} selected={selectedCase?.id === c.id} onSelect={setSelectedCase} />)}
            </>
          )}
          {grouped.routine.length > 0 && (
            <>
              <GroupLabel label="ROUTINE" color="var(--r1-text-muted)" count={grouped.routine.length} />
              {grouped.routine.map(c => <CaseCard key={c.id} item={c} selected={selectedCase?.id === c.id} onSelect={setSelectedCase} />)}
            </>
          )}
          {filtered.length === 0 && (
            <div className="r1-empty">
              {cases.length === 0 ? 'No cases available.' : 'No cases match the selected filter.'}
            </div>
          )}
        </div>
      </main>

      <aside className="r1-detail">
        {!selectedCase ? (
          <div className="r1-detail-empty">
            <div className="r1-de-icon">🗂</div>
            <div className="r1-de-title">No case selected</div>
            <div className="r1-de-sub">Click a case in the worklist to view details and take action.</div>
          </div>
        ) : (
          <div className="r1-detail-content">
            <div className="r1-detail-header">
              <div className="r1-dh-id">{displayCaseId(selectedCase.id)}</div>
              <div className="r1-dh-badges">
                <span className={`r1-pri-badge r1-pri-${selectedCase.priority}`}>{selectedCase.priority.toUpperCase()}</span>
                <span className={`r1-status-pill r1-status-${selectedCase.status}`}>{statusLabel(selectedCase.status)}</span>
                <span className="r1-mod-badge">{selectedCase.modality}</span>
              </div>
            </div>
            <div className="r1-detail-section">
              <div className="r1-ds-label">Case Information</div>
              {[
                ['Client ID', selectedCase.clientId ? displayClientId(selectedCase.clientId) : '—'],
                ['Age', `${selectedCase.age} years`],
                ['Sex', selectedCase.sex === 'M' ? 'Male' : selectedCase.sex === 'F' ? 'Female' : selectedCase.sex],
                ['Study', selectedCase.study],
                ['Wait time', fmtWait(selectedCase.waitMins)],
              ].map(([l, v]) => (
                <div key={l} className="r1-detail-row">
                  <span className="r1-dl">{l}</span>
                  <span className="r1-dv">{v}</span>
                </div>
              ))}
            </div>
            <div className="r1-detail-section">
              <div className="r1-ds-label">Scan Preview</div>
              <div className="r1-scan-preview">
                <img src={selectedCase.thumbnail || getSampleThumb(selectedCase.id, selectedCase.modality)} alt="Scan preview" />
              </div>
            </div>
            <div className="r1-detail-actions">
              <button className="r1-btn-primary" onClick={() => openViewer(selectedCase)}>▶ Open Viewer</button>
              {selectedCase.status !== 'completed' ? (
                <button className="r1-btn-secondary r1-btn-complete" onClick={() => markComplete(selectedCase.id)}>✓ Mark Complete</button>
              ) : (
                <div className="r1-completed-badge">✅ Completed</div>
              )}
              <button className="r1-btn-secondary" onClick={() => setReportOpen(true)}>📄 View Report</button>
              <button className="r1-btn-secondary" onClick={() => setSelectedCase(null)}>✕ Close</button>
            </div>
          </div>
        )}
      </aside>

      {reportOpen && selectedCase && (
        <div className="r1-modal-overlay" onClick={() => setReportOpen(false)}>
          <div className="r1-modal r1-report-modal" onClick={e => e.stopPropagation()}>
            <div className="r1-modal-header">
              <span className="r1-modal-title">Radiology Report</span>
              <button className="r1-modal-close" onClick={() => setReportOpen(false)}>✕</button>
            </div>
            <div className="r1-modal-body r1-report-body">
              <div className="r1-rpt-header">
                <div className="r1-rpt-logo">ONIX AI</div>
                <div className="r1-rpt-facility">Department of Radiology</div>
              </div>
              <div className="r1-rpt-divider" />
              <div className="r1-rpt-section">
                <div className="r1-rpt-row"><span className="r1-rpt-label">Patient Name</span><span className="r1-rpt-value">{selectedCase.patientName}</span></div>
                <div className="r1-rpt-row"><span className="r1-rpt-label">Case ID</span><span className="r1-rpt-value">{displayCaseId(selectedCase.id)}</span></div>
                <div className="r1-rpt-row"><span className="r1-rpt-label">Client ID</span><span className="r1-rpt-value">{selectedCase.clientId ? displayClientId(selectedCase.clientId) : '—'}</span></div>
                <div className="r1-rpt-row"><span className="r1-rpt-label">Age / Sex</span><span className="r1-rpt-value">{selectedCase.age}Y / {selectedCase.sex === 'M' ? 'Male' : selectedCase.sex === 'F' ? 'Female' : 'Other'}</span></div>
                <div className="r1-rpt-row"><span className="r1-rpt-label">Modality</span><span className="r1-rpt-value">{selectedCase.modality}</span></div>
                <div className="r1-rpt-row"><span className="r1-rpt-label">Study</span><span className="r1-rpt-value">{selectedCase.study}</span></div>
                <div className="r1-rpt-row"><span className="r1-rpt-label">Referred By</span><span className="r1-rpt-value">{selectedCase.referredBy}</span></div>
                <div className="r1-rpt-row"><span className="r1-rpt-label">Location</span><span className="r1-rpt-value">{selectedCase.location}</span></div>
                <div className="r1-rpt-row"><span className="r1-rpt-label">Priority</span><span className="r1-rpt-value">{selectedCase.priority.toUpperCase()}</span></div>
                <div className="r1-rpt-row"><span className="r1-rpt-label">Status</span><span className="r1-rpt-value">{statusLabel(selectedCase.status)}</span></div>
              </div>
              <div className="r1-rpt-divider" />
              <div className="r1-rpt-section">
                <div className="r1-rpt-section-title">Clinical History</div>
                <div className="r1-rpt-text">Patient referred for {selectedCase.study}. Clinical correlation advised.</div>
              </div>
              <div className="r1-rpt-divider" />
              <div className="r1-rpt-section">
                <div className="r1-rpt-section-title">Findings</div>
                <div className="r1-rpt-text r1-rpt-placeholder">No findings have been recorded yet. Open the viewer to analyze the scan and generate findings.</div>
              </div>
              <div className="r1-rpt-divider" />
              <div className="r1-rpt-section">
                <div className="r1-rpt-section-title">Impression</div>
                <div className="r1-rpt-text r1-rpt-placeholder">Pending radiologist review.</div>
              </div>
              <div className="r1-rpt-divider" />
              <div className="r1-rpt-signature">
                <div className="r1-rpt-sig-line" />
                <div className="r1-rpt-sig-name">Reporting Radiologist</div>
                <div className="r1-rpt-sig-date">Date: {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {uploadOpen && (
        <div className="r1-modal-overlay" onClick={() => setUploadOpen(false)}>
          <div className="r1-modal" onClick={e => e.stopPropagation()}>
            <div className="r1-modal-header">
              <span className="r1-modal-title">Upload Radiology Scan</span>
              <button className="r1-modal-close" onClick={() => setUploadOpen(false)}>✕</button>
            </div>
            <div className="r1-modal-body">
              <div className="r1-form-group">
                <label className="r1-form-label">Case ID</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="r1-form-input" type="text" value={uploadForm.caseId} readOnly />
                  <button className="r1-btn-secondary" style={{ width: 'auto', padding: '6px 12px', fontSize: 12 }} onClick={() => setUploadForm(prev => ({ ...prev, caseId: generateCaseId() }))}>Regenerate</button>
                </div>
              </div>
              <div className="r1-form-group">
                <label className="r1-form-label">Patient Name</label>
                <input className="r1-form-input" type="text" placeholder="e.g. John Doe" value={uploadForm.patientName} onChange={e => setUploadForm({ ...uploadForm, patientName: e.target.value })} />
              </div>
              <div className="r1-form-group">
                <label className="r1-form-label">Sex</label>
                <select className="r1-form-input" value={uploadForm.patientSex} onChange={e => setUploadForm({ ...uploadForm, patientSex: e.target.value })}>
                  <option value="">Select</option><option value="M">Male</option><option value="F">Female</option><option value="O">Other</option>
                </select>
              </div>
              <div className="r1-form-group">
                <label className="r1-form-label">Age</label>
                <input className="r1-form-input" type="number" min="0" max="120" value={uploadForm.patientAge} onChange={e => setUploadForm({ ...uploadForm, patientAge: e.target.value })} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="r1-form-group">
                  <label className="r1-form-label">Modality</label>
                  <select className="r1-form-input" value={uploadForm.scanType} onChange={e => setUploadForm({ ...uploadForm, scanType: e.target.value })}>
                    <option value="CT">CT</option><option value="MR">MR</option><option value="MRI">MRI</option><option value="XR">X-Ray</option><option value="MG">Mammography</option><option value="US">Ultrasound</option>
                  </select>
                </div>
                <div className="r1-form-group">
                  <label className="r1-form-label">Priority</label>
                  <select className="r1-form-input" value={uploadForm.priority} onChange={e => setUploadForm({ ...uploadForm, priority: e.target.value })}>
                    <option value="stat">STAT</option><option value="urgent">Urgent</option><option value="routine">Routine</option>
                  </select>
                </div>
              </div>
              <div className="r1-form-group">
                <label className="r1-form-label">Study Description</label>
                <input className="r1-form-input" type="text" value={uploadForm.study} onChange={e => setUploadForm({ ...uploadForm, study: e.target.value })} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="r1-form-group">
                  <label className="r1-form-label">Referred By</label>
                  <input className="r1-form-input" type="text" value={uploadForm.referredBy} onChange={e => setUploadForm({ ...uploadForm, referredBy: e.target.value })} />
                </div>
                <div className="r1-form-group">
                  <label className="r1-form-label">Location</label>
                  <input className="r1-form-input" type="text" value={uploadForm.location} onChange={e => setUploadForm({ ...uploadForm, location: e.target.value })} />
                </div>
              </div>
              <div className="r1-form-group">
                <label className="r1-form-label">NIfTI File (.nii / .nii.gz)</label>
                <input className="r1-form-input" ref={fileInputRef} type="file" accept=".nii,.nii.gz" onChange={e => setUploadForm({ ...uploadForm, file: e.target.files[0], dicomFile: null, folderFiles: null })} />
              </div>
              <div className="r1-form-group">
                <label className="r1-form-label">DICOM Single File (.dcm)</label>
                <input className="r1-form-input" ref={dicomInputRef} type="file" accept=".dcm" onChange={e => setUploadForm({ ...uploadForm, dicomFile: e.target.files[0], file: null, folderFiles: null })} />
              </div>
              <div className="r1-form-group">
                <label className="r1-form-label">DICOM Folder (CT/MR Series)</label>
                <input className="r1-form-input" ref={folderInputRef} type="file" multiple webkitdirectory="true" directory="true" onChange={e => setUploadForm({ ...uploadForm, folderFiles: e.target.files, file: null, dicomFile: null })} />
                <span className="r1-form-hint">Chrome/Edge only. For other browsers, upload a .zip.</span>
              </div>
            </div>
            <div className="r1-modal-footer">
              <button className="r1-btn-secondary" style={{ width: 'auto', padding: '8px 18px' }} onClick={() => { setUploadOpen(false); resetUploadForm(); }}>Cancel</button>
              <button className="r1-btn-primary" style={{ width: 'auto', padding: '8px 22px' }} onClick={handleUpload} disabled={uploadLoading}>{uploadLoading ? 'Uploading…' : 'Upload Scan'}</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
