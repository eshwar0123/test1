import codecScriptUrl from "@cornerstonejs/codec-libjpeg-turbo-8bit/decodewasmjs?url";

let loadPromise = null;

function loadCodecScript() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Codec loader requires a browser environment."));
  }
  if (typeof window.libjpegturbowasm_decode === "function") {
    return Promise.resolve();
  }
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-cs-libjpeg=\"${codecScriptUrl}\"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load libjpeg turbo codec script.")), {
        once: true,
      });
      return;
    }

    const script = document.createElement("script");
    script.src = codecScriptUrl;
    script.async = true;
    script.dataset.csLibjpeg = codecScriptUrl;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load libjpeg turbo codec script."));
    document.head.appendChild(script);
  });

  return loadPromise;
}

export default function libjpegTurboFactory(options = {}) {
  return loadCodecScript().then(() => {
    const factory = window.libjpegturbowasm_decode;
    if (typeof factory !== "function") {
      throw new Error("libjpegturbowasm_decode factory is not available on window.");
    }
    return factory(options);
  });
}
