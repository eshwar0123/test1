import wasmDecoderUrl from '@cornerstonejs/codec-charls/decodewasmjs?url';

let loadPromise = null;

function loadDecoderScript() {
  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && window.charlswasm_decode) {
      resolve(window.charlswasm_decode);
      return;
    }

    const script = document.createElement('script');
    script.src = wasmDecoderUrl;
    script.async = true;
    script.onload = () => {
      if (window.charlswasm_decode) {
        resolve(window.charlswasm_decode);
      } else {
        reject(new Error('charlswasm_decode not found on window.'));
      }
    };
    script.onerror = () => reject(new Error('Failed to load charlswasm_decode script.'));
    document.body.appendChild(script);
  });

  return loadPromise;
}

export default function charlsFactory(options = {}) {
  return loadDecoderScript().then((factory) => factory(options));
}
