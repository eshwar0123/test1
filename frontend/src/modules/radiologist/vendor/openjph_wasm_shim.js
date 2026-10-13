import wasmDecoderUrl from '@cornerstonejs/codec-openjph/wasmjs?url';

let loadPromise = null;

function loadDecoderScript() {
  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && window.openjphjs) {
      resolve(window.openjphjs);
      return;
    }

    const script = document.createElement('script');
    script.src = wasmDecoderUrl;
    script.async = true;
    script.onload = () => {
      if (window.openjphjs) {
        resolve(window.openjphjs);
      } else {
        reject(new Error('openjphjs not found on window.'));
      }
    };
    script.onerror = () => reject(new Error('Failed to load openjphjs script.'));
    document.body.appendChild(script);
  });

  return loadPromise;
}

export default function openjphFactory(options = {}) {
  return loadDecoderScript().then((factory) => factory(options));
}
