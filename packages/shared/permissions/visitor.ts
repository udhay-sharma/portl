/**
 * Step 2.2 — The status state machine (transition table)
 *
 * Defines the allowed status transitions for a VisitorRequest and provides
 * assertValidTransition() to enforce valid state changes before database updates.
 */

export type VisitorStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'CHECKED_IN'
  | 'CHECKED_OUT'
  | 'EXPIRED';

export const ALLOWED_TRANSITIONS: Record<VisitorStatus, readonly VisitorStatus[]> = {
  PENDING: ['APPROVED', 'REJECTED', 'EXPIRED'],
  APPROVED: ['CHECKED_IN', 'EXPIRED'],
  CHECKED_IN: ['CHECKED_OUT'],
  REJECTED: [],
  CHECKED_OUT: [],
  EXPIRED: [],
} as const;

export class InvalidTransitionError extends Error {
  constructor(public currentStatus: string, public newStatus: string) {
    super(`Invalid status transition: cannot transition from ${currentStatus} to ${newStatus}`);
    this.name = 'InvalidTransitionError';
  }
}

/**
 * Checks if a status transition is valid according to ALLOWED_TRANSITIONS.
 * Throws InvalidTransitionError if the transition is disallowed.
 * Returns true if valid.
 */
export function assertValidTransition(
  currentStatus: string,
  newStatus: string,
): boolean {
  const allowed = ALLOWED_TRANSITIONS[currentStatus as VisitorStatus];
  if (!allowed || !allowed.includes(newStatus as VisitorStatus)) {
    throw new InvalidTransitionError(currentStatus, newStatus);
  }
  return true;
}
