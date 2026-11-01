import {
  type Alert,
  type DecisionAction,
  type ProjectId,
  type Settings,
  type Sprint,
  type Ticket,
  DEFAULT_SETTINGS,
  DEFAULT_PROJECTS,
  addDays,
  compareSprints,
  defaultSprints,
  derive,
  DEFAULT_REVISIT_WEEKS,
  estimateLabel,
  fillState,
  findSprint,
  isReady,
  missingRequired,
  nudges,
  priorityRank,
  releaseOrder,
  revisitInWeeks,
  revisitIsDue,
  riskAlerts,
  hasShipped,
  iso,
  isFrozen,
  isOpen,
  label,
  spanOf,
} from "./schema";
import { seedTickets } from "./seed";

/**
 * store.ts — pure state transitions + persistence. No DOM in here.
 * The whole app state is one serialisable object: exportable, diffable.
 */

export interface Decision {
  id: number;
  at: string;                 // ISO timestamp
  ticketId: number;
  ticketLabel: string;        // "TKT-07 — SSO for the partner portal"
  projects: ProjectId[];
  action: DecisionAction;
  reason: string;
  revisit: string | null;
  /** The release the ticket ships in after the decision, if any. */
  sprint: string | null;
}

/**
 * One recorded change: what is needed to undo it, and nothing more.
 *
 * History is a chain leading back from the current register. Each entry holds the
 * state, from immediately BEFORE the labelled action, of only what the action
 * changed. So a revert starts from the register as it is now and steps back through
 * the entries, newest first. The current register is the starting point, which is
 * why no full copy is stored anywhere in the history.
 */
export interface Snapshot {
  at: string;
  label: string;
  /** Before-state of each ticket the change touched, keyed by id. null means the
   *  ticket did not exist yet, so undoing the change removes it. Tickets the change
   *  did not touch are left out: that omission is the whole saving. */
  tickets: Record<string, Ticket | null>;
  /** The ticket ids in order, before the change. Only present when the change
   *  added, removed or reordered tickets, so a revert puts each one back in place. */
  order?: number[];
  /** Settings before the change, only when the change altered them. */
  settings?: Settings;
  /** Structured form of the action, when it is one we can describe. Lets the
   *  board answer questions like "what was added after the freeze?" without
   *  storing anything on the ticket itself. */
  op?: { kind: "move"; ticketId: number; sprint: string | null };
}

/** The stored format. 4: history entries record changes, not full states.
 *  5: the plan workflow — nullable estimate and priority, noHardDate, planned. */
export const STORE_VERSION = 5;

export interface Store {
  version: typeof STORE_VERSION;
  tickets: Ticket[];
  decisions: Decision[];
  settings: Settings;
  nextTicketId: number;
  nextDecisionId: number;
  history: Snapshot[];
}

/**
 * The browser storage key. DO NOT RENAME it with the product.
 *
 * It identifies every existing save. Changing it makes load() find nothing, seed
 * a fresh register, and silently orphan whatever the user had — a rename is a
 * cosmetic change and this would be a data-loss event wearing one.
 */
const KEY = "revel-priority-tracker-v1";

const clone = (t: Ticket): Ticket => ({
  ...t,
  projects: [...t.projects],
  stakeholders: [...t.stakeholders],
});

export function freshStore(): Store {
  const tickets = seedTickets();
  return {
    version: STORE_VERSION,
    tickets,
    decisions: [],
    settings: {
      ...DEFAULT_SETTINGS,
      sprints: defaultSprints(),
      projects: [...DEFAULT_SETTINGS.projects],
      weights: { ...DEFAULT_SETTINGS.weights },
    },
    nextTicketId: tickets.reduce((m, t) => Math.max(m, t.id), 0) + 1,
    nextDecisionId: 1,
    history: [],
  };
}

/**
 * Replace the register with the demo data, as a recordable change.
 *
 * The register file is untracked, so this must never be a dead end: it keeps the
 * history (the caller records it, so it can be reverted like any other change),
 * keeps the decision log, which is append-only, and gives the demo tickets fresh
 * ids so no id is ever reused and no old decision attaches to a demo ticket.
 */
