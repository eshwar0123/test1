import React, { useState, useEffect, useRef } from "react";
import "./Chat.css";

/* ===============================
   Utility: Generate consistent color per user
================================ */
function stringToColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  let color = "#";
  for (let i = 0; i < 3; i++) {
    const value = (hash >> (i * 8)) & 0xff;
    color += value.toString(16).padStart(2, "0");
  }
  return color;
}

/* ===============================
   Adobe-Style Comment Panel (NO LOGIN REQUIRED FOR TESTING)
================================ */
export default function Chat({ scanId, annotationId }) {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(true);
  const scrollRef = useRef(null);

  // FOR TESTING: Use hardcoded test user if not logged in
  const userId = parseInt(localStorage.getItem("userId")) || 1;
  const userEmail = localStorage.getItem("userEmail") || "test@example.com";
  const userName = localStorage.getItem("userName") || "Test User";
  const userColor = stringToColor(userEmail);

  /* ===============================
     Fetch comments on mount & when annotation changes
  ================================ */
  useEffect(() => {
    if (scanId) {
      fetchComments();
    }
  }, [scanId, annotationId]);

  const fetchComments = async () => {
    setFetchLoading(true);
    try {
      let url;
      
      if (annotationId) {
        // Use the specific annotation endpoint
        url = `/api/annotations/${annotationId?.id}/chats`;
      } else {
        // Use the scan-wide endpoint
        url = `/api/scans/${scanId}/comments`;
      }

      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const data = await res.json();
      
      // Handle different response formats
      if (annotationId) {
        setMessages(data.chats || []); // /annotations/{id}/chats returns {success, chats}
      } else {
        setMessages(data); // /scans/{id}/comments returns array directly
      }
    } catch (err) {
      console.error("Error fetching comments:", err);
      setMessages([]);
    } finally {
      setFetchLoading(false);
    }
  };

  /* ===============================
     Auto-scroll to bottom when messages change
  ================================ */
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  /* ===============================
     Post new comment (NO LOGIN CHECK FOR TESTING)
  ================================ */
  const handleSendMessage = async () => {
  if (!inputValue.trim() || loading) return;

  setLoading(true);

  try {
    // Make sure annotation_id is either a string or null
    const payload = {
      text: inputValue,
      annotation_id: annotationId?.id || null,  // Keep it simple
      user_id: userId,
    };

    console.log("Sending payload:", payload);  // This will help us debug

    const res = await fetch(`/api/scans/${scanId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.detail || "Failed to post comment");
    }

    const newComment = await res.json();
    setMessages([...messages, newComment]);
    setInputValue("");
  } catch (err) {
    console.error("Error posting comment:", err);
    alert(err.message || "Failed to post comment. Please try again.");
  } finally {
    setLoading(false);
  }
};

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="chat-panel">
      {/* Header */}
      <div className="chat-header">
        <h3 className="chat-title">💬 Comments</h3>
        <div className="chat-metadata">
          <span className="scan-label">Scan #{scanId}</span>
          {annotationId && (
            <span className="annotation-badge">
              📌 Annotation
            </span>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="chat-messages" ref={scrollRef}>
        {fetchLoading ? (
          <div className="chat-loading">
            <div className="chat-spinner"></div>
            <span>Loading comments...</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="chat-empty">
            <div className="chat-empty-icon">💭</div>
            <div className="chat-empty-text">
              {annotationId
                ? "No comments on this annotation yet"
                : "No comments yet. Start the conversation!"}
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            const isOwn = msg.user_id === userId;
            const msgColor = stringToColor(msg.user_email || msg.user_name || String(msg.user_id));
            const displayName = msg.user_name || msg.user_email?.split("@")[0] || `User ${msg.user_id}`;

            return (
              <div
                key={msg.id}
                className={`message-container ${isOwn ? 'message-container-own' : 'message-container-other'}`}
              >
                <div
                  className={`message-bubble ${!isOwn ? 'message-bubble-other' : ''}`}
                  style={{
                    background: isOwn ? userColor : undefined,
                    borderBottomRightRadius: isOwn ? '4px' : undefined,
                    borderBottomLeftRadius: isOwn ? '12px' : undefined,
                  }}
                >
                  <div className="message-info">
                    <span
                      className="message-username"
                      style={{
                        color: isOwn ? "#fff" : msgColor,
                      }}
                    >
                      {isOwn ? "You" : displayName}
                    </span>
                    <span className="message-time">
                      {new Date(msg.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <div className="message-text">{msg.text}</div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Input Area */}
      <div className="chat-input-area">
        <input
          type="text"
          className="chat-input"
          placeholder={
            annotationId
              ? "Comment on this annotation..."
              : "Add a comment..."
          }
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={handleKeyPress}
          disabled={loading}
        />
        <button
          className="chat-send-button"
          onClick={handleSendMessage}
          disabled={loading || !inputValue.trim()}
          style={{
            backgroundColor: userColor,
            opacity: loading || !inputValue.trim() ? 0.5 : 1,
          }}
        >
          {loading ? "..." : "Send"}
        </button>
      </div>
    </div>
  );
}