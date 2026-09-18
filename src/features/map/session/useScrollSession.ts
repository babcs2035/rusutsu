"use client";

import { useEffect } from "react";
import { z } from "zod";
import { readStorage, writeStorage } from "./storage";

const scrollSchema = z.number().nonnegative();
export function useScrollSession() {
  useEffect(() => {
    const restored = new WeakMap<Element, string>();
    const restore = () => {
      for (const element of document.querySelectorAll<HTMLElement>(
        "[data-session-scroll]",
      )) {
        const key = `rusutsu:scroll:v1:${element.dataset.sessionScroll}`;
        if (restored.get(element) === key) continue;
        const top = readStorage(key, scrollSchema) ?? 0;
        element.scrollTop = top;
        if (Math.abs(element.scrollTop - top) < 1) restored.set(element, key);
      }
    };
    const save = (event: Event) => {
      const element = event.target;
      if (!(element instanceof HTMLElement) || !element.dataset.sessionScroll)
        return;
      if (
        restored.get(element) !==
        `rusutsu:scroll:v1:${element.dataset.sessionScroll}`
      )
        return;
      writeStorage(
        `rusutsu:scroll:v1:${element.dataset.sessionScroll}`,
        element.scrollTop,
      );
    };
    const interact = (event: Event) => {
      const element =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>("[data-session-scroll]")
          : null;
      if (element)
        restored.set(
          element,
          `rusutsu:scroll:v1:${element.dataset.sessionScroll}`,
        );
    };
    const interactions = ["pointerdown", "touchstart", "wheel", "keydown"];
    for (const event of interactions)
      document.addEventListener(event, interact, {
        capture: true,
        passive: true,
      });
    const observer = new MutationObserver(restore);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-session-scroll"],
    });
    restore();
    document.addEventListener("scroll", save, true);
    return () => {
      observer.disconnect();
      for (const event of interactions)
        document.removeEventListener(event, interact, true);
      document.removeEventListener("scroll", save, true);
    };
  }, []);
}