export function resetToSeed(s: Store): Store {
  const seed = freshStore();
  const start = s.nextTicketId;
  const tickets = seed.tickets.map((t, i) => ({ ...t, id: start + i }));
  return { ...s, tickets, settings: seed.settings, nextTicketId: start + tickets.length };
}

/** Validate the parsed shape; anything unrecognised falls back to seed. */
function looksValid(s: unknown): s is Store {
  const v = s as Store;
  return (
    !!v &&
    v.version === STORE_VERSION &&
    Array.isArray(v.tickets) &&
    v.tickets.every(
      (t) =>
        typeof t.id === "number" &&
        typeof t.name === "string" &&
        Array.isArray(t.projects) &&
        typeof t.carryovers === "number" &&
        typeof t.noHardDate === "boolean" &&
        "sprint" in t &&
        "planned" in t,
    ) &&
    Array.isArray(v.decisions) &&
    !!v.settings &&
    Array.isArray(v.settings.sprints)
  );
}

/**
 * Projects were a compile-time list before they were data, so a save that
 * predates them has none. Seed that list in.
 *
 * A ticket may also name a project the list does not carry — from an older save,
 * or from a project removed while the ticket was elsewhere. Those names are
 * unioned in, because the alternative is a ticket that no project view can show,
 * which is silent disappearance rather than a missing label.
 */
function migrateProjects(settingsProjects: unknown, tickets: Ticket[]): string[] {
  const carried = Array.isArray(settingsProjects)
    ? settingsProjects.filter((p): p is string => typeof p === "string" && p.trim() !== "")
    : [];
  const list = carried.length > 0 ? carried : [...DEFAULT_PROJECTS];
  const missing = [...new Set(tickets.flatMap((t) => t.projects))]
    .filter((p) => !list.includes(p))
    .sort();
  return [...list, ...missing];
}

/**
 * Repair what a valid save can still get wrong. Used by EVERY load path —
 * localStorage, the file endpoint, and a file the user picks.
 *
 * Older formats are not converted: the stored version is checked first, and a
 * save from an earlier one is refused whole (the server keeps the old file when a
 * save in the new format replaces it). What is left is integrity: a missing
 * history, and project names the tickets carry but the list has lost.
 */
export function migrateStore(parsed: unknown): Store {
  const s = parsed as Store;
  return {
    ...s,
    history: Array.isArray(s.history) ? s.history : [],
    settings: { ...s.settings, projects: migrateProjects(s.settings.projects, s.tickets) },
  };
}

/**
 * Parse, validate and migrate a stored register — the ONE way in, used by every
 * load path (browser storage, the file endpoint, a file the user picks). A path
 * that skips any of the three is how one copy arrives badly typed while another
 * arrives fine. Returns null for anything that is not a register this version can
 * read, so it is refused whole rather than loaded in part.
 */
export function readStore(raw: string): Store | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return looksValid(parsed) ? migrateStore(parsed) : null;
  } catch {
    return null;
  }
}

export function load(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    return (raw && readStore(raw)) || freshStore();
  } catch {
    return freshStore();
  }
}

export function save(s: Store): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode / quota — state stays in memory */
  }
}

/** Deferred work returns on the weekly revisit day — see REVISIT_WEEKDAY. */
export function defaultRevisit(now = new Date()): string {
  return revisitInWeeks(DEFAULT_REVISIT_WEEKS, now);
}

/**
 * The register as it is written to disk: indented, with a trailing newline.
 *
 * Nothing diffs this file automatically — it is untracked, and the History tab is
 * what reverts it. But it is the durable record, and it does get read and
 * hand-compared against a saved copy. Written compact, every save is a single 6KB
 * line: unreadable, and no two versions can be told apart by eye. Indented, a
 * change to one ticket is a change to a few lines. The trailing newline keeps it
 * a well-formed text file.
 */
export function serialize(s: Store): string {
  return `${JSON.stringify(s, null, 2)}\n`;
}

/** Only the fields a person decides, all unset: a default never stands in for a decision. */
export const blankTicket = (now = new Date()): Omit<Ticket, "id"> => ({
  name: "",
  summary: "",
  projects: [],
  externalUrl: null,
  dueDate: null,
  noHardDate: false,
  estimate: null,
  priority: null,
  type: null,
  stakeholders: [],
  notes: "",
  state: "New",
  opened: iso(now),
  sprint: null,
  planned: null,
  carryovers: 0,
  lastTouched: iso(now),
  closed: null,
});

