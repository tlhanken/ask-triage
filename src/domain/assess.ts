/**
 * Judging one ticket: what it is missing (readiness and nudges), what is going wrong
 * (flags and risk alerts, each with the reason it matters), and its draft score.
 */
import { daysSince, daysUntil } from "./dates";
import { findSprint, shipsLate, spanOf, startsTooLate } from "./releases";
import { estimateLabel, type Flag, isEstimate, isOpen, type Settings, type Ticket } from "./schema";

export interface DerivedTicket extends Ticket {
  score: number;
  flags: Flag[];
  ageDays: number | null;
  daysToDue: number | null;
  waitedLabel: string;
  /** True when its ship release ships after its due date. */
  shipsLate: boolean;
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
  };
}
