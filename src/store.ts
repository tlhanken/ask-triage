import {
  type DecisionAction,
  type ProjectId,
  type Settings,
  type Ticket,
  DEFAULT_SETTINGS,
  derive,
  iso,
  isOpen,
  label,
  queueHealth,
} from "./schema";
import { SEED_TICKETS } from "./seed";

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
  sprint: string;
  prev: Ticket;               // snapshot for undo
}

/** One recorded state, taken immediately BEFORE the labelled action ran. */
export interface Snapshot {
  at: string;
  label: string;
  data: string;   // JSON of { tickets, settings }
}

export interface Store {
  version: 3;
  tickets: Ticket[];
  decisions: Decision[];
  settings: Settings;
  nextTicketId: number;
  nextDecisionId: number;
  history: Snapshot[];
}

/** Bumped with the field trim: older saves validate false and seed fresh. */
const KEY = "revel-priority-tracker-v1";

const clone = (t: Ticket): Ticket => ({
  ...t,
  projects: [...t.projects],
  stakeholders: [...t.stakeholders],
});

export function freshStore(): Store {
  const tickets = SEED_TICKETS.map(clone);
  return {
    version: 3,
    tickets,
    decisions: [],
    settings: {
      ...DEFAULT_SETTINGS,
      sprints: [...DEFAULT_SETTINGS.sprints],
      weights: { ...DEFAULT_SETTINGS.weights },
    },
    nextTicketId: tickets.reduce((m, t) => Math.max(m, t.id), 0) + 1,
    nextDecisionId: 1,
    history: [],
  };
}

/** Validate the parsed shape; anything unrecognised falls back to seed. */
function looksValid(s: unknown): s is Store {
  const v = s as Store;
  return (
    !!v &&
    v.version === 3 &&
    Array.isArray(v.tickets) &&
    v.tickets.every(
      (t) =>
        typeof t.id === "number" &&
        typeof t.name === "string" &&
        Array.isArray(t.projects) &&
        typeof t.carryovers === "number" &&
        "sprint" in t,
    ) &&
    Array.isArray(v.decisions) &&
    !!v.settings &&
    Array.isArray(v.settings.sprints)
  );
}