// ---------------------------------------------------------------- ticket CRUD

export function createTicket(s: Store, draft: Omit<Ticket, "id">): Store {
  const t: Ticket = {
    ...draft,
    id: s.nextTicketId,
    projects: [...draft.projects],
    stakeholders: [...draft.stakeholders],
  };
  return { ...s, tickets: [...s.tickets, t], nextTicketId: s.nextTicketId + 1 };
}

/**
 * Apply a patch to one ticket and keep its invariants:
 *
 * - a due date and "no hard date" never both hold — the newer answer wins;
 * - an open ticket with a ship release is Committed, without one it is New;
 * - `planned` is stamped when a person sets the ship release or changes the
 *   estimate of scheduled work, and cleared when it is unscheduled.
 */
export function patchTicket(t: Ticket, patch: Partial<Ticket>, now = new Date()): Ticket {
  const next: Ticket = {
    ...t,
    ...patch,
    projects: patch.projects ? [...patch.projects] : t.projects,
    stakeholders: patch.stakeholders ? [...patch.stakeholders] : t.stakeholders,
    lastTouched: patch.lastTouched ?? iso(now),
  };
  if (patch.dueDate && patch.dueDate !== t.dueDate) next.noHardDate = false;
  else if (patch.noHardDate && !t.noHardDate) next.dueDate = null;

  if (next.state === "New" || next.state === "Committed") next.state = next.sprint ? "Committed" : "New";
  if (!next.sprint) next.planned = null;
  else if (next.sprint !== t.sprint || (next.estimate !== t.estimate && t.sprint)) {
    next.planned = patch.planned !== undefined ? patch.planned : iso(now);
  }
  return next;
}

/** Patch a ticket — this is "edit in the browser". Any edit re-stamps
 *  lastTouched unless the caller set it explicitly. */
export function updateTicket(s: Store, id: number, patch: Partial<Ticket>, now = new Date()): Store {
  return { ...s, tickets: s.tickets.map((t) => (t.id === id ? patchTicket(t, patch, now) : t)) };
}

/**
 * Remove a ticket. Its decisions stay: the decision log is an append-only record
 * of what was decided at the time, and it is also where a deferral's revisit
 * date lives — so dropping them would leave a deleted-then-restored ticket that
 * never comes back from its deferral.
 */
export function deleteTicket(s: Store, id: number): Store {
  return { ...s, tickets: s.tickets.filter((t) => t.id !== id) };
}

// ---------------------------------------------------------------- sprints

export { compareSprints };

/** Add a release column, slotted in by version. Dates start empty. */
export function addSprint(s: Store, name: string): Store {
  const clean = name.trim();
  if (!clean || s.settings.sprints.some((x) => x.name === clean)) return s;
  const at = s.settings.sprints.findIndex((x) => compareSprints(clean, x.name) > 0);
  const sprints = [...s.settings.sprints];
  const fresh: Sprint = { name: clean, freeze: null, release: null };
  if (at < 0) sprints.push(fresh);
  else sprints.splice(at, 0, fresh);
  return { ...s, settings: { ...s.settings, sprints } };
}

/** Set a release's freeze and/or release date. */
export function updateSprint(s: Store, name: string, patch: Partial<Omit<Sprint, "name">>): Store {
  return {
    ...s,
    settings: {
      ...s.settings,
      sprints: s.settings.sprints.map((sp) => (sp.name === name ? { ...sp, ...patch } : sp)),
    },
  };
}

/** Shift a release one place left (-1) or right (+1) in the display order. */
export function shiftSprint(s: Store, name: string, delta: -1 | 1): Store {
  const sprints = [...s.settings.sprints];
  const i = sprints.findIndex((x) => x.name === name);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= sprints.length) return s;
  [sprints[i], sprints[j]] = [sprints[j], sprints[i]];
  return { ...s, settings: { ...s.settings, sprints } };
}

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

// ---------------------------------------------------------------- auto-optimize

export interface Move {
  id: number;
  label: string;
  name: string;
  from: string | null;
  to: string;
  reason: string;
  /** Set when the proposal is placing work somewhere it knows is imperfect. */
  warning?: string;
}

