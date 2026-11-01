import { describe, expect, it } from "vitest";
import { parseDate } from "./dates";
import { findSprint, hasShipped, isFrozen, loadUnits, startsTooLate } from "./releases";
import { type Sprint } from "./schema";
import { revertTo, slippedIn, withHistory } from "./history";
import { applyPlan, explainPlan, fillReleaseDates, optimizePlan } from "./optimize";
import { freshStore, moveTicketToSprint, type Store, updateSprint, updateTicket } from "./store";
import { NOW, freezeClock, mk, readyStore } from "./test-fixtures";

freezeClock();

describe("auto-optimize", () => {
  it("only proposes for ready, open tickets that have no release", () => {
    let s = moveTicketToSprint(readyStore(), 1, "v0.24", NOW);
    s = updateTicket(s, 2, { estimate: null }, NOW);              // not ready any more
    const plan = optimizePlan(s, NOW).moves;
    expect(plan.map((m) => m.id)).not.toContain(1);
    expect(plan.map((m) => m.id)).not.toContain(2);
    for (const m of plan) expect(s.tickets.find((t) => t.id === m.id)!.sprint).toBeNull();
    expect(optimizePlan(freshStore(), NOW).candidates).toBe(0);    // nothing in the seed is ready
  });

  it("never proposes a span that includes a release that has already shipped", () => {
    const plan = optimizePlan(readyStore(2), NOW).moves;
    expect(plan.length).toBeGreaterThan(0);
    // two sprints: the earliest it can ship is v0.24 (spanning v0.23–v0.24)
    for (const m of plan) expect(["v0.24", "v0.25"]).toContain(m.to);
  });

  it("respects capacity in every release a ticket spans", () => {
    const s = readyStore(2);
    const applied = applyPlan(s, optimizePlan(s, NOW).moves, NOW);
    for (const name of ["v0.23", "v0.24", "v0.25"]) {
      expect(loadUnits(applied.tickets, name, applied.settings)).toBeLessThanOrEqual(s.settings.commitTargetPerSprint);
    }
  });

  it("will not ship a ticket where any release of its span is full", () => {
    const s = freshStore();
    const tight: Store = {
      ...s,
      settings: { ...s.settings, commitTargetPerSprint: 1 },
      tickets: [
        { ...mk({ id: 100, estimate: 1, state: "Committed", sprint: "v0.23", priority: "Should", type: "Driver" }), noHardDate: true },
        { ...mk({ id: 101, estimate: 2, state: "New", sprint: null, priority: "Should", type: "Driver" }), noHardDate: true },
      ],
    };
    const move = optimizePlan(tight, NOW).moves.find((m) => m.id === 101)!;
    expect(move.to).toBe("v0.25");                    // v0.24 would span the full v0.23
    expect(move.reason).toMatch(/v0.24–v0.25/);
  });

  it("reports work longer than the releases left", () => {
    const s = freshStore();
    const r = optimizePlan({
      ...s,
      tickets: [{ ...mk({ id: 100, estimate: 4, priority: "Should", type: "Driver" }), noHardDate: true }],
    }, NOW);
    expect(r.moves).toEqual([]);
    expect(r.tooBig).toBe(1);
    expect(explainPlan(r)).toMatch(/longer than the releases left/);
  });

  it("places dated work before undated work", () => {
    const s = readyStore();
    const plan = optimizePlan(s, NOW).moves;
    const dated = plan.map((m) => Boolean(s.tickets.find((t) => t.id === m.id)!.dueDate));
    const firstUndated = dated.indexOf(false);
    const lastDated = dated.lastIndexOf(true);
    if (firstUndated !== -1 && lastDated !== -1) expect(firstUndated).toBeGreaterThan(lastDated);
    expect(plan[0].reason).toMatch(/due \d{4}-\d{2}-\d{2}/);
  });

  it("applying commits the moves and the whole batch is revertible", () => {
    const s = readyStore();
    const plan = optimizePlan(s, NOW).moves;
    const s1 = withHistory(s, "auto-optimize", (cur) => applyPlan(cur, plan, NOW), NOW);
    const moved = s1.tickets.find((t) => t.id === plan[0].id)!;
    expect(moved).toMatchObject({ sprint: plan[0].to, state: "Committed", planned: "2026-10-18" });
    const s2 = revertTo(s1, s1.history.length - 1, NOW);
    expect(s2.tickets.find((t) => t.id === plan[0].id)!.sprint).toBeNull();
  });

  it("never proposes a placement that starts too late", () => {
    const s = readyStore(3);
    const applied = applyPlan(s, optimizePlan(s, NOW).moves, NOW);
    expect(applied.tickets.filter((t) => t.sprint).length).toBeGreaterThan(0);
    for (const t of applied.tickets) expect(startsTooLate(t, applied.settings)).toBe(false);
  });
});

