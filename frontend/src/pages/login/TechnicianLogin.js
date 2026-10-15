import React from 'react'
import OrganizationLogin from './OrganizationLogin'

// Same login flow as the organization portal; the backend decides the
// destination from the user's role (technician -> /technician/case-queue).
export default function TechnicianLogin() {
  return <OrganizationLogin portal="technician" />
}