/** A proposal plus everything needed to explain it, including when it is empty. */
export interface OptimizeResult {
  moves: Move[];
  /** Releases that could take work, in the order they were considered. */
  eligible: string[];
  /** Eligible, but already at capacity in work units. */
  full: string[];
  /** Eligible, and left over capacity — which a proposal never causes itself. */
  over: string[];
  /** Releases with no release date: usable, but not checkable against a due date. */
  undated: string[];
  /** Releases left out, and why. */
  skipped: { name: string; reason: "shipped" | "frozen" }[];
  /** Open, unscheduled tickets that were considered. */
  candidates: number;
  /** Candidates that got no release because nothing had room for them. */
  unplaced: number;
  /** Candidates whose own estimate exceeds capacity, so no release can take them. */
  tooBig: number;
}

/**
 * Propose ship releases for ready tickets that have none.
 *
 * Conservative by design: it never moves work that is already scheduled, never
 * unschedules anything, and never places a ticket that is not ready, so a manual
 * arrangement survives. A ticket estimated at N sprints spans N releases ending
 * where it ships; every one of them must be unshipped and have a unit free, and
 * the ship release must not be frozen, because a freeze is about what ships.
 *
 * A release with no date is still usable — it just cannot be checked against a
 * due date, so it sorts last and any dated ticket shipping there is flagged.
 * Returning an empty proposal always comes with a reason, since a button that
 * does nothing must say why.
 */
export function optimizePlan(s: Store, now = new Date()): OptimizeResult {
  const target = s.settings.commitTargetPerSprint;
  const order = releaseOrder(s.settings.sprints);

  const skipped: OptimizeResult["skipped"] = [];
  for (const sp of order) {
    if (hasShipped(sp, now)) skipped.push({ name: sp.name, reason: "shipped" });
    else if (isFrozen(sp, now)) skipped.push({ name: sp.name, reason: "frozen" });
  }
  const unshipped = order.filter((sp) => !hasShipped(sp, now));
  const eligible = unshipped.filter((sp) => !isFrozen(sp, now));

  // Load in span units: one per open ticket in each release it spans.
  const load = new Map(order.map((sp) => [sp.name, fillState(s.tickets, sp.name, s.settings).load]));

  const candidates = s.tickets
    .filter((t) => isOpen(t) && !t.sprint && (t.state === "New") && isReady(t))
    .map((t) => derive(t, s.settings, now))
    .sort((a, b) => {
      const dated = (a.dueDate ? 0 : 1) - (b.dueDate ? 0 : 1);
      if (dated !== 0) return dated;                        // dated work first
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      return b.score - a.score;                             // then by draft score
    });

  /** The span a ticket of length n would have shipping in `ship`, if it fits. */
  const spanAt = (ship: Sprint, n: number): Sprint[] | null => {
    const at = unshipped.findIndex((x) => x.name === ship.name);
    if (at - n + 1 < 0) return null;                        // would start in a shipped release
    const span = unshipped.slice(at - n + 1, at + 1);
    return span.every((x) => load.get(x.name)! + 1 <= target) ? span : null;
  };

  const moves: Move[] = [];
  let tooBig = 0;
  for (const t of candidates) {
    const n = t.estimate!;
    if (n > unshipped.length) { tooBig += 1; continue; }
    const fits = eligible.filter((sp) => spanAt(sp, n) !== null);
    if (fits.length === 0) continue;
    // The release has to ship on or before the due date to be any use.
    const inTime = t.dueDate ? fits.find((sp) => sp.release !== null && sp.release <= t.dueDate!) : fits[0];
    const ship = inTime ?? fits[0];
    const span = spanAt(ship, n)!;
    for (const x of span) load.set(x.name, load.get(x.name)! + 1);

    const bits: string[] = [];
    if (t.priority === "Critical") bits.push("critical");
    if (t.dueDate) bits.push(`due ${t.dueDate}`);
    bits.push(estimateLabel(t.estimate));

    const warning = !t.dueDate
      ? undefined
      : ship.release === null
        ? "this release has no date"
        : inTime
          ? undefined
          : "no release ships before its due date";

    const spanText = span.length > 1 ? `${span[0].name}–${ship.name}` : ship.name;
    moves.push({
      id: t.id,
      label: label(t.id),
      name: t.name,
      from: null,
      to: ship.name,
      reason: `${bits.join(", ")} → ${spanText}, ${ship.release ? `ships ${ship.release}` : "no release date"}`,
      warning,
    });
  }

  return {
    moves,
    eligible: eligible.map((sp) => sp.name),
    full: eligible.filter((sp) => load.get(sp.name)! >= target).map((sp) => sp.name),
    over: eligible.filter((sp) => load.get(sp.name)! > target).map((sp) => sp.name),
    undated: eligible.filter((sp) => sp.release === null).map((sp) => sp.name),
    skipped,
    candidates: candidates.length,
    unplaced: candidates.length - moves.length,
    tooBig,
  };
}

