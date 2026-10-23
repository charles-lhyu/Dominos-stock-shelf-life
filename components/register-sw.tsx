"use client";

import { useEffect } from "react";

import { withBasePath } from "@/lib/base-path";

export function RegisterSW() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      void navigator.serviceWorker
        .register(withBasePath("/sw.js"), {
          scope: withBasePath("/"),
        })
        .catch(() => {
          /* Install prompt still works once SW registers on a secure origin. */
        });
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
    }
  }, []);

  return null;
}
