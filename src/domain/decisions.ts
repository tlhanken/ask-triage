/**
 * Decisions: accept, defer, decline, block, and release close-out (done, carry over,
 * back to backlog). Each is applied to the ticket and appended to the decision log,
 * which is never rewritten. Also when set-aside work comes back.
 */
import { isReady } from "./assess";
import { DEFAULT_REVISIT_WEEKS, iso, revisitInWeeks, revisitIsDue } from "./dates";
import { hasShipped, releaseOrder } from "./releases";
import { type DecisionAction, label, type Settings, type Ticket } from "./schema";
import { type Decision, patchTicket, type Store, updateTicket } from "./store";

/** Deferred work returns on the weekly revisit day — see REVISIT_WEEKDAY. */
export function defaultRevisit(now = new Date()): string {
  return revisitInWeeks(DEFAULT_REVISIT_WEEKS, now);
}

// ---------------------------------------------------------------- decisions

/** The release after `name` in ship order that has not shipped: where carried-over work goes. */
export function nextRelease(settings: Settings, name: string, now = new Date()): string | null {
  const order = releaseOrder(settings.sprints);
  const at = order.findIndex((x) => x.name === name);
  if (at < 0) return null;
  return order.slice(at + 1).find((x) => !hasShipped(x, now))?.name ?? null;
}

export function applyToTicket(t: Ticket, action: DecisionAction, settings: Settings, now: Date): Ticket {
  const today = iso(now);
  switch (action) {
    case "Accept":
      return patchTicket(t, { state: t.sprint ? "Committed" : "New" }, now);
    case "Defer":
      return patchTicket(t, { state: "Deferred", sprint: null }, now);
    case "Block":
      return patchTicket(t, { state: "Blocked", sprint: null }, now);
    case "Decline":
      return patchTicket(t, { state: "Won't Do", closed: today }, now);
    case "Done":
      return patchTicket(t, { state: "Done", closed: today }, now);
    case "Carry over": {
      const next = t.sprint ? nextRelease(settings, t.sprint, now) : null;
      if (!next) return t;
      // `planned` is left alone: carrying over is progress, not a new plan.
      return patchTicket(t, { sprint: next, carryovers: t.carryovers + 1, planned: t.planned }, now);
    }
    case "Unschedule":
      return patchTicket(t, { state: "New", sprint: null }, now);
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
  const next = applyToTicket(prev, action, s.settings, now);
  if (next === prev) return s;
  const decision: Decision = {
    id: s.nextDecisionId,
    at: now.toISOString(),
    ticketId: prev.id,
    ticketLabel: `${label(prev.id)} — ${prev.name}`,
    projects: [...prev.projects],
    action,
    reason,
    revisit,
    sprint: next.sprint ?? (action === "Done" ? prev.sprint : null),
  };
  const tickets = s.tickets.slice();
  tickets[idx] = next;
  return { ...s, tickets, decisions: [...s.decisions, decision], nextDecisionId: s.nextDecisionId + 1 };
}

/**
 * Edit a ticket — the one way every screen edits one (the Fill out card, the
 * editor, the project table). If the edit answers the last required field, the
 * ticket is accepted: it moves to Schedule, and the decision log says so.
 */
export function editTicket(s: Store, id: number, patch: Partial<Ticket>, now = new Date()): Store {
  const before = s.tickets.find((t) => t.id === id);
  if (!before) return s;
  const edited = updateTicket(s, id, patch, now);
  const after = edited.tickets.find((t) => t.id === id)!;
  const accepted = !isReady(before) && isReady(after) && (after.state === "New" || after.state === "Committed");
  return accepted ? recordDecision(edited, id, "Accept", "filled out", null, now) : edited;
}

// ---------------------------------------------------------------- the plan pipeline

/** The most recent defer or block of a ticket: its revisit day and the reason given. */
export function lastSetAside(s: Store, ticketId: number): Decision | null {
  for (let i = s.decisions.length - 1; i >= 0; i--) {
    const d = s.decisions[i];
    if (d.ticketId === ticketId && (d.action === "Defer" || d.action === "Block")) return d;
  }
  return null;
}

export interface Returned {
  ticket: Ticket;
  revisit: string;
  /** Why it was set aside: the block reason, or the deferral's. */
  reason: string;
}

/**
 * Deferred and blocked tickets whose revisit day has arrived, longest-waiting first.
 *
 * This is what makes a revisit date mean anything. Without it the date is
 * written into the decision log and never read again.
 */
export function revisitDue(s: Store, now = new Date()): Returned[] {
  return s.tickets
    .filter((t) => t.state === "Deferred" || t.state === "Blocked")
    .map((t) => ({ t, d: lastSetAside(s, t.id) }))
    .filter((x) => revisitIsDue(x.d?.revisit, now))
    .map((x) => ({ ticket: x.t, revisit: x.d!.revisit!, reason: x.d!.reason }))
    .sort((a, b) => a.revisit.localeCompare(b.revisit));
}

export type CloseOutChoice = "Done" | "Carry over" | "Unschedule";

/** Apply the close-out choices that were made. Undecided tickets are simply absent. */
export function applyCloseOut(
  s: Store, choices: { id: number; choice: CloseOutChoice }[], now = new Date(),
): Store {
  return choices.reduce((acc, c) => {
    const reason = c.choice === "Done" ? "shipped" : c.choice === "Carry over" ? "did not ship" : "back to backlog";
    return recordDecision(acc, c.id, c.choice, reason, null, now);
  }, s);
}
