function wrapNode(node) {
  return {
    node,
    filter(predicate, includeSelf = false, recursive = true) {
      const out = [];

      const visit = (n, isSelf = false) => {
        const wrapped = { node: n };
        if ((includeSelf || !isSelf) && predicate(wrapped)) {
          out.push(wrapped);
        }
        if (!recursive) return;
        const children = n.childNodes || [];
        for (let i = 0; i < children.length; i += 1) {
          visit(children[i], false);
        }
      };

      visit(node, true);
      return out;
    },
  };
}

export function create(xmlStr) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(String(xmlStr ?? ""), "application/xml");
  return {
    root() {
      return wrapNode(doc.documentElement);
    },
  };
}

export default { create };
