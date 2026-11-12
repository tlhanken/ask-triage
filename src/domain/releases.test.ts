import { describe, expect, it } from "vitest";
import { riskAlerts } from "./assess";
import { beingWorkedOn, currentRelease, fillState, findSprint, hasShipped, loadUnits, releaseOrder, spanOf, startsTooLate } from "./releases";
import { type Ticket } from "./schema";
import { applyCloseOut } from "./decisions";
import { freshStore, moveTicketToSprint, updateTicket } from "./store";
import { NOW, freezeClock, mk, readyStore } from "./test-fixtures";

freezeClock();

describe("spans", () => {
  // freshStore's releases, in ship order: v0.21, v0.22 (shipped), v0.23 (current), v0.24, v0.25
  const settings = () => freshStore().settings;

  it("counts releases in ship-date order, not display order", () => {
    expect(releaseOrder(settings().sprints).map((x) => x.name)).toEqual(["v0.21", "v0.22", "v0.23", "v0.24", "v0.25"]);
    const undated = [...settings().sprints, { name: "v0.30", freeze: null, release: null }, { name: "v0.26", freeze: null, release: null }];
    expect(releaseOrder(undated).slice(-2).map((x) => x.name)).toEqual(["v0.26", "v0.30"]);
  });

  it("a ticket occupies as many releases as its estimate, ending where it ships", () => {
    expect(spanOf(mk({ sprint: "v0.24", estimate: 2 }), settings())).toEqual({ releases: ["v0.23", "v0.24"], short: 0 });
    expect(spanOf(mk({ sprint: "v0.22", estimate: 3 }), settings())).toEqual({ releases: ["v0.21", "v0.22"], short: 1 });
    expect(spanOf(mk({ sprint: null, estimate: 3 }), settings()).releases).toEqual([]);
    expect(spanOf(mk({ sprint: "v0.24", estimate: null }), settings()).releases).toEqual(["v0.24"]);
  });

  it("costs one unit in each release it spans", () => {
    const t: Ticket[] = [
      mk({ id: 1, estimate: 2, state: "Committed", sprint: "v0.24" }),
      mk({ id: 2, estimate: 3, state: "Committed", sprint: "v0.25" }),
    ];
    const st = settings();
    expect(loadUnits(t, "v0.23", st)).toBe(2);
    expect(loadUnits(t, "v0.24", st)).toBe(2);
    expect(loadUnits(t, "v0.25", st)).toBe(1);
    expect(fillState(t, "v0.24", { ...st, commitTargetPerSprint: 2 }).state).toBe("full");
    expect(fillState(t, "v0.24", { ...st, commitTargetPerSprint: 1 })).toEqual({ load: 2, room: -1, state: "over" });
  });

  it("a growing estimate keeps the ship release and reaches further back", () => {
    let s = moveTicketToSprint(readyStore(), 1, "v0.25", NOW);
    s = updateTicket(s, 1, { estimate: 2 }, NOW);
    const t = s.tickets.find((x) => x.id === 1)!;
    expect(t.sprint).toBe("v0.25");
    expect(spanOf(t, s.settings).releases).toEqual(["v0.24", "v0.25"]);
  });

  it("the current release is derived: the earliest neither shipped nor frozen", () => {
    expect(currentRelease(settings(), NOW)!.name).toBe("v0.23");
    expect(currentRelease(settings(), new Date(2026, 10, 2))!.name).toBe("v0.24");   // v0.23 ships 2026-11-01
  });
});

describe("starting too late", () => {
  it("is reported for work placed where it would have had to start in a shipped release", () => {
    // three sprints shipping in the current release: it would have started in v0.21
    const s = updateTicket(moveTicketToSprint(readyStore(3), 1, "v0.23", NOW), 1, {}, NOW);
    const t = s.tickets.find((x) => x.id === 1)!;
    expect(t.planned).toBe("2026-10-18");
    expect(startsTooLate(t, s.settings)).toBe(true);
    expect(riskAlerts(t, s.settings, NOW).map((a) => a.kind)).toContain("STARTS-LATE");
  });

  it("is not reported once a span has simply progressed", () => {
    // two sprints, planned in time to ship in v0.24: spans v0.23 and v0.24
    const s = moveTicketToSprint(readyStore(2), 1, "v0.24", NOW);
    const t = s.tickets.find((x) => x.id === 1)!;
    expect(startsTooLate(t, s.settings)).toBe(false);
    // later, v0.23 has shipped: progress, not lateness
    expect(hasShipped(findSprint(s.settings, "v0.23"), new Date(2026, 10, 5))).toBe(true);
    expect(startsTooLate(t, s.settings)).toBe(false);
    expect(beingWorkedOn(t, s.settings, NOW)).toBe(true);
  });

  it("is reported when the span runs off the front of the board", () => {
    const s = moveTicketToSprint(readyStore(9), 1, "v0.25", NOW);
    expect(startsTooLate(s.tickets.find((x) => x.id === 1)!, s.settings)).toBe(true);
  });

  it("carrying over does not make work late", () => {
    const shipped = new Date(2026, 10, 2);                         // v0.23 has shipped
    let s = moveTicketToSprint(readyStore(2), 1, "v0.23", new Date(2026, 9, 1));
    s = { ...s, tickets: s.tickets.map((t) => (t.id === 1 ? { ...t, planned: "2026-09-01" } : t)) };
    s = applyCloseOut(s, [{ id: 1, choice: "Carry over" }], shipped);
    const t = s.tickets.find((x) => x.id === 1)!;
    expect(t).toMatchObject({ sprint: "v0.24", carryovers: 1, planned: "2026-09-01" });
    expect(startsTooLate(t, s.settings)).toBe(false);
  });
});
