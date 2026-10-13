// Inline ghost-text autocomplete for the contentEditable report editor.
//
// Shows a greyed-out completion ahead of the caret (Copilot/Gmail style),
// scoped to the currently selected template/region. Press Tab to accept,
// Esc (or keep typing) to dismiss.
//
// IMPORTANT (why this is structured the way it is): the editor lives inside a
// component that re-renders frequently (series strip, polling, chat, etc.). If
// we re-attached listeners every render, the ghost overlay would be destroyed
// and recreated constantly and the suggestion would flicker away to nothing.
// So we bind listeners ONCE per editor element and read the region live from a
// ref — re-renders no longer disturb the overlay.
//
// The hint is a separate absolutely-positioned overlay span; the editor's own
// contentEditable DOM is only mutated when the user presses Tab (via
// execCommand("insertText")), keeping its undo/save state clean.

import { useEffect, useRef } from "react";
import { suggestCompletion } from "../utils/radiologyPhrases";

export default function useReportGhostAutocomplete(editorRef, getRegion) {
  // Keep the latest getRegion without forcing the listeners to re-bind.
  const getRegionRef = useRef(getRegion);
  getRegionRef.current = getRegion;

  // Which editor element we're bound to + how to tear it down. Lets us attach
  // exactly once per element instead of on every render.
  const boundRef = useRef({ el: null, teardown: null });

  // Runs after every render (no deps array) but only does work when the editor
  // element actually appears or changes — so normal re-renders are a no-op.
  useEffect(() => {
    const editor = editorRef?.current || null;
    if (editor === boundRef.current.el) return; // already bound to this element
    if (boundRef.current.teardown) boundRef.current.teardown();
    boundRef.current = { el: editor, teardown: null };
    if (editor) boundRef.current.teardown = attachGhost(editor, getRegionRef);
  });

  // Final cleanup on unmount.
  useEffect(
    () => () => {
      if (boundRef.current.teardown) boundRef.current.teardown();
      boundRef.current = { el: null, teardown: null };
    },
    []
  );
}

// Attaches the ghost overlay + listeners to one editor element.
// Returns a teardown function.
function attachGhost(editor, getRegionRef) {
  const ghost = document.createElement("span");
  Object.assign(ghost.style, {
    position: "fixed",
    pointerEvents: "none",
    color: "#9ca3af",
    zIndex: 99999,
    whiteSpace: "pre",
    display: "none",
  });
  // Mount the ghost INSIDE the current fullscreen element when one is active —
  // otherwise (attached to <body>) it would be invisible in fullscreen mode,
  // since the browser only renders the fullscreened element's subtree. We
  // re-home it whenever fullscreen toggles.
  const mount = () => {
    const host = document.fullscreenElement || document.body;
    if (ghost.parentElement !== host) host.appendChild(ghost);
  };
  mount();

  let current = ""; // the suggestion remainder currently shown

  const hide = () => {
    current = "";
    ghost.style.display = "none";
  };

  const region = () => {
    const g = getRegionRef.current;
    return (typeof g === "function" ? g() : g) || "general";
  };

  const update = () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return hide();
    const range = sel.getRangeAt(0);
    if (!editor.contains(range.startContainer)) return hide();

    const node = range.startContainer;
    const offset = range.startOffset;
    const before =
      node.nodeType === Node.TEXT_NODE ? node.textContent.slice(0, offset) : "";
    const suggestion = suggestCompletion(before, region());
    if (!suggestion) return hide();

    // position at the caret
    let rect;
    try {
      const r = range.cloneRange();
      r.collapse(true);
      const rects = r.getClientRects();
      rect = rects && rects.length ? rects[0] : r.getBoundingClientRect();
    } catch {
      return hide();
    }
    if (!rect || (rect.left === 0 && rect.top === 0)) return hide();

    // Match the font of the element the caret is actually in (Technique /
    // Findings block) so the ghost lines up on the same baseline.
    const styleEl =
      (node.nodeType === Node.TEXT_NODE ? node.parentElement : node) || editor;
    const cs = window.getComputedStyle(styleEl);
    ghost.style.fontStyle = cs.fontStyle;
    ghost.style.fontWeight = cs.fontWeight;
    ghost.style.fontSize = cs.fontSize;
    ghost.style.fontFamily = cs.fontFamily;
    ghost.style.letterSpacing = cs.letterSpacing;
    ghost.style.lineHeight = `${rect.height}px`;
    ghost.style.height = `${rect.height}px`;
    ghost.style.left = `${rect.right}px`;
    ghost.style.top = `${rect.top}px`;
    ghost.textContent = suggestion;
    ghost.style.display = "block";
    current = suggestion;
  };

  const onKeyDown = (e) => {
    if (e.key === "Tab" && current) {
      e.preventDefault();
      const text = current;
      hide();
      document.execCommand("insertText", false, text);
      setTimeout(update, 0);
      return;
    }
    if (e.key === "Escape" && current) {
      e.preventDefault();
      hide();
    }
  };

  const onInput = () => update();
  const onKeyUp = (e) => {
    if (e.key === "Tab" || e.key === "Escape") return;
    update();
  };
  const onScroll = () => hide();
  // When entering/leaving fullscreen, re-home the ghost into the visible
  // subtree and clear any stale suggestion.
  const onFullscreenChange = () => {
    hide();
    mount();
  };

  editor.addEventListener("keydown", onKeyDown, true);
  editor.addEventListener("input", onInput);
  editor.addEventListener("keyup", onKeyUp);
  editor.addEventListener("blur", hide, true);
  window.addEventListener("scroll", onScroll, true);
  document.addEventListener("fullscreenchange", onFullscreenChange);
  document.addEventListener("webkitfullscreenchange", onFullscreenChange);

  return () => {
    editor.removeEventListener("keydown", onKeyDown, true);
    editor.removeEventListener("input", onInput);
    editor.removeEventListener("keyup", onKeyUp);
    editor.removeEventListener("blur", hide, true);
    window.removeEventListener("scroll", onScroll, true);
    document.removeEventListener("fullscreenchange", onFullscreenChange);
    document.removeEventListener("webkitfullscreenchange", onFullscreenChange);
    ghost.remove();
  };
}
