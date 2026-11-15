"use client";

import { useEffect } from "react";

/** Enhance the server-rendered native disclosures with viewport placement and Escape. */
export function HeaderMenuController() {
  useEffect(() => {
    const header = document.querySelector<HTMLElement>("header.site-header");
    if (!header) return;

    const measure = () => {
      header.style.setProperty("--header-menu-top", `${Math.ceil(header.getBoundingClientRect().bottom)}px`);
      header.dataset.menuPositionReady = "true";
    };
    const onToggle = (event: Event) => {
      const disclosure = event.target;
      if (!(disclosure instanceof HTMLDetailsElement) || !disclosure.open) return;
      measure();
      for (const other of header.querySelectorAll<HTMLDetailsElement>("details[open]")) {
        if (other !== disclosure) other.open = false;
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const open = [...header.querySelectorAll<HTMLDetailsElement>("details[open]")];
      if (!open.length) return;
      const focused = document.activeElement?.closest("details");
      const owner = open.find(item => item === focused) ?? open.at(-1)!;
      for (const item of open) item.open = false;
      owner.querySelector("summary")?.focus();
      event.preventDefault();
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    header.addEventListener("toggle", onToggle, true);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      header.removeEventListener("toggle", onToggle, true);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
      delete header.dataset.menuPositionReady;
      header.style.removeProperty("--header-menu-top");
    };
  }, []);
  return null;
}