/** A plain-language account of a proposal — never empty when there is nothing. */
export function explainPlan(r: OptimizeResult): string {
  const constraints: string[] = [];
  const frozen = r.skipped.filter((x) => x.reason === "frozen").map((x) => x.name);
  const shipped = r.skipped.filter((x) => x.reason === "shipped").map((x) => x.name);
  if (frozen.length) constraints.push(`${frozen.join(", ")} frozen`);
  if (shipped.length) constraints.push(`${shipped.join(", ")} already shipped`);
  if (r.undated.length) constraints.push(`${r.undated.join(", ")} have no release date`);
  if (r.full.length) constraints.push(`${r.full.join(", ")} at capacity`);
  if (r.over.length) constraints.push(`${r.over.join(", ")} already over capacity`);
  if (r.tooBig > 0) constraints.push(`${r.tooBig} longer than the releases left`);
  if (r.candidates === 0) constraints.push("no ready ticket is unscheduled");
  else if (r.unplaced > 0) constraints.push(`${r.unplaced} left unplaced`);

  if (r.moves.length === 0) {
    return constraints.length ? `Nothing to place — ${constraints.join("; ")}.` : "Nothing to place.";
  }
  return constraints.length ? `Limited by — ${constraints.join("; ")}.` : "";
}

/**
 * Give releases that have no dates a plain two-week cadence from today, oldest
 * version first. Repairs the gap left by saves that predate release dates.
 */
export function fillReleaseDates(s: Store, now = new Date()): Store {
  const undated = s.settings.sprints
    .filter((sp) => sp.release === null)
    .map((sp) => sp.name)
    .sort(compareSprints);
  if (undated.length === 0) return s;

  // Freeze a week before shipping, matching the default plan's lead. The lead
  // matters: freeze-on-today would hand back a release that is already frozen,
  // which is exactly the state this action exists to repair.
  const lead = 7;
  const dates: Record<string, { freeze: string; release: string }> = {};
  undated.forEach((name, i) => {
    const releaseIn = (i + 1) * s.settings.sprintLengthDays;
    dates[name] = { freeze: iso(addDays(now, releaseIn - lead)), release: iso(addDays(now, releaseIn)) };
  });

  return {
    ...s,
    settings: {
      ...s.settings,
      sprints: s.settings.sprints.map((sp) => (dates[sp.name] ? { ...sp, ...dates[sp.name] } : sp)),
    },
  };
}

/** Apply a proposal. */
export function applyPlan(s: Store, moves: Move[], now = new Date()): Store {
  return moves.reduce((acc, m) => moveTicketToSprint(acc, m.id, m.to, now), s);
}

/** Remove a release column; tickets in it become unscheduled, not deleted. */
export function removeSprint(s: Store, name: string, now = new Date()): Store {
  const kept = { ...s, settings: { ...s.settings, sprints: s.settings.sprints.filter((x) => x.name !== name) } };
  return {
    ...kept,
    tickets: kept.tickets.map((t) => (t.sprint === name ? patchTicket(t, { sprint: null }, now) : t)),
  };
}

/**
 * Set the release a ticket ships in (or none). Placing work by hand is allowed for
 * any open ticket, ready or not; placing it takes it on, so a blocked or deferred
 * ticket becomes committed work again.
 */
export function moveTicketToSprint(s: Store, id: number, sprint: string | null, now = new Date()): Store {
  const t = s.tickets.find((x) => x.id === id);
  if (!t || !isOpen(t)) return s;
  return updateTicket(s, id, { sprint, state: sprint ? "Committed" : "New" }, now);
}

// ---------------------------------------------------------------- decisions

