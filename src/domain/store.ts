/**
 * The register: its stored shape, how it is read and written, and the plain
 * edits to tickets, releases and projects. Every function is pure (store in, store
 * out); App wraps each in withHistory so it is labelled and revertible.
 */
import { iso } from "./dates";
import { compareSprints, defaultSprints } from "./releases";
import { type DecisionAction, DEFAULT_PROJECTS, DEFAULT_SETTINGS, isOpen, type ProjectId, type Settings, type Sprint, type Ticket } from "./schema";
import { seedTickets } from "./seed";

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


export const clone = (t: Ticket): Ticket => ({
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
