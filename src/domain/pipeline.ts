/**
 * The Plan page's three queues, read-only: what to fill out, what to schedule,
 * what to check (with close-out), and the counts the header shows.
 */
import { type Alert, derive, isReady, nudges, riskAlerts } from "./assess";
import { nextRelease, type Returned, revisitDue } from "./decisions";
import { slippedIn } from "./history";
import { fillState, hasShipped, releaseOrder, spanOf } from "./releases";
import { isOpen, priorityRank, type Settings, type Ticket } from "./schema";
import { type Store } from "./store";

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

/** The span label for a scheduled ticket: "v0.23–v0.24", or its one release. */
export function spanLabel(t: Ticket, settings: Settings): string {
  const r = spanOf(t, settings).releases;
  return r.length > 1 ? `${r[0]}–${r[r.length - 1]}` : (r[0] ?? "");
}
