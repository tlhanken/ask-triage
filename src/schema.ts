/**
 * schema.ts — the data model. Pure logic, no DOM.
 *
 * Priority tracker. A ticket is the unit.
 *
 * FIELD DISCIPLINE: every stored field must drive a decision or a view.
 * If it only adds colour, it does not belong here. The editor asks only
 * for what a human must decide; everything else is stamped by the app.
 *
 * DEFAULT_PROJECTS below seeds a new register. The list itself lives in the
 * store's settings so projects can be added and removed at runtime — see
 * addProject and removeProject in store.ts.
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
  currentSprint: "v0.23",
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

/** The release names in display order. Used by the tests; kept here as the accessor. */
export const sprintNames = (s: Settings): string[] => s.sprints.map((x) => x.name);

/**
 * A release's load, in WORK UNITS: the sum of its open tickets' estimates.
 *
 * Counting tickets instead treats a three-sprint ticket as equal to a
 * one-sprint ticket, which is how a release reads "8/8, at target" while
 * carrying triple the work. Capacity and estimates then speak the same unit,
 * in the same way the estimate already earns its place by being comparable to
 * a due date.
 */
export function loadUnits(tickets: Ticket[], release: string): number {
  return tickets
    .filter((t) => isOpen(t) && t.sprint === release)
    .reduce((n, t) => n + t.estimate, 0);
}

export type FillState = "room" | "full" | "over";

/** How full a release is against its capacity, in work units. */
export function fillState(
  tickets: Ticket[], release: string, capacity: number,
): { load: number; room: number; state: FillState } {
  const load = loadUnits(tickets, release);
  const room = capacity - load;
  return { load, room, state: room < 0 ? "over" : room === 0 ? "full" : "room" };
}

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

/**
 * Deferred work comes back on ONE day a week, not on a spread of daily dates.
 *
 * A day-granular revisit for a register this size produces a trickle that
 * arrives five mornings a week and gets skimmed. Weekly revisits arrive in a
 * single batch, on the day the weekly triage already runs, so deferring costs
 * one decision now and one look later instead of a low-grade daily nag.
 */
export const REVISIT_WEEKDAY = 1;                 // Monday

export const REVISIT_WEEK_CHOICES = [1, 2, 4, 8] as const;
export const DEFAULT_REVISIT_WEEKS = 4;

/** Days from `from` to the next revisit day, strictly after it. */
export function daysToRevisitDay(from = new Date(), weekday = REVISIT_WEEKDAY): number {
  const delta = (weekday - from.getDay() + 7) % 7;
  return delta === 0 ? 7 : delta;                 // today IS the day, so a full week out
}

/** The revisit day n weeks out. n = 1 is the next one, and every result lands on REVISIT_WEEKDAY. */
export function revisitInWeeks(n: number, from = new Date(), weekday = REVISIT_WEEKDAY): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  d.setDate(d.getDate() + daysToRevisitDay(from, weekday) + (n - 1) * 7);
  return iso(d);
}

/** A recorded revisit is due once its day has arrived. */
export function revisitIsDue(revisit: string | null | undefined, now = new Date()): boolean {
  if (!revisit) return false;
  const days = daysSince(revisit, now);
  return days !== null && days >= 0;
}

export const isOpen = (t: Ticket): boolean => !CLOSED.includes(t.state);

export const backlog = (ts: Ticket[]): Ticket[] => ts.filter((t) => isOpen(t) && !t.sprint);

export const inSprint = (ts: Ticket[], sprint: string): Ticket[] => ts.filter((t) => t.sprint === sprint);

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

/** What an audit looks for: data missing where it matters, and work going wrong. */
export type AlertSeverity = "gap" | "risk";

export interface Alert {
  kind: string;
  severity: AlertSeverity;
  what: string;
  /** Why it matters. An alert with no stated consequence is noise. */
  why: string;
}

