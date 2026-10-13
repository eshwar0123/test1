import wasmDecoderUrl from '@cornerstonejs/codec-libjpeg-turbo-8bit/decodewasmjs?url';

let loadPromise = null;

function loadDecoderScript() {
  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && window.libjpegturbowasm_decode) {
      resolve(window.libjpegturbowasm_decode);
      return;
    }

    const script = document.createElement('script');
    script.src = wasmDecoderUrl;
    script.async = true;
    script.onload = () => {
      if (window.libjpegturbowasm_decode) {
        resolve(window.libjpegturbowasm_decode);
      } else {
        reject(new Error('libjpegturbowasm_decode not found on window.'));
      }
    };
    script.onerror = () => reject(new Error('Failed to load libjpegturbowasm_decode script.'));
    document.body.appendChild(script);
  });

  return loadPromise;
}

export default function libjpegTurboFactory(options = {}) {
  return loadDecoderScript().then((factory) => factory(options));
}
