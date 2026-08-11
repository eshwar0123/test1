const STORAGE_KEY = 'onix.radiology.availability.v1'

const safeParse = (value, fallback) => {
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

export const loadAvailabilitySlots = () => {
  const raw = localStorage.getItem(STORAGE_KEY)
  const data = safeParse(raw, [])
  return Array.isArray(data) ? data : []
}

export const saveAvailabilitySlots = (slots) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(slots || []))
}

export const addAvailabilitySlot = (slot) => {
  const current = loadAvailabilitySlots()
  current.push(slot)
  saveAvailabilitySlots(current)
  return current
}

export const removeAvailabilitySlot = (slotId, userId) => {
  const current = loadAvailabilitySlots()
  const next = current.filter((s) => !(s.id === slotId && s.userId === userId))
  saveAvailabilitySlots(next)
  return next
}
