function toPath(path) {
  if (Array.isArray(path)) return path;
  return String(path)
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean);
}

function get(obj, path, defaultValue) {
  const parts = toPath(path);
  let cur = obj;
  for (let i = 0; i < parts.length; i += 1) {
    if (cur == null) return defaultValue;
    cur = cur[parts[i]];
  }
  return cur === undefined ? defaultValue : cur;
}

export default get;
