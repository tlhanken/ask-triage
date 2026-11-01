/**
 * History: every change records only what undoes it, and a revert steps back from
 * the current register through those records. No full copy is ever stored.
 */
import { iso } from "./dates";
import { findSprint, isFrozen } from "./releases";
import { type Settings, type Ticket } from "./schema";
import { clone, type Snapshot, type Store } from "./store";

// ---------------------------------------------------------------- history

/** Kept small on purpose: the history rides along inside the store, which is
 *  written to localStorage as well as to the register file, and localStorage is
 *  not large. Each entry is now the size of its change rather than of the whole
 *  register, so the cap bounds the number of steps back, not a multiple of the
 *  register's size. */
export const HISTORY_CAP = 25;

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * Describe how to get from `after` back to `before`, as one history entry.
 * null when nothing changed, so a no-op records nothing.
 *
 * Computed by comparing the two states rather than trusting each mutation to say
 * what it touched: a mutation that forgets one ticket would otherwise record a
 * change that cannot be undone.
 */
export function recordChange(
  before: Store, after: Store, label: string, now = new Date(), op?: Snapshot["op"],
): Snapshot | null {
  const prev = new Map(before.tickets.map((t) => [t.id, t]));
  const next = new Map(after.tickets.map((t) => [t.id, t]));
  const tickets: Record<string, Ticket | null> = {};
  for (const [id, t] of prev) if (!same(t, next.get(id))) tickets[id] = clone(t);
  for (const id of next.keys()) if (!prev.has(id)) tickets[id] = null;

  const beforeOrder = before.tickets.map((t) => t.id);
  const orderChanged = !same(beforeOrder, after.tickets.map((t) => t.id));
  const settingsChanged = !same(before.settings, after.settings);
  if (Object.keys(tickets).length === 0 && !orderChanged && !settingsChanged) return null;

  return {
    at: now.toISOString(),
    label,
    tickets,
    ...(orderChanged ? { order: beforeOrder } : {}),
    ...(settingsChanged ? { settings: structuredClone(before.settings) } : {}),
    ...(op ? { op } : {}),
  };
}

const appendHistory = (history: Snapshot[], entry: Snapshot): Snapshot[] => {
  const next = [...history, entry];
  while (next.length > HISTORY_CAP) next.shift();
  return next;
};

/** Run a mutation and record what it changed, so it can be undone. A mutation
 *  that changes nothing leaves no entry behind. */
export function withHistory(
  s: Store,
  label: string,
  mutate: (s: Store) => Store,
  now = new Date(),
  op?: Snapshot["op"],
): Store {
  const next = mutate(s);
  const entry = recordChange(s, next, label, now, op);
  return entry ? { ...next, history: appendHistory(next.history, entry) } : s;
}

/** Is this a history entry this version can apply? Checked before a revert uses it,
 *  so a damaged entry fails the revert instead of applying part of it. */
function readableEntry(h: unknown): h is Snapshot {
  const e = h as Snapshot;
  if (!e || typeof e.label !== "string" || !e.tickets || typeof e.tickets !== "object") return false;
  for (const [id, t] of Object.entries(e.tickets)) {
    if (t !== null && (typeof t !== "object" || t.id !== Number(id) || !Array.isArray(t.projects))) return false;
  }
  if (e.order !== undefined && !(Array.isArray(e.order) && e.order.every((x) => typeof x === "number"))) return false;
  if (e.settings !== undefined && !(e.settings && Array.isArray(e.settings.sprints))) return false;
  return true;
}

export type RevertPlan =
  | { ok: true; tickets: Ticket[]; settings: Settings; label: string; oldest: boolean }
  | { ok: false; reason: string };

/**
 * Work out the state from before the change at `index`, without applying it.
 *
 * Starts from the register as it is now and undoes each later change in turn,
 * newest first. `oldest` says the target is the oldest state the history still
 * holds, since anything older has been dropped by the cap.
 */
export function planRevert(s: Store, index: number): RevertPlan {
  const target = s.history[index];
  if (!target) return { ok: false, reason: "there is no such history entry" };

  const byId = new Map(s.tickets.map((t) => [t.id, t]));
  let order = s.tickets.map((t) => t.id);
  let settings = s.settings;

  for (let i = s.history.length - 1; i >= index; i--) {
    const h = s.history[i];
    if (!readableEntry(h)) {
      return { ok: false, reason: `the history entry "${(h as { label?: string })?.label ?? i}" cannot be read, so nothing was reverted` };
    }
    for (const [key, t] of Object.entries(h.tickets)) {
      const id = Number(key);
      if (t === null) {
        byId.delete(id);
        order = order.filter((x) => x !== id);
      } else {
        byId.set(id, clone(t));
        if (!order.includes(id)) order.push(id);
      }
    }
    if (h.order) order = [...h.order.filter((id) => byId.has(id)), ...order.filter((id) => !h.order!.includes(id))];
    if (h.settings) settings = structuredClone(h.settings);
  }

  return {
    ok: true,
    tickets: order.filter((id) => byId.has(id)).map((id) => byId.get(id)!),
    settings,
    label: target.label,
    oldest: index === 0,
  };
}

/**
 * Tickets that were placed into a release on or after its freeze date. Derived
 * from the recorded moves rather than from a field on the ticket — which keeps
 * the ticket lean, and the history window is exactly the one that matters here.
 *
 * A release is frozen ON its freeze day, so a move that day counts. The move's
 * timestamp is stored in UTC and compared as a LOCAL date, like the freeze date.
 */
export function slippedIn(s: Store, sprint: string, now = new Date()): Snapshot[] {
  const sp = findSprint(s.settings, sprint);
  if (!sp || sp.freeze === null || !isFrozen(sp, now)) return [];
  const freeze = sp.freeze;
  return s.history.filter(
    (h) =>
      h.op?.kind === "move" &&
      h.op.sprint === sprint &&
      iso(new Date(h.at)) >= freeze,
  );
}

/**
 * Restore tickets and settings as they were before the action at `index`.
 * The revert is itself recorded, so it can be undone. The decision log is an
 * append-only record of what was decided at the time and is not rewritten.
 * A revert that cannot be computed changes nothing; planRevert says why.
 */
export function revertTo(s: Store, index: number, now = new Date()): Store {
  const plan = planRevert(s, index);
  if (!plan.ok) return s;
  return withHistory(s, `revert to before "${plan.label}"`,
    (cur) => ({ ...cur, tickets: plan.tickets, settings: plan.settings }), now);
}
