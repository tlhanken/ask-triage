/**
 * schema.ts — the data model. Pure logic, no DOM.
 *
 * Revel priority tracker. A ticket is the unit.
 *
 * FIELD DISCIPLINE: every stored field must drive a decision or a view.
 * If it only adds colour, it does not belong here. The editor asks only
 * for what a human must decide; everything else is stamped by the app.
 *
 * PROJECTS below is the typesafe list — edit it here and every view
 * (form dropdowns, chips, the project view) follows automatically.
 */

export const PROJECTS = ["Atlas", "Borealis", "Cinder", "Delta", "Platform"] as const;
export type ProjectId = (typeof PROJECTS)[number];

export const TICKET_TYPES = ["Critical", "Should", "Nice-to-have"] as const;
export type TicketType = (typeof TICKET_TYPES)[number];

/** How long it is expected to take, in sprints. 3 reads as "three or more". */
export const ESTIMATES = [1, 2, 3] as const;
export type Estimate = (typeof ESTIMATES)[number];

export const estimateLabel = (n: Estimate): string =>
  n >= 3 ? "3+ sprints" : `${n} sprint${n === 1 ? "" : "s"}`;

export const STATES = [
  "New",
  "Accepted-Backlog",
  "Committed",
  "In Progress",
  "Blocked",
  "Deferred",
  "Won't Do",
  "Done",
] as const;
export type State = (typeof STATES)[number];

export const FLAGS = ["UNPLANNED", "DATE-RISK", "SLIPPED", "STALE", "NO-DATE-OLD"] as const;
export type Flag = (typeof FLAGS)[number];

export const DECISIONS = ["Accept", "Defer", "Decline", "Block"] as const;
export type DecisionAction = (typeof DECISIONS)[number];

export const CLOSED: State[] = ["Done", "Won't Do"];
export const OPEN_STATES: State[] = STATES.filter((s) => !CLOSED.includes(s)) as State[];

/**
 * Three tiers. Only CORE is asked for; OPTIONAL is one click away; BACKGROUND
 * is set by the app or the loop and is shown but never hand-entered. Anything
 * not in these lists does not belong on a ticket.
 */
export const CORE_FIELDS = ["name", "summary", "projects", "externalUrl", "dueDate", "estimate"] as const;
export const OPTIONAL_FIELDS = ["type", "stakeholders", "notes"] as const;
export const BACKGROUND_FIELDS = ["state", "opened", "sprint", "carryovers", "lastTouched", "closed"] as const;

export interface Ticket {
  id: number;

  // ---- core: what a person decides
  name: string;                  // short title
  summary: string;               // what it is / why it exists
  projects: ProjectId[];         // relevant projects, from the typesafe list
  externalUrl: string | null;    // external ticket link (its label is derived)
  dueDate: string | null;        // ISO date; null = no hard date
  estimate: Estimate;            // how many sprints of work this is

  // ---- optional: available, never required
  type: TicketType;              // Critical / Should / Nice-to-have
  stakeholders: string[];        // who is told about it
  notes: string;                 // freeform context that has nowhere else to live

