/**
 * Step 4.3 — The status state machine for Complaints
 *
 * Parallel to the Visitor flow: defines the allowed status transitions for a Complaint
 * and provides assertValidComplaintTransition() to enforce valid state changes before database updates.
 */

export type ComplaintStatus =
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'RESOLVED';

export const COMPLAINT_ALLOWED_TRANSITIONS: Record<ComplaintStatus, readonly ComplaintStatus[]> = {
  OPEN: ['IN_PROGRESS', 'RESOLVED'],
  IN_PROGRESS: ['RESOLVED'],
  RESOLVED: [], // Terminal state
} as const;

export class InvalidComplaintTransitionError extends Error {
  constructor(public currentStatus: string, public newStatus: string) {
    super(`Invalid complaint status transition: cannot transition from ${currentStatus} to ${newStatus}`);
    this.name = 'InvalidComplaintTransitionError';
  }
}

/**
 * Checks if a status transition is valid according to COMPLAINT_ALLOWED_TRANSITIONS.
 * Throws InvalidComplaintTransitionError if the transition is disallowed.
 * Returns true if valid.
 */
export function assertValidComplaintTransition(
  currentStatus: string,
  newStatus: string,
): boolean {
  const allowed = COMPLAINT_ALLOWED_TRANSITIONS[currentStatus as ComplaintStatus];
  if (!allowed || !allowed.includes(newStatus as ComplaintStatus)) {
    throw new InvalidComplaintTransitionError(currentStatus, newStatus);
  }
  return true;
}
