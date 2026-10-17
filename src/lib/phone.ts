/** Accepts "98765 43210", "+91 9876543210", "09876543210"; returns 10 digits or null. */
export function normalizeIndianMobile(input: string): string | null {
  const digits = input.replace(/[\s-]/g, "").replace(/^\+?91(?=\d{10}$)/, "").replace(/^0(?=\d{10}$)/, "");
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

/** Only same-site relative paths are allowed as a post-login destination (no open redirect). */
export function safeNext(raw: string | null): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") && !raw.includes("\\") ? raw : "/home";
}
