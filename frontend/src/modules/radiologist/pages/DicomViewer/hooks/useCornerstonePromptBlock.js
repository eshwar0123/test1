import { useEffect } from "react";

export default function useCornerstonePromptBlock({
  isCornerstoneNifti,
  isCornerstoneDicom,
  promptBackupRef,
}) {
  const active = isCornerstoneNifti || isCornerstoneDicom;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const restorePrompt = () => {
      if (promptBackupRef.current) {
        window.prompt = promptBackupRef.current;
        promptBackupRef.current = null;
      }
    };

    if (!active) {
      restorePrompt();
      return;
    }

    if (!promptBackupRef.current) {
      promptBackupRef.current = window.prompt;
    }
    // ArrowAnnotateTool's getTextCallback/changeTextCallback config doesn't
    // actually suppress cornerstone-tools' internal window.prompt() call on
    // this version — it still blocks with a native "Enter your annotation"
    // dialog before our own Save Annotation modal ever gets a chance to open.
    // Answering it here with a blank string lets the tool proceed straight
    // to ANNOTATION_COMPLETED, which is what opens the real dialog.
    window.prompt = () => " ";

    return () => {
      restorePrompt();
    };
  }, [active, promptBackupRef]);
}