/** The release after `name` in ship order that has not shipped: where carried-over work goes. */
export function nextRelease(settings: Settings, name: string, now = new Date()): string | null {
  const order = releaseOrder(settings.sprints);
  const at = order.findIndex((x) => x.name === name);
  if (at < 0) return null;
  return order.slice(at + 1).find((x) => !hasShipped(x, now))?.name ?? null;
}

export function applyToTicket(t: Ticket, action: DecisionAction, settings: Settings, now: Date): Ticket {
  const today = iso(now);
  switch (action) {
    case "Accept":
      return patchTicket(t, { state: t.sprint ? "Committed" : "New" }, now);
    case "Defer":
      return patchTicket(t, { state: "Deferred", sprint: null }, now);
    case "Block":
      return patchTicket(t, { state: "Blocked", sprint: null }, now);
    case "Decline":
      return patchTicket(t, { state: "Won't Do", closed: today }, now);
    case "Done":
      return patchTicket(t, { state: "Done", closed: today }, now);
    case "Carry over": {
      const next = t.sprint ? nextRelease(settings, t.sprint, now) : null;
      if (!next) return t;
      // `planned` is left alone: carrying over is progress, not a new plan.
      return patchTicket(t, { sprint: next, carryovers: t.carryovers + 1, planned: t.planned }, now);
    }
    case "Unschedule":
      return patchTicket(t, { state: "New", sprint: null }, now);
  }
}

export function recordDecision(
  s: Store,
  ticketId: number,
  action: DecisionAction,
  reason: string,
  revisit: string | null,
  now = new Date(),
): Store {
  const idx = s.tickets.findIndex((t) => t.id === ticketId);
  if (idx < 0) return s;
  const prev = s.tickets[idx];
  const next = applyToTicket(prev, action, s.settings, now);
  if (next === prev) return s;
  const decision: Decision = {
    id: s.nextDecisionId,
    at: now.toISOString(),
    ticketId: prev.id,
    ticketLabel: `${label(prev.id)} — ${prev.name}`,
    projects: [...prev.projects],
    action,
    reason,
    revisit,
    sprint: next.sprint ?? (action === "Done" ? prev.sprint : null),
  };
  const tickets = s.tickets.slice();
  tickets[idx] = next;
  return { ...s, tickets, decisions: [...s.decisions, decision], nextDecisionId: s.nextDecisionId + 1 };
}

/**
 * Edit a ticket — the one way every screen edits one (the Fill out card, the
 * editor, the project table). If the edit answers the last required field, the
 * ticket is accepted: it moves to Schedule, and the decision log says so.
 */
export function editTicket(s: Store, id: number, patch: Partial<Ticket>, now = new Date()): Store {
  const before = s.tickets.find((t) => t.id === id);
  if (!before) return s;
  const edited = updateTicket(s, id, patch, now);
  const after = edited.tickets.find((t) => t.id === id)!;
  const accepted = !isReady(before) && isReady(after) && (after.state === "New" || after.state === "Committed");
  return accepted ? recordDecision(edited, id, "Accept", "filled out", null, now) : edited;
}

/** Add a project to the controlled list. Blank names and duplicates are refused. */
export function addProject(s: Store, name: string): Store {
  const clean = name.trim();
  if (!clean || s.settings.projects.includes(clean)) return s;
  return { ...s, settings: { ...s.settings, projects: [...s.settings.projects, clean] } };
}

/**
 * Rename a project in the list and on every ticket that carries it.
 *
 * A blank name, an unchanged one, or one already in the list is refused by
 * returning the store unchanged, so nothing is recorded and two projects are never
 * merged by accident. The decision log keeps the old name: it records what was
 * true when each decision was made.
 */
export function renameProject(s: Store, from: string, to: string): Store {
  const clean = to.trim();
  if (!clean || clean === from || !s.settings.projects.includes(from) || s.settings.projects.includes(clean)) return s;
  return {
    ...s,
    settings: { ...s.settings, projects: s.settings.projects.map((p) => (p === from ? clean : p)) },
    tickets: s.tickets.map((t) =>
      t.projects.includes(from) ? { ...t, projects: t.projects.map((p) => (p === from ? clean : p)) } : t),
  };
}

