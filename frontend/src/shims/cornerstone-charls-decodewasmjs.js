import codecScriptUrl from "@cornerstonejs/codec-charls/decodewasmjs?url";

let loadPromise = null;

function loadCodecScript() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Codec loader requires a browser environment."));
  }
  if (typeof window.CharLSWASM === "function") {
    return Promise.resolve();
  }
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-cs-charls=\"${codecScriptUrl}\"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load CharLS codec script.")), {
        once: true,
      });
      return;
    }

    const script = document.createElement("script");
    script.src = codecScriptUrl;
    script.async = true;
    script.dataset.csCharls = codecScriptUrl;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load CharLS codec script."));
    document.head.appendChild(script);
  });

  return loadPromise;
}

export default function charlsFactory(options = {}) {
  return loadCodecScript().then(() => {
    const factory = window.CharLSWASM;
    if (typeof factory !== "function") {
      throw new Error("CharLSWASM factory is not available on window.");
    }
    return factory(options);
  });
}
