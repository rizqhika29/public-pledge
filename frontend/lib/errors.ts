export type ErrorKind =
  | "rejected"
  | "busy"
  | "wallet"
  | "network"
  | "funds"
  | "contract"
  | "consensus"
  | "timeout"
  | "config"
  | "unknown";

export interface UserFacingError {
  kind: ErrorKind;
  title: string;
  message: string;
}

export class WalletBusyError extends Error {
  constructor() {
    super("Another wallet request is already open. Finish or dismiss it in your wallet first.");
    this.name = "WalletBusyError";
  }
}

export class NotConnectedError extends Error {
  constructor() {
    super("Connect your wallet to continue.");
    this.name = "NotConnectedError";
  }
}

export class WrongNetworkError extends Error {
  readonly expected: string;
  constructor(expected: string) {
    super(`Switch your wallet to ${expected} to continue.`);
    this.name = "WrongNetworkError";
    this.expected = expected;
  }
}

export class NoContractError extends Error {
  constructor() {
    super("No contract address is configured. Set NEXT_PUBLIC_CONTRACT_ADDRESS and restart the app.");
    this.name = "NoContractError";
  }
}

export class TxFailedError extends Error {
  readonly hash: string | undefined;
  readonly kind: "contract" | "consensus" | "timeout";
  constructor(message: string, hash: string | undefined, kind: "contract" | "consensus" | "timeout") {
    super(message);
    this.name = "TxFailedError";
    this.hash = hash;
    this.kind = kind;
  }
}

const CONTRACT_TAG = /\[(EXPECTED|EXTERNAL|LLM_ERROR)\]\s*([^"\\\n]*)/;

/** Pull the tagged reason our contract puts into its UserError messages out of any text blob. */
export function extractContractReason(text: string): { tag: string; reason: string } | null {
  const match = CONTRACT_TAG.exec(text);
  return match ? { tag: match[1], reason: match[2].trim() } : null;
}

export function contractReasonMessage(tag: string, reason: string): string {
  const clean = reason.replace(/\s+/g, " ").replace(/[.\s]+$/, "").trim();
  if (tag === "EXPECTED") {
    return clean ? `${clean.charAt(0).toUpperCase()}${clean.slice(1)}.` : "The contract rejected this action.";
  }
  if (tag === "EXTERNAL") {
    return `The evidence page could not be read${clean ? ` (${clean})` : ""}. Check that the URL is public and reachable, then try again.`;
  }
  return "The validators' AI returned an unusable answer. Nothing was changed. Try again in a moment.";
}

function rawMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    for (const key of ["shortMessage", "message", "details"]) {
      const value = record[key];
      if (typeof value === "string" && value) return value;
    }
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

/**
 * Collect every numeric code inside an error, however deeply a wallet nested it.
 *
 * Wallets do not agree on where the code lives: MetaMask puts a rejected request
 * at `error.code`, but wraps it as `error.data.originalError.code` when the
 * request came through a provider proxy, and some wrap it twice. Reading only
 * the top level turns "you rejected the request" into a generic error, so we
 * walk the common containers instead.
 */
export function errorCodes(error: unknown): number[] {
  const codes: number[] = [];
  const seen = new WeakSet<object>();

  const walk = (value: unknown, depth: number): void => {
    if (!value || typeof value !== "object" || depth > 6) return;
    if (seen.has(value as object)) return;
    seen.add(value as object);

    const record = value as Record<string, unknown>;
    const code = record.code;
    if (typeof code === "number" && Number.isFinite(code)) codes.push(code);
    else if (typeof code === "string" && /^-?\d+$/.test(code)) codes.push(Number(code));

    for (const key of ["data", "cause", "originalError", "error", "info"]) {
      const nested = record[key];
      if (nested && typeof nested === "object") walk(nested, depth + 1);
    }
  };

  walk(error, 0);
  return codes;
}

export function describeError(error: unknown): UserFacingError {
  if (error instanceof WalletBusyError) {
    return { kind: "busy", title: "Wallet is busy", message: error.message };
  }
  if (error instanceof NotConnectedError) {
    return { kind: "wallet", title: "Wallet not connected", message: error.message };
  }
  if (error instanceof WrongNetworkError) {
    return { kind: "network", title: "Wrong network", message: error.message };
  }
  if (error instanceof NoContractError) {
    return { kind: "config", title: "App not configured", message: error.message };
  }
  if (error instanceof TxFailedError) {
    const title =
      error.kind === "contract"
        ? "The contract rejected this action"
        : error.kind === "consensus"
          ? "Consensus did not complete"
          : "Still waiting for consensus";
    return { kind: error.kind, title, message: error.message };
  }

  const codes = errorCodes(error);
  const text = rawMessage(error);
  const lower = text.toLowerCase();

  if (codes.some((c) => c === 4001 || c === 5000) || /user (rejected|denied|cancel)/.test(lower) || lower.includes("rejected the request")) {
    return { kind: "rejected", title: "Request cancelled", message: "You dismissed the request in your wallet. Nothing was sent." };
  }
  if (codes.some((c) => c === -32002) || lower.includes("already pending") || lower.includes("already processing")) {
    return {
      kind: "busy",
      title: "Wallet request already open",
      message: "Your wallet already has a pending request. Open the wallet and approve or reject it first.",
    };
  }
  if (codes.some((c) => c === 4900 || c === 4901) || lower.includes("wallet is disconnected")) {
    return {
      kind: "wallet",
      title: "Wallet disconnected",
      message: "Your wallet is no longer reachable. Open the wallet extension, then reconnect.",
    };
  }
  if (codes.some((c) => c === 4200 || c === -32601) || lower.includes("does not support") || lower.includes("unsupported method")) {
    return {
      kind: "wallet",
      title: "Wallet does not support this",
      message: "This wallet cannot sign this request. Try another wallet, such as MetaMask.",
    };
  }
  if (lower.includes("insufficient funds") || lower.includes("exceeds balance") || lower.includes("insufficient balance")) {
    return {
      kind: "funds",
      title: "Not enough GEN",
      message: "Your wallet balance does not cover the stake plus fees. Get test GEN from the faucet and try again.",
    };
  }
  if (lower.includes("failed to fetch") || lower.includes("networkerror") || lower.includes("fetch failed") || lower.includes("network request failed")) {
    return {
      kind: "network",
      title: "Cannot reach GenLayer",
      message: "The GenLayer RPC did not respond. Check your connection and try again.",
    };
  }

  const tagged = extractContractReason(text);
  if (tagged) {
    return { kind: "contract", title: "The contract rejected this action", message: contractReasonMessage(tagged.tag, tagged.reason) };
  }
  if (lower.includes("pledge not found")) {
    return { kind: "contract", title: "Pledge not found", message: "No pledge exists with that id." };
  }

  const short = text.length > 240 ? `${text.slice(0, 237)}…` : text;
  return { kind: "unknown", title: "Something went wrong", message: short || "An unexpected error occurred." };
}