/** Sort rank for a due date: dated first (by date), then "no hard date", then unanswered. */
const dueRank = (t: Ticket): [number, string] =>
  t.dueDate ? [0, t.dueDate] : t.noHardDate ? [1, ""] : [2, ""];

/** A project's tickets, open ones by default, sorted by due date. */
export function projectTickets(s: Store, project: string, includeClosed = false): Ticket[] {
  return s.tickets
    .filter((t) => t.projects.includes(project) && (includeClosed || isOpen(t)))
    .sort((a, b) => {
      const [ra, da] = dueRank(a);
      const [rb, db] = dueRank(b);
      return ra - rb || da.localeCompare(db) || a.id - b.id;
    });
}

/** How many tickets currently carry a project. */
export const projectUsage = (s: Store, name: string): number =>
  s.tickets.filter((t) => t.projects.includes(name)).length;

/**
 * Remove a project from the list AND detach it from every ticket carrying it.
 *
 * Detaching is the point. Leaving the name on the tickets would keep them out of
 * every project view, so the tickets would vanish from the only place that shows
 * them — a worse outcome than losing a label. The whole action goes through the
 * history layer, so a mistaken delete is revertible.
 */
export function removeProject(s: Store, name: string): Store {
  return {
    ...s,
    settings: { ...s.settings, projects: s.settings.projects.filter((p) => p !== name) },
    tickets: s.tickets.map((t) =>
      t.projects.includes(name) ? { ...t, projects: t.projects.filter((p) => p !== name) } : t),
  };
}

// ---------------------------------------------------------------- the plan pipeline

/** The most recent defer or block of a ticket: its revisit day and the reason given. */
export function lastSetAside(s: Store, ticketId: number): Decision | null {
  for (let i = s.decisions.length - 1; i >= 0; i--) {
    const d = s.decisions[i];
    if (d.ticketId === ticketId && (d.action === "Defer" || d.action === "Block")) return d;
  }
  return null;
}

export interface Returned {
  ticket: Ticket;
  revisit: string;
  /** Why it was set aside: the block reason, or the deferral's. */
  reason: string;
}

/**
 * Deferred and blocked tickets whose revisit day has arrived, longest-waiting first.
 *
 * This is what makes a revisit date mean anything. Without it the date is
 * written into the decision log and never read again.
 */
export function revisitDue(s: Store, now = new Date()): Returned[] {
  return s.tickets
    .filter((t) => t.state === "Deferred" || t.state === "Blocked")
    .map((t) => ({ t, d: lastSetAside(s, t.id) }))
    .filter((x) => revisitIsDue(x.d?.revisit, now))
    .map((x) => ({ ticket: x.t, revisit: x.d!.revisit!, reason: x.d!.reason }))
    .sort((a, b) => a.revisit.localeCompare(b.revisit));
}

export interface FillOutItem {
  ticket: Ticket;
  /** Set when it came back on its revisit day. */
  returned: Returned | null;
}

/**
 * Fill out: returned work first, since it has waited longest; then every open
 * ticket missing a required field, highest draft score first.
 */
export function fillOutQueue(s: Store, now = new Date()): FillOutItem[] {
  const back = revisitDue(s, now).map((r) => ({ ticket: r.ticket, returned: r }));
  const incomplete = s.tickets
    .filter((t) => (t.state === "New" || t.state === "Committed") && !isReady(t))
    .sort((a, b) => derive(b, s.settings, now).score - derive(a, s.settings, now).score)
    .map((t) => ({ ticket: t, returned: null }));
  return [...back, ...incomplete];
}

/** Schedule: ready, open, unscheduled — by priority, then draft score. */
export function scheduleQueue(s: Store, now = new Date()): Ticket[] {
  return s.tickets
    .filter((t) => t.state === "New" && !t.sprint && isReady(t))
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority)
      || derive(b, s.settings, now).score - derive(a, s.settings, now).score);
}

export interface CloseOut {
  release: string;
  shipped: string | null;
  tickets: Ticket[];
  /** Where carried-over work would go; null when there is no later release. */
  next: string | null;
}

/** Shipped releases that still have open work shipping in them, in ship order. */
export function closeOutQueue(s: Store, now = new Date()): CloseOut[] {
  return releaseOrder(s.settings.sprints)
    .filter((sp) => hasShipped(sp, now))
    .map((sp) => ({
      release: sp.name,
      shipped: sp.release,
      tickets: s.tickets.filter((t) => t.state === "Committed" && t.sprint === sp.name),
      next: nextRelease(s.settings, sp.name, now),
    }))
    .filter((c) => c.tickets.length > 0);
}

