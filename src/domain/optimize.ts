/**
 * Auto-optimize: propose ship releases for ready work, explain the proposal
 * (including an empty one), and apply it. Also the release-date repair.
 */
import { derive, isReady } from "./assess";
import { addDays, iso } from "./dates";
import { compareSprints, fillState, hasShipped, isFrozen, releaseOrder } from "./releases";
import { estimateLabel, isOpen, label, type Sprint } from "./schema";
import { moveTicketToSprint, type Store } from "./store";

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
 * Propose ship releases for ready tickets that have none.
 *
 * Conservative by design: it never moves work that is already scheduled, never
 * unschedules anything, and never places a ticket that is not ready, so a manual
 * arrangement survives. A ticket estimated at N sprints spans N releases ending
 * where it ships; every one of them must be unshipped and have a unit free, and
 * the ship release must not be frozen, because a freeze is about what ships.
 *
 * A release with no date is still usable — it just cannot be checked against a
 * due date, so it sorts last and any dated ticket shipping there is flagged.
 * Returning an empty proposal always comes with a reason, since a button that
 * does nothing must say why.
 */
export function optimizePlan(s: Store, now = new Date()): OptimizeResult {
  const target = s.settings.commitTargetPerSprint;
  const order = releaseOrder(s.settings.sprints);

  const skipped: OptimizeResult["skipped"] = [];
  for (const sp of order) {
    if (hasShipped(sp, now)) skipped.push({ name: sp.name, reason: "shipped" });
    else if (isFrozen(sp, now)) skipped.push({ name: sp.name, reason: "frozen" });
  }
  const unshipped = order.filter((sp) => !hasShipped(sp, now));
  const eligible = unshipped.filter((sp) => !isFrozen(sp, now));

  // Load in span units: one per open ticket in each release it spans.
  const load = new Map(order.map((sp) => [sp.name, fillState(s.tickets, sp.name, s.settings).load]));

  const candidates = s.tickets
    .filter((t) => isOpen(t) && !t.sprint && (t.state === "New") && isReady(t))
    .map((t) => derive(t, s.settings, now))
    .sort((a, b) => {
      const dated = (a.dueDate ? 0 : 1) - (b.dueDate ? 0 : 1);
      if (dated !== 0) return dated;                        // dated work first
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      return b.score - a.score;                             // then by draft score
    });

  /** The span a ticket of length n would have shipping in `ship`, if it fits. */
  const spanAt = (ship: Sprint, n: number): Sprint[] | null => {
    const at = unshipped.findIndex((x) => x.name === ship.name);
    if (at - n + 1 < 0) return null;                        // would start in a shipped release
    const span = unshipped.slice(at - n + 1, at + 1);
    return span.every((x) => load.get(x.name)! + 1 <= target) ? span : null;
  };

  const moves: Move[] = [];
  let tooBig = 0;
  for (const t of candidates) {
    const n = t.estimate!;
    if (n > unshipped.length) { tooBig += 1; continue; }
    const fits = eligible.filter((sp) => spanAt(sp, n) !== null);
    if (fits.length === 0) continue;
    // The release has to ship on or before the due date to be any use.
    const inTime = t.dueDate ? fits.find((sp) => sp.release !== null && sp.release <= t.dueDate!) : fits[0];
    const ship = inTime ?? fits[0];
    const span = spanAt(ship, n)!;
    for (const x of span) load.set(x.name, load.get(x.name)! + 1);

    const bits: string[] = [];
    if (t.priority === "Critical") bits.push("critical");
    if (t.dueDate) bits.push(`due ${t.dueDate}`);
    bits.push(estimateLabel(t.estimate));

    const warning = !t.dueDate
      ? undefined
      : ship.release === null
        ? "this release has no date"
        : inTime
          ? undefined
          : "no release ships before its due date";

    const spanText = span.length > 1 ? `${span[0].name}–${ship.name}` : ship.name;
    moves.push({
      id: t.id,
      label: label(t.id),
      name: t.name,
      from: null,
      to: ship.name,
      reason: `${bits.join(", ")} → ${spanText}, ${ship.release ? `ships ${ship.release}` : "no release date"}`,
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
  if (r.tooBig > 0) constraints.push(`${r.tooBig} longer than the releases left`);
  if (r.candidates === 0) constraints.push("no ready ticket is unscheduled");
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

  // Freeze a week before shipping, matching the default plan's lead. The lead
  // matters: freeze-on-today would hand back a release that is already frozen,
  // which is exactly the state this action exists to repair.
  const lead = 7;
  const dates: Record<string, { freeze: string; release: string }> = {};
  undated.forEach((name, i) => {
    const releaseIn = (i + 1) * s.settings.sprintLengthDays;
    dates[name] = { freeze: iso(addDays(now, releaseIn - lead)), release: iso(addDays(now, releaseIn)) };
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
  return moves.reduce((acc, m) => moveTicketToSprint(acc, m.id, m.to, now), s);
}
