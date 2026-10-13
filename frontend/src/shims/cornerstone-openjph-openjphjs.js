const codecScriptUrl = "/node_modules/@cornerstonejs/codec-openjph/dist/openjphjs.js";

let loadPromise = null;
let openJphFactory = null;

function captureFactory(previousModule) {
  const candidate = typeof window !== "undefined" ? window.Module : null;
  if (typeof candidate !== "function") {
    throw new Error("OpenJPH Module factory is not available on window.");
  }
  openJphFactory = candidate;

  if (previousModule === undefined) {
    try {
      delete window.Module;
    } catch {
      window.Module = undefined;
    }
  } else {
    window.Module = previousModule;
  }
}

function loadCodecScript() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Codec loader requires a browser environment."));
  }
  if (openJphFactory) return Promise.resolve();
  if (loadPromise) return loadPromise;

  const previousModule = window.Module;
  loadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-cs-openjph="${codecScriptUrl}"]`);

    const onLoad = () => {
      try {
        captureFactory(previousModule);
        resolve();
      } catch (error) {
        reject(error);
      }
    };
    const onError = () => reject(new Error("Failed to load OpenJPH codec script."));

    if (existing) {
      existing.addEventListener("load", onLoad, { once: true });
      existing.addEventListener("error", onError, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = codecScriptUrl;
    script.async = true;
    script.dataset.csOpenjph = codecScriptUrl;
    script.onload = onLoad;
    script.onerror = onError;
    document.head.appendChild(script);
  });

  return loadPromise;
}

export default function openJphFactoryWrapper(options = {}) {
  return loadCodecScript().then(() => openJphFactory(options));
}
