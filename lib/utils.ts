import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Extract a clean, user-friendly error message from unknown error types
export function errorMessage(err: unknown, fallback = "Something went wrong") {
  const getFieldsMessage = (): string | undefined => {
    if (typeof err === "string") return err;
    if (err instanceof Error) return err.message;
    if (err && typeof err === "object") {
      const rec = err as Record<string, unknown> & { message?: string };
      const data = (rec as { data?: { message?: string } }).data;
      const resp = (rec as { response?: { data?: { message?: string } } }).response;
      return data?.message ?? resp?.data?.message ?? rec.message ?? undefined;
    }
    return undefined;
  };

  const cleanConvex = (raw: string) => {
    let s = `${raw}`.trim();
    // Remove bracketed prefixes like [CONVEX ...] and [Request ID: ...]
    s = s.replace(/^\s*\[[^\]]+\]\s*/g, "");
    s = s.replace(/^\s*\[[^\]]+\]\s*/g, "");
    // Remove 'Server Error'
    s = s.replace(/^Server Error\s*/i, "");
    // Extract after 'Uncaught Error:' if present
    const uncIdx = s.toLowerCase().indexOf("uncaught error:");
    if (uncIdx >= 0) s = s.slice(uncIdx + "uncaught error:".length);
    // Strip leading 'Error: '
    s = s.replace(/^error:\s*/i, "");
    // Drop stack/file refs and trailing notes like 'Called by client'
    s = s.split(/\r?\n/)[0];
    s = s.split(/\s+at\s+/)[0];
    s = s.replace(/\s*Called by client.*/i, "");
    return s.trim();
  };

  const candidateA = getFieldsMessage();
  const candidateB = (() => { try { return String(err); } catch { return undefined; } })();
  const cleanedA = candidateA ? cleanConvex(candidateA) : undefined;
  const cleanedB = candidateB ? cleanConvex(candidateB) : undefined;
  const chosen = [cleanedA, cleanedB].filter((s): s is string => !!s && s.length > 0).sort((a, b) => a.length - b.length)[0];
  return chosen || fallback;
}
