import React from 'react'
import OrganizationRegister from './OrganizationRegister'

// Technician signup: the "Organization Name" entered here is stored as the
// technician's username and is what links them to that organization's cases.
export default function TechnicianRegister() {
  return <OrganizationRegister role="technician" />
}