describe("release dates and feature freeze", () => {
  it("every release carries a freeze date and a release date", () => {
    for (const sp of freshStore().settings.sprints) {
      expect(sp.freeze).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(sp.release).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("a release is frozen once its freeze date arrives", () => {
    const sp = findSprint(freshStore().settings, "v0.23")!;
    expect(isFrozen(sp, parseDate(sp.freeze!))).toBe(true);
    expect(isFrozen(sp, new Date(parseDate(sp.freeze!).getTime() - 86_400_000))).toBe(false);
  });

  it("auto-optimize skips frozen releases", () => {
    let s = readyStore();
    s = updateSprint(s, "v0.23", { freeze: "2020-01-01" });
    const r = optimizePlan(s, NOW);
    expect(r.moves.map((m) => m.to)).not.toContain("v0.23");
    expect(r.moves.length).toBeGreaterThan(0);
  });

  it("auto-optimize prefers a release that ships on or before the due date", () => {
    let s = readyStore();
    s = updateSprint(s, "v0.23", { freeze: "2020-01-01" });
    s = updateSprint(s, "v0.24", { freeze: "2020-01-01" });
    const r = optimizePlan(s, NOW);
    expect(r.moves.length).toBeGreaterThan(0);
    expect(r.moves.every((m) => m.to === "v0.25")).toBe(true);
    // the dated ones cannot be shipped in time, and the proposal says so
    expect(r.moves.some((m) => m.warning)).toBe(true);
  });

  it("proposes nothing when every eligible release is frozen", () => {
    let s = freshStore();
    for (const sp of s.settings.sprints) s = updateSprint(s, sp.name, { freeze: "2020-01-01" });
    expect(optimizePlan(s, NOW).moves).toEqual([]);
  });

  it("still proposes when releases have no dates, and flags the uncertainty", () => {
    const s = readyStore();
    const undated: Sprint[] = s.settings.sprints.map((sp) => ({ ...sp, freeze: null, release: null }));
    const r = optimizePlan({ ...s, settings: { ...s.settings, sprints: undated } }, NOW);
    expect(r.moves.length).toBeGreaterThan(0);
    expect(r.undated).toHaveLength(undated.length);
    expect(r.moves.some((m) => m.warning === "this release has no date")).toBe(true);
    expect(explainPlan(r)).toMatch(/no release date/);
  });

  it("explains an empty proposal rather than returning nothing", () => {
    const s = freshStore();
    const shipped: Sprint[] = s.settings.sprints.map((sp) => ({
      ...sp, freeze: "2019-12-01", release: "2020-01-01",
    }));
    const r = optimizePlan({ ...s, settings: { ...s.settings, sprints: shipped } }, NOW);
    expect(r.moves).toEqual([]);
    expect(explainPlan(r)).toMatch(/Nothing to place/);
    expect(explainPlan(r)).toMatch(/already shipped/);
  });

  it("explains when everything is already scheduled", () => {
    const s = readyStore();
    const tickets = s.tickets.map((t, i) => ({ ...t, sprint: i % 2 ? "v0.23" : "v0.24" }));
    const r = optimizePlan({ ...s, tickets }, NOW);
    expect(r.moves).toEqual([]);
    expect(r.candidates).toBe(0);
    expect(explainPlan(r)).toMatch(/no ready ticket is unscheduled/);
  });

  it("can fill in missing release dates on a cadence, oldest version first", () => {
    const s = readyStore();
    const undated = { ...s, settings: {
      ...s.settings,
      sprints: s.settings.sprints.map((sp) => ({ ...sp, freeze: null, release: null })),
    } };
    const filled = fillReleaseDates(undated, NOW);
    expect(filled.settings.sprints.every((sp) => sp.release && sp.freeze)).toBe(true);
    const byName = Object.fromEntries(filled.settings.sprints.map((sp) => [sp.name, sp.release!]));
    expect(byName["v0.21"] < byName["v0.25"]).toBe(true);
    // A repair must not hand back a release that is already frozen or shipped.
    expect(filled.settings.sprints.every((sp) => !isFrozen(sp, NOW) && !hasShipped(sp, NOW))).toBe(true);
    expect(optimizePlan(filled, NOW).moves.length).toBeGreaterThan(0);
  });

  it("filling dates changes nothing when every release already has them", () => {
    const s = freshStore();
    expect(fillReleaseDates(s, NOW)).toEqual(s);
  });

  it("undated releases fall back to the order the date repair creates", () => {
    const s = freshStore();
    const undated = { ...s, settings: {
      ...s.settings,
      sprints: s.settings.sprints.map((sp) => ({ ...sp, freeze: null, release: null })),
    } };
    // with no dates, the oldest version is treated as next...
    expect(optimizePlan(undated, NOW).eligible[0]).toBe("v0.21");
    // ...and repairing the dates must not change which release comes first
    expect(optimizePlan(fillReleaseDates(undated, NOW), NOW).eligible[0]).toBe("v0.21");
  });

  it("records what was placed into a release after its freeze", () => {
    let s = freshStore();
    s = updateSprint(s, "v0.23", { freeze: "2020-01-01" });
    s = withHistory(
      s, "move 2 to v0.23", (cur) => moveTicketToSprint(cur, 2, "v0.23", NOW), NOW,
      { kind: "move", ticketId: 2, sprint: "v0.23" },
    );
    const slips = slippedIn(s, "v0.23", NOW);
    expect(slips).toHaveLength(1);
    expect(slips[0].op?.ticketId).toBe(2);
    expect(slips[0].label).toContain("move 2");
  });

  it("reports no slip for a release that has not frozen", () => {
    const s = withHistory(
      freshStore(), "move 2 to v0.24", (cur) => moveTicketToSprint(cur, 2, "v0.24", NOW), NOW,
      { kind: "move", ticketId: 2, sprint: "v0.24" },
    );
    expect(slippedIn(s, "v0.24", NOW)).toHaveLength(0);
  });

  it("moving a ticket still works as a plain change, with or without an op", () => {
    const s = freshStore();
    const a = withHistory(s, "move 3 to v0.24", (cur) => moveTicketToSprint(cur, 3, "v0.24", NOW), NOW);
    expect(a.history[0].op).toBeUndefined();
    expect(slippedIn(a, "v0.24", NOW)).toHaveLength(0);
  });

  // The suite runs in a negative-offset timezone (see vite.config.ts), so an
  // evening timestamp is already the next day in UTC.
  const frozenOn = (freeze: string) =>
    updateSprint(freshStore(), "v0.23", { freeze, release: "2026-12-01" });
  const moveAt = (s: ReturnType<typeof freshStore>, at: Date) =>
    withHistory(s, "move 2 to v0.23", (cur) => moveTicketToSprint(cur, 2, "v0.23", at), at,
      { kind: "move", ticketId: 2, sprint: "v0.23" });

  it("counts a move made on the freeze day itself, since the release is frozen that day", () => {
    const s = moveAt(frozenOn("2026-10-10"), new Date(2026, 9, 10, 9, 0));
    expect(slippedIn(s, "v0.23", NOW)).toHaveLength(1);
  });

  it("judges a move by its local date, not its UTC one", () => {
    // 23:30 local on the 9th is already the 10th in UTC.
    const s = moveAt(frozenOn("2026-10-10"), new Date(2026, 9, 9, 23, 30));
    expect(new Date(2026, 9, 9, 23, 30).toISOString().slice(0, 10)).toBe("2026-10-10");
    expect(slippedIn(s, "v0.23", NOW)).toHaveLength(0);
  });
});
