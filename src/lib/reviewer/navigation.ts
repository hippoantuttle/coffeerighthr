export function safeReturnPath(value: string | null) {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001f]/.test(value)
  )
    return "/applicants";
  return value.startsWith("/reviewer") ? "/applicants" : value;
}

export function reviewerSetupUrl() {
  return `/reviewer?next=${encodeURIComponent(location.pathname + location.search)}`;
}
