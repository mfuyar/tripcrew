/**
 * Returns "Family Name (First Name)" when a family is known,
 * otherwise falls back to the full name or a placeholder.
 */
export function displayName(
  fullName: string | null | undefined,
  familyName: string | null | undefined
): string {
  const first = fullName?.split(' ')[0] ?? '?';
  if (familyName) return `${familyName} (${first})`;
  return fullName ?? 'Unknown';
}

/** Short version for tight spaces: "Family" or "First Name" */
export function shortName(
  fullName: string | null | undefined,
  familyName: string | null | undefined
): string {
  return familyName ?? fullName?.split(' ')[0] ?? '?';
}
