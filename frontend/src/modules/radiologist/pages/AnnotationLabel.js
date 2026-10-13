import React, { useState, useEffect } from "react"
import "./AnnotationLabel.css"

/* ===============================
   Utility: Generate consistent color per user
================================ */
function stringToColor(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }

  let color = "#"
  for (let i = 0; i < 3; i++) {
    const value = (hash >> (i * 8)) & 0xff
    color += value.toString(16).padStart(2, "0")
  }
  return color
}

/* ===============================
   Annotation Label Component
================================ */
export default function AnnotationLabel({
  annotation,        // selected annotation object
  onUpdate,          // callback after save
}) {
  const [label, setLabel] = useState("")
  const [loading, setLoading] = useState(false)

  // Logged-in user (store during login)
  const userColor = stringToColor("user") // Replace with actual username

  /* ===============================
     Update label when annotation changes
  ================================ */
  useEffect(() => {
    setLabel(annotation?.label || "")
  }, [annotation?.id]) // Reset label when annotation ID changes

  /* ===============================
     Save label to backend
  ================================ */
  const saveLabel = async () => {
    if (!annotation?.id) return

    setLoading(true)

    try {
      const res = await fetch(
        `/api/annotations/${annotation.id}/label`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            label,
          }),
        }
      )

      if (!res.ok) throw new Error("Failed to update label")

      onUpdate?.({
        ...annotation,
        label,
      })
    } catch (err) {
      console.error(err)
      alert("Failed to save label")
    } finally {
      setLoading(false)
    }
  }

  if (!annotation) {
    return (
      <div className="annotation-label-empty">
        Select an annotation to add a label
      </div>
    )
  }

  return (
    <div className="annotation-label-container">
      <div className="annotation-label-header">Annotation Label</div>

      <input
        type="text"
        placeholder="Enter label name"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        className="annotation-label-input"
        style={{ borderColor: userColor }}
      />

      <div className="annotation-label-preview">
        <span style={{ color: userColor }}>●</span>
        <span className="annotation-label-preview-text">
          {label || "Label preview"}
        </span>
      </div>

      <button
        onClick={saveLabel}
        disabled={loading}
        className="annotation-label-button"
        style={{
          backgroundColor: userColor,
          opacity: loading ? 0.7 : 1,
          cursor: loading ? "not-allowed" : "pointer",
        }}
      >
        {loading ? "Saving..." : "Save Label"}
      </button>
    </div>
  )
}