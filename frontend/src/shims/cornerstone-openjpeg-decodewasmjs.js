import codecScriptUrl from "@cornerstonejs/codec-openjpeg/decodewasmjs?url";

let loadPromise = null;

function loadCodecScript() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Codec loader requires a browser environment."));
  }
  if (typeof window.OpenJPEGWASM === "function") {
    return Promise.resolve();
  }
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-cs-openjpeg=\"${codecScriptUrl}\"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Failed to load OpenJPEG codec script.")),
        { once: true }
      );
      return;
    }

    const script = document.createElement("script");
    script.src = codecScriptUrl;
    script.async = true;
    script.dataset.csOpenjpeg = codecScriptUrl;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load OpenJPEG codec script."));
    document.head.appendChild(script);
  });

  return loadPromise;
}

export default function openJpegFactory(options = {}) {
  return loadCodecScript().then(() => {
    const factory = window.OpenJPEGWASM;
    if (typeof factory !== "function") {
      throw new Error("OpenJPEGWASM factory is not available on window.");
    }
    return factory(options);
  });
}
