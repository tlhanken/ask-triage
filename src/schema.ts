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
 * yet, which is what the completeness check and the audit are for.
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

export interface DerivedTicket extends Ticket {
  score: number;
  flags: Flag[];
  ageDays: number | null;
  daysToDue: number | null;
  waitedLabel: string;
  /** True when its ship release ships after its due date. */
  shipsLate: boolean;
}

const MS_DAY = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");

/** Local-date ISO (yyyy-mm-dd) — avoids the UTC off-by-one on evening edits. */
export const iso = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * The local day `n` calendar days from `d`, at midnight. Adding n × 24 hours
 * instead skips or repeats a date when the span crosses a DST change late at
 * night, so every "N days from now" goes through here.
 */
export const addDays = (d: Date, n: number): Date =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/**
 * A stored timestamp (UTC ISO, which is right for storage) as the LOCAL date and
 * time a person reads. Slicing the stored string instead shows UTC, which in the
 * evening west of Greenwich is already tomorrow.
 */
export function localStamp(at: string): string {
  const d = new Date(at);
  return `${iso(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

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
    name, freeze: iso(addDays(now, freezeIn)), release: iso(addDays(now, releaseIn)),
  }));
}

/** Version strings compared numerically: v0.9 before v0.21. */
export function compareSprints(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true });
}

/**
 * Releases in the order they ship: by release date, then the undated ones in
 * version order. This is the order spans count through and auto-optimize fills.
 * It is NOT the board's display order, which the owner arranges.
 */
export function releaseOrder(sprints: Sprint[]): Sprint[] {
  return [...sprints].sort((a, b) => {
    if (a.release && b.release) return a.release.localeCompare(b.release) || compareSprints(a.name, b.name);
    if (a.release) return -1;
    if (b.release) return 1;
    return compareSprints(a.name, b.name);
  });
}

export interface Span {
  /** The releases the ticket occupies, in ship order, ending where it ships. */
  releases: string[];
  /** How many more releases the estimate needs than exist before the ship release. */
  short: number;
}

/**
 * The releases a scheduled ticket occupies: as many as its estimate, ending at the
 * one it ships in. A ticket with no estimate yet spans just its ship release.
 */
export function spanOf(t: Ticket, s: Settings): Span {
  if (!t.sprint) return { releases: [], short: 0 };
  const order = releaseOrder(s.sprints).map((x) => x.name);
  const at = order.indexOf(t.sprint);
  if (at < 0) return { releases: [], short: 0 };
  const n = t.estimate ?? 1;
  const start = at - n + 1;
  return { releases: order.slice(Math.max(0, start), at + 1), short: Math.max(0, -start) };
}

/**
 * A release's load, in WORK UNITS: one for each open ticket whose span includes it.
 *
 * A ticket that takes three sprints occupies three releases and costs one unit in
 * each, rather than three units in the release it ships in and none before.
 */
export function loadUnits(tickets: Ticket[], release: string, s: Settings): number {
  return tickets.filter((t) => isOpen(t) && spanOf(t, s).releases.includes(release)).length;
}

export type FillState = "room" | "full" | "over";

/** How full a release is against its capacity, in work units. */
export function fillState(
  tickets: Ticket[], release: string, s: Settings,
): { load: number; room: number; state: FillState } {
  const load = loadUnits(tickets, release, s);
  const room = s.commitTargetPerSprint - load;
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

/** Days from today until an ISO date — negative once it has passed. */
export const daysUntil = (isoDate: string | null | undefined, now = new Date()): number | null =>
  isoDate ? -daysSince(isoDate, now)! : null;

export const daysToRelease = (sp: Sprint | undefined, now = new Date()): number | null =>
  daysUntil(sp?.release, now);

/** The current release: the earliest, in ship order, that has neither shipped nor frozen. */
export const currentRelease = (s: Settings, now = new Date()): Sprint | undefined =>
  releaseOrder(s.sprints).find((sp) => !hasShipped(sp, now) && !isFrozen(sp, now));

/** Its ship release ships after its due date. An undated release cannot be checked. */
export function shipsLate(t: Ticket, s: Settings): boolean {
  const sp = findSprint(s, t.sprint);
  return !!(t.dueDate && sp?.release && sp.release > t.dueDate);
}

/**
 * It would have had to start in a release that had already shipped when the plan
 * was made — or before the first release there is.
 *
 * Judged as of `planned`, not today: once v0.23 ships, a ticket spanning
 * v0.23–v0.24 has a shipped release in its span, and that is progress, not lateness.
 */
export function startsTooLate(t: Ticket, s: Settings): boolean {
  if (!isOpen(t) || !t.sprint) return false;
  const span = spanOf(t, s);
  if (span.short > 0) return true;
  const first = findSprint(s, span.releases[0] ?? null);
  return !!(first && t.planned && hasShipped(first, parseDate(t.planned)));
}

/** Derived "in progress": its span has reached the current release, or it is due at close-out. */
export function beingWorkedOn(t: Ticket, s: Settings, now = new Date()): boolean {
  if (!isOpen(t) || !t.sprint) return false;
  if (hasShipped(findSprint(s, t.sprint), now)) return true;
  const cur = currentRelease(s, now);
  if (!cur) return false;
  const order = releaseOrder(s.sprints).map((x) => x.name);
  const first = spanOf(t, s).releases[0];
  return first !== undefined && order.indexOf(first) <= order.indexOf(cur.name);
}

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
  const toDue = daysUntil(t.dueDate, now);

  if (t.priority === "Critical" && !t.sprint) out.push("UNPLANNED");
  if (live && toDue !== null && toDue <= s.weights.dueRiskDays) out.push("DATE-RISK");
  if (live && t.carryovers >= s.weights.slippageThreshold) out.push("SLIPPED");
  if (live && t.lastTouched && daysSince(t.lastTouched, now)! > s.weights.staleDays) out.push("STALE");
  if (live && age !== null && age > s.weights.noDateOldDays && !t.dueDate && !t.noHardDate) out.push("NO-DATE-OLD");
  return out;
}

/** An alert: what is wrong, and why it matters. Gaps are missing data; risks are work going wrong. */
export type AlertSeverity = "gap" | "risk";

export interface Alert {
  kind: string;
  severity: AlertSeverity;
  what: string;
  /** Why it matters. An alert with no stated consequence is noise. */
  why: string;
}

/** The consequence of each contradiction flag, for Check to show. */
const FLAG_WHY: Record<Flag, { what: string; why: (s: Settings) => string }> = {
  UNPLANNED: { what: "Unplanned", why: () => "Marked critical, but committed to no release." },
  "DATE-RISK": { what: "Date risk", why: (s) => `Due within ${s.weights.dueRiskDays} days.` },
  SLIPPED: { what: "Slipped", why: (s) => `Carried over ${s.weights.slippageThreshold} times already.` },
  STALE: { what: "Stale", why: (s) => `Untouched for over ${s.weights.staleDays} days.` },
  "NO-DATE-OLD": { what: "Old, no date", why: (s) => `Open over ${s.weights.noDateOldDays} days with no due date, so nothing can measure it.` },
};

/** The fields that hold a ticket in Fill out until they are answered. */
export const REQUIRED_FIELDS = ["priority", "type", "estimate", "dueDate"] as const;
export type RequiredField = (typeof REQUIRED_FIELDS)[number];

/** Why each required field matters: shown on the Fill out card. */
export const REQUIRED_WHY: Record<RequiredField, { what: string; why: string }> = {
  priority: { what: "Priority", why: "Nothing to rank it by, so auto-optimize cannot order it." },
  type: { what: "Type", why: "Not marked Front-end / Back-end / Driver / Server, so per-team capacity cannot count it." },
  estimate: { what: "Estimate", why: "No length in sprints, so it cannot be given a span or checked against capacity." },
  dueDate: { what: "Due date", why: "No date and no explicit \"no hard date\", so no release can be judged as in time." },
};

/** Required fields this ticket has not answered. */
export function missingRequired(t: Ticket): RequiredField[] {
  const out: RequiredField[] = [];
  if (t.priority === null) out.push("priority");
  if (t.type === null) out.push("type");
  if (!isEstimate(t.estimate)) out.push("estimate");
  if (!t.dueDate && !t.noHardDate) out.push("dueDate");
  return out;
}

/** Ready to schedule: auto-optimize has everything it needs to place it. */
export const isReady = (t: Ticket): boolean => missingRequired(t).length === 0;

/** Details that would still help but never hold a ticket back. */
export function nudges(t: Ticket): Alert[] {
  const out: Alert[] = [];
  if (!isOpen(t)) return out;
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
  return out;
}

/**
 * What is going wrong with one ticket: Check's per-ticket items.
 *
 * Closed work cannot slip, so it raises nothing. Release-level problems (over
 * capacity, scope after freeze) need the whole register and are added in the store.
 */
export function riskAlerts(t: Ticket, s: Settings, now = new Date()): Alert[] {
  const out: Alert[] = [];
  if (!isOpen(t)) return out;

  const toDue = daysUntil(t.dueDate, now);
  if (toDue !== null && toDue < 0) {
    out.push({ kind: "PAST-DUE", severity: "risk", what: "Past due",
      why: `Its due date passed ${-toDue} day${-toDue === 1 ? "" : "s"} ago and it is still open.` });
  }
  if (shipsLate(t, s)) {
    const sp = findSprint(s, t.sprint)!;
    out.push({ kind: "WONT-FIT", severity: "risk", what: "Ships late",
      why: `${sp.name} ships ${sp.release}, after its due date of ${t.dueDate}.` });
  }
  if (startsTooLate(t, s)) {
    const span = spanOf(t, s);
    out.push({ kind: "STARTS-LATE", severity: "risk", what: "Starts too late",
      why: span.short > 0
        ? `${estimateLabel(t.estimate)} of work needs ${span.short} more release${span.short === 1 ? "" : "s"} before ${t.sprint} than there are.`
        : `${estimateLabel(t.estimate)} of work would have had to start in ${span.releases[0]}, which had already shipped.` });
  }
  for (const f of computeFlags(t, s, now)) {
    out.push({ kind: f, severity: "risk", what: FLAG_WHY[f].what, why: FLAG_WHY[f].why(s) });
  }
  return out;
}

/** Draft priority score. A proposal the human overrides, never the verdict. */
export function scoreTicket(t: Ticket, s: Settings, now = new Date()): number {
  const w = s.weights;
  let n = t.priority === "Critical" ? w.critical : t.priority === "Should" ? w.should : 0;
  const est = t.estimate ?? 0;
  const toDue = daysUntil(t.dueDate, now);
  if (toDue !== null) n += Math.max(0, w.urgencyHorizonDays - toDue) * w.urgencyPerDay;
  const age = daysSince(t.opened, now);
  if (age !== null) n += (Math.min(age, 365) / 30) * w.agePer30Days;
  n += t.carryovers * w.perCarryover;
  n += est === 1 ? w.smallBonus : est === 2 ? w.smallBonus * 0.5 : 0;
  return Math.round(n);
}

function waitedLabel(t: Ticket, now: Date): string {
  const age = daysSince(t.opened, now);
  if (age === null) return "—";
  return age < 1 ? "today" : `${age}d`;
}

export function derive(t: Ticket, s: Settings, now = new Date()): DerivedTicket {
  const toDue = daysUntil(t.dueDate, now);
  return {
    ...t,
    score: scoreTicket(t, s, now),
    flags: computeFlags(t, s, now),
    ageDays: daysSince(t.opened, now),
    daysToDue: toDue,
    waitedLabel: waitedLabel(t, now),
    shipsLate: shipsLate(t, s),
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
