import { toBigInt } from "@/lib/format";
import { LIMITS } from "@/lib/constants";

export type PledgeStatus = "active" | "kept" | "broken" | "refunded";
export type PledgePhase = "open" | "ready" | "refundable" | "kept" | "broken" | "refunded";

export interface Pledge {
  id: number;
  owner: string;
  beneficiary: string;
  promise: string;
  evidenceUrl: string;
  criteria: string;
  stake: bigint;
  createdAt: number;
  deadline: number;
  status: PledgeStatus;
  /** Latest reasoning agreed by the validators' AI (also set after an inconclusive check). */
  note: string;
  /** How many times the validators have examined the evidence. */
  checks: number;
}

export interface AccountRecord {
  kept: number;
  broken: number;
}

const STATUSES: readonly PledgeStatus[] = ["active", "kept", "broken", "refunded"];

function text(value: unknown): string {
  if (typeof value === "string") return value;
  return value === null || value === undefined ? "" : String(value);
}

function int(value: unknown): number {
  const n = Number(toBigInt(value));
  return Number.isFinite(n) ? n : 0;
}

export function parsePledge(raw: unknown): Pledge {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const status = text(r.status) as PledgeStatus;
  return {
    id: int(r.id),
    owner: text(r.owner),
    beneficiary: text(r.beneficiary),
    promise: text(r.promise),
    evidenceUrl: text(r.evidence_url),
    criteria: text(r.criteria),
    stake: toBigInt(r.stake),
    createdAt: int(r.created_at),
    deadline: int(r.deadline),
    status: STATUSES.includes(status) ? status : "active",
    note: text(r.note),
    checks: int(r.checks),
  };
}

export function parsePage(raw: unknown): { total: number; items: Pledge[] } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const items = Array.isArray(r.items) ? r.items.map(parsePledge) : [];
  return { total: int(r.total), items };
}

export function parseRecord(raw: unknown): AccountRecord {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return { kept: int(r.kept), broken: int(r.broken) };
}

/** Where a pledge is in its life, judged against `nowSec` (unix seconds). */
export function getPhase(p: Pledge, nowSec: number): PledgePhase {
  if (p.status === "kept") return "kept";
  if (p.status === "broken") return "broken";
  if (p.status === "refunded") return "refunded";
  if (nowSec < p.deadline) return "open";
  if (nowSec < p.deadline + LIMITS.graceSeconds) return "ready";
  return "refundable";
}

export const PHASE_LABEL: Record<PledgePhase, string> = {
  open: "Open",
  ready: "Ready for judgement",
  refundable: "Refundable",
  kept: "Kept",
  broken: "Broken",
  refunded: "Refunded",
};

export function isSettled(p: Pledge): boolean {
  return p.status !== "active";
}

/** Share of judged pledges that were kept, or null when nothing has been judged yet. */
export function keptRate(record: AccountRecord): number | null {
  const total = record.kept + record.broken;
  return total === 0 ? null : Math.round((record.kept / total) * 100);
}

export function isHttpsUrl(value: string): boolean {
  if (!value.startsWith("https://")) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
