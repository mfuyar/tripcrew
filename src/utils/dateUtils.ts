/** Returns today as a YYYY-MM-DD string in local time. */
export function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Returns a Date object for the start of today (midnight local time). */
export function todayDate(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Parse a YYYY-MM-DD string to a Date at noon local time. */
export function parseDate(ymd: string): Date {
  return new Date(ymd + 'T12:00:00');
}

/** Returns true if date string a is before date string b (YYYY-MM-DD compare). */
export function isBefore(a: string, b: string): boolean {
  return a < b;
}
