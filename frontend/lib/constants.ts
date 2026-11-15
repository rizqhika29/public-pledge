// These mirror the constants in contracts/public_pledge.py. Keep them in sync.

export const LIMITS = {
  promiseMax: 500,
  criteriaMax: 500,
  urlMax: 300,
  graceSeconds: 7 * 24 * 3600,
  horizonSeconds: 366 * 24 * 3600,
  pageSize: 50,
} as const;

// Consensus can take minutes, and the contract compares the deadline with the
// transaction's own timestamp. Leave a safety margin so a slow transaction does
// not land after the deadline it was created with.
export const MIN_DEADLINE_LEAD_SECONDS = 15 * 60;
// Stay clearly inside the contract's 366 day horizon.
export const MAX_DEADLINE_LEAD_SECONDS = 360 * 24 * 3600;

export const WEI_PER_GEN = 10n ** 18n;
