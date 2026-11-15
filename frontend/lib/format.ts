import { WEI_PER_GEN } from "@/lib/constants";

/** Convert whatever the RPC handed back (number, bigint, decimal string) to a bigint. */
export function toBigInt(value: unknown, fallback = 0n): bigint {
  try {
    if (typeof value === "bigint") return value;
    if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.trunc(value));
    if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return BigInt(value.trim());
  } catch {
    // fall through
  }
  return fallback;
}

/** Parse a decimal GEN amount such as "1.25" into wei. Returns null when invalid. */
export function parseGen(input: string): bigint | null {
  const text = input.trim();
  if (!/^\d*\.?\d*$/.test(text) || text === "" || text === ".") return null;
  const [whole = "", fraction = ""] = text.split(".");
  if (fraction.length > 18) return null;
  return BigInt(whole || "0") * WEI_PER_GEN + BigInt(fraction.padEnd(18, "0") || "0");
}

/** Format wei as a readable GEN amount, trimming trailing zeros. */
export function formatGen(wei: bigint, maxDecimals = 4): string {
  const negative = wei < 0n;
  const value = negative ? -wei : wei;
  const whole = value / WEI_PER_GEN;
  const fractionFull = (value % WEI_PER_GEN).toString().padStart(18, "0");
  const fraction = fractionFull.slice(0, maxDecimals).replace(/0+$/, "");

  if (!fraction && value > 0n && whole === 0n) {
    return `<0.${"0".repeat(Math.max(0, maxDecimals - 1))}1`;
  }
  const wholeText = whole.toLocaleString("en-US");
  return `${negative ? "-" : ""}${wholeText}${fraction ? `.${fraction}` : ""}`;
}

export function formatDateTime(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function formatDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString(undefined, { dateStyle: "medium" });
}

export function formatDuration(totalSeconds: number): string {
  let s = Math.max(0, Math.floor(totalSeconds));
  const d = Math.floor(s / 86400);
  s -= d * 86400;
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return `${m}m`;
  return "<1m";
}

/** Value for <input type="datetime-local"> in the user's local time zone. */
export function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
