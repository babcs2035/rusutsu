export function safeCorrectionReturnTo(
  value: string | undefined,
  resortId: string,
) {
  if (!value) return `/${resortId}`;
  try {
    const url = new URL(value, "https://return.invalid");
    if (
      url.origin !== "https://return.invalid" ||
      value.includes("\\") ||
      [...value].some(char => char.charCodeAt(0) < 32)
    )
      return `/${resortId}`;
    const pathname = url.pathname.replace(/^\/rusutsu(?=\/|$)/, "") || "/";
    if (
      pathname !== "/" &&
      pathname !== `/${resortId}` &&
      pathname !== `/${resortId}/`
    )
      return `/${resortId}`;
    return `${pathname}${url.search}${url.hash}`;
  } catch {
    return `/${resortId}`;
  }
}
