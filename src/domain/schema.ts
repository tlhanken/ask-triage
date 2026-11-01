/**
 * The data model: tickets, releases and settings, and the fixed lists they draw on.
 * Types and constants only, plus the few labels derived straight from them.
 *
 * FIELD DISCIPLINE: every stored field must drive a decision, a flag, a score term
 * or a view. Anything that only restates other data is derived, never stored.
 */

/** The projects a fresh register starts with. */
export const DEFAULT_PROJECTS = ["Atlas", "Borealis", "Cinder", "Delta", "Platform"];

/** A project name. A plain string now that the list is data rather than a union. */
export type ProjectId = string;

/**
 * How many suggestions a picker renders at once.
 *
 * Rendering every match is what breaks a picker at a few hundred projects: the
 * list stops being scannable long before it stops being fast. The count of what
 * was left out is shown, so the cap narrows without hiding anything.
 */
export const PROJECT_SUGGESTION_CAP = 50;

export interface ProjectMatches<T extends string = string> {
  /** The suggestions to render, capped. */
  shown: T[];
  /** How many matched before the cap. */
  total: number;
  /** How many are in the list and not already chosen. */
  available: number;
}

/**
 * Filter a controlled list for a picker.
 *
 * Prefix matches rank above substring ones, because with a few hundred projects
 * typing "plat" must offer "Platform" before "WebPlatform". Ties keep the list's
 * own order, so the author's arrangement shows through.
 */
export function matchProjects<T extends string>(
  query: string,
  selected: readonly T[],
  all: readonly T[],
  cap = PROJECT_SUGGESTION_CAP,
): ProjectMatches<T> {
  const pool = all.filter((p) => !selected.includes(p));
  const q = query.trim().toLowerCase();
  if (!q) return { shown: pool.slice(0, cap), total: pool.length, available: pool.length };

  const order = new Map(all.map((p, i) => [p, i] as const));
  const matched = pool
    .filter((p) => p.toLowerCase().includes(q))
    .sort((a, b) =>
      Number(!a.toLowerCase().startsWith(q)) - Number(!b.toLowerCase().startsWith(q))
      || (order.get(a) ?? 0) - (order.get(b) ?? 0));

  return { shown: matched.slice(0, cap), total: matched.length, available: pool.length };
}

/**
 * Priority is how much this matters. It was called `type`, which never said what
 * it meant.
 *
 * A ticket's priority is null until someone chooses one: a default would stand in
 * for a decision nobody made. "Unclassified" is only how null is shown.
 */
export const PRIORITIES = ["Critical", "Should", "Nice-to-have"] as const;

export type Priority = (typeof PRIORITIES)[number];

export const priorityLabel = (p: Priority | null): string => p ?? "Unclassified";

/** Sort rank: Critical first, unset last. */
export const priorityRank = (p: Priority | null): number => (p === null ? PRIORITIES.length : PRIORITIES.indexOf(p));

/**
 * Type is which part of the system the work sits in — a different axis from
 * priority, and deliberately allowed to be unset. At intake you often do not know
 * yet; Fill out asks for it before the ticket can be scheduled.
 */
export const CATEGORIES = ["Front-end", "Back-end", "Driver", "Server"] as const;

export type Category = (typeof CATEGORIES)[number];

/** How long it is expected to take: a whole number of sprints, or null until decided. */
export const isEstimate = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 1;

export const estimateLabel = (n: number | null): string =>
  n === null ? "no estimate" : `${n} sprint${n === 1 ? "" : "s"}`;

/**
 * Open work is New (no release) or Committed (has a ship release). Blocked and
 * Deferred come back on a revisit day. "In progress" is not stored: it is derived
 * from the release order (see beingWorkedOn).
 */
export const STATES = ["New", "Committed", "Blocked", "Deferred", "Won't Do", "Done"] as const;

export type State = (typeof STATES)[number];

export const FLAGS = ["UNPLANNED", "DATE-RISK", "SLIPPED", "STALE", "NO-DATE-OLD"] as const;

export type Flag = (typeof FLAGS)[number];

/** Accept is recorded when Fill out finishes a ticket, or returned work is taken on.
 *  Done and Carry over come from release close-out; Unschedule is "back to backlog". */
