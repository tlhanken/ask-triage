/**
 * Dates. Stored timestamps are UTC; everything a person sees or compares is a LOCAL
 * calendar date, stepped by calendar days so a daylight-saving change cannot skip one.
 * Also the weekly revisit day that deferred and blocked work returns on.
 */

const MS_DAY = 86_400_000;

const pad = (n: number) => String(n).padStart(2, "0");

/** Local-date ISO (yyyy-mm-dd) — avoids the UTC off-by-one on evening edits. */
export const iso = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * The local day `n` calendar days from `d`, at midnight. Adding n × 24 hours
 * instead skips or repeats a date when the span crosses a DST change late at
 * night, so every "N days from now" goes through here.
 */
export const addDays = (d: Date, n: number): Date =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/**
 * A stored timestamp (UTC ISO, which is right for storage) as the LOCAL date and
 * time a person reads. Slicing the stored string instead shows UTC, which in the
 * evening west of Greenwich is already tomorrow.
 */
export function localStamp(at: string): string {
  const d = new Date(at);
  return `${iso(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Parse an ISO date as a LOCAL date, not UTC midnight. */
export function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function daysSince(isoDate: string | null | undefined, now = new Date()): number | null {
  if (!isoDate) return null;
  const then = parseDate(isoDate);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today.getTime() - then.getTime()) / MS_DAY);
}

/** Days from today until an ISO date — negative once it has passed. */
export const daysUntil = (isoDate: string | null | undefined, now = new Date()): number | null =>
  isoDate ? -daysSince(isoDate, now)! : null;

/**
 * Deferred work comes back on ONE day a week, not on a spread of daily dates.
 *
 * A day-granular revisit for a register this size produces a trickle that
 * arrives five mornings a week and gets skimmed. Weekly revisits arrive in a
 * single batch, on the day the weekly planning already runs, so deferring costs
 * one decision now and one look later instead of a low-grade daily nag.
 */
export const REVISIT_WEEKDAY = 1;

                 // Monday

export const REVISIT_WEEK_CHOICES = [1, 2, 4, 8] as const;

export const DEFAULT_REVISIT_WEEKS = 4;

/** Days from `from` to the next revisit day, strictly after it. */
export function daysToRevisitDay(from = new Date(), weekday = REVISIT_WEEKDAY): number {
  const delta = (weekday - from.getDay() + 7) % 7;
  return delta === 0 ? 7 : delta;                 // today IS the day, so a full week out
}

/** The revisit day n weeks out. n = 1 is the next one, and every result lands on REVISIT_WEEKDAY. */
export function revisitInWeeks(n: number, from = new Date(), weekday = REVISIT_WEEKDAY): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  d.setDate(d.getDate() + daysToRevisitDay(from, weekday) + (n - 1) * 7);
  return iso(d);
}

/** A recorded revisit is due once its day has arrived. */
export function revisitIsDue(revisit: string | null | undefined, now = new Date()): boolean {
  if (!revisit) return false;
  const days = daysSince(revisit, now);
  return days !== null && days >= 0;
}
