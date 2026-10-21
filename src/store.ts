import {
  type DecisionAction,
  type ProjectId,
  type Settings,
  type Sprint,
  type Ticket,
  DEFAULT_SETTINGS,
  DEFAULT_PROJECTS,
  DEFAULT_PRIORITY,
  CATEGORIES,
  PRIORITIES,
  defaultSprints,
  derive,
  DEFAULT_REVISIT_WEEKS,
  estimateLabel,
  findSprint,
  loadUnits,
  revisitInWeeks,
  revisitIsDue,
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
  const tickets = SEED_TICKETS.map(clone);
  return {
    version: 3,
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

  // `type` used to hold the priority and now holds the category. Move the old
  // value across and leave the category unset: relabelling old data as a
  // category would invent a judgement nobody made, and the audit will ask for it.
  const old = t.type;
  const oldIsPriority = typeof old === "string" && (PRIORITIES as readonly string[]).includes(old);
  const oldIsCategory = typeof old === "string" && (CATEGORIES as readonly string[]).includes(old);
  const hasNewPriority = typeof t.priority === "string"
    && (PRIORITIES as readonly string[]).includes(t.priority as string);

  if (oldIsPriority && (!hasNewPriority || t.priority === DEFAULT_PRIORITY)) {
    // The old single axis: `type` held the priority. A priority that is only the
    // default does not outrank real information. The category stays unset —
    // inventing one would be a judgement nobody made, and the audit will ask.
    t.priority = old;
    t.type = null;
  } else if (hasNewPriority) {
    t.type = oldIsCategory ? old : null;
  } else {
    t.priority = DEFAULT_PRIORITY;
    t.type = null;
  }
  if (!Array.isArray(t.stakeholders)) t.stakeholders = [];
  return t as unknown as Ticket;
}

/**
 * Bring any older save up to the current shape. Used by EVERY load path —
 * localStorage, the file endpoint, and a file the user picks. Skipping it on one
 * path means an old-shaped register arrives badly typed, which is how a rename
 * turns into undefined priorities and a board with nothing in it.
 */
export function migrateStore(parsed: unknown): Store {
  const s = parsed as Store;
  const tickets = (s.tickets as unknown[]).map(migrateTicket);
  return {
    ...s,
    history: Array.isArray(s.history) ? s.history : [],
    tickets,
    settings: {
      ...s.settings,
      sprints: migrateSprints(s.settings.sprints),
      projects: migrateProjects(s.settings.projects, tickets),
    },
  };
}

export function load(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return freshStore();
    const parsed: unknown = JSON.parse(raw);
    if (!looksValid(parsed)) return freshStore();
    return migrateStore(parsed);
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

/** Only the fields a person decides. Nothing else is asked for. */
export const blankTicket = (): Omit<Ticket, "id"> => ({
  name: "",
  summary: "",
  projects: [],
  externalUrl: null,
  dueDate: null,
  estimate: 2,
  priority: DEFAULT_PRIORITY,     // a new ask is unclassified until someone says otherwise
  type: null,                     // and its category is usually not known yet
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

/** Kept small on purpose: snapshots ride along inside the store, which is written
 *  to localStorage as well as to the file, and localStorage is not large. */
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

  // Load in WORK UNITS, not head count. A four-sprint ticket is four units of
  // the team's capacity, so it cannot be counted the same as a one-sprint one.
  const load = new Map(eligible.map((sp) => [sp.name, loadUnits(s.tickets, sp.name)]));

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
  let tooBig = 0;
  for (const t of candidates) {
    // The WHOLE estimate has to fit. Capacity is work, so room that is already
    // committed elsewhere cannot absorb this ticket — which is what stops the
    // proposal from shoving everything into the earliest releases.
    const room = eligible.filter((sp) => load.get(sp.name)! + t.estimate <= target);
    if (room.length === 0) {
      // Nothing takes this one. If not even a one-unit ticket would fit, nothing
      // later will either; otherwise it is just too large for the room left, and
      // a smaller ticket may still fit.
      if (!eligible.some((sp) => load.get(sp.name)! + 1 <= target)) break;
      if (t.estimate > target) tooBig += 1;
      continue;
    }
    // The release has to ship on or before the due date to be any use.
    const inTime = t.dueDate
      ? room.find((sp) => sp.release !== null && sp.release <= t.dueDate!)
      : room[0];
    const sprint = inTime ?? room[0];
    const next = load.get(sprint.name)! + t.estimate;
    load.set(sprint.name, next);

    const bits: string[] = [];
    if (t.priority === "Critical") bits.push("critical");
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
      reason: `${bits.join(", ")} → ${sprint.release ? `ships ${sprint.release}` : "no release date"} (${next}/${target} units)`,
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
  if (r.tooBig > 0) constraints.push(`${r.tooBig} too large for any release`);
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

/** Add a project to the controlled list. Blank names and duplicates are refused. */
export function addProject(s: Store, name: string): Store {
  const clean = name.trim();
  if (!clean || s.settings.projects.includes(clean)) return s;
  return { ...s, settings: { ...s.settings, projects: [...s.settings.projects, clean] } };
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

/** The revisit date on the most recent defer of a ticket, if it has one. */
export function revisitFor(s: Store, ticketId: number): string | null {
  for (let i = s.decisions.length - 1; i >= 0; i--) {
    const d = s.decisions[i];
    if (d.ticketId === ticketId && d.action === "Defer") return d.revisit;
  }
  return null;
}

/**
 * Deferred tickets whose revisit day has arrived, longest-waiting first.
 *
 * This is what makes a revisit date mean anything. Without it the date is
 * written into the decision log and never read again — a field that does
 * nothing, which is the failure this register exists to avoid.
 */
export function revisitDue(s: Store, now = new Date()): { ticket: Ticket; revisit: string }[] {
  return s.tickets
    .filter((t) => t.state === "Deferred")
    .map((t) => ({ ticket: t, revisit: revisitFor(s, t.id) }))
    .filter((x): x is { ticket: Ticket; revisit: string } => revisitIsDue(x.revisit, now))
    .sort((a, b) => a.revisit.localeCompare(b.revisit));
}

/**
 * The triage queue: work that has come back for revisiting leads, then the
 * undecided few. Revisits go first because they have waited longest.
 */
export function triageQueue(s: Store, skipped: number[] = [], now = new Date()): Ticket[] {
  const back = revisitDue(s, now).map((x) => x.ticket);
  return [...back, ...undecided(s)].filter((t) => !skipped.includes(t.id));
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
