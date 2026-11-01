/**
 * Fixtures shared by the test files. Not imported by the app.
 *
 * The seed starts with every estimate unset (nobody has chosen one), so nothing in
 * it is ready to schedule. Tests about scheduling start from readyStore() instead.
 */
import { type Ticket } from "./schema";
import { freshStore, type Store } from "./store";

/** The browser storage key the app reads on startup (see domain/store.ts). */
export const STORAGE_KEY = "revel-priority-tracker-v1";

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
