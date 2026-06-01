/**
 * Pure validation functions for data integrity rules (SPEC §12).
 * Each returns true if valid. Callers decide how to surface errors.
 */

export function isValidExpenseAmount(amount: number): boolean {
  return amount > 0;
}

export function isSplitSumValid(
  splitAmounts: number[],
  totalAmount: number,
  toleranceCents = 0.01
): boolean {
  const sum = splitAmounts.reduce((s, a) => s + a, 0);
  return Math.abs(sum - totalAmount) <= toleranceCents;
}

export function isSelfSettlement(fromFamilyId: string, toFamilyId: string): boolean {
  return fromFamilyId === toFamilyId;
}

export function isValidItineraryDateRange(
  startDatetime: string,
  endDatetime: string | null | undefined
): boolean {
  if (!endDatetime) return true;
  return new Date(endDatetime) > new Date(startDatetime);
}

export function isValidSeatCount(seatCount: number): boolean {
  return Number.isInteger(seatCount) && seatCount >= 1;
}

export function isValidAdultsCount(adultsCount: number): boolean {
  return Number.isInteger(adultsCount) && adultsCount >= 1;
}
