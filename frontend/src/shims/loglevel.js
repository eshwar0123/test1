const LEVELS = ["trace", "debug", "info", "warn", "error", "silent"];

function makeLogger(name = "root") {
  let current = 2; // info

  const logger = {
    getName: () => name,
    setLevel: (lvl) => {
      if (typeof lvl === "number") {
        current = Math.max(0, Math.min(5, lvl));
        return;
      }
      const idx = LEVELS.indexOf(String(lvl).toLowerCase());
      if (idx >= 0) current = idx;
    },
    getLevel: () => current,
    enableAll: () => {
      current = 0;
    },
    disableAll: () => {
      current = 5;
    },
    methodFactory: null,
    trace: (...args) => current <= 0 && console.debug(...args),
    debug: (...args) => current <= 1 && console.debug(...args),
    info: (...args) => current <= 2 && console.info(...args),
    warn: (...args) => current <= 3 && console.warn(...args),
    error: (...args) => current <= 4 && console.error(...args),
  };

  return logger;
}

const named = new Map();
const root = makeLogger("root");

root.getLogger = (name) => {
  if (!name || name === "root") return root;
  if (!named.has(name)) named.set(name, makeLogger(name));
  return named.get(name);
};

root.noConflict = () => root;

export default root;