export const DECISIONS = ["Accept", "Defer", "Decline", "Block", "Done", "Carry over", "Unschedule"] as const;

export type DecisionAction = (typeof DECISIONS)[number];

export const CLOSED: State[] = ["Done", "Won't Do"];

/**
 * Three tiers. Only CORE is asked for; OPTIONAL is one click away; BACKGROUND
 * is set by the app or the loop and is shown but never hand-entered. Anything
 * not in these lists does not belong on a ticket.
 */
export const CORE_FIELDS = [
  "name", "summary", "projects", "externalUrl", "dueDate", "noHardDate", "estimate", "priority", "type",
] as const;

export const OPTIONAL_FIELDS = ["stakeholders", "notes"] as const;

export const BACKGROUND_FIELDS = ["state", "opened", "sprint", "planned", "carryovers", "lastTouched", "closed"] as const;

export interface Ticket {
  id: number;

  // ---- core: what a person decides
  name: string;                  // short title
  summary: string;               // what it is / why it exists
  projects: ProjectId[];         // relevant projects, from the typesafe list
  externalUrl: string | null;    // external ticket link (its label is derived)
  dueDate: string | null;        // ISO date; null = not answered, unless noHardDate
  noHardDate: boolean;           // chosen: there is no date to hit. Cleared by setting a date
  estimate: number | null;       // whole sprints of work; null = not estimated yet
  priority: Priority | null;     // Critical / Should / Nice-to-have; null = not chosen
  type: Category | null;         // Front-end / Back-end / Driver / Server; null = not known yet

  // ---- optional: available, never required
  stakeholders: string[];        // who is told about it
  notes: string;                 // freeform context that has nowhere else to live

  // ---- background metadata: set by the app
  state: State;
  opened: string | null;         // stamped on create
  sprint: string | null;         // the release it SHIPS in, e.g. "v0.24"; its span ends here
  planned: string | null;        // day the ship release or estimate was last set by a person
  carryovers: number;            // bumped when a release ships without it
  lastTouched: string | null;    // stamped on every edit
  closed: string | null;         // stamped on Done / Won't Do
}

/** A release on the board: when it stops taking new scope, and when it ships. */
export interface Sprint {
  name: string;                // "v0.23"
  freeze: string | null;       // ISO date — feature freeze
  release: string | null;      // ISO date — release date
}

export interface Settings {
  sprintLengthDays: number;
  commitTargetPerSprint: number;
  throughputPerWeek: number;
  intakePerWeek: number;
  /** The controlled project list. Data, not a compile-time union. */
  projects: string[];
  sprints: Sprint[],             // the release columns, in display order
  weights: {
    critical: number;
    should: number;
    urgencyHorizonDays: number;
    urgencyPerDay: number;
    agePer30Days: number;
    perCarryover: number;
    smallBonus: number;
    staleDays: number;
    dueRiskDays: number;
    noDateOldDays: number;
    slippageThreshold: number;   // carryovers at which SLIPPED fires
  };
}

export const DEFAULT_SETTINGS: Settings = {
  sprintLengthDays: 14,
  commitTargetPerSprint: 8,
  throughputPerWeek: 5,
  intakePerWeek: 7.5,
  projects: [...DEFAULT_PROJECTS],
  sprints: [],                   // freshStore() fills dated defaults; see defaultSprints()
  weights: {
    critical: 100,
    should: 30,
    urgencyHorizonDays: 45,
    urgencyPerDay: 2,
    agePer30Days: 1,
    perCarryover: 8,
    smallBonus: 10,
    staleDays: 21,
    dueRiskDays: 21,
    noDateOldDays: 90,
    slippageThreshold: 2,
  },
};

export const isOpen = (t: Ticket): boolean => !CLOSED.includes(t.state);

/** The label for an external link, derived rather than stored (e.g. "PX-118"). */
export function externalLabel(url: string | null | undefined): string {
  if (!url) return "";
  const m = url.replace(/\/+$/, "").match(/[^/]+$/);
  return m ? m[0] : url;
}

export const label = (id: number): string => `TKT-${String(id).padStart(2, "0")}`;
