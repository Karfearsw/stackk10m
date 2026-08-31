export function extractErrorMessage(error: any): string {
  if (!error) return "";
  if (typeof error.message === "string") return error.message;
  if (error.message && typeof error.message === "object") {
    const nested = extractErrorMessage(error.message);
    if (nested) return nested;
  }
  if (typeof error.stack === "string") return error.stack;
  return String(error);
}
