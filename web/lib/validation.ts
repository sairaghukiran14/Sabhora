/** Shared validation: the client uses it for instant feedback, the server re-runs it. */

const COMMON = new Set([
  "password", "password1", "password123", "1234567890", "12345678910", "qwertyuiop",
  "iloveyou123", "india12345", "welcome123", "admin12345", "letmein123", "abcdefghij",
  "passw0rd12", "qwerty1234", "1q2w3e4r5t",
]);

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

export type PasswordCheck = { id: string; label: string; ok: boolean };

export function passwordChecks(pw: string): PasswordCheck[] {
  return [
    { id: "len", label: "At least 10 characters", ok: pw.length >= 10 },
    { id: "mix", label: "A letter and a number", ok: /[a-z]/i.test(pw) && /\d/.test(pw) },
    { id: "common", label: "Not a common password", ok: pw.length > 0 && !COMMON.has(pw.toLowerCase()) },
  ];
}

export function passwordStrength(pw: string): 0 | 1 | 2 | 3 | 4 {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 10) s++;
  if (pw.length >= 14) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw) && /[^a-z0-9]/i.test(pw)) s++;
  if (COMMON.has(pw.toLowerCase())) s = 0;
  return Math.min(4, s) as 0 | 1 | 2 | 3 | 4;
}

export function isStrongEnough(pw: string): boolean {
  return pw.length <= 200 && passwordChecks(pw).every((c) => c.ok);
}

export function validateName(name: string): string | null {
  const n = name.trim();
  if (n.length < 2) return "Enter your name";
  if (n.length > 60) return "Keep your name under 60 characters";
  return null;
}

export function validatePublicUrl(raw: string): { url: string } | { error: string } {
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    return { error: "Enter a valid website address" };
  }
  if (!["http:", "https:"].includes(u.protocol)) return { error: "Use an http or https address" };
  const host = u.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    !host.includes(".")
  ) {
    return { error: "Use a public website address" };
  }
  return { url: u.toString() };
}

/** Only allow redirects back into the app, never to another origin. */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/dashboard") || next.startsWith("//")) return "/dashboard";
  return next;
}
