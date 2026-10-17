"use client";

import { useEffect } from "react";

/** Registers the app-shell service worker in production only. */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* offline support is an enhancement; the app works without it */
    });
  }, []);
  return null;
}
