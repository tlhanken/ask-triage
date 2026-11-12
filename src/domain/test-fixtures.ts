/**
 * Fixtures shared by the test files. Not imported by the app.
 *
 * The seed starts with every estimate unset (nobody has chosen one), so nothing in
 * it is ready to schedule. Tests about scheduling start from readyStore() instead.
 */
import { afterAll, beforeAll, vi } from "vitest";
import { type Settings, type Ticket } from "./schema";
import { freshStore, type Store } from "./store";


/** One ticket with sensible values, overridden by `over`. */
export const mk = (over: Partial<Ticket>): Ticket => ({
  id: 1, name: "x", summary: "s", projects: ["Atlas"], externalUrl: null,
  dueDate: null, noHardDate: false, estimate: 2, priority: "Should", type: null, stakeholders: ["S"], notes: "",
  state: "New", opened: null, sprint: null, planned: null, carryovers: 0,
  lastTouched: null, closed: null,
  ...over,
});

/** The seed, filled out: every ticket given a type, a priority, the estimate given
 *  here, and an explicit "no hard date" where it has no date. So all of it is ready. */
export const readyStore = (estimate = 1): Store => {
  const s = freshStore();
  return {
    ...s,
    tickets: s.tickets.map((t) => ({
      ...t, estimate, type: t.type ?? "Back-end", priority: t.priority ?? "Should", noHardDate: !t.dueDate,
    })),
  };
};

/**
 * The fixed "now" for domain tests: 2026-10-18 12:00 UTC. The spreadsheet numbers
 * in assess.test.ts were computed for this day.
 */
export const NOW = new Date("2026-10-18T12:00:00Z");

/**
 * Freeze Date at NOW for the calling test file. Call it once, at the top level.
 *
 * Fixtures built from the clock (the seed, defaultSprints(), isoFromNow) would
 * otherwise drift away from NOW day by day, and tests comparing the two start
 * failing a few days after they were written. Only Date is faked; timers stay real.
 */
export function freezeClock(at: Date = NOW): void {
  beforeAll(() => { vi.useFakeTimers({ toFake: ["Date"], now: at }); });
  afterAll(() => { vi.useRealTimers(); });
}

/** A local date N days from the (frozen) now, as yyyy-mm-dd. */
export const isoFromNow = (days: number): string => {
  const d = new Date(Date.now() + days * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** The release names in display order. */
export const sprintNames = (s: Settings): string[] => s.sprints.map((x) => x.name);