export type CloseOutChoice = "Done" | "Carry over" | "Unschedule";

/** Apply the close-out choices that were made. Undecided tickets are simply absent. */
export function applyCloseOut(
  s: Store, choices: { id: number; choice: CloseOutChoice }[], now = new Date(),
): Store {
  return choices.reduce((acc, c) => {
    const reason = c.choice === "Done" ? "shipped" : c.choice === "Carry over" ? "did not ship" : "back to backlog";
    return recordDecision(acc, c.id, c.choice, reason, null, now);
  }, s);
}

export interface CheckRow {
  ticket: Ticket;
  alerts: Alert[];
}

export interface CheckRelease {
  /** null for open work that is not scheduled. */
  release: string | null;
  load: number;
  capacity: number;
  /** Release-level problems: over capacity, scope after freeze. */
  alerts: Alert[];
  rows: CheckRow[];
}

/**
 * Check: what is going wrong, release by release in ship order, then ready work
 * that is not scheduled yet. Only rows and releases with something to say are kept.
 */
export function checkReport(s: Store, now = new Date()): CheckRelease[] {
  const capacity = s.settings.commitTargetPerSprint;
  const rowsFor = (pred: (t: Ticket) => boolean): CheckRow[] =>
    s.tickets
      .filter((t) => isOpen(t) && pred(t))
      .map((t) => ({ ticket: t, alerts: riskAlerts(t, s.settings, now) }))
      .filter((r) => r.alerts.length > 0)
      .sort((a, b) => b.alerts.length - a.alerts.length);

  const out: CheckRelease[] = releaseOrder(s.settings.sprints).map((sp) => {
    const { load, room } = fillState(s.tickets, sp.name, s.settings);
    const alerts: Alert[] = [];
    if (room < 0 && !hasShipped(sp, now)) {
      alerts.push({ kind: "OVER-CAPACITY", severity: "risk", what: "Over capacity",
        why: `${load} units of work against a capacity of ${capacity}: ${-room} more than the team can take.` });
    }
    const late = slippedIn(s, sp.name, now);
    if (late.length > 0) {
      alerts.push({ kind: "AFTER-FREEZE", severity: "risk", what: "Scope after freeze",
        why: `${late.length} placement${late.length === 1 ? "" : "s"} arrived after ${sp.name} froze on ${sp.freeze}.` });
    }
    return { release: sp.name, load, capacity, alerts, rows: rowsFor((t) => t.sprint === sp.name) };
  });
  // Unscheduled work is checked only once it is ready: until then it is in Fill out,
  // whose card already shows its risks, and counting it twice inflates the header.
  out.push({ release: null, load: 0, capacity, alerts: [], rows: rowsFor((t) => !t.sprint && isReady(t)) });
  return out.filter((r) => r.alerts.length > 0 || r.rows.length > 0);
}

export interface Pipeline {
  fillOut: number;
  schedule: number;
  check: number;
  /** Open tickets with a detail that would still help. */
  nudges: number;
}

/** What each step holds, for the header. */
export function pipeline(s: Store, now = new Date()): Pipeline {
  const check = new Set<string>();
  for (const r of checkReport(s, now)) {
    for (const a of r.alerts) check.add(`${r.release}:${a.kind}`);
    for (const row of r.rows) check.add(`t${row.ticket.id}`);
  }
  for (const c of closeOutQueue(s, now)) for (const t of c.tickets) check.add(`t${t.id}`);
  return {
    fillOut: fillOutQueue(s, now).length,
    schedule: scheduleQueue(s, now).length,
    check: check.size,
    nudges: s.tickets.filter((t) => nudges(t).length > 0).length,
  };
}

/** Required fields still missing on this ticket, for display. */
export { missingRequired };

/** The span label for a scheduled ticket: "v0.23–v0.24", or its one release. */
export function spanLabel(t: Ticket, settings: Settings): string {
  const r = spanOf(t, settings).releases;
  return r.length > 1 ? `${r[0]}–${r[r.length - 1]}` : (r[0] ?? "");
}