  // ---- background metadata: set by the app or the triage loop
  state: State;
  opened: string | null;         // stamped on create
  sprint: string | null;         // e.g. "v0.23"; set by the board or triage
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
  currentSprint: string;
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
  currentSprint: "v0.23",
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

export interface DerivedTicket extends Ticket {
  score: number;
  flags: Flag[];
  ageDays: number | null;
  daysToDue: number | null;
  waitedLabel: string;
  /** True when the estimate cannot finish before the due date allows. */
  overEstimate: boolean;
}

const MS_DAY = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");

/** Local-date ISO (yyyy-mm-dd) — avoids the UTC off-by-one on evening edits. */
export const iso = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

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

/** The default release plan. v0.23 is current: it freezes soon and ships in two weeks. */
export const DEFAULT_SPRINT_NAMES = ["v0.25", "v0.24", "v0.23", "v0.22", "v0.21"]; // newest left

export function defaultSprints(now = new Date()): Sprint[] {
  const plan: Array<[string, number, number]> = [
    ["v0.25", 42, 56], ["v0.24", 28, 42], ["v0.23", 5, 14], ["v0.22", -9, 0], ["v0.21", -23, -14],
  ];
  return plan.map(([name, freezeIn, releaseIn]) => ({
    name, freeze: isoFrom(now, freezeIn), release: isoFrom(now, releaseIn),
  }));
}

const isoFrom = (now: Date, inDays: number): string => {
  const d = new Date(now.getTime() + inDays * MS_DAY);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const sprintNames = (s: Settings): string[] => s.sprints.map((x) => x.name);

export const findSprint = (s: Settings, name: string | null): Sprint | undefined =>
  name ? s.sprints.find((x) => x.name === name) : undefined;

/** Frozen: the freeze date has arrived, so new scope is a deliberate decision. */
export const isFrozen = (sp: Sprint | undefined, now = new Date()): boolean =>
  !!sp && sp.freeze !== null && daysSince(sp.freeze, now)! >= 0;

/** Shipped: the release date has arrived. */
export const hasShipped = (sp: Sprint | undefined, now = new Date()): boolean =>
  !!sp && sp.release !== null && daysSince(sp.release, now)! >= 0;

export const daysToRelease = (sp: Sprint | undefined, now = new Date()): number | null =>
  sp && sp.release ? -daysSince(sp.release, now)! : null;

export const isOpen = (t: Ticket): boolean => !CLOSED.includes(t.state);

export const backlog = (ts: Ticket[]): Ticket[] => ts.filter((t) => isOpen(t) && !t.sprint);

export const inSprint = (ts: Ticket[], sprint: string): Ticket[] => ts.filter((t) => t.sprint === sprint);

export const forProject = (ts: Ticket[], p: ProjectId): Ticket[] =>
  ts.filter((t) => t.projects.includes(p));

/** The label for an external link, derived rather than stored (e.g. "PX-118"). */
export function externalLabel(url: string | null | undefined): string {
  if (!url) return "";
  const m = url.replace(/\/+$/, "").match(/[^/]+$/);
  return m ? m[0] : url;
}

/** Flags surface contradictions, not status. */
export function computeFlags(t: Ticket, s: Settings, now = new Date()): Flag[] {
  const out: Flag[] = [];
  const live = isOpen(t);
  const age = daysSince(t.opened, now);
  const toDue = t.dueDate ? -daysSince(t.dueDate, now)! : null;

  if (t.type === "Critical" && !t.sprint) out.push("UNPLANNED");
  if (live && toDue !== null && toDue <= s.weights.dueRiskDays) out.push("DATE-RISK");
  if (live && t.carryovers >= s.weights.slippageThreshold) out.push("SLIPPED");
  if (live && t.lastTouched && daysSince(t.lastTouched, now)! > s.weights.staleDays) out.push("STALE");
  if (live && age !== null && age > s.weights.noDateOldDays && !t.dueDate) out.push("NO-DATE-OLD");
  return out;
}

/** Draft priority score. A proposal the human overrides, never the verdict. */
export function scoreTicket(t: Ticket, s: Settings, now = new Date()): number {
  const w = s.weights;
  let n = t.type === "Critical" ? w.critical : t.type === "Should" ? w.should : 0;
  const toDue = t.dueDate ? -daysSince(t.dueDate, now)! : null;
  if (toDue !== null) n += Math.max(0, w.urgencyHorizonDays - toDue) * w.urgencyPerDay;
  const age = daysSince(t.opened, now);
  if (age !== null) n += (Math.min(age, 365) / 30) * w.agePer30Days;
  n += t.carryovers * w.perCarryover;
  n += t.estimate <= 1 ? w.smallBonus : t.estimate === 2 ? w.smallBonus * 0.5 : 0;
  return Math.round(n);
}

function waitedLabel(t: Ticket, now: Date): string {
  const age = daysSince(t.opened, now);
  if (age === null) return "—";
  return age < 1 ? "today" : `${age}d`;
}

export function derive(t: Ticket, s: Settings, now = new Date()): DerivedTicket {
  const toDue = t.dueDate ? -daysSince(t.dueDate, now)! : null;
  return {
    ...t,
    score: scoreTicket(t, s, now),
    flags: computeFlags(t, s, now),
    ageDays: daysSince(t.opened, now),
    daysToDue: toDue,
    waitedLabel: waitedLabel(t, now),
    // a release cadence of sprintLengthDays is the only way to turn an estimate
    // in sprints into days, so keep the comparison in days
    overEstimate: toDue !== null && toDue < t.estimate * s.sprintLengthDays,
  };
}

/** Little's Law: average time a ticket sits in the system. */
export function queueHealth(tickets: Ticket[], s: Settings) {
  const open = tickets.filter(isOpen).length;
  return {
    open,
    avgWaitWeeks: s.throughputPerWeek > 0 ? open / s.throughputPerWeek : Infinity,
    netGrowthPerWeek: s.intakePerWeek - s.throughputPerWeek,
  };
}

export const label = (id: number): string => `TKT-${String(id).padStart(2, "0")}`;