/** The consequence of each contradiction flag, for the sweep to show. */
const FLAG_WHY: Record<Flag, { what: string; why: (s: Settings) => string }> = {
  UNPLANNED: { what: "Unplanned", why: () => "Marked critical, but committed to no release." },
  "DATE-RISK": { what: "Date risk", why: (s) => `Due within ${s.weights.dueRiskDays} days and not started.` },
  SLIPPED: { what: "Slipped", why: (s) => `Carried over ${s.weights.slippageThreshold} times already.` },
  STALE: { what: "Stale", why: (s) => `Untouched for over ${s.weights.staleDays} days.` },
  "NO-DATE-OLD": { what: "Old, no date", why: (s) => `Open over ${s.weights.noDateOldDays} days with no due date, so nothing can measure it.` },
};

/**
 * Everything a sweep should raise on one ticket.
 *
 * Two families. GAPS are data missing where its absence has a consequence — the
 * optional tier means these are never REQUIRED to save, but that is not the same
 * as being fine to leave out. RISKS are work going wrong quietly: past its date,
 * left behind in a shipped release, too large to finish in time, or carrying one
 * of the contradiction flags.
 */
export function auditTicket(t: Ticket, s: Settings, now = new Date()): Alert[] {
  const out: Alert[] = [];
  const live = isOpen(t);

  if (!t.summary.trim()) {
    out.push({ kind: "NO-SUMMARY", severity: "gap", what: "No summary",
      why: "Nothing records what this is or why it exists." });
  }
  if (t.projects.length === 0) {
    out.push({ kind: "NO-PROJECTS", severity: "gap", what: "No project",
      why: "It appears in no project update, so nobody but you will ever see it." });
  }
  if (t.stakeholders.length === 0) {
    out.push({ kind: "NO-STAKEHOLDERS", severity: "gap", what: "Nobody waiting",
      why: "No stakeholder attached — worth checking this is still a real ask." });
  }
  if (live && (t.state === "Committed" || t.state === "In Progress") && !t.dueDate) {
    out.push({ kind: "COMMITTED-NO-DUE", severity: "gap", what: "Committed, no date",
      why: "Committed work with no due date cannot be late, so nothing will ever notice it slipping." });
  }

  if (!live) return out;                        // a closed ticket cannot slip

  const toDue = t.dueDate ? -daysSince(t.dueDate, now)! : null;
  if (toDue !== null && toDue < 0) {
    out.push({ kind: "PAST-DUE", severity: "risk", what: "Past due",
      why: `Its due date passed ${-toDue} day${-toDue === 1 ? "" : "s"} ago and it is still open.` });
  }

  const sp = findSprint(s, t.sprint);
  if (sp && hasShipped(sp, now)) {
    out.push({ kind: "SHIPPED-RELEASE", severity: "risk", what: "Left behind",
      why: `${sp.name} shipped ${daysSince(sp.release, now)} days ago and this is still open.` });
  }

  if (derive(t, s, now).overEstimate) {
    out.push({ kind: "WONT-FIT", severity: "risk", what: "Will not fit",
      why: `${estimateLabel(t.estimate)} of work cannot finish before its due date.` });
  }

  for (const f of computeFlags(t, s, now)) {
    out.push({ kind: f, severity: "risk", what: FLAG_WHY[f].what, why: FLAG_WHY[f].why(s) });
  }
  return out;
}

export interface AuditRow { ticket: Ticket; alerts: Alert[]; }

export interface AuditResult {
  /** Every ticket in scope, worst first. */
  rows: AuditRow[];
  tickets: number;
  withAlerts: number;
  alerts: number;
  gaps: number;
  risks: number;
}

/** Sweep the register. Worst first, so fixing from the top shrinks the list. */
export function audit(
  tickets: Ticket[], s: Settings, opts: { includeClosed?: boolean } = {}, now = new Date(),
): AuditResult {
  const rows: AuditRow[] = tickets
    .filter((t) => opts.includeClosed || isOpen(t))
    .map((t) => ({ ticket: t, alerts: auditTicket(t, s, now) }))
    .sort((a, b) =>
      b.alerts.length - a.alerts.length
      || scoreTicket(b.ticket, s, now) - scoreTicket(a.ticket, s, now));

  const all = rows.flatMap((r) => r.alerts);
  return {
    rows,
    tickets: rows.length,
    withAlerts: rows.filter((r) => r.alerts.length > 0).length,
    alerts: all.length,
    gaps: all.filter((a) => a.severity === "gap").length,
    risks: all.filter((a) => a.severity === "risk").length,
  };
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
