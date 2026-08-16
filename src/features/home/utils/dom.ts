import { MAP_ZOOM_SURFACE_SELECTOR } from "../constants";

export const isKeyboardInputElement = (element: Element | null) =>
  element instanceof HTMLInputElement ||
  element instanceof HTMLTextAreaElement ||
  element instanceof HTMLSelectElement;

export const isEventInsideMapZoomSurface = (event: Event) => {
  const composedPath = event.composedPath();
  return composedPath.some(
    target =>
      target instanceof Element &&
      target.closest(MAP_ZOOM_SURFACE_SELECTOR) !== null,
  );
};

export const getSearchResultListScrollElement = () =>
  typeof document === "undefined"
    ? null
    : ([
        ...document.querySelectorAll<HTMLElement>(
          '[data-ski-resort-list-scroll-container="true"], [data-ski-resort-list-scroll="true"]',
        ),
      ].find(element => element.scrollHeight > element.clientHeight) ?? null);

const restoreSearchResultListScroll = (scrollTop: number) => {
  const scrollElement = getSearchResultListScrollElement();
  if (!scrollElement) return;

  scrollElement.scrollTop = scrollTop;
};

export const scheduleRestoreSearchResultListScroll = (scrollTop: number) => {
  window.requestAnimationFrame(() => restoreSearchResultListScroll(scrollTop));
  window.setTimeout(() => restoreSearchResultListScroll(scrollTop), 0);
  window.setTimeout(() => restoreSearchResultListScroll(scrollTop), 120);
};