export function load(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return freshStore();
    const parsed: unknown = JSON.parse(raw);
    if (!looksValid(parsed)) return freshStore();
    // `history` arrived after the first release, so default it rather than
    // invalidating a save that predates it.
    return { ...parsed, history: Array.isArray(parsed.history) ? parsed.history : [] };
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

export function clear(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export const defaultRevisitDays = 90;

/** Only the fields a human decides. The rest are stamped or loop-driven. */
export const blankTicket = (): Omit<Ticket, "id"> => ({
  name: "",
  summary: "",
  projects: [],
  externalUrl: null,
  dueDate: null,
  ownerType: "Team",
  owner: "",
  stakeholders: [],
  type: "Should",
  size: "M",
  state: "New",
  opened: iso(new Date()),
  sprint: null,
  carryovers: 0,
  lastTouched: iso(new Date()),
  closed: null,
  nextAction: "",
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

/** Patch a ticket — this is "edit in the browser". Any edit re-stamps
 *  lastTouched unless the caller set it explicitly. */
export function updateTicket(s: Store, id: number, patch: Partial<Ticket>, now = new Date()): Store {
  return {
    ...s,
    tickets: s.tickets.map((t) =>
      t.id === id
        ? {
            ...t,
            ...patch,
            projects: patch.projects ? [...patch.projects] : t.projects,
            stakeholders: patch.stakeholders ? [...patch.stakeholders] : t.stakeholders,
            lastTouched: patch.lastTouched ?? iso(now),
          }
        : t,
    ),
  };
}

export function deleteTicket(s: Store, id: number): Store {
  return {
    ...s,
    tickets: s.tickets.filter((t) => t.id !== id),
    decisions: s.decisions.filter((d) => d.ticketId !== id),
  };
}

// ---------------------------------------------------------------- sprints

export function compareSprints(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true });
}

/**
 * Add a sprint column. The array IS the display order (newest left by default)
 * and the owner controls it, so a new sprint is slotted in by version relative
 * to what is already there instead of re-sorting the whole list and wiping out
 * any manual arrangement.
 */
export function addSprint(s: Store, name: string): Store {
  const clean = name.trim();
  if (!clean || s.settings.sprints.includes(clean)) return s;
  const at = s.settings.sprints.findIndex((x) => compareSprints(clean, x) > 0);
  const sprints = [...s.settings.sprints];
  if (at < 0) sprints.push(clean);
  else sprints.splice(at, 0, clean);
  return { ...s, settings: { ...s.settings, sprints } };
}

/** Shift a sprint one place left (-1) or right (+1) in the display order. */
export function shiftSprint(s: Store, name: string, delta: -1 | 1): Store {
  const sprints = [...s.settings.sprints];
  const i = sprints.indexOf(name);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= sprints.length) return s;
  [sprints[i], sprints[j]] = [sprints[j], sprints[i]];
  return { ...s, settings: { ...s.settings, sprints } };
}

// ---------------------------------------------------------------- history

/** Kept small on purpose: snapshots live in localStorage, which is not large. */
export const HISTORY_CAP = 25;

const capture = (s: Store): string => JSON.stringify({ tickets: s.tickets, settings: s.settings });

/** Record the CURRENT state under a label, immediately before a change lands. */
export function pushHistory(s: Store, label: string, now = new Date()): Store {
  const snapshot: Snapshot = { at: now.toISOString(), label, data: capture(s) };
  const history = [...s.history, snapshot];
  while (history.length > HISTORY_CAP) history.shift();
  return { ...s, history };
}

/** Run a mutation, having first recorded what it is about to change. A mutation
 *  that changes nothing (returns its input) leaves no dead snapshot behind. */
export function withHistory(
  s: Store,
  label: string,
  mutate: (s: Store) => Store,
  now = new Date(),
): Store {
  const recorded = pushHistory(s, label, now);
  const next = mutate(recorded);
  return next === recorded ? s : next;
}

/**
 * Restore tickets and settings as they were before the action at `index`.
 * The revert is itself recorded, so it can be undone. The decision log is an
 * append-only record of what was decided at the time and is not rewritten.
 */
export function revertTo(s: Store, index: number, now = new Date()): Store {
  const snapshot = s.history[index];
  if (!snapshot) return s;
  const data = JSON.parse(snapshot.data) as { tickets: Ticket[]; settings: Settings };
  const recorded = pushHistory(s, `revert to before "${snapshot.label}"`, now);
  return { ...recorded, tickets: data.tickets, settings: data.settings };
}

// ---------------------------------------------------------------- auto-optimize

export interface Move {
  id: number;
  label: string;
  name: string;
  from: string | null;
  to: string;
  reason: string;
}

/**
 * Propose sprint assignments for tickets that have none. Conservative by
 * design: it never moves work that is already scheduled and never unschedules
 * anything, so a manual arrangement survives. The result is a proposal — the
 * caller applies it, and history makes it one click to undo.
 */
export function optimizePlan(s: Store, now = new Date()): Move[] {
  const target = s.settings.commitTargetPerSprint;
  // Only releases that have not shipped yet, earliest first.
  const upcoming = s.settings.sprints
    .filter((sp) => compareSprints(sp, s.settings.currentSprint) >= 0)
    .sort(compareSprints);
  if (upcoming.length === 0) return [];

  const load = new Map(
    upcoming.map((sp) => [sp, s.tickets.filter((t) => t.sprint === sp && isOpen(t)).length]),
  );

  const candidates = s.tickets
    .filter((t) => isOpen(t) && !t.sprint)
    .map((t) => derive(t, s.settings, now))
    .sort((a, b) => {
      const dated = (a.dueDate ? 0 : 1) - (b.dueDate ? 0 : 1);
      if (dated !== 0) return dated;                        // dated work first
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      return b.score - a.score;                             // then by draft score
    });

  const moves: Move[] = [];
  for (const t of candidates) {
    const sprint = upcoming.find((sp) => load.get(sp)! < target);
    if (!sprint) break;                                     // every upcoming release is full
    const next = load.get(sprint)! + 1;
    load.set(sprint, next);
    // Say all of what is true about why this one is early — a human reads this.
    const bits: string[] = [];
    if (t.type === "Critical") bits.push("critical");
    if (t.dueDate) bits.push(`due ${t.dueDate}`);
    if (bits.length === 0) bits.push(`score ${t.score}`);
    moves.push({
      id: t.id, label: label(t.id), name: t.name, from: null, to: sprint,
      reason: `${bits.join(", ")} — fills ${sprint} (${next}/${target})`,
    });
  }
  return moves;
}

/** Apply a proposal. */
export function applyPlan(s: Store, moves: Move[], now = new Date()): Store {
  return moves.reduce(
    (acc, m) => updateTicket(acc, m.id, { sprint: m.to, state: "Committed" }, now),
    s,
  );
}

/** Remove a sprint column; tickets in it become unscheduled, not deleted. */
export function removeSprint(s: Store, name: string): Store {
  return {
    ...s,
    settings: { ...s.settings, sprints: s.settings.sprints.filter((x) => x !== name) },
    tickets: s.tickets.map((t) => (t.sprint === name ? { ...t, sprint: null } : t)),
  };
}

/** Move a ticket between sprint columns (or back to the backlog). */
export function moveTicketToSprint(s: Store, id: number, sprint: string | null, now = new Date()): Store {
  return updateTicket(s, id, { sprint, state: sprint ? "Committed" : "Accepted-Backlog" }, now);
}

// ---------------------------------------------------------------- decisions

export function applyToTicket(t: Ticket, action: DecisionAction, sprint: string, now: Date): Ticket {
  const today = iso(now);
  switch (action) {
    case "Accept":
      return { ...t, state: "Committed", sprint, lastTouched: today };
    case "Defer":
      return { ...t, state: "Deferred", lastTouched: today };
    case "Decline":
      return { ...t, state: "Won't Do", closed: today, lastTouched: today };
    case "Block":
      return { ...t, state: "Blocked", lastTouched: today };
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
  const next = applyToTicket(prev, action, s.settings.currentSprint, now);
  const decision: Decision = {
    id: s.nextDecisionId,
    at: now.toISOString(),
    ticketId: prev.id,
    ticketLabel: `${label(prev.id)} — ${prev.name}`,
    projects: [...prev.projects],
    action,
    reason,
    revisit,
    sprint: s.settings.currentSprint,
    prev: clone(prev),
  };
  const tickets = s.tickets.slice();
  tickets[idx] = next;
  return { ...s, tickets, decisions: [...s.decisions, decision], nextDecisionId: s.nextDecisionId + 1 };
}

export function undoLast(s: Store): Store {
  if (s.decisions.length === 0) return s;
  const last = s.decisions[s.decisions.length - 1];
  return {
    ...s,
    tickets: s.tickets.map((t) => (t.id === last.ticketId ? clone(last.prev) : t)),
    decisions: s.decisions.slice(0, -1),
  };
}

// ---------------------------------------------------------------- selectors

/** Still needing a triage decision. */
export function undecided(s: Store): Ticket[] {
  return s.tickets
    .filter((t) => t.state === "New" || t.state === "Accepted-Backlog")
    .sort((a, b) => derive(b, s.settings).score - derive(a, s.settings).score);
}

export function acceptedThisSprint(s: Store): number {
  return s.decisions.filter((d) => d.action === "Accept").length;
}

export function stats(s: Store) {
  return {
    ...queueHealth(s.tickets, s.settings),
    total: s.tickets.length,
    open: s.tickets.filter(isOpen).length,
    accepted: acceptedThisSprint(s),
    decided: s.decisions.length,
    deferred: s.tickets.filter((t) => t.state === "Deferred").length,
    declined: s.tickets.filter((t) => t.state === "Won't Do").length,
    target: s.settings.commitTargetPerSprint,
  };
}
