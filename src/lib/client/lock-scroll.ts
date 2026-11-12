"use client";

import { useEffect } from "react";

/**
 * Keeps the page still while something is on top of it (a dialog, a sheet, the full-screen
 * workout views). The body is pinned in place — the only way that holds on an iPhone — and
 * goes back to where it was when the last layer closes. Layers can nest.
 */
let layers = 0;
let scrollY = 0;

function lock() {
  if (layers++ > 0) return;
  scrollY = window.scrollY;
  const body = document.body.style;
  body.position = "fixed";
  body.top = `-${scrollY}px`;
  body.left = "0";
  body.right = "0";
  body.overflow = "hidden";
}

function unlock() {
  if (--layers > 0) return;
  const body = document.body.style;
  body.position = "";
  body.top = "";
  body.left = "";
  body.right = "";
  body.overflow = "";
  window.scrollTo(0, scrollY);
}

export function useLockScroll(active = true) {
  useEffect(() => {
    if (!active) return;
    lock();
    return unlock;
  }, [active]);
}
