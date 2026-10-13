function hash32(str, seed) {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
    h ^= h >>> 13;
  }
  return h >>> 0;
}

function toHex32(n) {
  return (n >>> 0).toString(16).padStart(8, "0");
}

function hash(input) {
  const s = String(input ?? "");
  const h1 = hash32(s, 0x811c9dc5);
  const h2 = hash32(s, 0x9e3779b1);
  const h3 = hash32(s, 0x85ebca6b);
  const h4 = hash32(s, 0xc2b2ae35);
  return `${toHex32(h1)}${toHex32(h2)}${toHex32(h3)}${toHex32(h4)}`;
}

const SparkMD5 = {
  hash,
  ArrayBuffer: {
    hash: (buf) => {
      if (buf instanceof ArrayBuffer) {
        const view = new Uint8Array(buf);
        let text = "";
        for (let i = 0; i < view.length; i += 1) text += String.fromCharCode(view[i]);
        return hash(text);
      }
      return hash(buf);
    },
  },
};

export default SparkMD5;
