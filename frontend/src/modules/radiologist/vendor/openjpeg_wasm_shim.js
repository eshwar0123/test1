import wasmDecoderUrl from '@cornerstonejs/codec-openjpeg/decodewasmjs?url';

let loadPromise = null;

function loadDecoderScript() {
  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && window.openjpegwasm_decode) {
      resolve(window.openjpegwasm_decode);
      return;
    }

    const script = document.createElement('script');
    script.src = wasmDecoderUrl;
    script.async = true;
    script.onload = () => {
      if (window.openjpegwasm_decode) {
        resolve(window.openjpegwasm_decode);
      } else {
        reject(new Error('openjpegwasm_decode not found on window.'));
      }
    };
    script.onerror = () => reject(new Error('Failed to load openjpegwasm_decode script.'));
    document.body.appendChild(script);
  });

  return loadPromise;
}

export default function openjpegFactory(options = {}) {
  return loadDecoderScript().then((factory) => factory(options));
}
