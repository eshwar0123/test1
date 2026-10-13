function hashSeed(input) {
  const str = String(input ?? "");
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeRng(seed) {
  let state = hashSeed(seed) || 0x6d2b79f5;
  const rng = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.quick = rng;
  rng.double = rng;
  rng.int32 = () => ((rng() * 4294967296) | 0);
  return rng;
}

function seedrandom(seed, options = {}) {
  const rng = makeRng(seed);
  if (options && options.global) {
    Math.random = rng;
  }
  return rng;
}

seedrandom.alea = seedrandom;
seedrandom.xor128 = seedrandom;
seedrandom.xorwow = seedrandom;
seedrandom.xorshift7 = seedrandom;
seedrandom.xor4096 = seedrandom;
seedrandom.tychei = seedrandom;

export default seedrandom;
