// src/shared/useAssessmentLock.js
import { useEffect, useState } from "react";
import api from "./api/axios"; // ✅ since it's in src/shared/

export default function useAssessmentLock() {
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get("/radiologist/progress");
        const prog = res?.data?.progress || {};
        setLocked(Boolean(prog.completion_acknowledged));
      } catch (e) {
        console.error("Failed to load assessment lock", e);
        setLocked(false); // don't block user if API fails
      }
    };

    load();
  }, []);

  return { locked };
}

