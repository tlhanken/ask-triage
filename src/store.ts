import {
  type DecisionAction,
  type ProjectId,
  type Settings,
  type Sprint,
  type Ticket,
  DEFAULT_SETTINGS,
  defaultSprints,
  derive,
  estimateLabel,
  findSprint,
  hasShipped,
  iso,
  isFrozen,
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
  /** Structured form of the action, when it is one we can describe. Lets the
   *  board answer questions like "what was added after the freeze?" without
   *  storing anything on the ticket itself. */
  op?: { kind: "move"; ticketId: number; sprint: string | null };
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
      sprints: defaultSprints(),
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

/** Releases were names before they had dates; upgrade in place. */
function migrateSprints(sprints: unknown): Sprint[] {
  if (!Array.isArray(sprints)) return defaultSprints();
  return sprints.map((sp) =>
    typeof sp === "string" ? { name: sp, freeze: null, release: null } : (sp as Sprint),
  );
}

/**
 * Tickets predate the tier split. Drop what the model no longer carries and
 * default what is new, rather than reseeding and losing the history.
 * `size` (S/M/L) becomes an estimate in sprints; owner, owner-type and
 * next-action are gone.
 */
function migrateTicket(raw: unknown): Ticket {
  const t = { ...(raw as Record<string, unknown>) };
  delete t.ownerType;
  delete t.owner;
  delete t.size;
  delete t.nextAction;
  if (typeof t.estimate !== "number") t.estimate = 2;
  if (typeof t.notes !== "string") t.notes = "";
  if (!Array.isArray(t.stakeholders)) t.stakeholders = [];
  return t as unknown as Ticket;
}

export function load(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return freshStore();
    const parsed: unknown = JSON.parse(raw);
    if (!looksValid(parsed)) return freshStore();
    // `history` arrived after the first release, so default it rather than
    // invalidating a save that predates it.
    return {
      ...parsed,
      history: Array.isArray(parsed.history) ? parsed.history : [],
      tickets: parsed.tickets.map(migrateTicket),
      // releases used to be plain names; give them dates rather than reseeding
      settings: { ...parsed.settings, sprints: migrateSprints(parsed.settings.sprints) },
    };
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

/** Only the fields a person decides. Nothing else is asked for. */
export const blankTicket = (): Omit<Ticket, "id"> => ({
  name: "",
  summary: "",
  projects: [],
  externalUrl: null,
  dueDate: null,
  estimate: 2,
  type: "Should",
  stakeholders: [],
  notes: "",
  state: "New",
  opened: iso(new Date()),
  sprint: null,
  carryovers: 0,
  lastTouched: iso(new Date()),
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

/** Kept small on purpose: snapshots live in localStorage, which is not large. */
export const HISTORY_CAP = 25;

const capture = (s: Store): string => JSON.stringify({ tickets: s.tickets, settings: s.settings });

/** Record the CURRENT state under a label, immediately before a change lands. */
export function pushHistory(s: Store, label: string, now = new Date(), op?: Snapshot["op"]): Store {
  const snapshot: Snapshot = { at: now.toISOString(), label, data: capture(s), ...(op ? { op } : {}) };
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
  op?: Snapshot["op"],
): Store {
  const recorded = pushHistory(s, label, now, op);
  const next = mutate(recorded);
  return next === recorded ? s : next;
}

/**
 * Tickets that were placed into a release AFTER its freeze date. Derived from
 * the recorded moves rather than from a field on the ticket — which keeps the
 * ticket lean, and the history window is exactly the one that matters here.
 */
export function slippedIn(s: Store, sprint: string, now = new Date()): Snapshot[] {
  const sp = findSprint(s.settings, sprint);
  if (!sp || sp.freeze === null || !isFrozen(sp, now)) return [];
  return s.history.filter(
    (h) =>
      h.op?.kind === "move" &&
      h.op.sprint === sprint &&
      h.at.slice(0, 10) > sp.freeze!,
  );
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
  /** Set when the proposal is placing work somewhere it knows is imperfect. */
  warning?: string;
}

/** A proposal plus everything needed to explain it, including when it is empty. */
export interface OptimizeResult {
  moves: Move[];
  /** Releases that could take work, in the order they were considered. */
  eligible: string[];
  /** Eligible, but already at capacity. */
  full: string[];
  /** Releases with no release date: usable, but not checkable against a due date. */
  undated: string[];
  /** Releases left out, and why. */
  skipped: { name: string; reason: "shipped" | "frozen" }[];
  /** Open, unscheduled tickets that were considered. */
  candidates: number;
  /** Candidates that got no release because everything eligible was full. */
  unplaced: number;
}

/**
 * Propose release assignments for tickets that have none.
 *
 * Conservative by design: it never moves work that is already scheduled and
 * never unschedules anything, so a manual arrangement survives. It skips frozen
 * and shipped releases, because adding scope to those is a human decision.
 *
 * A release with no date is still usable — it just cannot be checked against a
 * due date, so it sorts last and any dated ticket landing there is flagged.
 * Returning an empty proposal always comes with a reason, since a button that
 * does nothing must say why.
 */
export function optimizePlan(s: Store, now = new Date()): OptimizeResult {
  const target = s.settings.commitTargetPerSprint;

  const skipped: OptimizeResult["skipped"] = [];
  const usable: Sprint[] = [];
  for (const sp of s.settings.sprints) {
    if (hasShipped(sp, now)) skipped.push({ name: sp.name, reason: "shipped" });
    else if (isFrozen(sp, now)) skipped.push({ name: sp.name, reason: "frozen" });
    else usable.push(sp);
  }

  const eligible = [...usable].sort((a, b) => {
    if (a.release && b.release) return a.release.localeCompare(b.release);
    if (a.release) return -1;
    if (b.release) return 1;
    // Neither has a date: fall back to version order, oldest first — the same
    // direction the date-repair offer uses, so the two agree about what is next.
    return compareSprints(a.name, b.name);
  });

  const load = new Map(
    eligible.map((sp) => [sp.name, s.tickets.filter((t) => t.sprint === sp.name && isOpen(t)).length]),
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
    const room = eligible.filter((sp) => load.get(sp.name)! < target);
    if (room.length === 0) break;                           // everything eligible is full
    // The release has to ship on or before the due date to be any use.
    const inTime = t.dueDate
      ? room.find((sp) => sp.release !== null && sp.release <= t.dueDate!)
      : room[0];
    const sprint = inTime ?? room[0];
    const next = load.get(sprint.name)! + 1;
    load.set(sprint.name, next);

    const bits: string[] = [];
    if (t.type === "Critical") bits.push("critical");
    if (t.dueDate) bits.push(`due ${t.dueDate}`);
    bits.push(estimateLabel(t.estimate));

    const warning = !t.dueDate
      ? undefined
      : sprint.release === null
        ? "this release has no date"
        : inTime
          ? undefined
          : "no release ships before its due date";

    moves.push({
      id: t.id,
      label: label(t.id),
      name: t.name,
      from: null,
      to: sprint.name,
      reason: `${bits.join(", ")} → ${sprint.release ? `ships ${sprint.release}` : "no release date"} (${next}/${target})`,
      warning,
    });
  }

  return {
    moves,
    eligible: eligible.map((sp) => sp.name),
    full: eligible.filter((sp) => load.get(sp.name)! >= target).map((sp) => sp.name),
    undated: eligible.filter((sp) => sp.release === null).map((sp) => sp.name),
    skipped,
    candidates: candidates.length,
    unplaced: candidates.length - moves.length,
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
  if (r.candidates === 0) constraints.push("no open ticket is unscheduled");
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

  const DAY = 86_400_000;
  const span = s.settings.sprintLengthDays * DAY;
  // Freeze a week before shipping, matching the default plan's lead. The lead
  // matters: freeze-on-today would hand back a release that is already frozen,
  // which is exactly the state this action exists to repair.
  const lead = 7 * DAY;
  const dates: Record<string, { freeze: string; release: string }> = {};
  undated.forEach((name, i) => {
    const release = new Date(now.getTime() + (i + 1) * span);
    dates[name] = { freeze: iso(new Date(release.getTime() - lead)), release: iso(release) };
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
  return moves.reduce(
    (acc, m) => updateTicket(acc, m.id, { sprint: m.to, state: "Committed" }, now),
    s,
  );
}

/** Remove a release column; tickets in it become unscheduled, not deleted. */
export function removeSprint(s: Store, name: string): Store {
  return {
    ...s,
    settings: { ...s.settings, sprints: s.settings.sprints.filter((x) => x.name !== name) },
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
