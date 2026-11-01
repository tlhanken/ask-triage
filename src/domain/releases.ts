/**
 * Releases in time: ship-date order, the span a ticket occupies, load against
 * capacity, frozen and shipped, the derived current release, and the date fit of
 * scheduled work (ships late, starts too late).
 */
import { addDays, daysSince, daysUntil, iso, parseDate } from "./dates";
import { isOpen, type Settings, type Sprint, type Ticket } from "./schema";

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
