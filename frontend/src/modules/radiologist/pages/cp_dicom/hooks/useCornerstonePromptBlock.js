import { useEffect } from "react";

export default function useCornerstonePromptBlock({
  isCornerstoneNifti,
  promptBackupRef,
}) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const restorePrompt = () => {
      if (promptBackupRef.current) {
        window.prompt = promptBackupRef.current;
        promptBackupRef.current = null;
      }
    };

    if (!isCornerstoneNifti) {
      restorePrompt();
      return;
    }

    if (!promptBackupRef.current) {
      promptBackupRef.current = window.prompt;
    }
    window.prompt = () => " ";

    return () => {
      restorePrompt();
    };
  }, [isCornerstoneNifti, promptBackupRef]);
}
