const getGlobal = () => globalThis;

getGlobal.getPolyfill = () => globalThis;
getGlobal.implementation = () => globalThis;
getGlobal.shim = () => globalThis;

export default getGlobal;
